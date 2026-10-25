//! Read-only viewport over the unmodified GridCraft grid renderer.
#![forbid(unsafe_code)]
use gridcraft_engine::{DocState, Session, Trust};
use gridcraft_ui_egui::SheetApp;
use sha2::Digest;
use std::{cell::RefCell, rc::Rc};
use wasm_bindgen::prelude::*;

struct State {
    app: SheetApp,
    context: egui::Context,
    on_frame: Option<js_sys::Function>,
    capture_requested: bool,
}

struct GridShell(Rc<RefCell<State>>);

impl eframe::App for GridShell {
    fn raw_input_hook(&mut self, _ctx: &egui::Context, raw: &mut egui::RawInput) {
        if let Ok(mut state) = self.0.try_borrow_mut() {
            for event in &raw.events {
                if let egui::Event::Screenshot { image, .. } = event
                    && let Some(callback) = state.on_frame.take()
                {
                    let pixels: Vec<u8> = image
                        .pixels
                        .iter()
                        .flat_map(|color| color.to_array())
                        .collect();
                    let _ = callback.call3(
                        &JsValue::NULL,
                        &JsValue::from_f64(image.size[0] as f64),
                        &JsValue::from_f64(image.size[1] as f64),
                        &js_sys::Uint8Array::from(pixels.as_slice()),
                    );
                }
            }
        }
        // A positive allowlist: no typing, buttons, touch, paste, IME, or drops can
        // reach upstream handlers. Do not call SheetApp::logic/raw_input_hook/ui.
        raw.events.retain(view_event);
        for event in &mut raw.events {
            if let egui::Event::MouseWheel { modifiers, .. } = event {
                *modifiers = egui::Modifiers {
                    shift: modifiers.shift,
                    ..Default::default()
                };
            }
        }
        raw.dropped_files.clear();
        raw.hovered_files.clear();
    }

    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        if let Ok(mut state) = self.0.try_borrow_mut() {
            gridcraft_ui_egui::grid::show(&mut state.app, ui);
            if !state.capture_requested && state.on_frame.is_some() {
                state.capture_requested = true;
                ui.ctx()
                    .send_viewport_cmd(egui::ViewportCommand::Screenshot(Default::default()));
                ui.ctx().request_repaint();
            }
        }
    }
}

fn view_event(event: &egui::Event) -> bool {
    matches!(
        event,
        egui::Event::PointerMoved(_) | egui::Event::PointerGone | egui::Event::MouseWheel { .. }
    )
}

#[wasm_bindgen]
pub struct GridViewer {
    runner: eframe::WebRunner,
    state: Rc<RefCell<State>>,
}

#[wasm_bindgen]
impl GridViewer {
    pub async fn start(
        canvas: web_sys::HtmlCanvasElement,
        bytes: Vec<u8>,
        on_frame: js_sys::Function,
    ) -> Result<GridViewer, JsValue> {
        if bytes.len() > 32 * 1024 * 1024 {
            return Err(JsValue::from_str("Document exceeds 32 MiB."));
        }
        let (wb, _report) = gridcraft_xlsx::read_xlsx(&bytes)
            .map_err(|_| JsValue::from_str("The workbook could not be opened."))?;
        if wb.active().is_none() {
            return Err(JsValue::from_str("The workbook has no active worksheet."));
        }
        let mut session = Session::new();
        session.add_document(DocState::new(wb, None, "Preview".into(), Trust::FromFile));
        let state = Rc::new(RefCell::new(State {
            app: SheetApp::new(session, Default::default()),
            context: egui::Context::default(),
            on_frame: Some(on_frame),
            capture_requested: false,
        }));
        let shared = state.clone();
        let runner = eframe::WebRunner::new();
        let options = eframe::WebOptions {
            renderer: eframe::Renderer::Glow,
            ..Default::default()
        };
        runner
            .start(
                canvas,
                options,
                Box::new(move |cc| {
                    SheetApp::setup_context(&cc.egui_ctx, false);
                    shared.borrow_mut().context = cc.egui_ctx.clone();
                    Ok(Box::new(GridShell(shared)))
                }),
            )
            .await
            .map_err(|_| {
                JsValue::from_str("The spreadsheet renderer could not start. WebGL is required.")
            })?;
        Ok(Self { runner, state })
    }

    pub fn sheets(&self) -> Result<js_sys::Array, JsValue> {
        let state = self
            .state
            .try_borrow()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        let array = js_sys::Array::new();
        if let Some(doc) = state.app.session.active() {
            for sheet in &doc.wb.sheets {
                array.push(&JsValue::from_str(&sheet.name));
            }
        }
        Ok(array)
    }

    pub fn select_sheet(&self, index: usize) -> Result<(), JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        let doc = state
            .app
            .session
            .active_mut()
            .ok_or_else(|| JsValue::from_str("No workbook."))?;
        if index >= doc.wb.sheets.len() {
            return Err(JsValue::from_str("Worksheet is out of range."));
        }
        // Only preview-local active-sheet metadata changes; no editing API is exported.
        std::sync::Arc::make_mut(&mut doc.wb).active_sheet = index;
        state.capture_requested = false;
        state.context.request_repaint();
        Ok(())
    }

    pub fn destroy(&self) {
        self.runner.destroy();
    }

    /// Diagnostic hash, used by read-only interaction regression tests.
    pub fn content_signature(&self) -> Result<String, JsValue> {
        let state = self
            .state
            .try_borrow()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        let doc = state
            .app
            .session
            .active()
            .ok_or_else(|| JsValue::from_str("No workbook."))?;
        let bytes = serde_json::to_vec(&doc.wb)
            .map_err(|_| JsValue::from_str("Could not inspect preview state."))?;
        Ok(sha2::Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect())
    }

    pub fn active_sheet(&self) -> Result<usize, JsValue> {
        let state = self
            .state
            .try_borrow()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        Ok(state
            .app
            .session
            .active()
            .map_or(0, |doc| doc.wb.active_sheet))
    }

    pub fn cell_text(&self, sheet: usize, row: u32, col: u32) -> Result<String, JsValue> {
        let state = self
            .state
            .try_borrow()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        let doc = state
            .app
            .session
            .active()
            .ok_or_else(|| JsValue::from_str("No workbook."))?;
        let sheet = doc
            .wb
            .sheet(sheet)
            .ok_or_else(|| JsValue::from_str("No worksheet."))?;
        sheet
            .value(gridcraft_engine::core::CellRef::new(row, col))
            .to_text()
            .map_err(|_| JsValue::from_str("Cell contains an error."))
    }
}
