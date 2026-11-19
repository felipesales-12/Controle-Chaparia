import { canonicalItem } from './inox-merge.js';
export const MATERIALS = Object.freeze({ carbono: { name: 'Aço Carbono', density: 7850, thicknesses: [2, 3, 4.76, 6.35, 7.94, 9.35, 12.7, 19.05] }, inox: { name: 'Aço Inox', density: 8000, thicknesses: [1.5, 2, 3, 4, 5, 6.35] } });
export const activeSheets = data => Object.values(data?.sheets || {}).filter(sheet => sheet.active !== false).map(canonicalItem);
export const reorderPoint = sheet => Number.isSafeInteger(sheet.reorderPoint) && sheet.reorderPoint >= 0 ? sheet.reorderPoint : 2;
export const needsRestock = sheet => sheet.active !== false && sheet.quantity <= reorderPoint(sheet);
export const materialName = (key, data = {}) => data.materials?.[key]?.name || MATERIALS[key]?.name || key;
export const materialDensity = (key, data = {}) => Number(data.materials?.[key]?.density ?? MATERIALS[key]?.density ?? 0);
export function getMaterials(data = {}) {
  const definitions = { ...MATERIALS, ...(data.materials || {}) };
  const thicknesses = new Map();
  if (data.sheets != null) for (const sheet of activeSheets(data)) {
    if (!thicknesses.has(sheet.material)) thicknesses.set(sheet.material, new Set());
    thicknesses.get(sheet.material).add(Number(sheet.thickness));
  }
  return Object.fromEntries(Object.entries(definitions).map(([key, info]) => [key, {
    ...info,
    density: materialDensity(key, data),
    // Missing materials/reorderPoint/active fields in older databases need no destructive migration.
    thicknesses: data.sheets == null ? [...(info.thicknesses || [])] : [...(thicknesses.get(key) || [])].sort((a, b) => a - b)
  }]));
}
const tie = (a, b, data) => String(materialName(a.material, data)).localeCompare(String(materialName(b.material, data)), 'pt-BR') || String(a.id).localeCompare(String(b.id));
export function orderInventory(items, order = 'area', data = {}) {
  const materialKeys = order === 'material' ? Object.keys(getMaterials(data)) : [];
  const difference = (a, b, key) => Number(a[key]) - Number(b[key]);
  return [...items].sort((a, b) => {
    let result = 0;
    switch (order) {
      case 'material': {
        const keys = materialKeys;
        result = keys.indexOf(a.material) - keys.indexOf(b.material) || difference(a, b, 'thickness'); break;
      }
      case 'thickness-asc': result = difference(a, b, 'thickness'); break;
      case 'thickness-desc': result = difference(b, a, 'thickness'); break;
      case 'length-asc': result = difference(a, b, 'length'); break;
      case 'length-desc': result = difference(b, a, 'length'); break;
      case 'thickness-length-asc': result = difference(a, b, 'thickness') || difference(a, b, 'length'); break;
      case 'thickness-length-desc': result = difference(b, a, 'thickness') || difference(b, a, 'length'); break;
      case 'length-thickness-asc': result = difference(a, b, 'length') || difference(a, b, 'thickness'); break;
      case 'length-thickness-desc': result = difference(b, a, 'length') || difference(b, a, 'thickness'); break;
      default: result = a.width * a.length - b.width * b.length;
    }
    return result || tie(a, b, data);
  });
}

export const sortChoices = remnant => remnant
  ? [['area','Menor área primeiro'],['thickness-asc','Espessura: menor → maior'],['thickness-desc','Espessura: maior → menor'],['length-asc','Comprimento: menor → maior'],['length-desc','Comprimento: maior → menor'],['thickness-length-asc','Espessura ↑ e comprimento ↑'],['thickness-length-desc','Espessura ↓ e comprimento ↓'],['length-thickness-asc','Comprimento ↑ e espessura ↑'],['length-thickness-desc','Comprimento ↓ e espessura ↓']]
  : [['material','Material e espessura'],['thickness-asc','Espessura: menor → maior'],['thickness-desc','Espessura: maior → menor']];
