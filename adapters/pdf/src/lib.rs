//! Read-only CPU page rasterization through PdfCraft's unmodified renderer.
#![forbid(unsafe_code)]
use pdfcraft_render::{PageRenderer, RenderConfig, RenderRequest};
use std::sync::Arc;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct PdfViewer {
    renderer: PageRenderer,
    width: u32,
    height: u32,
}

#[wasm_bindgen]
impl PdfViewer {
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: Vec<u8>) -> Result<Self, JsValue> {
        if bytes.len() > 32 * 1024 * 1024 {
            return Err(JsValue::from_str("Document exceeds 32 MiB."));
        }
        let renderer = PageRenderer::new(
            Arc::new(bytes),
            RenderConfig {
                reject_oversize: true,
                ..Default::default()
            },
        );
        if renderer.page_count() == 0 {
            return Err(JsValue::from_str(
                "The PDF could not be opened. Encrypted PDFs are not supported in this preview.",
            ));
        }
        Ok(Self {
            renderer,
            width: 0,
            height: 0,
        })
    }

    pub fn page_count(&self) -> usize {
        self.renderer.page_count()
    }
    pub fn width(&self) -> u32 {
        self.width
    }
    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn render(&mut self, page: usize, scale: f32) -> Result<Vec<u8>, JsValue> {
        if page >= self.page_count() || !scale.is_finite() || !(0.25..=2.0).contains(&scale) {
            return Err(JsValue::from_str("Invalid page or zoom."));
        }
        let result = self.renderer.render(RenderRequest {
            page,
            scale,
            ..Default::default()
        });
        if result.error.is_some() {
            return Err(JsValue::from_str("The PDF page could not be rendered."));
        }
        if result.width == 0
            || result.height == 0
            || result.width.saturating_mul(result.height) > 16_000_000
        {
            return Err(JsValue::from_str(
                "The PDF page exceeds the preview size limit.",
            ));
        }
        self.width = result.width;
        self.height = result.height;
        // Default RenderConfig clears white: the output is opaque RGBA, so the
        // premultiplied and straight-alpha representations are identical.
        Ok(result.rgba.as_ref().to_vec())
    }
}
