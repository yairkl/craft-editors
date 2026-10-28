// The verified script fallback is shared by all native UI adapters.
const HEBREW_FONT_BYTES: &[u8] = include_bytes!("../../upstream/font-assets/NotoSansHebrew.ttf");
// Keep this list in sync with the pinned assets in upstream/font-assets.json.
const FALLBACK_FONTS: &[(&str, &[u8])] = &[("noto-sans-hebrew", HEBREW_FONT_BYTES)];
fn install_language_fallback(ctx: &egui::Context) {
    let mut definitions = ctx.fonts(|fonts| fonts.definitions().clone());
    let mut changed = false;
    for &(name, bytes) in FALLBACK_FONTS {
        if definitions.font_data.contains_key(name) {
            continue;
        }
        definitions.font_data.insert(
            name.into(),
            std::sync::Arc::new(egui::FontData::from_static(bytes)),
        );
        for chain in definitions.families.values_mut() {
            chain.push(name.into());
        }
        changed = true;
    }
    if changed {
        ctx.set_fonts(definitions);
        ctx.request_repaint();
    }
}
fn ui_has_hebrew(ctx: &egui::Context) -> bool {
    ctx.fonts_mut(|fonts| fonts.has_glyphs(&egui::FontId::proportional(14.0), "שָׁלוֹם"))
}
