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
