import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
const base='/Controle-Chaparia/';
async function login(page,email='pcp@example.com'){
  await page.goto(base);await page.locator('[data-auth-form=login] [name=email]').fill(email);await page.locator('[data-auth-form=login] [name=password]').fill('valid-password');await page.getByRole('button',{name:'Entrar no sistema'}).click();await expect(page.locator('body')).toHaveAttribute('data-auth','authenticated');
}
async function save(page){await page.locator('#inventory-dialog button[type=submit]').click();await expect(page.locator('#inventory-dialog')).not.toBeVisible();}
async function entry(page,n=3){await page.goto(base+'#chapas');await page.locator('tbody tr').first().getByRole('button',{name:'Entrada',exact:true}).click();await page.locator('#inventory-dialog [name=quantity]').fill(String(n));await save(page);}
test.beforeEach(async({request})=>{await request.get('/__test/reset');});
test('login gate, invalid credential and production configuration screen',async({page})=>{
  await page.goto(base+'#chapas');await expect(page.getByRole('heading',{name:'Bem-vindo à Chaparia'})).toBeVisible();await expect(page.locator('.app-shell')).not.toBeVisible();
  await page.locator('[data-auth-form=login] [name=email]').fill('pcp@example.com');await page.locator('[data-auth-form=login] [name=password]').fill('wrong');await page.locator('#login-submit').click();await expect(page.locator('[data-auth-form=login] .auth-error')).toContainText('inválidos');
});
test('stock transactions synchronize to another authenticated browser and prevent negative balance',async({page,browser})=>{
  await login(page);const context=await browser.newContext();const other=await context.newPage();await login(other,'fabrica@example.com');await other.goto(base+'#chapas');
  await entry(page,3);await expect(other.locator('tbody tr').first().locator('.stock-count')).toHaveText('3');
  await page.locator('tbody tr').first().getByRole('button',{name:'Baixa',exact:true}).click();await page.locator('#inventory-dialog [name=quantity]').fill('4');await page.locator('#inventory-dialog button[type=submit]').click();await expect(page.locator('.inventory-error')).toContainText('Saldo insuficiente');
  await page.locator('#inventory-dialog [name=quantity]').fill('1');await save(page);await expect(other.locator('tbody tr').first().locator('.stock-count')).toHaveText('2');
  await page.locator('.purchase-banner summary').click();await expect(page.locator('.critical-list')).toContainText('Restam 2 chapas');
  await page.goto(base+'#movimentacoes');await expect(page.locator('tbody')).toContainText('pcp@example.com');await expect(page.locator('tbody tr')).toHaveCount(2);
  await context.close();
});
test('parallel withdrawals across browsers commit only one unit',async({page,browser})=>{
  await login(page);await entry(page,1);const ctx=await browser.newContext();const other=await ctx.newPage();await login(other,'fabrica@example.com');await other.goto(base+'#chapas');
  for(const p of [page,other]){await p.locator('tbody tr').first().getByRole('button',{name:'Baixa',exact:true}).click();await p.locator('#inventory-dialog [name=quantity]').fill('1');}
  await Promise.all([page.locator('#inventory-dialog button[type=submit]').click(),other.locator('#inventory-dialog button[type=submit]').click()]);
  const response=await page.request.get('/__test/data');const state=await response.json();expect(state.sheets['carbono-2'].quantity).toBe(0);expect(Object.values(state.movements).filter(m=>m.type==='sheet-out')).toHaveLength(1);await ctx.close();
});
test('retalho registration, rotated fit, child offcut and total consumption',async({page})=>{
  await login(page);await page.goto(base+'#retalhos');await page.getByRole('button',{name:'Cadastrar retalho'}).first().click();
  const form=page.locator('#inventory-dialog');await form.locator('[name=width]').fill('800');await form.locator('[name=length]').fill('1200');await form.locator('[name=quantity]').fill('3');await form.locator('[name=location]').fill('R-02');await form.locator('[name=notes]').fill('Conferir furo no canto');await save(page);
  await page.locator('[data-inventory-form=remnant-search] [name=width]').fill('1000');await page.locator('[data-inventory-form=remnant-search] [name=length]').fill('700');await page.getByRole('button',{name:'Buscar retalhos'}).click();await expect(page.locator('.remnant-card.compatible')).toHaveCount(1);
  await page.locator('.remnant-card').getByRole('button',{name:'Cortar / Sub-retalho'}).click();await form.locator('[name=width]').fill('400');await form.locator('[name=length]').fill('600');await save(page);await expect(page.locator('.remnant-card')).toHaveCount(2);
  const response=await page.request.get('/__test/data');const state=await response.json();expect(Object.values(state.remnants).map(r=>r.quantity).sort()).toEqual([1,2]);
  await page.locator('.remnant-card').first().getByRole('button',{name:'Baixa total'}).click();await page.locator('#confirm-dialog').getByRole('button',{name:'Confirmar baixa'}).click();await expect(page.locator('.remnant-card')).toHaveCount(1);
});
test('activities preserve create, edit, duplicate, progress, completion, restore, export and delete',async({page})=>{
  await login(page);await page.goto(base+'#atividades');await page.getByRole('button',{name:'Nova atividade',exact:true}).click();
  const form=page.locator('#task-form');await form.locator('[name=title]').fill('Inspeção de chapas');await form.locator('[name=requester]').fill('PCP');await form.locator('[name=location]').fill('Corte 01');await form.locator('[name=description]').fill('Conferir rebarbas');await form.locator('[name=priority]').selectOption('critical');await form.getByRole('button',{name:'Salvar atividade'}).click();await expect(page.locator('#task-dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Editar atividade',exact:true}).click();await form.locator('[name=notes]').fill('Executar antes do segundo turno');await form.getByRole('button',{name:'Salvar atividade'}).click();
  await page.getByRole('button',{name:'Duplicar atividade',exact:true}).click();await form.getByRole('button',{name:'Salvar atividade'}).click();await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button',{name:'Iniciar atividade'}).first().click();await expect(page.locator('tbody')).toContainText('Em andamento');
  await page.getByRole('button',{name:'Concluir atividade'}).first().click();await page.goto(base+'#historico');await expect(page.locator('tbody tr')).toHaveCount(1);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar histórico CSV'}).click();expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await page.getByRole('button',{name:'Restaurar atividade'}).click();await page.locator('#confirm-dialog').getByRole('button',{name:'Restaurar atividade'}).click();await page.goto(base+'#atividades');await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button',{name:'Excluir atividade'}).first().click();await page.locator('#confirm-dialog').getByRole('button',{name:'Excluir permanentemente'}).click();await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.goto(base+'#backup');const backup=page.waitForEvent('download');await page.getByRole('button',{name:'Baixar backup JSON'}).click();expect((await backup).suggestedFilename()).toMatch(/\.json$/);
});
test('offline operations keep the draft and logout hides all records',async({page})=>{
  await login(page);await page.goto(base+'#chapas');await page.locator('tbody tr').first().getByRole('button',{name:'Entrada',exact:true}).click();await page.locator('#inventory-dialog [name=quantity]').fill('5');
  await page.evaluate(()=>window.__qa.disconnect());await page.locator('#inventory-dialog button[type=submit]').click();await expect(page.locator('.inventory-error')).toContainText('Sem conexão');await expect(page.locator('#inventory-dialog [name=quantity]')).toHaveValue('5');
  await page.evaluate(()=>window.__qa.reconnect());await save(page);await page.goto(base+'#conta');await page.getByRole('button',{name:'Sair da conta',exact:true}).click();await expect(page.locator('.app-shell')).not.toBeVisible();await expect(page.locator('#main')).toBeEmpty();
});
for(const path of ['Codex','Controle_Chaparia','Controle-Chaparia'])test(`relative assets load under /${path}/`,async({page})=>{const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`/${path}/`);await expect(page.locator('#login-screen')).toBeVisible();expect(errors).toEqual([]);});
test('mobile screens fit without page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await login(page);
  for(const route of ['dashboard','chapas','retalhos','resumo','atividades','conta']){await page.goto(base+'#'+route);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
});
test('purchase list can be copied for the purchasing department',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);await login(page);await page.getByRole('button',{name:'Copiar Lista de Compra'}).click();const copied=await page.evaluate(()=>navigator.clipboard.readText());expect(copied).toContain('SOLICITAÇÃO DE COMPRA');expect(copied).toContain('Aço Carbono 4.76mm');expect(copied.split('\n')).toHaveLength(15);
});
test('backup restoration retains identifiers and dates and rejects concurrent overwrites',async({page,request})=>{
  await login(page);await page.goto(base+'#backup');
  const original={id:'legacy-task',title:'Atividade legada',requester:'PCP',location:'Linha 01',priority:'high',status:'completed',description:'Preservar',notes:'Histórico anterior',dueDate:'',createdAt:'2025-01-01T10:00:00.000Z',updatedAt:'2025-01-02T10:00:00.000Z',completedAt:'2025-01-02T10:00:00.000Z'};
  const backup=Buffer.from(JSON.stringify({format:'atividades-local',version:1,tasks:[original],settings:{}}));
  await page.locator('#backup-file').setInputFiles({name:'atividades.json',mimeType:'application/json',buffer:backup});await expect(page.locator('#confirm-dialog')).toBeVisible();await page.locator('#confirm-dialog').getByRole('button',{name:'Substituir e restaurar'}).click();
  await expect.poll(async()=>Object.keys((await(await request.get('/__test/data')).json()).tasks||{}).length).toBe(1);
  let state=await(await request.get('/__test/data')).json();expect(state.tasks['legacy-task'].createdAt).toBe(original.createdAt);expect(state.tasks['legacy-task'].completedAt).toBe(original.completedAt);
  await page.locator('#backup-file').setInputFiles({name:'atividades.json',mimeType:'application/json',buffer:backup});await expect(page.locator('#confirm-dialog')).toBeVisible();
  await request.post('/__test/mutate',{data:{actor:{uid:'factory',email:'fabrica@example.com'},command:{type:'task-put',task:{...state.tasks['legacy-task'],title:'Alterada por outro operador'}}}});
  await page.locator('#confirm-dialog').getByRole('button',{name:'Substituir e restaurar'}).click();await expect(page.locator('.toast.error')).toContainText('outro aparelho');
  state=await(await request.get('/__test/data')).json();expect(state.tasks['legacy-task'].title).toBe('Alterada por outro operador');
});
test('an open activity editor rejects stale revisions while preserving its draft',async({page,request})=>{
  await login(page);const t={id:'task-to-edit',title:'Inspeção',requester:'PCP',location:'Corte',priority:'high',status:'pending',description:'',notes:'',dueDate:'',createdAt:'2025-01-01T10:00:00.000Z',updatedAt:'2025-01-01T10:00:00.000Z',completedAt:null};
  await request.post('/__test/mutate',{data:{actor:{uid:'admin',email:'pcp@example.com'},command:{type:'task-add',task:t}}});await page.goto(base+'#atividades');await page.getByRole('button',{name:'Editar atividade',exact:true}).click();await page.locator('#task-form [name=title]').fill('Minha alteração');
  let state=await(await request.get('/__test/data')).json();await request.post('/__test/mutate',{data:{actor:{uid:'factory',email:'fabrica@example.com'},command:{type:'task-put',task:{...state.tasks[t.id],title:'Alteração remota'}}}});
  await page.locator('#task-form').getByRole('button',{name:'Salvar atividade'}).click();await expect(page.locator('#form-error')).toContainText('outro aparelho');await expect(page.locator('#task-form [name=title]')).toHaveValue('Minha alteração');
});
test('weights tab groups steel and thickness and updates from synchronized stock',async({page,request})=>{
  await login(page);await page.getByRole('link',{name:'Pesos',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Pesos do estoque.'})).toBeVisible();
  await expect(page.locator('.weight-table tbody tr')).toHaveCount(14);
  await expect(page.locator('[data-weight-summary=total] strong')).toHaveText('0,00 kg');
  const post=async command=>{const response=await request.post('/__test/mutate',{data:{actor:{uid:'factory',email:'fabrica@example.com'},command}});expect(response.ok()).toBe(true);};
  await post({type:'sheet-in',id:'carbono-2',quantity:2});
  await post({type:'sheet-in',id:'inox-2',quantity:1});
  await post({type:'remnant-add',id:'weight-remnant',material:'carbono',thickness:2,width:500,length:1000,quantity:3,location:'R-01'});
  const carbon=page.locator('[data-weight-material=carbono] [data-weight-thickness="2"]');
  const stainless=page.locator('[data-weight-material=inox] [data-weight-thickness="2"]');
  await expect(carbon.locator('[data-weight-cell=sheet]')).toHaveText('141,30 kg');
  await expect(carbon.locator('[data-weight-cell=remnant]')).toHaveText('23,55 kg');
  await expect(stainless.locator('[data-weight-cell=sheet]')).toHaveText('72,00 kg');
  await expect(page.locator('[data-weight-summary=total] strong')).toHaveText('236,85 kg');
  await post({type:'remnant-consume',id:'weight-remnant',revision:1});
  await expect(carbon.locator('[data-weight-cell=remnant]')).toHaveText('0,00 kg');
  await post({type:'sheet-edit',id:'carbono-2',revision:2,width:1000,length:2000,location:'A1'});
  await expect(carbon.locator('[data-weight-cell=sheet]')).toHaveText('62,80 kg');
  await expect(page.locator('[data-weight-summary=total] strong')).toHaveText('134,80 kg');
  await page.reload();await expect(page.locator('[data-weight-summary=total] strong')).toHaveText('134,80 kg');
});
test('mobile weights navigation and tables keep the page within the screen',async({page})=>{
  await page.setViewportSize({width:390,height:844});await login(page);
  await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('link',{name:'Pesos',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Pesos do estoque.'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.locator('.weight-method')).toContainText('7.850 kg/m³');
  await expect(page.locator('.weight-method')).toContainText('8.000 kg/m³');
  await expect(page.locator('[data-weight-material=carbono] .table-scroll')).toHaveAttribute('tabindex','0');
});
test('unit-weight view separates each record from its total quantity and preserves its view during sync',async({page,request})=>{
  await login(page);await entry(page,2);await page.goto(base+'#pesos');await page.getByRole('button',{name:'Peso por peça',exact:true}).click();
  const sheet=page.locator('[data-weight-record="carbono-2"]');
  await expect(sheet.locator('[data-weight-cell=unit]')).toHaveText('70,65 kg');await expect(sheet.locator('[data-weight-cell=stock]')).toHaveText('141,30 kg');
  await request.post('/__test/mutate',{data:{actor:{uid:'factory',email:'fabrica@example.com'},command:{type:'remnant-add',id:'unit-remnant',material:'inox',thickness:2,width:500,length:1000,quantity:3,location:'R-01',notes:'<img src=x onerror=alert(1)> Corte em L'}}});
  const remnant=page.locator('[data-weight-record="unit-remnant"]');await expect(remnant.locator('[data-weight-cell=unit]')).toHaveText('8,00 kg');await expect(remnant.locator('[data-weight-cell=stock]')).toHaveText('24,00 kg');
  await expect(remnant.locator('.weight-record-notes')).toContainText('<img src=x');await expect(remnant.locator('img')).toHaveCount(0);
  await request.post('/__test/mutate',{data:{actor:{uid:'factory',email:'fabrica@example.com'},command:{type:'remnant-consume',id:'unit-remnant',revision:1}}});
  await expect(remnant.locator('[data-weight-cell=stock]')).toHaveText('0,00 kg');await expect(remnant).toContainText('Consumido');await expect(remnant.locator('[data-weight-cell=unit]')).toHaveText('8,00 kg');
  await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Resumo por espessura',exact:true}).click();await expect(page.locator('.weight-table tbody tr')).toHaveCount(14);
});
test('browser downloads a styled real Excel workbook with unit weights and separate stock sheets',async({page,request})=>{
  const excelRequests=[];page.on('request',request=>{if(request.url().includes('weights-excel-'))excelRequests.push(request.url());});
  await login(page);await entry(page,2);await page.goto(base+'#pesos');expect(excelRequests).toHaveLength(0);
  await request.post('/__test/mutate',{data:{actor:{uid:'factory',email:'fabrica@example.com'},command:{type:'remnant-add',id:'export-remnant',material:'inox',thickness:2,width:500,length:1000,quantity:3,location:'R-01',notes:'Furo no canto'}}});
  await expect(page.locator('[data-weight-summary=remnant] strong')).toHaveText('24,00 kg');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar Excel (.xlsx)'}).click();const download=await pending;
  expect(download.suggestedFilename()).toMatch(/^chaparia-pesos-\d{4}-\d{2}-\d{2}\.xlsx$/);expect(excelRequests.length).toBeGreaterThan(0);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await readFile(await download.path()));
  expect(workbook.worksheets.map(s=>s.name)).toEqual(['Resumo','Chapas inteiras','Retalhos','Critérios']);
  expect(workbook.getWorksheet('Chapas inteiras').getCell('G9').result).toBeCloseTo(70.65);expect(workbook.getWorksheet('Chapas inteiras').getCell('H9').result).toBeCloseTo(141.3);
  expect(workbook.getWorksheet('Retalhos').getCell('G9').result).toBe(8);expect(workbook.getWorksheet('Retalhos').getCell('H9').result).toBe(24);expect(workbook.getWorksheet('Retalhos').getCell('K9').value).toBe('Furo no canto');
  expect(workbook.getWorksheet('Resumo').getCell('E7').result).toBeCloseTo(165.3);expect(workbook.getWorksheet('Resumo').getCell('A1').fill.fgColor.argb).toBe('FF142F3E');
  await expect(page.getByRole('button',{name:'Exportar Excel (.xlsx)'})).toBeEnabled();
  await page.evaluate(()=>window.__qa.disconnect());const pendingOffline=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar Excel (.xlsx)'}).click();const offline=await pendingOffline;const offlineBook=new ExcelJS.Workbook();await offlineBook.xlsx.load(await readFile(await offline.path()));expect(offlineBook.getWorksheet('Resumo').getCell('A4').value).toContain('SEM CONEXÃO');
});
test('an Excel export pending during sign-out cannot download stock after the session ends',async({page})=>{
  await login(page);await page.goto(base+'#pesos');
  let release;let received;const arrived=new Promise(resolve=>{received=resolve;});const downloads=[];page.on('download',download=>downloads.push(download));
  await page.route('**/weights-excel-*.js',route=>{release=()=>route.continue();received();});
  await page.getByRole('button',{name:'Exportar Excel (.xlsx)'}).click();await arrived;
  await page.goto(base+'#conta');await page.getByRole('button',{name:'Sair da conta',exact:true}).click();await expect(page.locator('#login-screen')).toBeVisible();
  await release();await expect(page.locator('.toast.error')).toContainText('A sessão mudou');expect(downloads).toHaveLength(0);
});
test('sheet and remnant ordering uses numeric thickness and combined length priorities',async({page,request})=>{
  await login(page);await page.goto(base+'#chapas');await page.getByLabel('Ordenar chapas').selectOption('thickness-asc');
  await expect(page.locator('.stock-table tbody tr').first()).toHaveAttribute('data-sheet-id','inox-1_5');
  await page.getByLabel('Ordenar chapas').selectOption('thickness-desc');await expect(page.locator('.stock-table tbody tr').first()).toHaveAttribute('data-sheet-id','carbono-19_05');
  const entries=[['two-long',2,1000],['three-short',3,600],['two-short',2,600],['three-long',3,1000]];
  for(const [id,thickness,length]of entries)await request.post('/__test/mutate',{data:{actor:{uid:'pcp',email:'pcp@example.com'},command:{type:'remnant-add',id,material:'carbono',thickness,width:500,length,quantity:1,location:'R1'}}});
  await page.goto(base+'#retalhos');await page.getByLabel('Ordenar retalhos').selectOption('thickness-length-asc');
  await expect.poll(()=>page.locator('[data-remnant-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.remnantId))).toEqual(['two-short','two-long','three-short','three-long']);
  await page.getByLabel('Ordenar retalhos').selectOption('length-thickness-asc');await expect.poll(()=>page.locator('[data-remnant-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.remnantId))).toEqual(['two-short','three-short','two-long','three-long']);
  await page.goto(base+'#pesos');await page.getByRole('button',{name:'Peso por peça',exact:true}).click();await page.getByLabel('Ordenar pesos de chapas').selectOption('thickness-asc');await expect(page.locator('[data-weight-detail=sheets] tbody tr').first()).toHaveAttribute('data-weight-record','inox-1_5');
  await page.getByLabel('Ordenar pesos de retalhos').selectOption('length-thickness-asc');await expect.poll(()=>page.locator('[data-weight-detail=remnants] [data-weight-record]').evaluateAll(nodes=>nodes.map(n=>n.dataset.weightRecord))).toEqual(['two-short','three-short','two-long','three-long']);
  await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('new material and thicknesses flow through stock, replenishment, remnants and Excel',async({page,request})=>{
  await login(page);await page.goto(base+'#chapas');await page.getByRole('button',{name:'Novo material',exact:true}).click();
  let form=page.locator('#inventory-dialog');await form.locator('[name=name]').fill('Chapa piso');await save(page);
  const state=await(await request.get('/__test/data')).json();const material=Object.keys(state.materials)[0];
  for(const thickness of ['3','4.76']){
    await page.getByRole('button',{name:'Adicionar espessura',exact:true}).click();await form.locator('[name=material]').selectOption({label:'Chapa piso'});await form.locator('[name=thickness]').fill(thickness);await form.locator('[name=reorderPoint]').fill('5');await save(page);
  }
  const id=material+'-3';let row=page.locator(`[data-sheet-id="${id}"]`);
  await row.getByRole('button',{name:'Entrada',exact:true}).click();await form.locator('[name=quantity]').fill('4');await save(page);await expect(row.locator('.stock-state')).toHaveText('Reposição');
  await row.getByRole('button',{name:'Editar Chapa piso 3mm',exact:true}).click();await form.locator('[name=reorderPoint]').fill('3');await save(page);await expect(row.locator('.stock-state')).toHaveText('Disponível');await expect(row.locator('.reorder-label')).toContainText('3 un.');
  await page.goto(base+'#retalhos');await page.getByRole('button',{name:'Cadastrar retalho'}).first().click();await form.locator('[name=material]').selectOption({label:'Chapa piso'});await form.locator('[name=thickness]').selectOption('4.76');await form.locator('[name=width]').fill('500');await form.locator('[name=length]').fill('1000');await form.locator('[name=location]').fill('R-Piso');await save(page);await expect(page.locator('.remnant-card .material-tag')).toHaveText('Chapa piso');
  await page.goto(base+'#pesos');await expect(page.locator(`[data-weight-material="${material}"] h2`)).toHaveText('Chapa piso');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar Excel (.xlsx)'}).click();const download=await pending;const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await readFile(await download.path()));
  const sheet=workbook.getWorksheet('Chapas inteiras');let floorRow;sheet.eachRow(r=>{if(r.getCell(1).value===id)floorRow=r;});expect(floorRow.getCell(2).value).toBe('Chapa piso');expect(floorRow.getCell(16).value).toBe(3);
});
test('removing a thickness checks available stock and can be reactivated without losing history',async({page,request})=>{
  await login(page);await page.goto(base+'#chapas');let row=page.locator('[data-sheet-id="carbono-2"]');
  await row.getByRole('button',{name:'Remover espessura Aço Carbono 2mm',exact:true}).click();await page.locator('#confirm-dialog').getByRole('button',{name:'Remover espessura',exact:true}).click();await expect(row).toHaveCount(0);
  let state=await(await request.get('/__test/data')).json();expect(state.sheets['carbono-2'].active).toBe(false);expect(Object.values(state.movements).some(m=>m.type==='sheet-remove')).toBe(true);
  await page.getByRole('button',{name:'Adicionar espessura',exact:true}).click();await page.locator('#inventory-dialog [name=thickness]').fill('2');await save(page);await expect(row).toHaveCount(1);
  await row.getByRole('button',{name:'Entrada',exact:true}).click();await page.locator('#inventory-dialog [name=quantity]').fill('1');await save(page);
  await row.getByRole('button',{name:'Remover espessura Aço Carbono 2mm',exact:true}).click();await page.locator('#confirm-dialog').getByRole('button',{name:'Remover espessura',exact:true}).click();await expect(page.locator('.toast.error')).toContainText('Dê baixa');await expect(row.locator('.stock-count')).toHaveText('1');
});
