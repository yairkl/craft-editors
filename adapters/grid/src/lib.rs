//! GridCraft's native UI, with document lifecycle owned by VS Code.
#![forbid(unsafe_code)]
use gridcraft_engine::{DocState, HistoryEntry, Selection, Session, Trust};
use gridcraft_ui_egui::{Services, SheetApp};
use sha2::Digest;
use std::{cell::RefCell, collections::BTreeMap, rc::Rc, sync::Arc};
use wasm_bindgen::prelude::*;

#[derive(Clone)]
struct Snapshot {
    wb: Arc<gridcraft_engine::model::Workbook>,
    selection: Selection,
    undo: Vec<HistoryEntry>,
    redo: Vec<HistoryEntry>,
    sheet_selections: Vec<Selection>,
    editor: Option<gridcraft_ui_egui::editor::EditState>,
    text_box_editor: Option<gridcraft_ui_egui::text_box::EditState>,
}
impl Snapshot {
    fn capture(doc: &DocState, app: &SheetApp) -> Self {
        Self {
            editor: app.editor.clone(),
            text_box_editor: app.text_box_editor.clone(),
            wb: doc.wb.clone(),
            selection: doc.selection.clone(),
            undo: doc.undo.clone(),
            redo: doc.redo.clone(),
            sheet_selections: doc.sheet_selections.clone(),
        }
    }
    fn same_draft(&self, app: &SheetApp) -> bool {
        self.editor
            .as_ref()
            .map(|edit| (edit.sheet, edit.cell, &edit.text))
            == app
                .editor
                .as_ref()
                .map(|edit| (edit.sheet, edit.cell, &edit.text))
            && self
                .text_box_editor
                .as_ref()
                .map(|edit| (edit.id, &edit.text))
                == app
                    .text_box_editor
                    .as_ref()
                    .map(|edit| (edit.id, &edit.text))
    }
    fn restore(&self, doc: &mut DocState) {
        doc.wb = self.wb.clone();
        doc.selection = self.selection.clone();
        doc.undo = self.undo.clone();
        doc.redo = self.redo.clone();
        doc.sheet_selections = self.sheet_selections.clone();
        doc.calc.rebuild(&doc.wb);
        doc.revision = doc.revision.saturating_add(1);
    }
}
struct State {
    app: SheetApp,
    context: egui::Context,
    on_frame: Option<js_sys::Function>,
    on_event: js_sys::Function,
    token: u32,
    next_token: u32,
    snapshots: BTreeMap<u32, Snapshot>,
    commands: Rc<RefCell<Vec<String>>>,
}
fn emit(callback: &js_sys::Function, kind: &str, fields: &[(&str, JsValue)]) {
    let event = js_sys::Object::new();
    if js_sys::Reflect::set(&event, &"kind".into(), &kind.into()).is_err() {
        return;
    }
    for (name, value) in fields {
        if js_sys::Reflect::set(&event, &(*name).into(), value).is_err() {
            return;
        }
    }
    let _ = callback.call1(&JsValue::NULL, &event);
}
fn services(commands: Rc<RefCell<Vec<String>>>) -> Services {
    Services {
        host_command: Some(Box::new(move |id| {
            if matches!(
                id,
                "file.save"
                    | "file.saveAs"
                    | "file.open"
                    | "file.new"
                    | "file.close"
                    | "edit.undo"
                    | "edit.redo"
                    | "view.newWindow"
                    | "app.quit"
            ) {
                if let Ok(mut queue) = commands.try_borrow_mut() {
                    queue.push(id.to_owned());
                }
                true
            } else {
                false
            }
        })),
        ..Default::default()
    }
}
fn make_app(bytes: &[u8], commands: Rc<RefCell<Vec<String>>>) -> Result<SheetApp, JsValue> {
    let (wb, _) = gridcraft_xlsx::read_xlsx(bytes)
        .map_err(|_| JsValue::from_str("The workbook could not be opened."))?;
    if wb.active().is_none() {
        return Err(JsValue::from_str("The workbook has no active worksheet."));
    }
    let mut session = Session::new();
    session.add_document(DocState::new(
        wb,
        None,
        "Workbook.xlsx".into(),
        Trust::FromFile,
    ));
    let mut app = SheetApp::new(session, services(commands));
    // VS Code provides file/window chrome; the native ribbon, formula bar, grid,
    // worksheet tabs, context menus and dialogs remain fully interactive.
    app.chrome.title_bar = false;
    app.chrome.file_tab = false;
    Ok(app)
}
impl State {
    fn observe(&mut self) {
        let Some(doc) = self.app.session.active() else {
            return;
        };
        if self
            .snapshots
            .get(&self.token)
            .is_some_and(|old| Arc::ptr_eq(&old.wb, &doc.wb) && old.same_draft(&self.app))
        {
            return;
        }
        if let Some(previous) = self.snapshots.get(&self.token) {
            let mut comparison = (*previous.wb).clone();
            comparison.active_sheet = doc.wb.active_sheet;
            if comparison == *doc.wb && previous.same_draft(&self.app) {
                self.snapshots
                    .insert(self.token, Snapshot::capture(doc, &self.app));
                return;
            }
        }
        let before = self.token;
        let Some(token) = self.next_token.checked_add(1) else {
            return;
        };
        self.next_token = token;
        self.token = token;
        let label = doc
            .undo
            .last()
            .map_or("Workbook change", |entry| entry.label.as_str())
            .to_owned();
        self.snapshots
            .insert(token, Snapshot::capture(doc, &self.app));
        emit(
            &self.on_event,
            "changed",
            &[
                ("before", before.into()),
                ("after", token.into()),
                ("label", label.into()),
            ],
        );
    }
    fn flush(&mut self, preserve_draft: bool) -> Result<(), JsValue> {
        self.observe();
        let editor = self.app.editor.clone();
        let text_box_editor = self.app.text_box_editor.clone();
        let has_draft = editor.is_some() || text_box_editor.is_some();
        // Text-box drafts compare against their original text internally. Let the
        // native editor finish that transaction before a background save commits it.
        if preserve_draft && text_box_editor.is_some() {
            return Err(JsValue::from_str("DRAFT_PENDING"));
        }
        // An unfinished formula belongs to the editor, not to an autosaved cell.
        if preserve_draft
            && let Some(ed) = &editor
            && let Some(doc) = self.app.session.active()
        {
            let text_format = doc.wb.sheet(ed.sheet).is_some_and(|sheet| {
                doc.wb.styles.get(sheet.style_id(ed.cell)).num_fmt.as_str() == "@"
            });
            let formula = ed.text.starts_with('=')
                || ((ed.text.starts_with('+') || ed.text.starts_with('-'))
                    && ed
                        .text
                        .chars()
                        .nth(1)
                        .is_some_and(|c| c.is_ascii_alphabetic() || c == '('));
            if formula
                && !text_format
                && gridcraft_engine::formula::parse_input(&ed.text, ed.locale, |name| {
                    doc.wb.name(name, ed.sheet).is_some() || doc.wb.table(name).is_some()
                })
                .is_err()
            {
                return Err(JsValue::from_str("DRAFT_PENDING"));
            }
        }
        let mode = self.app.session.mode;
        let message = self.app.message.clone();
        let selection = self
            .app
            .session
            .active()
            .map(|doc| (doc.selection.clone(), doc.wb.active_sheet));
        // Serialize exactly what was typed; autosave must not accept an autocomplete suggestion.
        if preserve_draft && let Some(ed) = self.app.editor.as_mut() {
            ed.completion = None;
        }
        let cell_ok = self.app.editor.is_none() || self.app.commit_edit(0, 0, false, false);
        let text_ok = cell_ok && self.app.commit_text_box_edit().is_ok();
        if preserve_draft {
            self.app.editor = editor;
            self.app.text_box_editor = text_box_editor;
            self.app.session.mode = mode;
            self.app.message = message;
            if let Some((selection, sheet)) = selection
                && let Some(doc) = self.app.session.active_mut()
            {
                doc.selection = selection;
                if doc.wb.active_sheet != sheet {
                    std::sync::Arc::make_mut(&mut doc.wb).active_sheet = sheet;
                }
            }
        }
        if !text_ok {
            return Err(JsValue::from_str(if preserve_draft {
                "DRAFT_PENDING"
            } else {
                "The edit could not be committed."
            }));
        }
        if preserve_draft && has_draft {
            // Committing for serialization is the same logical edit, not another undo step.
            // The live editor (text, caret, selection and point mode) stays in place.
            if let Some(doc) = self.app.session.active() {
                self.snapshots
                    .insert(self.token, Snapshot::capture(doc, &self.app));
            }
        } else {
            self.observe();
        }
        Ok(())
    }
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
                        &(image.size[0] as f64).into(),
                        &(image.size[1] as f64).into(),
                        &js_sys::Uint8Array::from(pixels.as_slice()),
                    );
                }
            }
            state.app.raw_input_hook(raw);
        }
        // Files are opened by VS Code, never into a second internal workbook.
        raw.dropped_files.clear();
        raw.hovered_files.clear();
    }
    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        if let Ok(mut state) = self.0.try_borrow_mut() {
            state.app.logic(ctx);
        }
    }
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        if let Ok(mut state) = self.0.try_borrow_mut() {
            state.app.ui(ui);
            state.observe();
            let queued = state
                .commands
                .try_borrow_mut()
                .map(|mut commands| std::mem::take(&mut *commands))
                .unwrap_or_default();
            for command in queued {
                emit(&state.on_event, "command", &[("command", command.into())]);
            }
            if state.on_frame.is_some() && state.app.grid.geo.is_some() {
                ui.ctx()
                    .send_viewport_cmd(egui::ViewportCommand::Screenshot(Default::default()));
                ui.ctx().request_repaint();
            }
        }
    }
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
        on_event: js_sys::Function,
    ) -> Result<GridViewer, JsValue> {
        if bytes.len() > 32 * 1024 * 1024 {
            return Err(JsValue::from_str("Document exceeds 32 MiB."));
        }
        let commands = Rc::new(RefCell::new(Vec::new()));
        let app = make_app(&bytes, commands.clone())?;
        let doc = app
            .session
            .active()
            .ok_or_else(|| JsValue::from_str("No workbook."))?;
        let snapshots = BTreeMap::from([(0, Snapshot::capture(doc, &app))]);
        let state = Rc::new(RefCell::new(State {
            app,
            commands,
            context: egui::Context::default(),
            on_frame: Some(on_frame),
            on_event,
            token: 0,
            next_token: 0,
            snapshots,
        }));
        let shared = state.clone();
        let runner = eframe::WebRunner::new();
        runner
            .start(
                canvas,
                eframe::WebOptions {
                    renderer: eframe::Renderer::Glow,
                    ..Default::default()
                },
                Box::new(move |cc| {
                    SheetApp::setup_context(&cc.egui_ctx, false);
                    shared.borrow_mut().context = cc.egui_ctx.clone();
                    Ok(Box::new(GridShell(shared)))
                }),
            )
            .await
            .map_err(|_| JsValue::from_str("GridCraft could not start. WebGL is required."))?;
        Ok(Self { runner, state })
    }
    pub fn set_theme(&self, dark: bool) -> Result<(), JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        state.app.ui.dark = dark;
        state.app.ui.system_theme = false;
        gridcraft_ui_egui::theme::apply(&state.context, dark);
        state.context.request_repaint();
        Ok(())
    }
    pub fn is_dark(&self) -> Result<bool, JsValue> {
        Ok(self
            .state
            .try_borrow()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?
            .context
            .global_style()
            .visuals
            .dark_mode)
    }
    pub fn draft_text(&self) -> Result<Option<String>, JsValue> {
        let state = self
            .state
            .try_borrow()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        Ok(state.app.editor.as_ref().map(|editor| editor.text.clone()))
    }
    pub fn commit(&self) -> Result<(), JsValue> {
        self.state
            .try_borrow_mut()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?
            .flush(false)
    }
    pub fn mark_original(&self, bytes: Vec<u8>) -> Result<(), JsValue> {
        let (wb, _) = gridcraft_xlsx::read_xlsx(&bytes)
            .map_err(|_| JsValue::from_str("Original workbook could not be opened."))?;
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        if let Some(doc) = state.app.session.active_mut() {
            doc.saved = Arc::new(wb);
        }
        Ok(())
    }
    pub fn serialize(&self, flush: bool) -> Result<JsValue, JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        if flush {
            state.flush(true)?;
        } else {
            state.observe();
        }
        let snapshot = state
            .snapshots
            .get(&state.token)
            .ok_or_else(|| JsValue::from_str("Missing workbook state."))?;
        let bytes = gridcraft_engine::io::save_bytes_as(
            &snapshot.wb,
            "Workbook.xlsx",
            gridcraft_engine::io::FileKind::Xlsx,
        )
        .map_err(|_| JsValue::from_str("The workbook could not be serialized."))?;
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
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        let saved = state
            .snapshots
            .get(&token)
            .ok_or_else(|| JsValue::from_str("Saved state is no longer available."))?
            .wb
            .clone();
        if let Some(doc) = state.app.session.active_mut() {
            doc.saved = saved;
        }
        state.context.request_repaint();
        Ok(())
    }
    pub fn restore_history(&self, token: u32) -> Result<(), JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        let snapshot = state
            .snapshots
            .get(&token)
            .ok_or_else(|| JsValue::from_str("Undo state is no longer available."))?
            .clone();
        if let Some(uid) = state.app.session.active().map(|doc| doc.uid) {
            state.app.session.abort_groups(uid);
        }
        if let Some(doc) = state.app.session.active_mut() {
            snapshot.restore(doc);
        }
        state.app.editor = snapshot.editor;
        state.app.text_box_editor = snapshot.text_box_editor;
        state.token = token;
        state.context.request_repaint();
        Ok(())
    }
    pub fn replace(&self, bytes: Vec<u8>) -> Result<u32, JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        let mut app = make_app(&bytes, state.commands.clone())?;
        app.ui.dark = state.app.ui.dark;
        app.ui.system_theme = false;
        let token = state
            .next_token
            .checked_add(1)
            .ok_or_else(|| JsValue::from_str("Session revision limit reached."))?;
        let snapshot = Snapshot::capture(
            app.session
                .active()
                .ok_or_else(|| JsValue::from_str("No workbook."))?,
            &app,
        );
        state.app = app;
        state.snapshots.clear();
        state.snapshots.insert(token, snapshot);
        state.token = token;
        state.next_token = token;
        state.context.request_repaint();
        Ok(token)
    }
    pub fn blank_workbook() -> Result<Vec<u8>, JsValue> {
        let mut session = Session::new();
        session.new_workbook();
        let doc = session
            .active()
            .ok_or_else(|| JsValue::from_str("No workbook."))?;
        gridcraft_xlsx::write_xlsx(&doc.wb)
            .map_err(|_| JsValue::from_str("Could not create workbook."))
    }
    pub fn destroy(&self) {
        self.runner.destroy();
    }
    pub fn sheets(&self) -> Result<js_sys::Array, JsValue> {
        let state = self
            .state
            .try_borrow()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        let array = js_sys::Array::new();
        if let Some(doc) = state.app.session.active() {
            for sheet in &doc.wb.sheets {
                array.push(&sheet.name.as_str().into());
            }
        }
        Ok(array)
    }
    pub fn zoom_percent(&self) -> Result<u16, JsValue> {
        let state = self
            .state
            .try_borrow()
            .map_err(|_| JsValue::from_str("Renderer busy"))?;
        Ok(state
            .app
            .session
            .active()
            .and_then(|doc| doc.wb.active())
            .map_or(100, |sheet| sheet.zoom))
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
    pub fn select_sheet(&self, index: usize) -> Result<(), JsValue> {
        let mut state = self
            .state
            .try_borrow_mut()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        state
            .app
            .run("sheet.activate", serde_json::json!({"sheet":index}))
            .map_err(|_| JsValue::from_str("Could not select sheet."))?;
        state.observe();
        state.context.request_repaint();
        Ok(())
    }
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
            .map_err(|_| JsValue::from_str("Could not inspect workbook."))?;
        Ok(sha2::Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect())
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
        let sh = doc
            .wb
            .sheet(sheet)
            .ok_or_else(|| JsValue::from_str("No worksheet."))?;
        sh.value(gridcraft_engine::core::CellRef::new(row, col))
            .to_text()
            .map_err(|_| JsValue::from_str("Cell contains an error."))
    }
    pub fn cell_bounds(&self, row: u32, col: u32) -> Result<js_sys::Float32Array, JsValue> {
        let state = self
            .state
            .try_borrow()
            .map_err(|_| JsValue::from_str("Renderer is busy."))?;
        let sh = state
            .app
            .session
            .active()
            .and_then(|doc| doc.wb.active())
            .ok_or_else(|| JsValue::from_str("No worksheet."))?;
        let geo = state
            .app
            .grid
            .geo
            .as_ref()
            .ok_or_else(|| JsValue::from_str("Grid has not rendered."))?;
        let rect = geo.screen_cell_rect(sh, gridcraft_engine::core::CellRef::new(row, col));
        Ok(js_sys::Float32Array::from(
            [rect.min.x, rect.min.y, rect.max.x, rect.max.y].as_slice(),
        ))
    }
}
