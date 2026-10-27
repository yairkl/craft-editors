//! WordCraft native UI behind the shared VS Code lifecycle protocol.
#![forbid(unsafe_code)]
include!("../../native/runtime.rs");
use wordcraft_engine::{HostSnapshot, Session};
use wordcraft_ui_egui::{Services, WordApp};

struct AgentBackend(std::rc::Rc<std::cell::RefCell<State>>);
impl wordcraft_mcp::Backend for AgentBackend {
    fn call(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let mut state = self
            .0
            .try_borrow_mut()
            .map_err(|_| "Document is busy".to_owned())?;
        if method == "engine.commands" {
            return Ok(state.document.app.session.registry.describe());
        }
        let (command, args) = if method == "engine.execute" || method == "command" {
            let command = params
                .get("command")
                .and_then(serde_json::Value::as_str)
                .ok_or("Missing command")?;
            (
                command,
                params
                    .get("params")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({})),
            )
        } else {
            (method, params)
        };
        if command.starts_with("file.")
            || command.starts_with("ui.")
            || command.starts_with("app.")
            || command.starts_with("window.")
            || matches!(command, "edit.undo" | "edit.redo")
        {
            return Err("This operation is managed by the VS Code host".into());
        }
        let result = state
            .document
            .app
            .session
            .run(command, &args)
            .map_err(|e| e.to_string());
        state.observe();
        state.context.request_repaint();
        result
    }
    fn has_ui(&self) -> bool {
        false
    }
    fn describe(&self) -> String {
        "live VS Code document".into()
    }
}

#[wasm_bindgen]
impl NativeViewer {
    pub fn mcp_message(&self, message: &str) -> Result<Option<String>, JsValue> {
        let mut agent = self
            .agent
            .try_borrow_mut()
            .map_err(|_| error("Agent server is busy"))?;
        let server = agent.get_or_insert_with(|| {
            Box::new(wordcraft_mcp::Server::new(Box::new(AgentBackend(
                self.state.clone(),
            ))))
        });
        let server = server
            .downcast_mut::<wordcraft_mcp::Server>()
            .ok_or_else(|| error("Invalid agent server"))?;
        Ok(server.handle_line(message))
    }
}

struct SharedHeadless(std::rc::Rc<std::cell::RefCell<wordcraft_mcp::Headless>>);
impl wordcraft_mcp::Backend for SharedHeadless {
    fn call(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        self.0
            .try_borrow_mut()
            .map_err(|_| "Document is busy".to_owned())?
            .call(method, params)
    }
    fn has_ui(&self) -> bool {
        false
    }
    fn describe(&self) -> String {
        "headless document".into()
    }
}

