//! VectorCraft native UI behind the shared VS Code lifecycle protocol.
#![forbid(unsafe_code)]
include!("../../native/runtime.rs");
use vectorcraft_engine::{DocState, Session};
use vectorcraft_ui_egui::{Services, VectorcraftApp};
#[derive(Clone)]
struct Snapshot {
    native: DocState,
    native_format: bool,
}
struct Document {
    app: VectorcraftApp,
    native_format: bool,
}
impl Document {
    fn open(bytes: &[u8], commands: Commands, _format: &str) -> Result<Self, JsValue> {
        let native = _format == "vectorcraft";
        let doc = if native {
            vectorcraft_format::load(bytes)
                .map_err(|_| error("The VectorCraft file could not be opened."))?
        } else {
            let svg = std::str::from_utf8(bytes).map_err(|_| error("Invalid SVG text."))?;
            if let Some(editing) = vectorcraft_svg::editing(svg).filter(|editing| editing.intact) {
                let native = vectorcraft_format::base64_decode(&editing.data)
                    .ok_or_else(|| error("The SVG editing data is invalid."))?;
                vectorcraft_format::load(&native)
                    .map_err(|_| error("The SVG editing model could not be opened."))?
            } else {
                vectorcraft_svg::import(svg).map_err(|_| error("The SVG could not be opened."))?
            }
        };
        let mut session = Session::new();
        session.add_document(doc, None);
        let services = Services {
            embedded: true,
            host_command: Some(Box::new(move |id| host_command(&commands, id))),
            ..Default::default()
        };
        Ok(Self {
            app: VectorcraftApp::new(session, services),
            native_format: native,
        })
    }
    fn snapshot(&self) -> Snapshot {
        Snapshot {
            native: self.app.session.active().cloned().unwrap_or_else(|| {
                DocState::new(vectorcraft_doc::Document::new(640.0, 480.0), None)
            }),
            native_format: self.native_format,
        }
    }
    fn changed(&self, old: &Snapshot) -> bool {
        self.app
            .session
            .active()
            .is_some_and(|doc| !doc.same_content(&old.native.doc))
    }
    fn restore(&mut self, snapshot: &Snapshot) -> Result<(), JsValue> {
        if let Some(doc) = self.app.session.active_mut() {
            doc.doc = snapshot.native.doc.clone();
            doc.selection = snapshot.native.selection.clone();
            doc.history = snapshot.native.history.clone();
            doc.revision = doc.revision.saturating_add(1);
            doc.interaction = None;
        }
        Ok(())
    }
    fn mark_saved(&mut self, snapshot: &Snapshot) {
        if let Some(doc) = self.app.session.active_mut() {
            doc.mark_saved_as(&snapshot.native.doc);
        }
    }
    fn serialize(snapshot: &Snapshot) -> Result<Vec<u8>, JsValue> {
        Ok(if snapshot.native_format {
            vectorcraft_format::save_file(&snapshot.native.doc)
        } else {
            let native = vectorcraft_format::save_file(&snapshot.native.doc);
            let options = vectorcraft_svg::ExportOptions {
                preserve_editing: true,
                ..Default::default()
            };
            vectorcraft_svg::export_full(&snapshot.native.doc, &options, Some(&native)).take_bytes()
        })
    }
    fn flush(&mut self, _preserve_draft: bool) -> Result<(), JsValue> {
        Ok(())
    }
    fn raw_input(&mut self, ctx: &egui::Context, raw: &mut egui::RawInput) {
        // VectorCraft's keyboard path calls Session directly, bypassing VectorcraftApp::run.
        // Delegate host-owned shortcuts before that path sees them.
        raw.events.retain(|event| {
            if let egui::Event::Key {
                key,
                pressed: true,
                modifiers,
                ..
            } = event
                && (modifiers.command || modifiers.ctrl)
                && !modifiers.alt
            {
                let command = match key {
                    egui::Key::Z => Some(if modifiers.shift {
                        "edit.redo"
                    } else {
                        "edit.undo"
                    }),
                    egui::Key::Y => Some("edit.redo"),
                    egui::Key::S => Some(if modifiers.shift {
                        "file.saveAs"
                    } else {
                        "file.save"
                    }),
                    egui::Key::O => Some("file.open"),
                    egui::Key::N => Some("file.new"),
                    _ => None,
                };
                if let Some(command) = command {
                    self.app.run(command, serde_json::json!({})).ok();
                    return false;
                }
            }
            true
        });
        self.app.raw_input_hook(ctx, raw);
    }
    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.app.tick(ctx);
        self.app.finish_ime_logic(ctx);
    }
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        self.app.ui(ui);
    }
    fn screenshot_events(_raw: &egui::RawInput, _capture: &Capture) {}
    fn request_screenshot(ctx: &egui::Context, capture: Capture) {
        ctx.send_viewport_cmd(egui::ViewportCommand::Screenshot(
            egui::ScreenshotCallback::new(move |image| {
                if let Ok(mut target) = capture.lock() {
                    *target = Some((*image).clone());
                }
            }),
        ));
    }
    fn set_theme(&mut self, ctx: &egui::Context, dark: bool) {
        self.app.ui.brightness = if dark {
            vectorcraft_ui_egui::theme::Brightness::Dark
        } else {
            vectorcraft_ui_egui::theme::Brightness::Light
        };
        vectorcraft_ui_egui::theme::apply(ctx, self.app.ui.brightness);
    }
    fn setup(ctx: &egui::Context) {
        VectorcraftApp::install_ime_reset_hooks(ctx);
    }
    fn ready(&self) -> bool {
        self.app.canvas_rect.is_some()
    }
    fn units(&mut self) -> usize {
        self.app
            .session
            .active()
            .map_or(0, |doc| doc.doc.artboards.len().max(1))
    }
    fn text(&self) -> String {
        self.app.session.active().map_or_else(String::new, |doc| {
            serde_json::to_string(&doc.doc).unwrap_or_default()
        })
    }
    fn inspect(&self) -> serde_json::Value {
        serde_json::json!({"zoom": self.app.view().map(|v| v.zoom), "rect": self.app.canvas_rect.map(|r| [r.min.x,r.min.y,r.max.x,r.max.y])})
    }
    fn command(&mut self, id: &str, params: serde_json::Value) -> Result<(), JsValue> {
        self.app
            .run(id, params)
            .map(|_| ())
            .map_err(|_| error("Native command was refused."))
    }
    fn blank() -> Result<Vec<u8>, JsValue> {
        Ok(vectorcraft_svg::export(
            &vectorcraft_doc::Document::new(640.0, 480.0),
            &Default::default(),
        )
        .into_bytes())
    }
}

#[wasm_bindgen]
impl NativeViewer {
    pub fn native_bytes(&self) -> Result<Vec<u8>, JsValue> {
        let state = self
            .state
            .try_borrow()
            .map_err(|_| error("Editor is busy."))?;
        let doc = state
            .document
            .app
            .session
            .active()
            .ok_or_else(|| error("No drawing."))?;
        Ok(vectorcraft_format::save_file(&doc.doc))
    }
}
