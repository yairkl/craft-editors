# Language and font support in the beta

Document text, bidirectional/shaping behavior, spelling/proofing and translated menus are separate capabilities. A font supplies glyphs; it does not by itself guarantee every editing or proofing feature for a language.

## Document content

| Content | Current status |
| --- | --- |
| English/basic Latin | Native rendering and edit/save/reopen covered in all five apps |
| Hebrew, including niqqud | Bundled, hash-verified Noto Sans Hebrew fallback in **all five apps**; native edit/save/reopen covered by `npm run test:languages` |
| Other Latin-script languages; Greek/Cyrillic | The native bundled font families include extended coverage; full language-specific editing/proofing is not a beta guarantee |
| Arabic, Indic scripts, Thai, Chinese/Japanese/Korean and other scripts | Not advertised as fully supported by this integration's current font pack; require suitable fonts plus engine-specific shaping/editing validation |
| Existing PDFs with embedded fonts | Rendering uses the document's embedded fonts where supported by PdfCraft; this differs from writing new text in a script |

Hebrew fallback is registered with each document engine and the native UI. PDF gets the font in its text writer as well as its interface. It is a small reviewed OFL font, not an operating-system font copied into the package. Each independent extension includes its own font bytes and license; no companion extension is required. The RTL fixtures and screenshots cover basic mixed Hebrew/English and niqqud, not every bidi cursor/selection case.

Use the native paragraph/sheet direction controls when the content needs right-to-left layout. A Hebrew document does not automatically translate the ribbon into Hebrew.

## Adding a user's language

For the bundled scripts, select a suitable native font and direction; no extra installation is needed. Installing a font into the OS alone does **not** make it visible to the WASM engines.

This first beta does not yet expose a user font import/folder setting. Additional scripts currently require a reviewed font-pack update and rebuilt extension, or document-embedded fonts where the engine supports them. Report the script/language, a short original sample, file type, expected direction and a font's official source/license; avoid private documents. A universal “install language” claim would be inaccurate until font loading, shaping, input and saved-file behavior are validated in each engine.

For contributors: add a pinned font and its license to the font asset manifest, register its bytes in the shared fallback list, connect it to each engine's document font/shaping interface, and add the script to the all-app language round-trip suite. PDF accepts host font registrations through a generic hook, but its script-specific shaping and document-font selection must be extended and tested for each newly supported script. Font bytes remain ignored build inputs fetched and SHA-256-verified during source preparation. Public redistribution needs an appropriate font license. New menu languages require upstream translation catalogs and, where needed, UI fonts; a VS Code language pack alone does not translate the embedded app.

A future end-user importer should use one shared host workflow to load explicit TTF/OTF files (including remote workspace files), with per-engine registration, bounded memory, visible coverage/errors and persistence. It should not require a mandatory core extension or silently download fonts. That importer is not represented as shipped in beta 1.

## Menu catalogs in the pinned sources

These are upstream catalog offerings, not a claim that every translated screen/font combination is fully validated by this beta. English UI is the common tested baseline. Choose other offered languages in each app's native preferences.

| App | Catalog language codes |
| --- | --- |
| Spreadsheets | `en`, `es`, `el`, `zh`, `ja`, `ko`, `ru`, `pt-br`, `de`, `cs`, `fr`, `sr`, `tr`, `pl`, `it`, `uk`, `vi`, `nl`, `ro` |
| Word | `en`, `zh-hans`, `zh-hant`, `ja`, `ko`, `uk`, `es`, `pt-br`, `sr`, `sr-latn`, `pl`, `cs`, `et`, `de`, `ru`, `tr`, `it`, `hu`, `fr`, `bg`, `vi`, `sv`, `hr`, `nl`, `da`, `ro`, `sl` |
| Vector | `en`, `el`, `ja`, `ko`, `vi`, `cs`, `de`, `es`, `fr`, `it`, `ka`, `ru`, `uk`, `bg`, `hu`, `pl`, `sv`, `pt-br`, `zh-hant`, `zh-hans`, `nl`, `da`, `id`, `fi`, `tr` |
| PowerPoint | `en` |
| PDF | `en`, `ar`, `bg`, `ca`, `ckb`, `cs`, `de`, `el`, `es`, `fi`, `fr`, `hi`, `hu`, `id`, `it`, `ja`, `kk`, `ko`, `lo`, `lt`, `nb`, `pl`, `pt-br`, `ro`, `ru`, `sl`, `sq`, `te`, `th`, `tr`, `uk`, `vi`, `zh-hans`, `zh-hant` |