#[wasm_bindgen]
pub struct WordMcpHeadless {
    backend: std::rc::Rc<std::cell::RefCell<wordcraft_mcp::Headless>>,
    server: std::cell::RefCell<wordcraft_mcp::Server>,
}
impl Default for WordMcpHeadless {
    fn default() -> Self {
        Self::new()
    }
}
#[wasm_bindgen]
impl WordMcpHeadless {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let backend = std::rc::Rc::new(std::cell::RefCell::new(wordcraft_mcp::Headless::default()));
        let server = std::cell::RefCell::new(wordcraft_mcp::Server::new(Box::new(SharedHeadless(
            backend.clone(),
        ))));
        Self { backend, server }
    }
    pub fn open_bytes(&self, bytes: Vec<u8>) -> Result<(), JsValue> {
        if bytes.len() > 32 * 1024 * 1024 {
            return Err(error("Document exceeds 32 MiB."));
        }
        let doc = wordcraft_engine::io::open_bytes("Document.docx", &bytes)
            .map_err(|_| error("The Word document could not be opened."))?;
        self.backend
            .try_borrow_mut()
            .map_err(|_| error("Document is busy"))?
            .session = Session::new(doc);
        Ok(())
    }
    pub fn save_bytes(&self) -> Result<Vec<u8>, JsValue> {
        let backend = self
            .backend
            .try_borrow()
            .map_err(|_| error("Document is busy"))?;
        wordcraft_engine::io::save_bytes("Document.docx", &backend.session.doc)
            .map_err(|_| error("The Word document could not be serialized."))
    }
    pub fn message(&self, message: &str) -> Result<Option<String>, JsValue> {
        Ok(self
            .server
            .try_borrow_mut()
            .map_err(|_| error("MCP server is busy"))?
            .handle_line(message))
    }
}
#[derive(Clone)]
struct Snapshot {
    native: HostSnapshot,
    doc: wordcraft_engine::doc::Document,
}
struct Document {
    app: WordApp,
    saved: wordcraft_engine::doc::Document,
    observed: std::cell::Cell<u64>,
}
impl Document {
    fn open(bytes: &[u8], commands: Commands, _format: &str) -> Result<Self, JsValue> {
        static HEBREW_FONT: std::sync::OnceLock<usize> = std::sync::OnceLock::new();
        let count = HEBREW_FONT
            .get_or_init(|| wordcraft_fonts::FontDb::global().add_font(HEBREW_FONT_BYTES.to_vec()));
        if *count == 0 {
            return Err(error("The bundled Hebrew font could not be loaded."));
        }
        let doc = wordcraft_engine::io::open_bytes("Document.docx", bytes)
            .map_err(|_| error("The Word document could not be opened."))?;
        let saved = doc.clone();
        let services = Services {
            embedded: true,
            host_command: Some(Box::new(move |id| host_command(&commands, id))),
            ..Default::default()
        };
        let mut app = WordApp::new(Session::new(doc), services);
        app.ui.backstage = false;
        app.ui.ribbon_collapsed = true;
        let observed = std::cell::Cell::new(app.session.rev());
        Ok(Self {
            app,
            saved,
            observed,
        })
    }
    fn snapshot(&self) -> Snapshot {
        Snapshot {
            native: self.app.session.host_snapshot(),
            doc: self.app.session.doc.clone(),
        }
    }
    fn changed(&self, old: &Snapshot) -> bool {
        if self.observed.replace(self.app.session.rev()) == self.app.session.rev() {
            return false;
        }
        self.app.session.doc != old.doc
    }
    fn restore(&mut self, snapshot: &Snapshot) -> Result<(), JsValue> {
        self.app
            .session
            .restore_host_snapshot(snapshot.native.clone());
        self.app.session.dirty = self.app.session.doc != self.saved;
        self.observed.set(self.app.session.rev());
        Ok(())
    }
    fn mark_saved(&mut self, snapshot: &Snapshot) {
        self.saved = snapshot.doc.clone();
        self.app.session.dirty = self.app.session.doc != self.saved;
    }
    fn serialize(snapshot: &Snapshot) -> Result<Vec<u8>, JsValue> {
        wordcraft_engine::io::save_bytes("Document.docx", &snapshot.doc)
            .map_err(|_| error("The Word document could not be serialized."))
    }
    fn flush(&mut self, _preserve_draft: bool) -> Result<(), JsValue> {
        self.app
            .host_flush()
            .map_err(|_| error("The document draft could not be committed."))
    }
    fn raw_input(&mut self, _ctx: &egui::Context, raw: &mut egui::RawInput) {
        self.app.raw_input_hook(raw);
    }
    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.app.logic(ctx);
    }
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        self.app.ui(ui);
    }
    fn screenshot_events(raw: &egui::RawInput, capture: &Capture) {
        for event in &raw.events {
            if let egui::Event::Screenshot { image, .. } = event
                && let Ok(mut target) = capture.lock()
            {
                *target = Some((**image).clone());
            }
        }
    }
    fn request_screenshot(ctx: &egui::Context, _capture: Capture) {
        ctx.send_viewport_cmd(egui::ViewportCommand::Screenshot(Default::default()));
    }
    fn set_theme(&mut self, ctx: &egui::Context, dark: bool) {
        self.app.ui.theme = if dark {
            wordcraft_ui_egui::theme::Appearance::Dark
        } else {
            wordcraft_ui_egui::theme::Appearance::Light
        };
        wordcraft_ui_egui::theme::apply(ctx, self.app.ui.theme);
    }
    fn setup(_ctx: &egui::Context) {}
    fn ready(&self) -> bool {
        !self.app.canvas.page_rects.is_empty()
    }
    fn units(&mut self) -> usize {
        self.app.session.layout().pages.len()
    }
    fn text(&self) -> String {
        self.app
            .session
            .doc
            .plain_text(wordcraft_engine::doc::StoryRef::Body)
    }
    fn inspect(&self) -> serde_json::Value {
        let hebrew_glyphs = ['א', 'ש', 'ל', 'ו', 'ם', 'ָ'].iter().all(|c| {
            wordcraft_fonts::FontDb::global()
                .fallback_for(*c, u32::MAX)
                .is_some()
        });
        serde_json::json!({"focused": self.app.canvas.focused, "hebrewGlyphs": hebrew_glyphs})
    }
    fn command(&mut self, id: &str, params: serde_json::Value) -> Result<(), JsValue> {
        self.app
            .run(id, params)
            .map(|_| ())
            .map_err(|_| error("Native command was refused."))
    }
    fn blank() -> Result<Vec<u8>, JsValue> {
        let doc = wordcraft_engine::blank_document(&wordcraft_engine::Region::from_tag("en-US"));
        wordcraft_engine::io::save_bytes("Document.docx", &doc)
            .map_err(|_| error("Could not create a Word document."))
    }
}
