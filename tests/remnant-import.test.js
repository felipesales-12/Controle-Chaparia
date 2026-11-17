import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, prepareRemnantImport, applyOperation, transactionReducer } from '../js/domain.js';
import { applyRemnantCorrections } from '../js/remnant-file.js';
const actor = { uid: 'pcp', email: 'pcp@example.com' };
const batch = records => ({ format: 'chaparia-retalhos', version: 1, batchId: 'test-batch', source: 'test.xlsx', records });
const record = (code, extra = {}) => ({ code, material: 'carbono', thickness: 2, width: 400, length: 800, quantity: 1, location: code, notes: '', ...extra });
const apply = (state, batch, eventId = 'import-1') => applyOperation(state, { type: 'remnant-import', batch, eventId }, actor, 1700000000000);

test('batch import keeps each code, quantity and dimensions and audits each remnant atomically', () => {
  const original = initialState();
  const next = apply(original, batch([record('CAR-9001', { quantity: 25, width: 330, length: 330, notes: 'Circular Ø330 mm' }), record('CAR-9002')]));
  assert.equal(original.remnants, undefined);
  assert.equal(next.remnants['test-batch-CAR-9001'].quantity, 25);
  assert.equal(next.remnants['test-batch-CAR-9001'].location, 'CAR-9001');
  assert.equal(next.remnants['test-batch-CAR-9001'].width, 330);
  assert.equal(Object.keys(next.movements).length, 3);
  assert.equal(next.movements['import-1-r0'].after.notes, 'Circular Ø330 mm');
  assert.equal(next.movements['import-1-r0'].actor.uid, 'pcp');
  assert.equal(next.movements['import-1'].after.pieces, 26);
});
test('an exact new thickness is added at zero without merging 9.53 into 9.35 or replacing existing stock', () => {
  const state = initialState(); state.sheets['carbono-9_35'].quantity = 7;
  const next = apply(state, batch([record('CAR-9001', { thickness: 9.53 })]));
  assert.equal(next.sheets['carbono-9_35'].quantity, 7);
  assert.equal(next.sheets['carbono-9_53'].quantity, 0);
  assert.equal(next.remnants['test-batch-CAR-9001'].thickness, 9.53);
  assert.equal(next.movements['import-1-s0'].type, 'sheet-add');
});
test('reimport never restores consumed or resized pieces and permits additional corrected records', () => {
  const file = batch([record('CAR-9001'), record('CAR-9002')]);
  let state = apply(initialState(), file);
  state = applyOperation(state, { type: 'remnant-consume', id: 'test-batch-CAR-9001', revision: 1, eventId: 'consume' }, actor, 1700000001000);
  state = applyOperation(state, { type: 'remnant-resize', id: 'test-batch-CAR-9002', revision: 1, width: 200, length: 400, eventId: 'resize' }, actor, 1700000002000);
  assert.throws(() => apply(state, file, 'again'), /já foram importados/);
  const next = apply(state, batch([...file.records, record('CAR-9003')]), 'extra');
  assert.equal(next.remnants['test-batch-CAR-9001'].quantity, 0);
  assert.equal(next.remnants['test-batch-CAR-9002'].width, 200);
  assert.equal(Object.keys(next.remnants).length, 3);
  assert.equal(next.movements.extra.after.skipped, 2);
});
test('invalid later records roll back the entire batch including new catalog entries', () => {
  const original = initialState(), before = JSON.stringify(original);
  const transaction = transactionReducer({ type: 'remnant-import', batch: batch([record('CAR-9001', { thickness: 9.53 }), record('CAR-9002', { width: 0 })]), eventId: 'bad' }, actor, 1);
  assert.equal(transaction.update(original), undefined); assert.match(transaction.error.message, /Largura/);
  assert.equal(JSON.stringify(original), before);
});
test('duplicates, malformed identifiers, unknown materials and partial dimensions are rejected', () => {
  for (const records of [[record('CAR-9001'), record('CAR-9001')], [record('../unsafe')], [record('CAR-9001', { material: 'unknown' })], [record('CAR-9001', { length: '' })], [record('CAR-9001', { quantity: 1.5 })]]) assert.throws(() => prepareRemnantImport(batch(records), initialState()));
  const state = initialState(); state.remnants = { 'test-batch-CAR-9001': { ...record('CAR-9001'), id: 'test-batch-CAR-9001' } };
  assert.throws(() => prepareRemnantImport(batch([record('CAR-9001')]), state), /outro cadastro/);
});
test('batch imports respect archived thicknesses and preserve activities', () => {
  const state = initialState(); state.sheets['carbono-2'].active = false;
  assert.throws(() => apply(state, batch([record('CAR-9001')])), /Reative/);
  state.sheets['carbono-2'].active = true;
  state.tasks = { task1: { title: 'Atividade existente' } };
  const next = apply(state, batch([record('CAR-9001')]));
  assert.deepEqual(next.tasks, state.tasks);
});
test('prepared corrections fill only matching pending codes, preserve source data and validate quantities', () => {
  const input = { batch: batch([record('CAR-9001')]), pending: [record('CAR-9002', { width: '', length: '', original: 'Ø300-25' })], warnings: [] };
  const corrected = applyRemnantCorrections(input, [['CAR-9002', 300, 300, 25, true]]);
  assert.equal(corrected.pending.length, 0);
  assert.equal(corrected.batch.records[1].quantity, 25);
  assert.equal(corrected.batch.records[1].width, 300);
  assert.match(corrected.batch.records[1].notes, /Circular Ø300/);
  assert.equal(input.pending.length, 1);
  assert.throws(() => applyRemnantCorrections(input, [['CAR-9999', 300, 300, 1]]), /não contém/);
  assert.throws(() => applyRemnantCorrections(input, [['CAR-9002', 300, 300, 1.5]]), /Confira/);
});
