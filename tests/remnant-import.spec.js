import { test, expect } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { remnantWorkbook } from './fixtures/remnant-workbook.js';
const base = '/Controle-Chaparia/';
async function login(page, hash = '#retalhos') {
  await page.goto(base + hash);
  await page.locator('[data-auth-form=login] [name=email]').fill('pcp@example.com');
  await page.locator('[data-auth-form=login] [name=password]').fill('valid-password');
  await page.locator('#login-submit').click();
  await expect(page.locator('body')).toHaveAttribute('data-auth', 'authenticated');
}
test.beforeEach(async ({ request }) => { await request.get('/__test/reset'); });
test('namespaced XLSX imports rectangles and circles with corrected pending measurements and no duplicates', async ({ page, request }) => {
  await login(page); await page.getByRole('button', { name: 'Importar planilha' }).click();
  await page.locator('#remnant-import-file').setInputFiles({ name: 'example.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await remnantWorkbook() });
  await expect(page.locator('#remnant-import-preview')).toContainText('2 registros novos · 3 peças');
  await expect(page.locator('#remnant-import-preview')).toContainText('9.53 mm');
  await expect(page.locator('.import-records')).toContainText('290 × 290 mm');
  await page.getByLabel('Comprimento CAR-9003').fill('450');
  await page.getByLabel('Largura CAR-9003').fill('500');
  await page.getByLabel('Quantidade CAR-9003').fill('25');
  await page.getByRole('button', { name: 'Importar para a nuvem' }).click();
  await expect(page.locator('#inventory-dialog')).toBeHidden();
  const data = await (await request.get('/__test/data')).json();
  expect(Object.keys(data.remnants)).toHaveLength(3);
  expect(Object.values(data.remnants).reduce((n, r) => n + r.quantity, 0)).toBe(28);
  expect(data.remnants['controle-retalhos-carbono-CAR-9002'].width).toBe(290);
  expect(data.remnants['controle-retalhos-carbono-CAR-9002'].notes).toContain('Circular');
  expect(data.sheets['carbono-9_35'].quantity).toBe(0);
  expect(data.sheets['carbono-9_53'].quantity).toBe(0);
  await page.getByRole('button', { name: 'Importar planilha' }).click();
  await page.locator('#remnant-import-file').setInputFiles({ name: 'example.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await remnantWorkbook() });
  await expect(page.locator('#remnant-import-preview')).toContainText('2 já importados serão ignorados');
});
test('prepared private link survives login, opens a review and writes only after import is clicked', async ({ page, request }) => {
  const batch = { format: 'chaparia-retalhos', version: 1, batchId: 'test-link', source: 'example.xlsx', records: [{ code: 'CAR-9001', material: 'carbono', thickness: 2, width: 330, length: 330, quantity: 25, location: 'CAR-9001', notes: 'Circular Ø330 mm' }] };
  const payload = gzipSync(JSON.stringify(batch)).toString('base64url');
  const requests = []; page.on('request', request => requests.push(request.url()));
  await login(page, '#retalhos?import=' + payload);
  await expect(page.locator('#inventory-dialog')).toBeVisible();
  await expect(page.locator('#remnant-import-preview')).toContainText('1 registros novos · 25 peças');
  await expect(page).toHaveURL(base + '#retalhos');
  expect((await (await request.get('/__test/data')).json()).remnants).toBeUndefined();
  expect(requests.some(url => url.includes(payload))).toBe(false);
  await page.getByRole('button', { name: 'Importar para a nuvem' }).click();
  await expect(page.locator('#inventory-dialog')).toBeHidden();
  expect((await (await request.get('/__test/data')).json()).remnants['test-link-CAR-9001'].quantity).toBe(25);
});
test('invalid import preserves the preview and produces no partial stock or catalog changes', async ({ page, request }) => {
  await login(page); await page.getByRole('button', { name: 'Importar planilha' }).click();
  await page.locator('#remnant-import-file').setInputFiles({ name: 'example.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await remnantWorkbook() });
  await expect(page.locator('#remnant-import-preview')).toContainText('2 registros novos');
  await page.getByLabel('Comprimento CAR-9003').fill('450');
  await page.getByRole('button', { name: 'Importar para a nuvem' }).click();
  await expect(page.locator('.import-error')).toContainText('comprimento e largura juntos');
  await expect(page.getByLabel('Comprimento CAR-9003')).toHaveValue('450');
  const data = await (await request.get('/__test/data')).json();
  expect(data.remnants).toBeUndefined(); expect(data.sheets['carbono-9_53']).toBeUndefined();
});
test('a correction link applies quantities and dimensions after file selection without manual entry', async ({ page, request }) => {
  const corrections = [['CAR-9003', 300, 300, 25, true]];
  await login(page, '#retalhos?corrections=' + encodeURIComponent(JSON.stringify(corrections)));
  await expect(page.locator('#remnant-import-help')).toContainText('1 correções');
  await page.locator('#remnant-import-file').setInputFiles({ name: 'example.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await remnantWorkbook() });
  await expect(page.locator('#remnant-import-preview')).toContainText('3 registros novos · 28 peças');
  await expect(page.locator('.import-pending')).toHaveCount(0);
  await expect(page.locator('.import-records')).toContainText('300 × 300 mm');
  await page.getByRole('button', { name: 'Importar para a nuvem' }).click();
  await expect(page.locator('#inventory-dialog')).toBeHidden();
  const data = await (await request.get('/__test/data')).json();
  expect(data.remnants['controle-retalhos-carbono-CAR-9003'].quantity).toBe(25);
  expect(data.remnants['controle-retalhos-carbono-CAR-9003'].notes).toContain('Circular Ø300');
});

test('inox spreadsheet imports its separate quantity column and preserves carbon stock and repeated imports', async ({ page, request }) => {
  await login(page);
  for (const material of ['carbono','inox']) {
    await page.getByRole('button', { name: 'Importar planilha' }).click();
    await page.locator('#remnant-import-file').setInputFiles({ name:material+'.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer:await remnantWorkbook(material) });
    await expect(page.locator('#remnant-import-preview')).toContainText(material === 'inox' ? '2 registros novos · 5 peças' : '2 registros novos · 3 peças');
    if (material === 'inox') {
      await expect(page.locator('.import-records')).toContainText('250 × 250 mm');
      await expect(page.locator('#remnant-import-preview')).toContainText('INOX-9002: conferir');
    }
    await page.getByRole('button', { name:'Importar para a nuvem' }).click();
    await expect(page.locator('#inventory-dialog')).toBeHidden();
  }
  const state = await (await request.get('/__test/data')).json();
  expect(Object.keys(state.remnants)).toHaveLength(4);
  expect(state.remnants['controle-retalhos-carbono-CAR-9001'].quantity).toBe(2);
  expect(state.remnants['controle-retalhos-inox-INOX-9001'].thickness).toBe(1.5);
  expect(state.remnants['controle-retalhos-inox-INOX-9002'].quantity).toBe(3);
  await page.getByRole('button', { name:'Importar planilha' }).click();
  await page.locator('#remnant-import-file').setInputFiles({name:'inox.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:await remnantWorkbook('inox')});
  await expect(page.locator('#remnant-import-preview')).toContainText('2 já importados serão ignorados');
  await expect(page.getByRole('button',{name:'Importar para a nuvem'})).toBeDisabled();
});
