import JSZip from 'jszip';

const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const numeric = value => Number(String(value ?? '').replace(',', '.'));
const positive = value => Number.isFinite(numeric(value)) && numeric(value) > 0;
function xml(source) {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('A planilha contém XML inválido.');
  return doc;
}
const elements = (node, name) => [...node.getElementsByTagNameNS(ns, name)];

export async function readPreparedRemnantLink(payload) {
  if (payload.length > 64000 || !/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error('O link de importação é inválido.');
  if (typeof DecompressionStream === 'undefined') throw new Error('Abra o link de importação em uma versão atualizada do navegador.');
  const bytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4)), char => char.charCodeAt(0));
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 1000000) throw new Error('O lote de importação excede o tamanho permitido.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return JSON.parse(await new Blob(chunks).text());
}

export function validateRemnantCorrections(corrections) {
  if (!Array.isArray(corrections) || !corrections.length || corrections.length > 1000) throw new Error('Correções de medidas inválidas.');
  const codes = new Set();
  for (const row of corrections) {
    if (!Array.isArray(row) || !/^CAR-\d+$/.test(row[0] || '') || codes.has(row[0]) || !row.slice(1, 4).every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1000000) || row.length < 4 || !Number.isSafeInteger(row[3]) || (row[4] && row[1] !== row[2])) throw new Error('Confira código, medidas e quantidade das correções.');
    codes.add(row[0]);
  }
  return corrections;
}
export function applyRemnantCorrections(parsed, corrections) {
  validateRemnantCorrections(corrections);
  const fixed = new Map(corrections.map(row => [row[0], row]));
  const all = [...parsed.batch.records, ...parsed.pending];
  if (corrections.some(row => !all.some(record => record.code === row[0]))) throw new Error('A planilha selecionada não contém todos os códigos das correções preparadas.');
  const correct = record => {
    const row = fixed.get(record.code);
    if (!row) return record;
    const { original, ...copy } = record;
    return { ...copy, length: row[1], width: row[2], quantity: row[3], notes: record.notes + ' Medidas e quantidade corrigidas pelo responsável no cadastro.' + (row[4] ? ` Circular Ø${row[1]} mm; cadastro ${row[1]} × ${row[2]} mm. Peso estimado pelo envelope retangular.` : '') };
  };
  return { ...parsed, batch: { ...parsed.batch, records: [...parsed.batch.records.map(correct), ...parsed.pending.filter(r => fixed.has(r.code)).map(correct)] }, pending: parsed.pending.filter(r => !fixed.has(r.code)) };
}

// Reads values only: formulas, macros and instructions in other tabs never run.
export async function readRemnantFile(file) {
  if (file.size > 5 * 1024 * 1024) throw new Error('Selecione um arquivo de até 5 MB.');
  if (/\.json$/i.test(file.name)) return { batch: JSON.parse(await file.text()), pending: [], warnings: [] };
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Selecione a planilha .xlsx ou um arquivo de importação .json.');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const readXml = async path => {
    const entry = zip.file(path);
    if (!entry) throw new Error(`Estrutura da planilha incompleta: ${path}.`);
    return xml(await entry.async('string'));
  };
  const workbook = await readXml('xl/workbook.xml');
  const sheet = elements(workbook, 'sheet').find(s => s.getAttribute('name') === 'Cadastro de retalhos');
  if (!sheet) throw new Error('Não encontrei a aba Cadastro de retalhos.');
  const id = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rels = await readXml('xl/_rels/workbook.xml.rels');
  const relationship = [...rels.getElementsByTagNameNS('*', 'Relationship')].find(r => r.getAttribute('Id') === id);
  if (!relationship || relationship.getAttribute('TargetMode') === 'External') throw new Error('Referência de aba inválida.');
  const target = relationship.getAttribute('Target');
  const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
  if (path.includes('..')) throw new Error('Caminho de aba inválido.');
  const doc = await readXml(path);
  const strings = zip.file('xl/sharedStrings.xml') ? elements(await readXml('xl/sharedStrings.xml'), 'si').map(si => elements(si, 't').map(t => t.textContent).join('')) : [];
  const rows = elements(doc, 'row').map(row => Object.fromEntries(elements(row, 'c').map(cell => {
    const column = cell.getAttribute('r').replace(/\d+$/, '');
    const value = elements(cell, 'v')[0]?.textContent ?? '';
    return [column, cell.getAttribute('t') === 's' ? strings[Number(value)] : cell.getAttribute('t') === 'inlineStr' ? elements(cell, 't').map(t => t.textContent).join('') : value];
  })));
  const header = rows.find(row => row.A === 'Código');
  if (!header || header.B !== 'Material' || header.C !== 'Espessura (mm)' || header.E !== 'Comprimento (mm)' || header.F !== 'Largura (mm)' || header.G !== 'Qtd.') throw new Error('As colunas da planilha não correspondem ao cadastro de retalhos.');
  const records = [], pending = [], warnings = [];
  for (const row of rows.filter(row => /^CAR-\d+$/.test(row.A || ''))) {
    const record = {
      code: row.A, material: /^carbono$|^aço carbono$/i.test(row.B || '') ? 'carbono' : '',
      thickness: numeric(row.C), width: numeric(row.F), length: numeric(row.E), quantity: numeric(row.G), location: row.A,
      notes: `Origem: ${file.name}; ${row.H || ''}, linha ${row.I || ''}. Anotação: ${row.J || ''}. Prateleira não informada.`
    };
    const diameter = row.D === 'Circular' && /^Ø\s*(\d+(?:[.,]\d+)?)$/i.exec(row.J || '');
    if (diameter) {
      record.width = record.length = numeric(diameter[1]);
      record.notes += ` Circular Ø${record.width} mm; cadastro ${record.width} × ${record.width} mm. Peso estimado pelo envelope retangular.`;
    }
    if (!record.material || !positive(record.thickness) || !positive(record.quantity)) throw new Error(`${row.A}: material, espessura ou quantidade inválidos.`);
    if (row.D === 'Indefinido' || !positive(record.width) || !positive(record.length)) {
      pending.push({ ...record, original: row.J || '', width: '', length: '' });
    } else {
      if (row.K && row.K !== 'Transcrito' && !diameter) {
        record.notes += ` Conferência indicada na origem: ${row.K}.`;
        warnings.push(`${row.A}: conferir ${record.length} × ${record.width} mm.`);
      }
      records.push(record);
    }
  }
  if (records.length + pending.length === 0 || records.length + pending.length > 1000) throw new Error('A planilha deve conter de 1 a 1.000 registros CAR-.');
  return { batch: { format: 'chaparia-retalhos', version: 1, batchId: 'controle-retalhos-carbono', source: file.name, records }, pending, warnings };
}
