import {test,expect} from '@playwright/test';

for(const kind of ['root','dist'])test(`real Firebase SDK enables login from the ${kind} Pages artifact`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // A fresh unauthenticated browser must enable the form without contacting
  // real accounts or reading production stock. Keep external network offline.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4174)/,route=>route.abort());
  await page.goto(`/__production/${kind}/index.html`);
  await expect(page.locator('html')).toHaveAttribute('data-app-ready','true');
  await expect(page.locator('#login-submit')).toBeEnabled();
  await expect(page.locator('#login-status')).toHaveText('Use o acesso fornecido pelo administrador.');
  await expect(page.locator('#startup-reload')).toBeHidden();
  expect(errors).toEqual([]);
});

test('missing application bundle offers a reload and then enables the real login form',async({page})=>{
  await page.route('**/js/app.bundle.js*',route=>route.abort());
  await page.goto('/__production/root/index.html#chapas');
  await expect(page.locator('#startup-reload')).toBeVisible();
  await expect(page.locator('#login-status')).toContainText('Não foi possível carregar o aplicativo');
  await page.unroute('**/js/app.bundle.js*');
  await page.getByRole('button',{name:'Recarregar o sistema'}).click();
  await expect(page).toHaveURL(/atualizar=\d+#chapas$/);
  await expect(page.locator('#login-submit')).toBeEnabled();
  await expect(page.locator('#startup-reload')).toBeHidden();
});

test('a bundle request that never finishes cannot leave startup silently loading',async({page})=>{
  let held;
  await page.clock.install();
  await page.route('**/js/app.bundle.js*',route=>{held=route;});
  try{
    await page.goto('/__production/root/index.html',{waitUntil:'commit'});
    await expect(page.locator('html')).toHaveAttribute('data-startup-guard','active');
    await page.clock.runFor(13000);
    await expect(page.locator('#startup-reload')).toBeVisible();
    await expect(page.locator('#login-status')).toContainText('Recarregar o sistema');
  }finally{await held?.abort().catch(()=>{});}
});
