// The verified script fallback is shared by all native UI adapters.
const HEBREW_FONT_BYTES: &[u8] = include_bytes!("../../upstream/font-assets/NotoSansHebrew.ttf");
fn install_language_fallback(ctx: &egui::Context) {
    const KEY: &str = "craft-hebrew-fallback";
    let mut definitions = ctx.fonts(|fonts| fonts.definitions().clone());
    if definitions.font_data.contains_key(KEY) {
        return;
    }
    definitions.font_data.insert(
        KEY.into(),
        std::sync::Arc::new(egui::FontData::from_static(HEBREW_FONT_BYTES)),
    );
    for chain in definitions.families.values_mut() {
        chain.push(KEY.into());
    }
    ctx.set_fonts(definitions);
    ctx.request_repaint();
}
fn ui_has_hebrew(ctx: &egui::Context) -> bool {
    ctx.fonts_mut(|fonts| fonts.has_glyphs(&egui::FontId::proportional(14.0), "שָׁלוֹם"))
}
