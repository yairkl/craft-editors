//! PdfCraft's native editor with VS Code-owned persistence and history.
#![forbid(unsafe_code)]
include!("../../native/runtime.rs");
use eframe::App;
use pdfcraft_engine::{DocId, HostSnapshot, Session};
use pdfcraft_ui_egui::PdfCraftApp;
#[derive(Clone)]
struct Snapshot {
    native: HostSnapshot,
    draft: Option<pdfcraft_ui_egui::HostDraftSnapshot>,
}
struct Document {
    app: PdfCraftApp,
    id: DocId,
}
impl Document {
    fn open(bytes: &[u8], commands: Commands, _format: &str) -> Result<Self, JsValue> {
        let mut app = PdfCraftApp::new();
        app.embedded = true;
        app.host_command = Some(Box::new(move |id| {
            let mapped = match id {
                "file.save_as" => "file.saveAs",
                "file.close_all" => "file.close",
                _ => id,
            };
            host_command(&commands, mapped)
        }));
        app.open_bytes("Document.pdf", None, bytes.to_vec())
            .map_err(|_| {
                error("The PDF could not be opened. Password-protected files are not supported.")
            })?;
        let (_, id) = app
            .active_ids()
            .ok_or_else(|| error("The PDF could not be opened."))?;
        Ok(Self { app, id })
    }
    fn snapshot(&self) -> Snapshot {
        // The host owns one document, and intercepts every close/new/open operation.
        Snapshot {
            native: self.app.session.host_snapshot(self.id),
            draft: self.app.host_draft(),
        }
    }
    fn changed(&self, old: &Snapshot) -> bool {
        !self.app.session.host_matches(self.id, &old.native)
            || self.app.host_draft().map(|d| d.text()) != old.draft.as_ref().map(|d| d.text())
    }
    fn restore(&mut self, snapshot: &Snapshot) -> Result<(), JsValue> {
        self.app
            .session
            .host_restore(self.id, &snapshot.native)
            .map_err(|_| error("Could not restore PDF history."))?;
        self.app.host_restore_draft(&snapshot.draft);
        if let Some(doc) = self.app.session.get(self.id) {
            for view in &mut self.app.views {
                view.document_changed(&doc.info);
            }
        }
        Ok(())
    }
    // Native tabs/close prompts are omitted; the host owns the saved revision.
    fn mark_saved(&mut self, _snapshot: &Snapshot) {}
    fn serialize(snapshot: &Snapshot) -> Result<Vec<u8>, JsValue> {
        Ok(snapshot.native.bytes.as_ref().clone())
    }
    fn flush(&mut self, preserve_draft: bool) -> Result<(), JsValue> {
        if preserve_draft && self.app.host_pending() {
            return Err(error("DRAFT_PENDING"));
        }
        if !self.app.host_flush() {
            return Err(error(
                "Finish or correct the current PDF edit before saving.",
            ));
        }
        Ok(())
    }
    fn raw_input(&mut self, ctx: &egui::Context, raw: &mut egui::RawInput) {
        self.app.raw_input_hook(ctx, raw);
    }
    fn logic(&mut self, ctx: &egui::Context, frame: &mut eframe::Frame) {
        self.app.logic(ctx, frame);
    }
    fn ui(&mut self, ui: &mut egui::Ui, frame: &mut eframe::Frame) {
        self.app.ui(ui, frame);
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
        use pdfcraft_ui_egui::theme::{ThemeKind, ThemePreference};
        self.app.set_theme_preference(if dark {
            ThemePreference::Dark
        } else {
            ThemePreference::Light
        });
        pdfcraft_ui_egui::theme::apply(
            ctx,
            if dark {
                ThemeKind::Dark
            } else {
                ThemeKind::Light
            },
        );
    }
    fn setup(_ctx: &egui::Context) {}
    fn ready(&self) -> bool {
        self.app
            .views
            .first()
            .is_some_and(|v| v.page_screen_rect(0).is_some())
    }
    fn units(&mut self) -> usize {
        self.app
            .session
            .get(self.id)
            .map_or(0, |d| d.info.pages.len())
    }
    fn text(&self) -> String {
        self.app
            .session
            .get(self.id)
            .map_or_else(String::new, |doc| {
                (0..doc.info.pages.len())
                    .flat_map(|page| doc.text_lines(page).into_iter().map(|line| line.text))
                    .collect::<Vec<_>>()
                    .join("\n")
            })
    }
    fn inspect(&self) -> serde_json::Value {
        let view = self.app.views.first();
        let rect = view.map(|v| v.viewport_rect());
        serde_json::json!({"zoom": view.map(|v| v.zoom), "draft": self.app.host_draft().map(|d| d.text()), "pageRect": view.and_then(|v| v.page_screen_rect(0)).map(|r| [r.min.x,r.min.y,r.max.x,r.max.y]), "rotations": self.app.session.get(self.id).map(|d| d.info.pages.iter().map(|p| p.rotation).collect::<Vec<_>>()),
            "rect": rect.map(|r| [r.min.x,r.min.y,r.max.x,r.max.y])})
    }
    fn command(&mut self, id: &str, _params: serde_json::Value) -> Result<(), JsValue> {
        if self.app.execute(id) {
            Ok(())
        } else {
            Err(error("PDF command was refused."))
        }
    }
    fn blank() -> Result<Vec<u8>, JsValue> {
        Session::new()
            .create_blank(612.0, 792.0, 1)
            .map(|b| b.as_ref().clone())
            .map_err(|_| error("Could not create a PDF."))
    }
}
