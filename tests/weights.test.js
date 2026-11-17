import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pieceWeightKg, stockWeightSummary } from '../js/weights.js';
import { initialState, applyOperation } from '../js/domain.js';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('millimetre dimensions convert to kilograms using the density of each steel', () => {
  near(pieceWeightKg({ material: 'carbono', width: 1500, length: 3000, thickness: 2 }), 70.65);
  near(pieceWeightKg({ material: 'inox', width: 1500, length: 3000, thickness: 2 }), 72);
  near(pieceWeightKg({ material: 'carbono', width: 800, length: 1200, thickness: 4.76 }), 35.87136);
});

test('weights sum individual dimensions and quantities separately by steel and thickness', () => {
  const summary = stockWeightSummary({
    sheets: {
      a: { material: 'carbono', thickness: 2, width: 1500, length: 3000, quantity: 2 },
      b: { material: 'carbono', thickness: 2, width: 1000, length: 1000, quantity: 1 },
      c: { material: 'inox', thickness: 2, width: 1500, length: 3000, quantity: 1 }
    },
    remnants: {
      a: { material: 'carbono', thickness: 2, width: 500, length: 1000, quantity: 3 },
      b: { material: 'carbono', thickness: 2, width: 200, length: 500, quantity: 2 },
      c: { material: 'inox', thickness: 2, width: 500, length: 1000, quantity: 2 }
    }
  });
  const carbon = summary.materials.find(group => group.material === 'carbono');
  const row = carbon.rows.find(row => row.thickness === 2);
  assert.equal(row.sheetQuantity, 3); assert.equal(row.remnantQuantity, 5);
  near(row.sheetKg, 157); near(row.remnantKg, 26.69); near(row.totalKg, 183.69);
  near(summary.materials.find(group => group.material === 'inox').totalKg, 88);
  near(summary.sheetKg, 229); near(summary.remnantKg, 42.69); near(summary.totalKg, 271.69);
  assert.equal(summary.sheetQuantity, 4); assert.equal(summary.remnantQuantity, 7);
  assert.equal(carbon.rows.find(row => row.thickness === 3).totalKg, 0);
});

test('empty Firebase collections and the initial catalog produce zero totals for all 14 thicknesses', () => {
  for (const data of [{}, { sheets: null, remnants: null }, initialState()]) {
    const summary = stockWeightSummary(data);
    assert.equal(summary.materials.flatMap(group => group.rows).length, 14);
    assert.equal(summary.sheetKg, 0); assert.equal(summary.remnantKg, 0); assert.equal(summary.totalKg, 0);
  }
});

test('consumed remnants add no weight and calculations do not change stored records', () => {
  const state = initialState();
  state.remnants = { consumed: { material: 'inox', thickness: 6, width: 1000, length: 2000, quantity: 0 } };
  const original = structuredClone(state);
  assert.equal(stockWeightSummary(state).remnantKg, 0); assert.deepEqual(state, original);
});

test('sub-remnant cutting recalculates the remaining batch and its child dimensions', () => {
  const actor = { uid: 'operator', email: 'pcp@example.com' };
  let state = applyOperation(initialState(), { type: 'remnant-add', id: 'batch', eventId: 'add', material: 'carbono', thickness: 4.76, width: 800, length: 1200, quantity: 3, location: 'R1' }, actor, 1700000000000);
  near(stockWeightSummary(state).remnantKg, 107.61408);
  state = applyOperation(state, { type: 'remnant-resize', id: 'batch', childId: 'child', eventId: 'cut', revision: 1, width: 400, length: 600 }, actor, 1700000000001);
  const summary = stockWeightSummary(state);
  assert.equal(summary.remnantQuantity, 3); near(summary.remnantKg, 80.71056);
});
