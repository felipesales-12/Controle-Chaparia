import ExcelJS from 'exceljs';
import { needsRestock, reorderPoint } from './catalog.js';
import { stockWeightDetails, stockWeightSummary } from './weights.js';

const C = { navy: 'FF142F3E', ink: 'FF243D49', muted: 'FF667E89', gold: 'FFF4B84F', green: 'FF386955', pale: 'FFF0F5F3', white: 'FFFFFFFF', border: 'FFDCE5E8', amber: 'FFFFF0CF' };
const KG = '#,##0.00" kg"';
const MM = '#,##0.00';
const INTEGER = '#,##0';
const zone = 'America/Sao_Paulo';
const dateLabel = value => {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: zone }).format(date) : String(value);
};
const formula = (expression, result) => ({ formula: expression, result });
function mergeText(sheet, row, first, last, value, options = {}) {
  sheet.mergeCells(row, first, row, last);
  const cell = sheet.getCell(row, first); cell.value = value;
  cell.font = { name: 'Calibri', size: 11, color: { argb: C.ink }, ...options.font };
  cell.alignment = { vertical: 'middle', wrapText: true, ...options.alignment };
  if (options.fill) for (let column = first; column <= last; column++) sheet.getCell(row, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.fill } };
  return cell;
}
function frame(sheet, title, subtitle, columns, meta, headerRow) {
  sheet.properties.defaultRowHeight = 23;
  sheet.properties.outlineProperties = { summaryBelow: true };
  sheet.views = [{ state: 'frozen', xSplit: columns > 7 ? 3 : 2, ySplit: headerRow, showGridLines: false, zoomScale: columns > 7 ? 85 : 100 }];
  sheet.pageSetup = { orientation: 'landscape', paperSize: columns > 7 ? 8 : 9, fitToPage: true, fitToWidth: columns > 7 ? 2 : 1, fitToHeight: 0, printTitlesRow: `${headerRow}:${headerRow}`, ...(columns > 7 ? { printTitlesColumn: 'A:C' } : {}), margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 } };
  sheet.headerFooter.oddFooter = '&LChaparia · Peso estimado&C&P / &N&RRelatório de estoque';
  mergeText(sheet, 1, 1, columns, title, { fill: C.navy, font: { size: 23, bold: true, color: { argb: C.white } } }); sheet.getRow(1).height = 44;
  mergeText(sheet, 2, 1, columns, subtitle, { fill: C.navy, font: { size: 11, color: { argb: 'FFD1DEE4' } } }); sheet.getRow(2).height = 29;
  mergeText(sheet, 3, 1, columns, `Emitido em ${dateLabel(meta.generatedAt)} (Brasília)  •  Responsável: ${meta.email || 'Usuário autenticado'}`, { font: { size: 10, color: { argb: C.muted } } }); sheet.getRow(3).height = 26;
  mergeText(sheet, 4, 1, columns, meta.connected === false ? 'SEM CONEXÃO • Exportado a partir do último estoque recebido. Confirme a atualização antes de usar.' : 'RETRATO DO ESTOQUE • Dados recebidos pelo sistema no momento da exportação.', { fill: C.pale, font: { size: 10, color: { argb: meta.connected === false ? 'FF946617' : C.green } } }); sheet.getRow(4).height = 27;
}
function table(sheet, name, headerRow, columns, rows, green = false) {
  if (rows.length) sheet.addTable({ name, ref: `A${headerRow}`, headerRow: true, totalsRow: false, style: { theme: green ? 'TableStyleMedium4' : 'TableStyleMedium2', showRowStripes: true }, columns: columns.map(name => ({ name, filterButton: true })), rows });
  else sheet.getRow(headerRow).values = columns;
  sheet.getRow(headerRow).height = 35;
  sheet.getRow(headerRow).eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: green ? C.green : C.navy } };
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  for (let number = headerRow + 1; number <= headerRow + rows.length; number++) {
    const row = sheet.getRow(number); row.height = 28;
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: 'Calibri', size: 11, color: { argb: C.ink } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'hair', color: { argb: C.border } } };
    });
  }
}
function totalRow(sheet, number, columns, values) {
  const row = sheet.getRow(number); row.height = 31;
  for (let column = 1; column <= columns; column++) {
    const cell = row.getCell(column); cell.value = values[column - 1] ?? null;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } };
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } };
    cell.alignment = { vertical: 'middle', horizontal: column === 1 ? 'left' : 'right', wrapText: true };
  }
}
function detailSheet(workbook, name, records, meta, kind) {
  const sheet = workbook.addWorksheet(name, { properties: { tabColor: { argb: kind === 'remnants' ? C.green : C.gold } } });
  const headers = ['Identificador', 'Tipo de aço', 'Espessura (mm)', 'Largura (mm)', 'Comprimento (mm)', 'Quantidade (un.)', 'Peso unitário (kg)', 'Peso em estoque (kg)', 'Densidade (kg/m³)', 'Localização / Prateleira', 'Observações', 'Situação', 'ID do retalho de origem', 'Cadastro (Brasília)', 'Revisão'];
  if (kind === 'sheets') headers.push('Ponto de reposição (un.)', 'Arquivamento (Brasília)');
  [35, 20, 17, 17, 20, 18, 22, 23, 21, 30, 52, 18, 35, 26, 12, 22, 26].slice(0, headers.length).forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  frame(sheet, `CHAPARIA  /  ${name.toLocaleUpperCase('pt-BR')}`, 'Cada linha representa um cadastro. O peso unitário corresponde a UMA peça; o peso em estoque considera o saldo.', headers.length, meta, 8);
  mergeText(sheet, 5, 1, headers.length, 'Os filtros da tabela permitem separar aço, espessura e situação. A linha final soma somente os registros visíveis.', { font: { size: 10, color: { argb: C.muted } } });
  mergeText(sheet, 6, 1, headers.length, kind === 'remnants' ? 'Retalhos consumidos estão incluídos com quantidade e peso em estoque iguais a zero. Formatos em L e furos não são descontados.' : 'Todo o catálogo está incluído, mesmo sem saldo. O peso unitário usa as dimensões cadastradas de cada chapa.', { font: { size: 10, color: { argb: C.muted } } });
  const start = 9, end = start + records.length - 1;
  const rows = records.map((record, index) => {
    const number = start + index;
    return [String(record.id), record.materialLabel, Number(record.thickness), Number(record.width), Number(record.length), record.quantity,
      formula(`C${number}*D${number}*E${number}*I${number}/1000000000`, record.unitKg), formula(`F${number}*G${number}`, record.totalKg), record.density,
      String(record.location || ''), String(record.notes || ''), record.status, String(record.parentId || ''), dateLabel(record.createdAt), Number(record.revision || 1), ...(kind === 'sheets' ? [record.reorderPoint, dateLabel(record.archivedAt)] : [])];
  });
  // An empty sheet has an explicit empty state, without a fake stock record.
  if (rows.length) table(sheet, kind === 'remnants' ? 'TabelaRetalhos' : 'TabelaChapas', 8, headers, rows, kind === 'remnants');
  else {
    table(sheet, kind === 'remnants' ? 'TabelaRetalhos' : 'TabelaChapas', 8, headers, [], kind === 'remnants');
    mergeText(sheet, 10, 1, headers.length, 'Nenhum registro cadastrado nesta categoria.', { font: { italic: true, color: { argb: C.muted } } });
  }
  for (let number = start; number <= end; number++) {
    const row = sheet.getRow(number), record = records[number - start];
    row.height = Math.min(100, Math.max(30, Math.ceil(String(record.notes || '').length / 55) * 15));
    for (const column of [3, 4, 5]) row.getCell(column).numFmt = MM;
    for (const column of [6, 9, 15]) row.getCell(column).numFmt = INTEGER;
    for (const column of [7, 8]) { row.getCell(column).numFmt = KG; row.getCell(column).font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.green } }; }
    if (!record.quantity) row.getCell(12).font = { name: 'Calibri', size: 10, italic: true, color: { argb: C.muted } };
    if (kind === 'sheets' && needsRestock(record)) {
      row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.amber } };
      row.getCell(6).note = `Nível crítico: saldo menor ou igual ao ponto de reposição de ${reorderPoint(record)} chapas.`;
    }
  }
  const footer = rows.length ? end + 1 : 12;
  const quantity = records.reduce((sum, record) => sum + record.quantity, 0), mass = records.reduce((sum, record) => sum + record.totalKg, 0);
  const totals = []; totals[0] = 'TOTAL VISÍVEL'; totals[5] = rows.length ? formula(`SUBTOTAL(109,F${start}:F${end})`, quantity) : 0; totals[7] = rows.length ? formula(`SUBTOTAL(109,H${start}:H${end})`, mass) : 0;
  totalRow(sheet, footer, headers.length, totals); sheet.getCell(`F${footer}`).numFmt = INTEGER; sheet.getCell(`H${footer}`).numFmt = KG;
  sheet.pageSetup.printArea = `A1:${String.fromCharCode(64 + headers.length)}${footer}`;
  return { start, end, footer, count: records.length, sheet };
}
function range(sheetName, column, info) {
  // An empty collection contributes no rows; its range stays below its header.
  return `'${sheetName}'!$${column}$${info.start}:$${column}$${Math.max(info.start, info.end)}`;
}
export function createWeightsWorkbook(data, options = {}) {
  const meta = { generatedAt: options.generatedAt || new Date(), email: options.email || '', connected: options.connected !== false };
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Chaparia · Controle Industrial'; workbook.title = 'Pesos do estoque de chapas e retalhos'; workbook.subject = 'Estoque por aço, espessura e peso unitário';
  workbook.created = new Date(meta.generatedAt); workbook.modified = new Date(meta.generatedAt); workbook.calcProperties.fullCalcOnLoad = true;
  const summary = stockWeightSummary(data), details = stockWeightDetails(data);
  const overview = workbook.addWorksheet('Resumo', { properties: { tabColor: { argb: C.gold } } });
  const sheets = detailSheet(workbook, 'Chapas inteiras', details.sheets, meta, 'sheets');
  const remnants = detailSheet(workbook, 'Retalhos', details.remnants, meta, 'remnants');
  [25, 19, 23, 23, 23, 23, 25].forEach((width, index) => { overview.getColumn(index + 1).width = width; });
  frame(overview, 'CHAPARIA  /  PESOS DO ESTOQUE', 'Visão executiva · Chapas inteiras e retalhos separados por tipo de aço e espessura', 7, meta, 10);
  const cards = [
    [1, 2, 'CHAPAS INTEIRAS', formula(sheets.count ? `SUM(${range('Chapas inteiras', 'H', sheets)})` : '0', summary.sheetKg), `${summary.sheetQuantity} chapa(s) em estoque`],
    [3, 4, 'RETALHOS', formula(remnants.count ? `SUM(${range('Retalhos', 'H', remnants)})` : '0', summary.remnantKg), `${summary.remnantQuantity} peça(s) aproveitáveis`],
    [5, 7, 'TOTAL EM ESTOQUE', formula('A7+C7', summary.totalKg), 'Peso estimado · kg']
  ];
  for (const [first, last, title, value, caption] of cards) {
    mergeText(overview, 6, first, last, title, { fill: C.pale, font: { size: 10, bold: true, color: { argb: C.green } } });
    mergeText(overview, 7, first, last, value, { fill: C.pale, font: { size: 24, bold: true, color: { argb: C.ink } } }).numFmt = KG;
    mergeText(overview, 8, first, last, caption, { fill: C.pale, font: { size: 10, color: { argb: C.muted } } });
  }
  overview.getRow(7).height = 40;
  const summaryRows = summary.materials.flatMap(group => group.rows.map(row => ({ ...row, material: group.name })));
  const sum = (name, column, info, number) => info.count ? `SUMIFS(${range(name, column, info)},${range(name, 'B', info)},A${number},${range(name, 'C', info)},B${number})` : '0';
  table(overview, 'ResumoPorEspessura', 10, ['Tipo de aço', 'Espessura (mm)', 'Chapas (un.)', 'Peso chapas (kg)', 'Retalhos (un.)', 'Peso retalhos (kg)', 'Peso total (kg)'], summaryRows.map((row, index) => {
    const number = 11 + index;
    return [row.material, row.thickness, formula(sum('Chapas inteiras', 'F', sheets, number), row.sheetQuantity), formula(sum('Chapas inteiras', 'H', sheets, number), row.sheetKg), formula(sum('Retalhos', 'F', remnants, number), row.remnantQuantity), formula(sum('Retalhos', 'H', remnants, number), row.remnantKg), formula(`D${number}+F${number}`, row.totalKg)];
  }));
  const end = 10 + summaryRows.length;
  for (let number = 11; number <= end; number++) {
    overview.getCell(`B${number}`).numFmt = MM;
    for (const column of ['D', 'F', 'G']) overview.getCell(`${column}${number}`).numFmt = KG;
    for (const column of ['C', 'E']) overview.getCell(`${column}${number}`).numFmt = INTEGER;
  }
  totalRow(overview, end + 1, 7, ['TOTAL VISÍVEL', null, formula(summaryRows.length ? `SUBTOTAL(109,C11:C${end})` : '0', summary.sheetQuantity), formula(summaryRows.length ? `SUBTOTAL(109,D11:D${end})` : '0', summary.sheetKg), formula(summaryRows.length ? `SUBTOTAL(109,E11:E${end})` : '0', summary.remnantQuantity), formula(summaryRows.length ? `SUBTOTAL(109,F11:F${end})` : '0', summary.remnantKg), formula(summaryRows.length ? `SUBTOTAL(109,G11:G${end})` : '0', summary.totalKg)]);
  for (const column of ['D', 'F', 'G']) overview.getCell(`${column}${end + 1}`).numFmt = KG;
  mergeText(overview, end + 3, 1, 7, 'CHAPAS INTEIRAS e RETALHOS: consulte as abas para ver peso de uma peça, saldo, medidas, identificação e observações.', { font: { size: 10, color: { argb: C.muted } } });
  mergeText(overview, end + 4, 1, 7, 'Estimativa: carbono 7.850 kg/m³ • inox 8.000 kg/m³. Recortes e furos não são descontados. Consulte a aba Critérios.', { font: { size: 10, color: { argb: C.muted } } });
  overview.getRow(end + 3).height = 30; overview.getRow(end + 4).height = 30; overview.pageSetup.printArea = `A1:G${end + 4}`;
  const criteria = workbook.addWorksheet('Critérios', { properties: { tabColor: { argb: C.muted } } });
  criteria.getColumn(1).width = 32; for (let col = 2; col <= 7; col++) criteria.getColumn(col).width = 20;
  frame(criteria, 'CHAPARIA  /  CRITÉRIOS DO RELATÓRIO', 'Premissas, unidades e leitura da planilha', 7, meta, 6);
  const notes = [
    ['Peso de uma peça', 'Largura (mm) × comprimento (mm) × espessura (mm) × densidade (kg/m³) ÷ 1.000.000.000.'],
    ['Peso em estoque', 'Peso unitário × quantidade disponível. Linhas com saldo zero têm peso em estoque zero.'],
    ['Materiais adicionais', summary.materials.filter(m => !['carbono','inox'].includes(m.material)).map(m => `${m.name}: ${m.density} kg/m³`).join(' • ') || 'Nenhum material adicional cadastrado.'],
    ['Aço Carbono', 'Densidade de referência: 7.850 kg/m³.'], ['Aço Inox', 'Densidade de referência: 8.000 kg/m³. A liga específica pode alterar o peso real.'],
    ['Retalhos irregulares', 'Medidas tratadas como um retângulo. Furos, formatos em L e recortes não são descontados; confira as observações.'],
    ['Abrangência', 'Inclui todo o catálogo de chapas e todos os retalhos cadastrados, inclusive consumidos. Atividades e histórico de movimentações não fazem parte deste relatório de pesos.'],
    ['Cadastros e peças', 'Uma linha representa um cadastro de peças iguais. Não são criados identificadores fictícios para cada unidade do lote.'],
    ['Precisão e fórmulas', 'Valores exibidos com duas casas decimais, calculados sem arredondamento intermediário. As fórmulas têm resultados salvos e são recalculadas pelo Excel.'],
    ['Filtros e totais', 'Nas abas detalhadas, TOTAL VISÍVEL usa SUBTOTAL para acompanhar os filtros. O resumo por espessura usa SUMIFS para todos os registros da categoria.'],
    ['Impressão', 'Resumo em A4 paisagem; detalhes em A3 paisagem, com cabeçalho e identificação repetidos, margens ajustadas e até duas páginas de largura para manter a leitura.'],
    ['Atualização', 'Arquivo independente: retrato do estoque na exportação. Para receber alterações posteriores, exporte novamente pelo sistema.'],
    ['Datas', 'Horários de emissão e cadastro exibidos no fuso America/Sao_Paulo (Brasília). Campo de cadastro vazio significa que o registro não possui essa informação.']
  ];
  for (const [index, [title, description]] of notes.entries()) {
    const number = 6 + index * 2;
    mergeText(criteria, number, 1, 7, title, { fill: C.pale, font: { bold: true, color: { argb: C.green } } });
    mergeText(criteria, number + 1, 1, 7, description); criteria.getRow(number + 1).height = 34;
  }
  criteria.pageSetup.printArea = `A1:G${5 + notes.length * 2}`;
  workbook.views = [{ activeTab: 0 }];
  return workbook;
}
export async function weightsExcelBuffer(data, options) {
  return createWeightsWorkbook(data, options).xlsx.writeBuffer();
}
