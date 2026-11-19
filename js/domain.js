import { validateBackup } from './backup.js';
import { PRODUCT_CODES, addMissingProductTypes, productCode } from './product-codes.js';

import { MATERIALS, getMaterials, materialName, activeSheets, needsRestock, reorderPoint } from './catalog.js';
export { MATERIALS, materialName } from './catalog.js';
export const sheetId = (material, thickness) => `${material}-${String(thickness).replace('.', '_')}`;
export function initialState() {
  return { schemaVersion: 1, sheets: Object.fromEntries(Object.entries(MATERIALS).flatMap(([material, info]) => info.thicknesses.map(thickness => {
    const id = sheetId(material, thickness);
    return [id, { id, material, thickness, width: 1500, length: 3000, quantity: 0, location: '', revision: 1 }];
  }))) };
}
export const criticalSheets = sheets => Object.values(sheets || {}).filter(needsRestock);
export const purchaseText = (sheets, data = {}) => ['SOLICITAÇÃO DE COMPRA • CHAPARIA', ...criticalSheets(sheets).map(s => `Solicitar mais chapas: ${materialName(s.material, data)} ${s.thickness}mm — Restam ${s.quantity} chapas${productCode(s) ? ` — Código ${productCode(s)}` : ''} (ponto de reposição: ${reorderPoint(s)}; ${s.length}x${s.width}mm)${s.location ? ` — ${s.location}` : ''}`)].join('\n');
export function number(value, label, integer = false, allowZero = false) {
  const n = Number(value);
  if (String(value).trim() === '' || !Number.isFinite(n) || n < (allowZero ? 0 : Number.MIN_VALUE) || n > 1000000 || (integer && !Number.isSafeInteger(n))) throw new Error(`${label}: informe ${integer ? 'um número inteiro' : 'um número'} ${allowZero ? 'maior ou igual a zero' : 'maior que zero'}, até 1.000.000.`);
  return n;
}
function text(value, limit = 500) { return String(value || '').trim().slice(0, limit); }
function validKey(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('Identificador inválido.');
  return id;
}
function material(values, data = {}) {
  const materials = getMaterials(data);
  if (!Object.hasOwn(materials, values.material) || !materials[values.material].thicknesses.includes(Number(values.thickness))) throw new Error('Selecione um material e uma espessura do catálogo ativo.');
  return { material: values.material, thickness: Number(values.thickness) };
}
export function remnantValues(values, data = {}) {
  const location = text(values.location, 140);
  if (!location) throw new Error('Informe a identificação/prateleira do retalho.');
  return { ...material(values, data), width: number(values.width, 'Largura'), length: number(values.length, 'Comprimento'), quantity: number(values.quantity, 'Quantidade', true), location, notes: text(values.notes, 2000) };
}

// Recomputed inside the cloud transaction. Stable IDs prevent duplicate stock,
// including after a previously imported item has been consumed or cut.
export function prepareRemnantImport(batch, data) {
  if (batch?.format !== 'chaparia-retalhos' || batch.version !== 1 || !Array.isArray(batch.records) || !batch.records.length || batch.records.length > 1000) throw new Error('Arquivo de importação de retalhos inválido. Use o formato chaparia-retalhos, versão 1, com até 1.000 registros.');
  const batchId = validKey(batch.batchId), source = text(batch.source, 200);
  const staged = { ...data, sheets: { ...data.sheets } }, entries = [], additions = [], codes = new Set();
  if (batch.ensureProductCatalog === true) additions.push(...addMissingProductTypes(staged));
  let skipped = 0;
  for (const record of batch.records) {
    const code = validKey(record.code), id = validKey(`${batchId}-${code}`);
    if (codes.has(code)) throw new Error(`Código repetido no arquivo: ${code}.`);
    codes.add(code);
    const existing = data.remnants?.[id];
    if (existing) {
      if (existing.importBatch !== batchId) throw new Error(`O identificador ${code} já pertence a outro cadastro. Nenhum registro foi substituído.`);
      skipped++; continue;
    }
    const materials = getMaterials(staged);
    if (!Object.hasOwn(materials, record.material)) throw new Error(`${code}: material não cadastrado.`);
    const thickness = number(record.thickness, `${code}: espessura`);
    if (thickness > 1000) throw new Error(`${code}: a espessura deve ser menor ou igual a 1.000 mm.`);
    if (!materials[record.material].thicknesses.includes(thickness)) {
      const old = Object.values(staged.sheets).find(s => s.material === record.material && s.thickness === thickness);
      if (old) throw new Error(`${code}: esta espessura foi removida. Reative-a no catálogo antes de importar.`);
      const typeId = validKey(sheetId(record.material, thickness));
      if (staged.sheets[typeId]) throw new Error(`${code}: identificador de espessura em conflito.`);
      const sheet = { id: typeId, material: record.material, thickness, width: 1500, length: 3000, quantity: 0, location: '', reorderPoint: 2, active: true, revision: 1 };
      staged.sheets[typeId] = sheet; additions.push(sheet);
    }
    entries.push({ id, ...remnantValues(record, staged), importBatch: batchId });
  }
  return { batchId, source, entries, additions, skipped, pieces: entries.reduce((total, entry) => total + entry.quantity, 0) };
}

