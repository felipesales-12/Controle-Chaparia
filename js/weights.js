import { MATERIALS } from './domain.js';

// Reference densities for an estimated mass; the specific alloy can vary.
export const STEEL_DENSITIES = Object.freeze({ carbono: 7850, inox: 8000 });

export function pieceWeightKg(item) {
  const density = STEEL_DENSITIES[item.material];
  const dimensions = [item.width, item.length, item.thickness].map(Number);
  if (!density || dimensions.some(value => !Number.isFinite(value) || value <= 0)) return 0;
  // All three dimensions are in millimetres: 1 m³ = 1,000,000,000 mm³.
  return dimensions.reduce((volume, dimension) => volume * dimension, 1) * density / 1e9;
}

export function stockWeightSummary(data = {}) {
  const materials = Object.entries(MATERIALS).map(([material, info]) => ({
    material, name: info.name, density: STEEL_DENSITIES[material],
    rows: info.thicknesses.map(thickness => ({ thickness, sheetQuantity: 0, sheetKg: 0, remnantQuantity: 0, remnantKg: 0, totalKg: 0 })),
    sheetQuantity: 0, sheetKg: 0, remnantQuantity: 0, remnantKg: 0, totalKg: 0
  }));
  for (const [collection, quantityKey, massKey] of [['sheets', 'sheetQuantity', 'sheetKg'], ['remnants', 'remnantQuantity', 'remnantKg']]) {
    for (const item of Object.values(data[collection] || {})) {
      const group = materials.find(entry => entry.material === item.material);
      const row = group?.rows.find(entry => entry.thickness === Number(item.thickness));
      const quantity = Number(item.quantity);
      if (!row || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
      const mass = pieceWeightKg(item) * quantity;
      row[quantityKey] += quantity; row[massKey] += mass; row.totalKg += mass;
      group[quantityKey] += quantity; group[massKey] += mass; group.totalKg += mass;
    }
  }
  // Keep full precision in calculations; round only when presenting the result.
  return {
    materials,
    sheetQuantity: materials.reduce((sum, group) => sum + group.sheetQuantity, 0),
    sheetKg: materials.reduce((sum, group) => sum + group.sheetKg, 0),
    remnantQuantity: materials.reduce((sum, group) => sum + group.remnantQuantity, 0),
    remnantKg: materials.reduce((sum, group) => sum + group.remnantKg, 0),
    totalKg: materials.reduce((sum, group) => sum + group.totalKg, 0)
  };
}
