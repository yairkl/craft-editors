// Shared native editor runner; each application supplies document operations.
use std::{cell::RefCell, collections::BTreeMap, rc::Rc};
use wasm_bindgen::prelude::*;
include!("fonts.rs");
type Capture = std::sync::Arc<std::sync::Mutex<Option<egui::ColorImage>>>;
type Commands = Rc<RefCell<Vec<String>>>;
fn error(message: &str) -> JsValue {
    JsValue::from_str(message)
}
fn emit(callback: &js_sys::Function, kind: &str, fields: &[(&str, JsValue)]) {
    let event = js_sys::Object::new();
    let _ = js_sys::Reflect::set(&event, &"kind".into(), &kind.into());
    for (key, value) in fields {
        let _ = js_sys::Reflect::set(&event, &(*key).into(), value);
    }
    let _ = callback.call1(&JsValue::NULL, &event);
}
fn host_command(commands: &Commands, id: &str) -> bool {
    if matches!(
        id,
        "file.save"
            | "file.saveAs"
            | "file.open"
            | "file.new"
            | "file.close"
            | "file.revert"
            | "edit.undo"
            | "edit.redo"
            | "app.quit"
            | "view.newWindow"
    ) {
        if let Ok(mut commands) = commands.try_borrow_mut() {
            commands.push(id.to_owned());
        }
        true
    } else {
        false
    }
}
struct State {
    document: Document,
    context: egui::Context,
    commands: Commands,
    keyboard_history: bool,
    capture: Capture,
    on_frame: Option<js_sys::Function>,
    on_event: js_sys::Function,
    dark: bool,
    format: String,
    token: u32,
    next_token: u32,
    snapshots: BTreeMap<u32, Snapshot>,
}
impl State {
    fn observe(&mut self) {
        if self
            .snapshots
            .get(&self.token)
            .is_some_and(|old| !self.document.changed(old))
        {
            return;
        }
        let Some(next) = self.next_token.checked_add(1) else {
            return;
        };
        let before = self.token;
        self.token = next;
        self.next_token = next;
        self.snapshots.insert(next, self.document.snapshot());
        emit(
            &self.on_event,
            "changed",
            &[
                ("before", before.into()),
                ("after", next.into()),
                ("label", "Edit document".into()),
            ],
        );
    }
    fn flush(&mut self, preserve_draft: bool) -> Result<(), JsValue> {
        self.document.flush(preserve_draft)?;
        self.observe();
        Ok(())
    }
}
struct Shell(Rc<RefCell<State>>);
impl eframe::App for Shell {
    fn raw_input_hook(&mut self, ctx: &egui::Context, raw: &mut egui::RawInput) {
        if let Ok(mut state) = self.0.try_borrow_mut() {
            state.keyboard_history = raw.events.iter().any(|event| matches!(event,
                egui::Event::Key { pressed: true, modifiers, .. } if modifiers.command || modifiers.ctrl
            ));
            Document::screenshot_events(raw, &state.capture);
            let captured = state
                .capture
                .lock()
                .ok()
                .and_then(|mut capture| capture.take());
            if let Some(image) = captured
                && let Some(callback) = state.on_frame.take()
            {
                let pixels: Vec<u8> = image
                    .pixels
                    .iter()
                    .flat_map(|color| color.to_array())
                    .collect();
                let _ = callback.call3(
                    &JsValue::NULL,
                    &(image.size[0] as f64).into(),
                    &(image.size[1] as f64).into(),
                    &js_sys::Uint8Array::from(pixels.as_slice()),
                );
            }
            raw.dropped_files.clear();
            raw.hovered_files.clear();
            state.document.raw_input(ctx, raw);
        }
    }
    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        if let Ok(mut state) = self.0.try_borrow_mut() {
            state.document.logic(ctx, _frame);
        }
    }
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        if let Ok(mut state) = self.0.try_borrow_mut() {
            state.document.ui(ui, _frame);
            if state.document.ready() {
                install_language_fallback(ui.ctx());
            }
            state.observe();
            let commands = std::mem::take(&mut *state.commands.borrow_mut());
            // The host already receives keyboard history shortcuts; pointer commands still delegate.
            let keyboard_history = state.keyboard_history;
            state.keyboard_history = false;
            for command in commands {
                if keyboard_history && matches!(command.as_str(), "edit.undo" | "edit.redo") {
                    continue;
                }
                emit(&state.on_event, "command", &[("command", command.into())]);
            }
            if state.on_frame.is_some() && state.document.ready() {
                Document::request_screenshot(ui.ctx(), state.capture.clone());
                ui.ctx().request_repaint();
            }
        }
    }
}
#[wasm_bindgen]
pub struct NativeViewer {
    state: Rc<RefCell<State>>,
    runner: eframe::WebRunner,
    #[allow(dead_code)] // Used by adapters that expose an embedded MCP server.
    agent: RefCell<Option<Box<dyn std::any::Any>>>,
}
#[wasm_bindgen]
impl NativeViewer {
    pub async fn start(
        canvas: web_sys::HtmlCanvasElement,
        bytes: Vec<u8>,
        on_frame: js_sys::Function,
        on_event: js_sys::Function,
        format: String,
    ) -> Result<NativeViewer, JsValue> {
        if bytes.len() > 32 * 1024 * 1024 {
            return Err(error("Document exceeds 32 MiB."));
        }
        let commands = Commands::default();
        let document = Document::open(&bytes, commands.clone(), &format)?;
        let snapshots = BTreeMap::from([(0, document.snapshot())]);
        let state = Rc::new(RefCell::new(State {
            document,
            commands,
            keyboard_history: false,
            capture: Capture::default(),
            context: egui::Context::default(),
            on_frame: Some(on_frame),
            on_event,
            dark: false,
            format,
            token: 0,
            next_token: 0,
            snapshots,
        }));
        let app_state = state.clone();
        let runner = eframe::WebRunner::new();
        runner
            .start(
                canvas,
                eframe::WebOptions {
                    // Let the containing editor resolve its own keybindings.
                    should_stop_propagation: Box::new(|event| !matches!(event, egui::Event::Key { .. })),
                    ..Default::default()
                },
                Box::new(move |cc| {
                    app_state.borrow_mut().context = cc.egui_ctx.clone();
                    Document::setup(&cc.egui_ctx);
                    Ok(Box::new(Shell(app_state)))
                }),
            )
            .await?;
        Ok(NativeViewer {
            state,
            runner,
            agent: RefCell::new(None),
        })
    }
    pub fn set_theme(&self, dark: bool) -> Result<(), JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| error("Editor is busy."))?;
        let context = state.context.clone();
        state.document.set_theme(&context, dark);
        state.dark = dark;
        context.request_repaint();
        Ok(())
    }
    pub fn is_dark(&self) -> Result<bool, JsValue> {
        Ok(self
            .state
            .try_borrow()
            .map_err(|_| error("Editor is busy."))?
            .context
            .global_style()
            .visuals
            .dark_mode)
    }
    pub fn commit(&self) -> Result<(), JsValue> {
        self.state
            .try_borrow_mut()
            .map_err(|_| error("Editor is busy."))?
            .flush(false)
    }
    pub fn serialize(&self, flush: bool) -> Result<JsValue, JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| error("Editor is busy."))?;
        if flush {
            state.flush(true)?;
        } else {
            state.observe();
        }
        let snapshot = state
            .snapshots
            .get(&state.token)
            .ok_or_else(|| error("Document state is unavailable."))?;
        let bytes = Document::serialize(snapshot)?;
        let result = js_sys::Object::new();
        js_sys::Reflect::set(
            &result,
            &"bytes".into(),
            &js_sys::Uint8Array::from(bytes.as_slice()),
        )?;
        js_sys::Reflect::set(&result, &"token".into(), &state.token.into())?;
        Ok(result.into())
    }
    pub fn mark_saved(&self, token: u32) -> Result<(), JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| error("Editor is busy."))?;
        let snapshot = state
            .snapshots
            .get(&token)
            .ok_or_else(|| error("Saved revision is unavailable."))?
            .clone();
        state.document.mark_saved(&snapshot);
        state.context.request_repaint();
        Ok(())
    }
    pub fn mark_original(&self, bytes: Vec<u8>) -> Result<(), JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| error("Editor is busy."))?;
        let original = Document::open(&bytes, Commands::default(), &state.format)?;
        state.document.mark_saved(&original.snapshot());
        Ok(())
    }
    pub fn restore_history(&self, token: u32) -> Result<(), JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| error("Editor is busy."))?;
        let snapshot = state
            .snapshots
            .get(&token)
            .ok_or_else(|| error("History revision is unavailable."))?
            .clone();
        state.document.restore(&snapshot)?;
        state.token = token;
        state.context.request_repaint();
        Ok(())
    }
    pub fn replace(&self, bytes: Vec<u8>) -> Result<u32, JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| error("Editor is busy."))?;
        let mut document = Document::open(&bytes, state.commands.clone(), &state.format)?;
        document.set_theme(&state.context, state.dark);
        let token = state
            .next_token
            .checked_add(1)
            .ok_or_else(|| error("Session revision limit reached."))?;
        state.snapshots.clear();
        state.snapshots.insert(token, document.snapshot());
        state.document = document;
        state.token = token;
        state.next_token = token;
        state.context.request_repaint();
        Ok(token)
    }
    pub fn blank_document() -> Result<Vec<u8>, JsValue> {
        Document::blank()
    }
    pub fn unit_count(&self) -> Result<usize, JsValue> {
        Ok(self
            .state
            .try_borrow_mut()
            .map_err(|_| error("Editor is busy."))?
            .document
            .units())
    }
    pub fn text(&self) -> Result<String, JsValue> {
        Ok(self
            .state
            .try_borrow()
            .map_err(|_| error("Editor is busy."))?
            .document
            .text())
    }
    pub fn inspect(&self) -> Result<String, JsValue> {
        let state = self
            .state
            .try_borrow()
            .map_err(|_| error("Editor is busy."))?;
        let mut details = state.document.inspect();
        details["uiHebrewGlyphs"] = ui_has_hebrew(&state.context).into();
        Ok(details.to_string())
    }
    pub fn command(&self, id: &str, params: &str) -> Result<(), JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| error("Editor is busy."))?;
        let params =
            serde_json::from_str(params).map_err(|_| error("Invalid command parameters."))?;
        state.document.command(id, params)?;
        state.observe();
        state.context.request_repaint();
        Ok(())
    }
    pub fn destroy(&self) {
        self.runner.destroy();
    }
}
