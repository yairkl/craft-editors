//! WordCraft native UI behind the shared VS Code lifecycle protocol.
#![forbid(unsafe_code)]
include!("../../native/runtime.rs");
use wordcraft_engine::{HostSnapshot, Session};
use wordcraft_ui_egui::{Services, WordApp};
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
    fn open(bytes: &[u8], commands: Commands) -> Result<Self, JsValue> {
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
    fn restore(&mut self, snapshot: &Snapshot) {
        self.app
            .session
            .restore_host_snapshot(snapshot.native.clone());
        self.app.session.dirty = self.app.session.doc != self.saved;
        self.observed.set(self.app.session.rev());
    }
    fn mark_saved(&mut self, snapshot: &Snapshot) {
        self.saved = snapshot.doc.clone();
        self.app.session.dirty = self.app.session.doc != self.saved;
    }
    fn serialize(snapshot: &Snapshot) -> Result<Vec<u8>, JsValue> {
        wordcraft_engine::io::save_bytes("Document.docx", &snapshot.doc)
            .map_err(|_| error("The Word document could not be serialized."))
    }
    fn flush(&mut self) -> Result<(), JsValue> {
        self.app
            .host_flush()
            .map_err(|_| error("The document draft could not be committed."))
    }
    fn raw_input(&mut self, _ctx: &egui::Context, raw: &mut egui::RawInput) {
        self.app.raw_input_hook(raw);
    }
    fn logic(&mut self, ctx: &egui::Context) {
        self.app.logic(ctx);
    }
    fn ui(&mut self, ui: &mut egui::Ui) {
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
    fn blank() -> Result<Vec<u8>, JsValue> {
        let doc = wordcraft_engine::blank_document(&wordcraft_engine::Region::from_tag("en-US"));
        wordcraft_engine::io::save_bytes("Document.docx", &doc)
            .map_err(|_| error("Could not create a Word document."))
    }
}
