import JSZip from 'jszip';

const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const numeric = value => Number(String(value ?? '').replace(',', '.'));
const positive = value => Number.isFinite(numeric(value)) && numeric(value) > 0;
const validCode = /^(?:CAR|INOX)-\d+$/;
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
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
    if (!Array.isArray(row) || !validCode.test(row[0] || '') || codes.has(row[0]) || !row.slice(1, 4).every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1000000) || row.length < 4 || !Number.isSafeInteger(row[3]) || (row[4] && row[1] !== row[2])) throw new Error('Confira código, medidas e quantidade das correções.');
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
  return parseRemnantRows(rows, file.name);
}

export function parseRemnantRows(rows, filename) {
  const header = rows.find(row => Object.values(row).some(value => normalize(value) === 'codigo'));
  if (!header) throw new Error('Não encontrei os cabeçalhos do cadastro de retalhos.');
  const column = (...names) => Object.keys(header).find(key => names.includes(normalize(header[key])));
  const columns = {
    code: column('codigo'), material: column('material'), thickness: column('espessura (mm)'), format: column('formato'),
    length: column('comprimento (mm)'), width: column('largura (mm)'), diameter: column('diametro (mm)'), quantity: column('qtd.', 'qtd', 'quantidade'),
    origin: column('origem'), order: column('linha na coluna', 'ordem na coluna'), annotation: column('anotacao original', 'medida transcrita'), status: column('situacao'), notes: column('observacao', 'observacoes')
  };
  if (['code','material','thickness','format','length','width','quantity'].some(key => !columns[key])) throw new Error('As colunas da planilha não correspondem ao cadastro de retalhos.');
  const get = (row, key) => row[columns[key]] ?? '';
  const records = [], pending = [], warnings = [], materials = new Set();
  for (const row of rows.filter(row => validCode.test(get(row, 'code')))) {
    const code = get(row, 'code');
    const material = ({ carbono: 'carbono', 'aco carbono': 'carbono', inox: 'inox', 'aco inox': 'inox', 'aco inoxidavel': 'inox' })[normalize(get(row, 'material'))];
    if (!material || (code.startsWith('INOX-') ? material !== 'inox' : material !== 'carbono')) throw new Error(`${code}: confira o material e o prefixo do código.`);
    materials.add(material);
    const record = {
      code, material, thickness: numeric(get(row, 'thickness')), width: numeric(get(row, 'width')), length: numeric(get(row, 'length')), quantity: numeric(get(row, 'quantity')), location: code,
      notes: `Origem: ${filename}; ${get(row, 'origin')}, linha ${get(row, 'order')}. Anotação: ${get(row, 'annotation')}. Prateleira não informada.`
    };
    if (get(row, 'notes')) record.notes += ` Observação de origem: ${get(row, 'notes')}.`;
    const circular = normalize(get(row, 'format')) === 'circular';
    const writtenDiameter = /^[Ø⌀]\s*(\d+(?:[.,]\d+)?)(?:\s*mm)?$/i.exec(get(row, 'annotation'));
    const diameter = positive(get(row, 'diameter')) ? numeric(get(row, 'diameter')) : writtenDiameter ? numeric(writtenDiameter[1]) : 0;
    if (circular && diameter > 0) {
      record.width = record.length = diameter;
      record.notes += ` Circular Ø${diameter} mm; cadastro ${diameter} × ${diameter} mm. Peso estimado pelo envelope retangular.`;
    }
    if (!positive(record.thickness) || !positive(record.quantity)) throw new Error(`${code}: espessura ou quantidade inválidos.`);
    if (normalize(get(row, 'format')) === 'indefinido' || (circular && !diameter) || !positive(record.width) || !positive(record.length)) {
      pending.push({ ...record, original: get(row, 'annotation'), width: '', length: '' });
    } else {
      const status = get(row, 'status');
      if (status && !['transcrito', 'conferido'].includes(normalize(status))) {
        record.notes += ` Conferência indicada na origem: ${status}.`;
        warnings.push(`${code}: conferir ${record.length} × ${record.width} mm.`);
      }
      records.push(record);
    }
  }
  if (records.length + pending.length === 0 || records.length + pending.length > 1000) throw new Error('A planilha deve conter de 1 a 1.000 registros CAR- ou INOX-.');
  if (materials.size !== 1) throw new Error('Importe carbono e inox em planilhas separadas para preservar a identificação dos lotes.');
  return { batch: { format: 'chaparia-retalhos', version: 1, batchId: 'controle-retalhos-' + [...materials][0], source: filename, records }, pending, warnings };
}
