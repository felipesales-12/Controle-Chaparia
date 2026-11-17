import JSZip from 'jszip';
export async function remnantWorkbook() {
  const zip = new JSZip();
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>');
  zip.file('xl/workbook.xml', `<x:workbook xmlns:x="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><x:sheets><x:sheet name="Cadastro de retalhos" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  const rows = [
    ['Código', 'Material', 'Espessura (mm)', 'Formato', 'Comprimento (mm)', 'Largura (mm)', 'Qtd.', 'Origem', 'Linha na coluna', 'Anotação original', 'Situação'],
    ['CAR-9001', 'Carbono', 2, 'Retangular', 800, 400, 2, 'Teste', 1, '800x400', 'Transcrito'],
    ['CAR-9002', 'Carbono', 9.53, 'Circular', '', '', 1, 'Teste', 2, 'Ø290', 'Conferir foto'],
    ['CAR-9003', 'Carbono', 3, 'Indefinido', '', '', 1, 'Teste', 3, '?x500', 'Conferir foto']
  ];
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  zip.file('xl/worksheets/sheet1.xml', `<x:worksheet xmlns:x="${ns}"><x:sheetData>${rows.map((row, i) => `<x:row r="${i + 5}">${row.map((value, j) => `<x:c r="${String.fromCharCode(65 + j)}${i + 5}" t="${typeof value === 'number' ? 'n' : 'str'}"><x:v>${escape(value)}</x:v></x:c>`).join('')}</x:row>`).join('')}</x:sheetData></x:worksheet>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}