export function fits(remnant, width, length, rotate = true) {
  if (remnant.quantity <= 0 || width <= 0 || length <= 0) return false;
  return (remnant.width >= width && remnant.length >= length) || (rotate && remnant.width >= length && remnant.length >= width);
}
const unchanged = () => { throw new Error('O registro foi alterado em outro aparelho. Atualize a lista e revise a operação.'); };
function currentItem(items, id, revision) {
  const item = items?.[validKey(id)];
  if (!item) throw new Error('Registro não encontrado. Atualize a lista.');
  if (revision !== undefined && (item.revision || item._cloudRevision || 1) !== revision) unchanged();
  return item;
}
function taskValues(value) {
  validKey(value.id);
  return validateBackup({ format: 'atividades-local', version: 1, tasks: [{ ...value, completedAt: value.completedAt ?? null }], settings: {} }).tasks[0];
}
// Pure reducer: used inside runTransaction. Firebase may re-run it after a concurrent write.
export function applyOperation(previous, command, actor, timestamp) {
  if (!previous || previous.schemaVersion !== 1) throw new Error('Estrutura do banco não reconhecida. Solicite uma verificação ao administrador.');
  const state = structuredClone(previous);
  state.sheets ||= {}; state.remnants ||= {}; state.tasks ||= {}; state.movements ||= {};
  let description = '', before = null, after = null, entityId = command.id || '';
  switch (command.type) {
    case 'catalog-product-codes': {
      const added = addMissingProductTypes(state);
      if (!added.length) throw new Error('As espessuras da tabela de códigos já estão cadastradas. Nenhum saldo foi alterado.');
      after = { codes: PRODUCT_CODES.map(row => ({ ...row })), addedThicknesses: added.map(sheet => ({ id: sheet.id, material: sheet.material, thickness: sheet.thickness, quantity: 0 })) };
      description = `Catálogo de códigos atualizado · ${added.length} espessura(s) adicionada(s) com saldo zero`;
      entityId = 'product-codes';
      break;
    }
    case 'material-add': {
      validKey(command.id);
      const name = text(command.name, 80);
      if (!name) throw new Error('Informe o nome do material.');
      const normalized = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (getMaterials(state)[command.id] || Object.values(getMaterials(state)).some(m => normalized(m.name) === normalized(name))) throw new Error('Já existe um material com esse nome.');
      const density = number(command.density, 'Densidade');
      if (density > 30000) throw new Error('A densidade deve ser menor ou igual a 30.000 kg/m³.');
      state.materials ||= {};
      after = { id: command.id, name, density, revision: 1 };
      state.materials[command.id] = after;
      description = `Cadastro de material · ${name}`;
      break;
    }
    case 'sheet-add': {
      const materials = getMaterials(state);
      if (!Object.hasOwn(materials, command.material)) throw new Error('Selecione um material cadastrado.');
      const thickness = number(command.thickness, 'Espessura');
      if (thickness > 1000) throw new Error('A espessura deve ser menor ou igual a 1.000 mm.');
      const id = sheetId(command.material, thickness); validKey(id); entityId = id;
      const old = state.sheets[id];
      if (old && old.active !== false) throw new Error('Esta espessura já está cadastrada para o material.');
      if (old && old.quantity > 0) throw new Error('Revise o saldo da espessura removida antes de reativar.');
      before = old || null;
      after = { id, material: command.material, thickness, width: number(command.width, 'Largura'), length: number(command.length, 'Comprimento'), quantity: 0, location: text(command.location, 140), reorderPoint: number(command.reorderPoint ?? 2, 'Ponto de reposição', true, true), active: true, revision: (old?.revision || 0) + 1 };
      state.sheets[id] = after;
      description = `${old ? 'Reativação' : 'Cadastro'} de espessura · ${materialName(command.material, state)} ${thickness}mm`;
      break;
    }
    case 'sheet-remove': {
      const item = currentItem(state.sheets, command.id, command.revision);
      if (item.active === false) throw new Error('Esta espessura já foi removida.');
      if (item.quantity > 0 || Object.values(state.remnants).some(r => r.material === item.material && Number(r.thickness) === Number(item.thickness) && r.quantity > 0)) throw new Error('Dê baixa nas chapas e retalhos disponíveis desta espessura antes de removê-la.');
      before = { ...item }; item.active = false; item.revision++; item.archivedAt = timestamp; after = { ...item };
      description = `Remoção de espessura do catálogo ativo · ${materialName(item.material, state)} ${item.thickness}mm`;
      break;
    }
    case 'sheet-in':
    case 'sheet-out': {
      const item = currentItem(state.sheets, command.id);
      if (item.active === false) throw new Error('Esta espessura foi removida do catálogo. Adicione-a novamente antes de movimentar.');
      const quantity = number(command.quantity, 'Quantidade', true);
      before = { ...item };
      const next = item.quantity + (command.type === 'sheet-in' ? quantity : -quantity);
      if (next < 0) throw new Error('Saldo insuficiente. A quantidade disponível mudou ou é menor que a baixa.');
      number(next, 'Saldo', true, true);
      item.quantity = next; item.revision++;
      after = { ...item };
      description = `${command.type === 'sheet-in' ? 'Entrada' : 'Baixa por corte'} de ${quantity} chapa(s) · ${materialName(item.material, state)} ${item.thickness}mm`;
      break;
    }
    case 'sheet-edit': {
      const item = currentItem(state.sheets, command.id, command.revision);
      before = { ...item };
      item.width = number(command.width, 'Largura'); item.length = number(command.length, 'Comprimento');
      item.location = text(command.location, 140);
      if (command.reorderPoint !== undefined) item.reorderPoint = number(command.reorderPoint, 'Ponto de reposição', true, true);
      item.revision++;
      after = { ...item }; description = `Dimensões/localização/reposição atualizadas · ${materialName(item.material, state)} ${item.thickness}mm`;
      break;
    }
    case 'remnant-add': {
      validKey(command.id);
      if (state.remnants[command.id]) throw new Error('Este retalho já foi cadastrado.');
      after = { id: command.id, ...remnantValues(command, state), revision: 1, createdAt: timestamp };
      state.remnants[command.id] = after;
      description = `Cadastro de ${after.quantity} retalho(s) · ${materialName(after.material, state)} ${after.thickness}mm · ${after.width}x${after.length}mm`;
      break;
    }
    case 'remnant-import': {
      const plan = prepareRemnantImport(command.batch, state);
      if (!plan.entries.length) throw new Error('Todos os registros deste arquivo já foram importados. Nenhuma quantidade foi alterada.');
      const log = (suffix, type, item, detail) => {
        const id = validKey(`${command.eventId}-${suffix}`);
        if (state.movements[id]) throw new Error('Esta importação já foi confirmada.');
        state.movements[id] = { id, type, entityId: item.id, description: detail, reason: `Importação: ${plan.source}`, actor: { uid: actor.uid, email: actor.email || '' }, timestamp, after: item };
      };
      plan.additions.forEach((sheet, index) => {
        state.sheets[sheet.id] = sheet;
        log(`s${index}`, 'sheet-add', sheet, `Cadastro de espessura · ${materialName(sheet.material, state)} ${sheet.thickness}mm · saldo zero`);
      });
      plan.entries.forEach((entry, index) => {
        const item = { ...entry, revision: 1, createdAt: timestamp };
        state.remnants[item.id] = item;
        log(`r${index}`, 'remnant-add', item, `Cadastro de ${item.quantity} retalho(s) · ${materialName(item.material, state)} ${item.thickness}mm · ${item.width}x${item.length}mm · ${item.location}`);
      });
      entityId = plan.batchId;
      after = { imported: plan.entries.length, pieces: plan.pieces, skipped: plan.skipped, source: plan.source, addedThicknesses: plan.additions.map(s => ({ material: s.material, thickness: s.thickness })), ...(command.batch.ensureProductCatalog === true ? { productCodes: PRODUCT_CODES.map(row => ({ ...row })) } : {}) };
      description = `Importação de retalhos · ${plan.entries.length} registros · ${plan.pieces} peça(s) · ${plan.skipped} já importados`;
      break;
    }
    case 'remnant-consume': {
      const item = currentItem(state.remnants, command.id, command.revision);
      if (!item.quantity) throw new Error('Este retalho já foi consumido.');
      before = { ...item }; item.quantity = 0; item.revision++; after = { ...item };
      description = `Baixa total de ${before.quantity} retalho(s) · ${materialName(item.material, state)} ${item.thickness}mm`;
      break;
    }
    case 'remnant-resize': {
      const item = currentItem(state.remnants, command.id, command.revision);
      if (!item.quantity) throw new Error('Este retalho já foi consumido.');
      const width = number(command.width, 'Largura restante'), length = number(command.length, 'Comprimento restante');
      if (!fits(item, width, length) || width * length >= item.width * item.length) throw new Error('O sub-retalho deve caber no retalho original e ter área menor.');
      before = { ...item }; item.revision++;
      const notes = text(command.notes, 2000), location = text(command.location || item.location, 140);
      if (item.quantity > 1) {
        validKey(command.childId);
        if (state.remnants[command.childId]) throw new Error('Sub-retalho já cadastrado.');
        item.quantity--;
        after = { ...item, id: command.childId, width, length, quantity: 1, location, notes, revision: 1, parentId: item.id, createdAt: timestamp };
        state.remnants[command.childId] = after; entityId = command.childId;
      } else { Object.assign(item, { width, length, location, notes }); after = { ...item }; }
      description = `Corte de 1 retalho · sobra ${width}x${length}mm · ${materialName(item.material, state)} ${item.thickness}mm`;
      break;
    }
    case 'task-add':
    case 'task-put': {
      const task = taskValues(command.task); entityId = task.id;
      const existing = state.tasks[task.id];
      if (command.type === 'task-add' && existing) throw new Error('Esta atividade já foi cadastrada. Atualize a lista.');
      if (command.type === 'task-put') currentItem(state.tasks, task.id, command.task._cloudRevision || 1);
      before = existing || null;
      after = { ...task, _cloudRevision: (existing?._cloudRevision || 0) + 1 };
      state.tasks[task.id] = after;
      description = `${existing ? 'Atualização' : 'Cadastro'} de atividade · ${task.title}`;
      break;
    }
    case 'task-remove': {
      const item = currentItem(state.tasks, command.id, command.revision);
      before = item; delete state.tasks[command.id]; description = `Exclusão de atividade · ${item.title}`; break;
    }
    case 'task-replace': {
      const imported = validateBackup({ format: 'atividades-local', version: 1, tasks: command.tasks, settings: {} }).tasks;
      if (JSON.stringify(state.tasks) !== command.expected) unchanged();
      before = { count: Object.keys(state.tasks).length };
      state.tasks = Object.fromEntries(imported.map(t => [validKey(t.id), { ...t, _cloudRevision: (state.tasks[t.id]?._cloudRevision || 0) + 1 }]));
      after = { count: imported.length }; description = `Restauração de backup de atividades · ${imported.length} registros`; break;
    }
    default: throw new Error('Operação não reconhecida.');
  }
  const eventId = validKey(command.eventId);
  if (state.movements[eventId]) throw new Error('Esta operação já foi confirmada. Atualize a lista antes de repetir.');
  state.movements[eventId] = { id: eventId, type: command.type, entityId, description, reason: text(command.reason), actor: { uid: actor.uid, email: actor.email || '' }, timestamp, ...(before ? { before } : {}), ...(after ? { after } : {}) };
  return state;
}

// Firebase retries update callbacks asynchronously. Abort by returning undefined;
// throwing inside a retry can escape the SDK and leave its transaction unresolved.
export function transactionReducer(command, actor, timestamp) {
  let error = null;
  return {
    update(current) {
      try { error = null; return applyOperation(current, command, actor, timestamp); }
      catch (cause) { error = cause; return undefined; }
    },
    get error() { return error; }
  };
}
