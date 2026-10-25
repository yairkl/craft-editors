"""Check the actual installable archives, not just staging configuration."""
import json
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
for name, engine, extension in [("spreadsheets", "grid", "xlsx"), ("pdf", "pdf", "pdf"), ("suite", None, None)]:
    manifest = json.loads((ROOT / "packages" / name / "package.json").read_text())
    archive = ROOT / "dist/vsix" / f"{manifest['name']}-{manifest['version']}.vsix"
    with ZipFile(archive) as z:
        files = set(z.namelist())
        installed = json.loads(z.read("extension/package.json"))
        assert installed == manifest, f"{name}: packaged manifest drift"
        assert not installed.get("extensionDependencies"), f"{name}: unexpected required extension"
        assert not any("node_modules/" in f or "rendering-checks.js" in f or "/test/" in f for f in files)
        if engine:
            assert f"extension/media/engines/{engine}/viewer_bg.wasm" in files
            assert f"extension/media/engines/{engine}/viewer.js" in files
            other = "pdf" if engine == "grid" else "grid"
            assert not any(f.startswith(f"extension/media/engines/{other}/") for f in files), f"{name}: includes the other renderer"
            assert not any(f"entrypoints/{other_name}.js" in f for f in files for other_name in ["pdf" if name == "spreadsheets" else "spreadsheets"])
            assert "extension/" + installed["main"].removeprefix("./") in files
            assert "extension/notices/dependencies.json" in files
            dependencies = json.loads(z.read("extension/notices/dependencies.json"))
            other_program = "pdfcraft-" if name == "spreadsheets" else "gridcraft-"
            assert not any(p["name"].startswith(other_program) for p in dependencies), f"{name}: includes the other program's dependencies"
            for editor in installed["contributes"]["customEditors"]:
                assert editor["selector"] == [{"filenamePattern": f"*.{extension}"}]
            renderer = ROOT / "media/engines" / engine / "viewer_bg.wasm"
            assert z.read(f"extension/media/engines/{engine}/viewer_bg.wasm") == renderer.read_bytes()
        else:
            assert not installed.get("main") and not installed.get("browser")
            assert not any(f.startswith(("extension/media/", "extension/out/")) for f in files)
            assert installed["extensionPack"] == ["craft-vscode-dev.craft-spreadsheets", "craft-vscode-dev.craft-pdf"]
        print(f"Verified {archive.name}: {len(files)} files, {archive.stat().st_size:,} bytes; renderer isolation passed.")
