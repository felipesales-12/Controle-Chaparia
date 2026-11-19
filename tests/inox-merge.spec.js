import {test,expect} from '@playwright/test';
import ExcelJS from 'exceljs';
import {readFile} from 'node:fs/promises';
const base='/Controle-Chaparia/';
async function login(page){
  await page.goto(base+'#chapas');
  await page.locator('[data-auth-form=login] [name=email]').fill('pcp@example.com');
  await page.locator('[data-auth-form=login] [name=password]').fill('valid-password');
  await page.locator('#login-submit').click();
  await expect(page.locator('body')).toHaveAttribute('data-auth','authenticated');
}
test('login unifies existing cloud stock automatically and reloading does not repeat the migration',async({page,request})=>{
  await request.get('/__test/legacy-inox');await login(page);
  await expect(page.locator('[data-sheet-id="inox-6_35"] .stock-count')).toHaveText('5');
  await expect(page.locator('[data-sheet-id="inox-6"]')).toHaveCount(0);
  const state=await(await request.get('/__test/data')).json();
  expect(state.remnants['legacy-r'].thickness).toBe(6.35);expect(state.remnants['legacy-r'].quantity).toBe(2);
  expect(state.remnants.consumed.quantity).toBe(0);expect(state.remnants.consumed.thickness).toBe(6.35);
  expect(Object.values(state.movements).filter(m=>m.type==='merge-inox-6-635')).toHaveLength(1);
  await page.reload();await expect(page.locator('[data-sheet-id="inox-6_35"] .stock-count')).toHaveText('5');
  const again=await(await request.get('/__test/data')).json();
  expect(Object.values(again.movements).filter(m=>m.type==='merge-inox-6-635')).toHaveLength(1);
  await page.goto(base+'#pesos');
  const inox=page.locator('[data-weight-material="inox"]');
  await expect(inox.locator('[data-weight-thickness="6"]')).toHaveCount(0);
  await expect(inox.locator('[data-weight-thickness="6.35"]')).toContainText('6,35');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar Excel (.xlsx)'}).click();
  const download=await pending;const book=new ExcelJS.Workbook();await book.xlsx.load(await readFile(await download.path()));
  const sheet=book.getWorksheet('Retalhos');
  expect(sheet.getTable('TabelaRetalhos').table.tableRef).toBe('A8:P10');
  for (const row of [9,10]) { expect(sheet.getCell('C'+row).value).toBe(6.35);expect(sheet.getCell('P'+row).value).toBe('3.0011.010.1'); }
});
test('new sheet and remnant forms offer a single stainless 6.35 mm thickness',async({page,request})=>{
  await request.get('/__test/reset');await login(page);
  await expect(page.locator('[data-sheet-id="inox-6"]')).toHaveCount(0);
  await expect(page.locator('[data-sheet-id="inox-6_35"]')).toContainText('3.0011.010.1');
  await page.goto(base+'#retalhos');
  await page.getByRole('button',{name:'Cadastrar retalho',exact:true}).first().click();
  await page.locator('#stock-material').selectOption('inox');
  await expect(page.locator('#stock-thickness option[value="6"]')).toHaveCount(0);
  await expect(page.locator('#stock-thickness option[value="6.35"]')).toHaveCount(1);
});
