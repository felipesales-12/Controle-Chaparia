export const canonicalThickness = (material, value) => material === 'inox' && Number(value) === 6 ? 6.35 : Number(value);
export const canonicalItem = item => canonicalThickness(item.material,item.thickness) !== Number(item.thickness) ? { ...item,thickness:canonicalThickness(item.material,item.thickness) } : item;
export function canonicalBatch(batch) {
  if (!Array.isArray(batch?.records)) return batch;
  return { ...batch,records:batch.records.map(item => {
    const normalized = canonicalItem(item);
    return normalized === item ? item : { ...normalized,notes:(item.notes || '')+' Espessura original 6 mm unificada em inox 6,35 mm, código 3.0011.010.1.' };
  }) };
}
const legacy = item => item?.material === 'inox' && Number(item.thickness) === 6;
const family = item => item?.material === 'inox' && [6, 6.35].includes(Number(item.thickness));
export const needsInoxMerge = data => ['sheets','remnants'].some(name => Object.values(data?.[name] || {}).some(legacy));
const snapshot = items => Object.fromEntries(Object.entries(items).filter(([,item]) => family(item)).map(([id,item]) => [id,structuredClone(item)]));
const quantity = items => Object.values(items).reduce((total,item) => total + Number(item.quantity || 0), 0);
const revision = item => (item.revision || 1) + 1;
const limit = item => Number.isSafeInteger(item.reorderPoint) ? item.reorderPoint : 2;

// Mutates a transaction-owned clone only. Different dimensions/locations stay
// as separate lots within the same thickness. Audit snapshots retain old IDs.
export function mergeInoxStock(data) {
  data.sheets ||= {}; data.remnants ||= {};
  const before = { sheets:snapshot(data.sheets), remnants:snapshot(data.remnants) };
  const sources = Object.entries(data.sheets).filter(([,item]) => legacy(item));
  const remnantSources = Object.entries(data.remnants).filter(([,item]) => legacy(item));
  if (!sources.length && !remnantSources.length) return null;
  const canonicalId = 'inox-6_35';
  const occupied = data.sheets[canonicalId];
  if (occupied && !family(occupied)) throw new Error('O identificador de inox 6,35 mm está em uso por outro material. Revise o catálogo antes de unificar.');
  for (const [id] of sources) delete data.sheets[id];
  const moved = [], combined = [];
  for (const [oldId, source] of sources) {
    const match = Object.values(data.sheets).find(target => target.material === 'inox' && Number(target.thickness) === 6.35
      && Number(target.width) === Number(source.width) && Number(target.length) === Number(source.length)
      && String(target.location || '') === String(source.location || '') && (target.active !== false) === (source.active !== false)
      && Number(target.quantity) + Number(source.quantity) <= 1000000);
    if (match) {
      match.quantity = Number(match.quantity) + Number(source.quantity);
      match.reorderPoint = Math.max(limit(match),limit(source)); match.revision = revision(match);
      moved.push({ from:oldId,to:match.id }); combined.push(oldId);
    } else {
      let id = !data.sheets[canonicalId] ? canonicalId : !data.sheets[oldId] ? oldId : canonicalId+'-lot';
      let suffix = 1;
      while (data.sheets[id]) id = canonicalId+'-lot-'+suffix++;
      data.sheets[id] = { ...source,id,thickness:6.35,revision:revision(source) };
      moved.push({ from:oldId,to:id });
    }
  }
  for (const [id,item] of remnantSources) data.remnants[id] = { ...item,thickness:6.35,revision:revision(item) };
  // Remnant-only legacy data still needs an active catalog pair for future use.
  if (!Object.values(data.sheets).some(item => item.material === 'inox' && Number(item.thickness) === 6.35)) {
    data.sheets[canonicalId] = { id:canonicalId,material:'inox',thickness:6.35,width:1500,length:3000,quantity:0,location:'',revision:1 };
  }
  const after = { sheets:snapshot(data.sheets), remnants:snapshot(data.remnants) };
  const totals = { sheetsBefore:quantity(before.sheets),sheetsAfter:quantity(after.sheets),remnantsBefore:quantity(before.remnants),remnantsAfter:quantity(after.remnants) };
  if (totals.sheetsBefore !== totals.sheetsAfter || totals.remnantsBefore !== totals.remnantsAfter) throw new Error('A conferência de quantidades falhou. Nenhum dado foi unificado.');
  return { before,after,totals,moved,combined,changedRemnants:remnantSources.length };
}
