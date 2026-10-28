#!/usr/bin/env python3
"""Generate disposable content-filled large-file fixtures; never use private documents."""
import base64
import random
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/large-real')
out.mkdir(parents=True, exist_ok=True)
rng = random.Random(82911)
workbook = out / 'content-large.xlsx'
with ZipFile(root / 'integration-tests/fixtures/minimal.xlsx') as source, ZipFile(workbook, 'w', ZIP_DEFLATED, compresslevel=3) as target:
    for info in source.infolist():
        if info.filename != 'xl/worksheets/sheet1.xml':
            target.writestr(info.filename, source.read(info.filename))
    with target.open('xl/worksheets/sheet1.xml', 'w') as sheet:
        sheet.write(b'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D30001"/><sheetData>')
        sheet.write(b'<row r="1"><c r="A1" t="inlineStr"><is><t>Craft smoke fixture</t></is></c><c r="B1" t="inlineStr"><is><t>Payload</t></is></c><c r="C1" t="inlineStr"><is><t>Value</t></is></c><c r="D1" t="inlineStr"><is><t>Double</t></is></c></row>')
        for row in range(2, 30002):
            a = base64.b64encode(rng.randbytes(600)).decode('ascii')
            b = base64.b64encode(rng.randbytes(600)).decode('ascii')
            b_cell = f'<c r="B{row}" t="inlineStr"><is><t>{b}</t></is></c>'
            if row == 2: b_cell = '<c r="B2"><v>42</v></c>'
            if row == 3: b_cell = '<c r="B3"><f>B2*2</f><v>84</v></c>'
            sheet.write(f'<row r="{row}"><c r="A{row}" t="inlineStr"><is><t>{a}</t></is></c>{b_cell}<c r="C{row}"><v>{row}</v></c><c r="D{row}"><f>C{row}*2</f><v>{row*2}</v></c></row>'.encode())
        sheet.write(b'</sheetData></worksheet>')

pdf = out / 'content-large.pdf'
width, height = 3600, 3300
pixels = rng.randbytes(width * height * 3)
objects = [
    b'<< /Type /Catalog /Pages 2 0 R >>',
    b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',
    b'<< /Length 31 >>\nstream\nq 612 0 0 792 0 0 cm /Im1 Do Q\nendstream',
    f'<< /Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length {len(pixels)} >>\nstream\n'.encode() + pixels + b'\nendstream',
]
with pdf.open('wb') as f:
    f.write(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = [0]
    for i, data in enumerate(objects, 1):
        offsets.append(f.tell()); f.write(f'{i} 0 obj\n'.encode()); f.write(data); f.write(b'\nendobj\n')
    xref = f.tell(); f.write(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode())
    for offset in offsets[1:]: f.write(f'{offset:010d} 00000 n \n'.encode())
    f.write(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
for file in (workbook, pdf):
    print(f'{file}: {file.stat().st_size:,} bytes')
