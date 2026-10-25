//! DeckCraft native UI behind the shared VS Code lifecycle protocol.
#![forbid(unsafe_code)]
include!("../../native/runtime.rs");
use deckcraft_engine::{DocState, Session};
use deckcraft_ui_egui::{Services, SlideApp};
#[derive(Clone)]
struct Snapshot {
    native: DocState,
}
struct Document {
    app: SlideApp,
}
impl Document {
    fn open(bytes: &[u8], commands: Commands, _format: &str) -> Result<Self, JsValue> {
        static FONT: std::sync::OnceLock<usize> = std::sync::OnceLock::new();
        FONT.get_or_init(|| deckcraft_fonts::FontDb::global().add_font(HEBREW_FONT_BYTES.to_vec()));
        let doc = deckcraft_pptx::import(bytes)
            .map_err(|_| error("The presentation could not be opened."))?;
        let mut session = Session::new();
        session.add_document(DocState::new(doc, None, "Presentation.pptx".into()));
        let services = Services {
            embedded: true,
            host_command: Some(Box::new(move |id| host_command(&commands, id))),
            ..Default::default()
        };
        Ok(Self {
            app: SlideApp::new(session, services),
        })
    }
    fn snapshot(&self) -> Snapshot {
        Snapshot {
            native: self.app.session.active().cloned().unwrap_or_else(|| {
                DocState::new(Default::default(), None, "Presentation.pptx".into())
            }),
        }
    }
    fn changed(&self, old: &Snapshot) -> bool {
        self.app
            .session
            .active()
            .is_some_and(|doc| !std::sync::Arc::ptr_eq(&doc.doc, &old.native.doc))
    }
    fn restore(&mut self, snapshot: &Snapshot) -> Result<(), JsValue> {
        if let Some(doc) = self.app.session.active_mut() {
            doc.doc = snapshot.native.doc.clone();
            doc.selection = snapshot.native.selection.clone();
            doc.history = snapshot.native.history.clone();
            doc.revision = doc.revision.saturating_add(1);
            doc.interaction = None;
            doc.composition = None;
        }
        Ok(())
    }
    fn mark_saved(&mut self, snapshot: &Snapshot) {
        if let Some(doc) = self.app.session.active_mut() {
            doc.saved_doc = snapshot.native.doc.clone();
        }
    }
    fn serialize(snapshot: &Snapshot) -> Result<Vec<u8>, JsValue> {
        deckcraft_pptx::export(&snapshot.native.doc)
            .map_err(|_| error("The presentation could not be serialized."))
    }
    fn flush(&mut self, _preserve_draft: bool) -> Result<(), JsValue> {
        Ok(())
    }
    fn raw_input(&mut self, ctx: &egui::Context, raw: &mut egui::RawInput) {
        // DeckCraft's keyboard path calls Session directly, bypassing SlideApp::run.
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
        self.app.logic(ctx);
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
            deckcraft_ui_egui::theme::Brightness::Dark
        } else {
            deckcraft_ui_egui::theme::Brightness::Light
        };
        deckcraft_ui_egui::theme::apply(
            ctx,
            &deckcraft_ui_egui::theme::Tokens::for_brightness(self.app.ui.brightness),
        );
    }
    fn setup(ctx: &egui::Context) {
        deckcraft_ui_egui::install_ime_pass_hooks(ctx);
    }
    fn ready(&self) -> bool {
        self.app.canvas_rect.is_some()
    }
    fn units(&mut self) -> usize {
        self.app
            .session
            .active()
            .map_or(0, |doc| doc.doc.slides.len())
    }
    fn text(&self) -> String {
        self.app
            .session
            .active()
            .map(|doc| {
                doc.doc
                    .slides
                    .iter()
                    .flat_map(|slide| {
                        slide
                            .shapes
                            .iter()
                            .filter_map(|shape| shape.text.as_ref().map(|text| text.text()))
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default()
    }
    fn inspect(&self) -> serde_json::Value {
        serde_json::json!({"hebrewGlyphs": deckcraft_fonts::FontDb::global().fallback_for('ש', u32::MAX).is_some()})
    }
    fn command(&mut self, id: &str, params: serde_json::Value) -> Result<(), JsValue> {
        self.app
            .run(id, params)
            .map(|_| ())
            .map_err(|_| error("Native command was refused."))
    }
    fn blank() -> Result<Vec<u8>, JsValue> {
        let mut session = Session::new();
        session
            .execute("file.new", &serde_json::json!({}))
            .map_err(|_| error("Could not create a presentation."))?;
        let doc = session.active().ok_or_else(|| error("No presentation."))?;
        deckcraft_pptx::export(&doc.doc).map_err(|_| error("Could not create a presentation."))
    }
}
