import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
const base = '/Controle-Chaparia/';
async function login(page,hash='#chapas') {
  await page.goto(base+hash);
  await page.locator('[data-auth-form=login] [name=email]').fill('pcp@example.com');
  await page.locator('[data-auth-form=login] [name=password]').fill('valid-password');
  await page.locator('#login-submit').click();
  await expect(page.locator('body')).toHaveAttribute('data-auth','authenticated');
}
test.beforeEach(async({request})=>{await request.get('/__test/reset');});
test('product codes are searchable and missing exact thicknesses can be added without changing existing stock',async({page,request})=>{
  await login(page);
  await expect(page.locator('[data-sheet-id="carbono-2"]')).toContainText('3.0011.020.2');
  await expect(page.locator('[data-sheet-id="inox-6_35"]')).toContainText('3.0011.010.1');
  await page.locator('#sheet-search').fill('3.0011.020.11');
  await page.locator('[data-inventory-form=sheet-search]').getByRole('button',{name:'Buscar',exact:true}).click();
  await expect(page.locator('.stock-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.stock-table')).toContainText('12.7');
  await page.locator('.catalog-code-reference summary').click();
  await expect(page.locator('.product-code-list [role=listitem]')).toHaveCount(13);
  await page.getByRole('button',{name:'Adicionar espessuras da tabela de códigos'}).click();
  await expect(page.getByRole('button',{name:'Adicionar espessuras da tabela de códigos'})).toHaveCount(0);
  const data=await(await request.get('/__test/data')).json();
  expect(data.sheets['inox-6_35'].quantity).toBe(0);
  expect(data.sheets['inox-6']).toBeUndefined();
  expect(data.sheets['carbono-9_53'].quantity).toBe(0);
});
test('prepared photo lot shows material code and shape, imports atomically and blocks duplicates',async({page,request})=>{
  const batch={format:'chaparia-retalhos',version:1,batchId:'test-coded-photos',source:'Synthetic photos',ensureProductCatalog:true,records:[
    {code:'CAR-PHOTO-1',material:'carbono',thickness:19.05,width:200,length:800,quantity:1,location:'PHOTO-1',notes:'Meia-lua; peso pelo envelope retangular'}
  ]};
  const hash='#retalhos?import='+gzipSync(JSON.stringify(batch)).toString('base64url');
  await login(page,hash);
  await expect(page.locator('#remnant-import-preview')).toContainText('1 registros novos · 1 peças');
  await expect(page.locator('.import-records')).toContainText('3.0011.020.8');
  await expect(page.locator('.import-records')).toContainText('Meia-lua');
  await page.getByRole('button',{name:'Importar para a nuvem'}).click();
  await expect(page.locator('#inventory-dialog')).toBeHidden();
  await expect(page.locator('.remnant-card')).toContainText('3.0011.020.8');
  await expect(page.locator('.remnant-card')).toContainText('Meia-lua');
  await page.goto(base+'#pesos');
  await page.getByRole('button',{name:'Peso por peça',exact:true}).click();
  await expect(page.locator('[data-weight-record="test-coded-photos-CAR-PHOTO-1"]')).toContainText('3.0011.020.8');
  const data=await(await request.get('/__test/data')).json();
  expect(data.sheets['inox-6_35'].quantity).toBe(0);
  expect(data.movements[Object.keys(data.movements).find(id=>data.movements[id].type==='remnant-import')].after.productCodes).toHaveLength(13);
  await page.goto(base+hash);
  await expect(page.locator('#remnant-import-preview')).toContainText('1 já importados serão ignorados');
  await expect(page.getByRole('button',{name:'Importar para a nuvem'})).toBeDisabled();
});
