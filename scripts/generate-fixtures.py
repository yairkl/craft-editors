"""Generate original, deterministic smoke fixtures using only the Python stdlib."""
from io import BytesIO
from pathlib import Path
import sys
from zipfile import ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1] / "integration-tests" / "fixtures"


def spreadsheet(styled=False, active_sheet=0):
    parts = {
        "[Content_Types].xml": '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>''',
        "_rels/.rels": '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>''',
        "xl/workbook.xml": '''<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Smoke" sheetId="1" r:id="rId1"/></sheets></workbook>''',
        "xl/_rels/workbook.xml.rels": '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>''',
        "xl/worksheets/sheet1.xml": '''<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B3"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Craft smoke fixture</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Input</t></is></c><c r="B2"><v>42</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Double</t></is></c><c r="B3"><f>B2*2</f><v>84</v></c></row></sheetData></worksheet>''',
    }
    if styled:
        parts["[Content_Types].xml"] = parts["[Content_Types].xml"].replace("</Types>", '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        parts["xl/_rels/workbook.xml.rels"] = parts["xl/_rels/workbook.xml.rels"].replace("</Relationships>", '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>')
        parts["xl/workbook.xml"] = parts["xl/workbook.xml"].replace('name="Smoke"', 'name="Overview"').replace('</sheets>', '<sheet name="Notes" sheetId="2" r:id="rId3"/></sheets>')
        parts["xl/workbook.xml"] = parts["xl/workbook.xml"].replace('<sheets>', f'<bookViews><workbookView activeTab="{active_sheet}"/></bookViews><sheets>')
        parts["xl/styles.xml"] = '''<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="sans-serif"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="sans-serif"/></font><font><b/><sz val="11"/><name val="sans-serif"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF185A8D"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6EFF5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'''
        parts["xl/worksheets/sheet1.xml"] = '''<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C6"/><cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="3" width="18" customWidth="1"/></cols><sheetData><row r="1" ht="34" customHeight="1"><c r="A1" s="1" t="inlineStr"><is><t>Quarterly overview</t></is></c></row><row r="2"><c r="A2" s="2" t="inlineStr"><is><t>Metric</t></is></c><c r="B2" s="2" t="inlineStr"><is><t>Actual</t></is></c><c r="C2" s="2" t="inlineStr"><is><t>Target</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Revenue</t></is></c><c r="B3" s="3"><v>12500.5</v></c><c r="C3" s="3"><v>14000</v></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>Margin</t></is></c><c r="B4" s="4"><v>0.275</v></c><c r="C4" s="4"><v>0.3</v></c></row><row r="5"><c r="A5" t="inlineStr"><is><t>Units</t></is></c><c r="B5"><v>42</v></c><c r="C5"><v>50</v></c></row><row r="6"><c r="A6" t="inlineStr"><is><t>Double units</t></is></c><c r="B6"><f>B5*2</f><v>84</v></c><c r="C6"><v>100</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells></worksheet>'''
        parts["xl/worksheets/sheet2.xml"] = '''<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:A2"/><cols><col min="1" max="1" width="40" customWidth="1"/></cols><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Second worksheet</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Read-only rendering test</t></is></c></row></sheetData></worksheet>'''
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        for name, content in sorted(parts.items()):
            info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            # Stored entries ensure identical output across zlib versions.
            archive.writestr(info, content.encode())
    return output.getvalue()


def pdf(multipage=False):
    stream = b"BT /F1 18 Tf 72 720 Td (Craft smoke fixture) Tj ET\n"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"endstream",
    ]
    if multipage:
        first = b"0.1 0.35 0.65 rg 72 580 468 100 re f\n0 0 0 rg BT /F1 24 Tf 72 720 Td (Rendering overview) Tj 0 -32 Td /F1 12 Tf (Page one - text and vector graphics) Tj ET\n"
        second = b"0.15 0.6 0.35 rg 72 480 240 180 re f\n0 0 0 rg BT /F1 24 Tf 72 720 Td (Second page) Tj 0 -32 Td /F1 12 Tf (Page two - navigation check) Tj ET\n"
        objects[1] = b"<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>"
        objects[4] = b"<< /Length " + str(len(first)).encode() + b" >>\nstream\n" + first + b"endstream"
        objects.extend([b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>", b"<< /Length " + str(len(second)).encode() + b" >>\nstream\n" + second + b"endstream"])
    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, body in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        output.extend(f"{offset:010} 00000 n \n".encode())
    output.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(output)


def office_package(parts):
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        for name, text in parts.items():
            archive.writestr(ZipInfo(name, (2026, 1, 1, 0, 0, 0)), text.encode("utf-8"))
    return output.getvalue()


def word_document():
    return office_package({
        "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/><w:color w:val="185A8D"/><w:sz w:val="40"/></w:rPr><w:t>Craft Word fixture</w:t></w:r></w:p><w:p><w:r><w:t>Original writing for native editing and save verification.</w:t></w:r></w:p><w:p><w:r><w:t>Open, edit, save and reopen this document in VS Code.</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>',
    })


def hebrew_document():
    with ZipFile(BytesIO(word_document())) as source:
        parts = {name: source.read(name).decode('utf-8') for name in source.namelist()}
    parts['word/document.xml'] = parts['word/document.xml'].replace('Craft Word fixture', 'שָׁלוֹם עולם — Craft עברית').replace('<w:p><w:r>', '<w:p><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr><w:r>', 1)
    return office_package(parts)


def presentation():
    parts = {
        "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' + ''.join(f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' for i in [1, 2]) + '</Types>',
        "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
        "ppt/presentation.xml": '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
        "ppt/_rels/presentation.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>' for i in [1, 2]) + '</Relationships>',
    }
    for i, title in [(1, 'Craft presentation fixture'), (2, 'Craft second slide')]:
        parts[f"ppt/slides/slide{i}.xml"] = f'<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld name="Slide {i}"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="10058400" cy="1828800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="3600" b="1"><a:solidFill><a:srgbClr val="185A8D"/></a:solidFill></a:rPr><a:t>{title}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
    return office_package(parts)


if __name__ == "__main__":
    check = "--check" in sys.argv
    ROOT.mkdir(parents=True, exist_ok=True)
    for name, contents in {"minimal.svg": b'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect x="40" y="40" width="240" height="120" fill="#2778c4"/><text x="40" y="220" font-size="28">Craft vector fixture</text></svg>\n', "minimal.docx": word_document(), "hebrew.docx": hebrew_document(), "minimal.pptx": presentation(), "minimal.xlsx": spreadsheet(), "minimal.pdf": pdf(), "rendering.xlsx": spreadsheet(True), "rendering-active.xlsx": spreadsheet(True, 1), "rendering.pdf": pdf(True)}.items():
        path = ROOT / name
        if check:
            if not path.exists() or path.read_bytes() != contents:
                raise SystemExit(f"Fixture differs: {name}. Run npm run fixtures.")
            print(f"Verified {name} ({len(contents)} bytes)")
        else:
            path.write_bytes(contents)
            print(f"Generated {name} ({len(contents)} bytes)")
