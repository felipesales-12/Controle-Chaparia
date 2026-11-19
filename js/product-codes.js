// Reference codes are values, never Firebase keys. Exact material/thickness
// pairs keep 9.53 separate from 9.35 and stainless 6.35 separate from 6 mm.
export const PRODUCT_CODES = Object.freeze([
  ['carbono', 2, '3.0011.020.2'],
  ['carbono', 3, '3.0011.020.1'],
  ['carbono', 4.76, '3.0011.020.4'],
  ['carbono', 6.35, '3.0011.020.6'],
  ['carbono', 7.94, '3.0011.020.7'],
  ['carbono', 9.53, '3.0011.020.10'],
  ['carbono', 12.7, '3.0011.020.11'],
  ['carbono', 19.05, '3.0011.020.8'],
  ['inox', 1.5, '3.0011.010.4'],
  ['inox', 2, '3.0011.010.11'],
  ['inox', 3, '3.0011.010.2'],
  ['inox', 5, '3.0011.010.20'],
  ['inox', 6.35, '3.0011.010.1']
].map(([material, thickness, code]) => Object.freeze({ material, thickness, code })));

export const productCode = item => PRODUCT_CODES.find(row => row.material === item.material && row.thickness === Number(item.thickness))?.code || '';
export const missingProductTypes = data => PRODUCT_CODES.filter(row => !Object.values(data?.sheets || {}).some(sheet => sheet.material === row.material && Number(sheet.thickness) === row.thickness));

// Used only inside the authenticated root transaction. Existing balances,
// locations, dimensions, revisions and archived types are kept intact.
export function addMissingProductTypes(data) {
  data.sheets ||= {};
  return missingProductTypes(data).map(row => {
    const id = `${row.material}-${String(row.thickness).replace('.', '_')}`;
    if (Object.hasOwn(data.sheets, id)) throw new Error('Identificador de espessura em conflito. Revise o catálogo.');
    const sheet = { id, material: row.material, thickness: row.thickness, width: 1500, length: 3000, quantity: 0, location: '', reorderPoint: 2, active: true, revision: 1 };
    data.sheets[id] = sheet;
    return sheet;
  });
}
