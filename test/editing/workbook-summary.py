"""Inspect the actual exported archive, independently of the renderer's model."""
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

namespace = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    styles = ET.fromstring(archive.read("xl/styles.xml"))
    fonts = styles.find("s:fonts", namespace)
    cell_styles = styles.find("s:cellXfs", namespace)
    bold = False
    for name in archive.namelist():
        if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
            cell = ET.fromstring(archive.read(name)).find(".//s:c[@r=\'B2\']", namespace)
            if cell is not None:
                font = fonts[int(cell_styles[int(cell.get("s", "0"))].get("fontId", "0"))]
                bold = bold or font.find("s:b", namespace) is not None
    formulas = [
        ET.fromstring(archive.read(name)).findtext(".//s:f", namespaces=namespace)
        for name in archive.namelist()
        if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
    ]
print(json.dumps({"sheets": len(workbook.findall(".//s:sheet", namespace)), "formulas": formulas, "bold": bold}))
