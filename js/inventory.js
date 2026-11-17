import { cloudState, mutate, ensureMovementHistory } from './cloud.js';
import { materialName as lookupMaterialName, criticalSheets, purchaseText, fits } from './domain.js';
import { escapeHTML as h } from './ui.js';
import { icon } from './icons.js';
import { uniqueId } from './tasks.js';
import { download } from './backup.js';
import { getMaterials, activeSheets, reorderPoint, needsRestock, orderInventory, sortChoices } from './catalog.js';

let redraw = () => {}, notify = () => {}, confirm = async () => false;
let sheetMaterial = '', sheetSearch = '', remnantFilter = { material: '', thickness: '', width: '', length: '', rotate: true }, historySearch = '', historyLimit = 100;
let context = null, draftId;
let sheetOrder = 'material', remnantOrder = 'area';
const data = () => cloudState().data || {};
const catalog = () => getMaterials(data());
const materialName = key => lookupMaterialName(key, data());
const chips = active => `<div class="segmented">${[['', 'Todos os materiais'], ...Object.entries(catalog()).map(([key, info]) => [key, info.name])].map(([key, label]) => `<button class="${key === active ? 'selected' : ''}" data-inventory-action="material" data-id="${h(key)}">${h(label)}</button>`).join('')}</div>`;
const title = (eyebrow, title, text, action = '') => `<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}<span class="heading-dot">.</span></h1><p>${text}</p></div>${action}</div>`;
const actionButton = (action, label, id, style = 'secondary') => `<button class="button ${style}" data-inventory-action="${action}" data-id="${h(id)}">${label}</button>`;
const materialTag = item => `<span class="material-tag ${item.material}"><i></i>${h(materialName(item.material))}</span>`;
const sheetLabel = item => `${materialName(item.material)} ${item.thickness}mm`;
const time = timestamp => typeof timestamp === 'number' ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp)) : 'Confirmando horário…';
export function criticalBanner() {
  const list = criticalSheets(data().sheets);
  if (!list.length) return `<div class="healthy-banner">${icon('circleCheck')} Todos os materiais estão acima do nível crítico de reposição.</div>`;
  return `<section class="purchase-banner" aria-label="Solicitação de compra"><div class="purchase-top"><span class="alert-square">${icon('alert')}</span><div><span class="eyebrow">ATENÇÃO AO ABASTECIMENTO</span><h2>${list.length} ${list.length === 1 ? 'item precisa' : 'itens precisam'} de reposição</h2><p>Solicite a compra dos materiais que atingiram seu ponto de reposição.</p></div>${actionButton('copy-purchase', `${icon('copy')}Copiar Lista de Compra`, '', 'purchase-button')}</div><details><summary>Ver materiais em nível crítico <span>${list.length} itens</span></summary><ul class="critical-list">${list.map(s => `<li>Solicitar mais chapas: <strong>${h(sheetLabel(s))}</strong> — Restam <b>${s.quantity}</b> chapas <small>(repor ao atingir ${reorderPoint(s)})</small></li>`).join('')}</ul></details></section>`;
}
export function inventoryDashboard(metrics) {
  const sheets = activeSheets(data()), remnants = Object.values(data().remnants || {}).filter(r => r.quantity > 0);
  const quantity = sheets.reduce((n, s) => n + s.quantity, 0), pieces = remnants.reduce((n, r) => n + r.quantity, 0);
  const area = remnants.reduce((n, r) => n + r.width * r.length * r.quantity / 1000000, 0);
  const cards = [[quantity, 'Chapas em estoque', 'Unidades disponíveis', 'layers', 'chapas'], [pieces, 'Retalhos aproveitáveis', `${area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m² para reutilizar`, 'cut', 'retalhos'], [metrics.active, 'Atividades em aberto', `${metrics.progress} em andamento`, 'list', 'atividades'], [criticalSheets(data().sheets).length, 'Itens em nível crítico', 'Limites definidos por chapa', 'alert', 'chapas']];
  const recent = Object.values(data().movements || {}).sort((a,b) => b.timestamp - a.timestamp).slice(0, 5);
  return `${title('PCP / ALMOXARIFADO', 'Visão geral', 'Cada chapa conta. Controle o estoque e aproveite melhor os materiais.', actionButton('sheet-select', `${icon('plus')}Movimentar estoque`, '', 'primary'))}${criticalBanner()}<section class="inventory-metrics">${cards.map(([count, label, caption, symbol, target]) => `<a class="inventory-metric" href="#${target}"><div><span>${label}</span>${icon(symbol)}</div><strong>${count}</strong><small>${h(caption)} ${icon('arrow')}</small></a>`).join('')}</section><div class="overview-grid"><section class="panel"><div class="panel-heading"><div><h2>Estoque por material</h2><p>Disponibilidade de chapas inteiras por espessura.</p></div><a class="text-link" href="#chapas">Ver estoque ${icon('arrow')}</a></div><div class="material-overview">${Object.entries(catalog()).map(([key, info]) => { const items = sheets.filter(s=>s.material===key); return `<div class="material-summary"><div>${materialTag({material:key})}<strong>${items.reduce((n,s)=>n+s.quantity,0)} <small>chapas</small></strong></div><div class="thickness-grid">${items.map(s=>`<button data-inventory-action="sheet-in" data-id="${s.id}" title="Registrar entrada de ${h(sheetLabel(s))}"><span>${s.thickness}<small> mm</small></span><b class="${needsRestock(s)?'critical-quantity':''}">${s.quantity}</b></button>`).join('')}</div></div>`; }).join('')}</div></section><section class="reuse-card"><span class="eyebrow">ANTES DE CORTAR UMA CHAPA</span><div class="sheet-art" aria-hidden="true"><div class="metal-sheet"><span>RETALHO</span><i></i></div><div class="measure">APROVEITE CADA MILÍMETRO</div></div><h2>A próxima peça pode<br>estar em um retalho.</h2><p>Informe as medidas do corte e encontre sobras compatíveis no seu estoque.</p><a class="button primary" href="#retalhos">${icon('search')}Buscar aproveitamento ${icon('arrow')}</a></section></div><section class="panel"><div class="panel-heading"><div><h2>Últimas movimentações</h2><p>Rastreabilidade em cada entrada e saída.</p></div><a class="text-link" href="#movimentacoes">Ver histórico ${icon('arrow')}</a></div>${movementTable(recent)}</section>`;
}
export function sheetsPage() {
  const all = activeSheets(data()), query = sheetSearch.toLowerCase();
  const list = orderInventory(all.filter(s => (!sheetMaterial || s.material === sheetMaterial) && `${sheetLabel(s)} ${s.location}`.toLowerCase().includes(query)), sheetOrder, data());
  return `${title('ESTOQUE DE MATÉRIA-PRIMA', 'Chapas inteiras', 'Entradas, baixas por corte e localização dos materiais.', `<div class="catalog-actions">${actionButton('material-add', `${icon('plus')}Novo material`)}${actionButton('sheet-add', `${icon('plus')}Adicionar espessura`, '', 'primary')}</div>`)}${criticalBanner()}<section class="panel"><div class="inventory-toolbar">${chips(sheetMaterial)}<form data-inventory-form="sheet-search" class="inline-search"><label class="inventory-sort">Ordenar chapas<select id="sheet-order">${sortOptions(sheetOrder, false)}</select></label><label class="sr-only" for="sheet-search">Pesquisar chapas</label><input id="sheet-search" name="search" type="search" value="${h(sheetSearch)}" placeholder="Buscar espessura ou prateleira…"><button class="button secondary">${icon('search')}Buscar</button></form></div><div class="table-scroll"><table class="stock-table"><thead><tr><th>MATERIAL / ESPESSURA</th><th>DIMENSÕES (C × L)</th><th>LOCALIZAÇÃO</th><th>DISPONÍVEL</th><th>MOVIMENTAR</th></tr></thead><tbody>${list.map(s => `<tr data-sheet-id="${h(s.id)}"><td>${materialTag(s)}<strong class="thickness-label">${s.thickness} <small>mm</small></strong></td><td class="dimension">${s.length} × ${s.width}<small>mm</small></td><td>${s.location ? `${icon('pin')}${h(s.location)}` : '<span class="muted">Não definida</span>'}</td><td><strong class="stock-count">${s.quantity}</strong><span class="stock-state ${needsRestock(s)?'critical':'good'}">${needsRestock(s)?'Reposição':'Disponível'}</span><small class="reorder-label">Repor ao atingir ${reorderPoint(s)} un.</small></td><td><div class="stock-actions">${actionButton('sheet-in', `${icon('plus')}Entrada`, s.id)}${actionButton('sheet-out', `${icon('cut')}Baixa`, s.id)}<button class="icon-button" data-inventory-action="sheet-edit" data-id="${s.id}" aria-label="Editar ${h(sheetLabel(s))}" title="Dimensões, localização e ponto de reposição">${icon('edit')}</button><button class="icon-button delete-action" data-inventory-action="sheet-remove" data-id="${h(s.id)}" aria-label="Remover espessura ${h(sheetLabel(s))}" title="Remover espessura">${icon('trash')}</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="empty-message">Nenhuma chapa corresponde à busca.</td></tr>'}</tbody></table></div><div class="panel-footer">${icon('info')} A quantidade é alterada por movimentações. Cada operação fica no histórico.</div></section>`;
}
export function remnantsPage() {
  const f = remnantFilter, searching = Number(f.width)>0 && Number(f.length)>0;
  const list = Object.values(data().remnants || {}).filter(r => r.quantity>0 && (!f.material || r.material===f.material) && (!f.thickness || r.thickness===Number(f.thickness)));
  const ordered = orderInventory(list, remnantOrder, data());
  list.splice(0, list.length, ...ordered);
  if (searching) list.sort((a,b) => Number(fits(b,+f.width,+f.length,f.rotate))-Number(fits(a,+f.width,+f.length,f.rotate)));
  const matches = searching ? list.filter(r=>fits(r,+f.width,+f.length,f.rotate)).length : 0;
  return `${title('SOBRAS QUE GERAM VALOR', 'Retalhos', 'Encontre a sobra certa antes de consumir uma chapa inteira.', actionButton('remnant-add', `${icon('plus')}Cadastrar retalho`, '', 'primary'))}<section class="fit-panel"><div><span class="feature-icon">${icon('cut')}</span><div><h2>Qual peça você precisa cortar?</h2><p>Busca por envelope retangular em mm. Confirme o formato e as observações antes do corte.</p></div></div><form data-inventory-form="remnant-search" class="fit-form"><label>Material<select name="material" id="remnant-material-filter"><option value="">Todos os materiais</option>${Object.entries(catalog()).map(([key,info])=>`<option value="${key}" ${key===f.material?'selected':''}>${h(info.name)}</option>`).join('')}</select></label><label>Espessura<select name="thickness" id="remnant-thickness-filter"><option value="">Todas</option>${[...new Set((f.material ? (catalog()[f.material]?.thicknesses || []) : Object.values(catalog()).flatMap(m=>m.thicknesses)))].sort((a,b)=>a-b).map(t=>`<option value="${t}" ${String(t)===f.thickness?'selected':''}>${t}mm</option>`).join('')}</select></label><label>Largura mínima (mm)<input name="width" type="number" min="0.01" max="1000000" step="any" value="${h(f.width)}" placeholder="Ex.: 400"></label><label>Comprimento mínimo (mm)<input name="length" type="number" min="0.01" max="1000000" step="any" value="${h(f.length)}" placeholder="Ex.: 600"></label><button class="button primary">${icon('search')}Buscar retalhos</button><label class="checkbox-label"><input type="checkbox" name="rotate" ${f.rotate?'checked':''}>Permitir girar a peça em 90°</label><button class="button subtle" type="button" data-inventory-action="clear-remnant">Limpar busca</button></form></section><div class="section-heading"><h2>${searching ? `${matches} ${matches===1?'retalho compatível':'retalhos compatíveis'}` : 'Retalhos disponíveis'} <span class="count-bubble">${list.length}</span></h2><span>${searching?'Compatíveis primeiro; ordem escolhida em cada grupo':'Selecione a ordem dos retalhos'}</span><label class="inventory-sort">Ordenar retalhos<select id="remnant-order">${sortOptions(remnantOrder, true)}</select></label></div><div class="remnant-grid">${list.map(r => { const match = searching && fits(r,+f.width,+f.length,f.rotate); return `<article data-remnant-id="${h(r.id)}" class="remnant-card ${match?'compatible':''}"><div class="remnant-card-top">${materialTag(r)}<span class="badge ${match?'green':'slate'}">${match?'Compatível':`${r.quantity} peça(s)`}</span></div><div class="remnant-visual"><svg viewBox="0 0 280 104" aria-hidden="true"><defs><pattern id="hatch-${r.id}" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L6 0" stroke="currentColor" opacity=".15"/></pattern></defs><rect x="30" y="10" width="220" height="65" rx="3" fill="url(#hatch-${r.id})" stroke="currentColor"/><text x="140" y="50" text-anchor="middle" fill="currentColor" font-size="15">${r.thickness} mm</text><path d="M30 86h220m-220-4v8m220-8v8" stroke="currentColor"/><text x="140" y="102" text-anchor="middle" fill="currentColor" font-size="10">${r.width} × ${r.length} mm</text></svg></div><div class="remnant-info"><strong>${r.width} × ${r.length} <small>mm</small></strong><span>${r.thickness} mm de espessura · ${r.quantity} peça(s)</span><p>${icon('pin')}${h(r.location)}</p><p class="remnant-notes">${h(r.notes || 'Sem observações de formato.')}</p><small class="identifier">ID ${h(r.id.slice(0,8))}</small></div><div class="remnant-actions">${actionButton('remnant-resize','Cortar / Sub-retalho',r.id)}${actionButton('remnant-consume','Baixa total',r.id,'subtle')}</div></article>`; }).join('') || `<div class="panel inventory-empty">${icon('cut')}<h2>Nenhum retalho disponível</h2><p>Cadastre uma sobra aproveitável ou ajuste os filtros.</p>${actionButton('remnant-add','Cadastrar retalho','','primary')}</div>`}</div><p class="section-note">A compatibilidade considera largura e comprimento. Formas em L, furos, folga e espessura do corte devem ser conferidos pelo operador.</p>`;
}
function movementTable(rows) {
  if (!rows.length) return '<div class="inventory-empty"><span class="empty-icon">↔</span><h3>O histórico começa no primeiro movimento</h3><p>Entradas, baixas e atividades aparecerão aqui automaticamente.</p></div>';
  return `<div class="table-scroll"><table class="movement-table"><thead><tr><th>OPERAÇÃO / MOTIVO</th><th>USUÁRIO</th><th>DATA E HORA</th><th>DETALHES</th></tr></thead><tbody>${rows.map(m=>`<tr><td><div class="movement-description"><span class="movement-icon ${m.type.endsWith('in')||m.type.endsWith('add')?'incoming':''}">${icon(m.type.startsWith('task')?'list':m.type==='sheet-in'?'plus':'cut')}</span><div><strong>${h(m.description)}</strong><small>${h(m.reason || 'Registro automático')}</small></div></div></td><td>${h(m.actor?.email || m.actor?.uid)}</td><td class="date-cell">${time(m.timestamp)}</td><td><button class="icon-button" data-inventory-action="movement-detail" data-id="${h(m.id)}" aria-label="Detalhes da movimentação">${icon('file')}</button></td></tr>`).join('')}</tbody></table></div>`;
}
export function movementsPage() {
  const state = cloudState();
  if (state.historyLoaded === false) return `${title('RASTREABILIDADE DA OPERAÇÃO','Movimentações','O histórico completo é carregado ao abrir esta seção.')}<section class="panel inventory-empty" role="status">${state.historyError ? `<p>${h(state.historyError)}</p>${actionButton('history-retry','Tentar novamente')}` : '<p>Carregando o histórico completo de movimentações…</p>'}</section>`;
  const query = historySearch.toLowerCase();
  const list = Object.values(data().movements || {}).filter(m=>`${m.description} ${m.actor?.email} ${m.reason}`.toLowerCase().includes(query)).sort((a,b)=>b.timestamp-a.timestamp);
  return `${title('RASTREABILIDADE DA OPERAÇÃO','Movimentações','Entradas, cortes, retalhos e atividades com usuário e horário do servidor.',actionButton('export-inventory',`${icon('download')}Exportar estoque e histórico`))}<section class="panel"><div class="inventory-toolbar"><strong>${list.length} registros</strong><form class="inline-search" data-inventory-form="history-search"><label class="sr-only" for="history-search">Pesquisar movimentações</label><input id="history-search" name="search" type="search" value="${h(historySearch)}" placeholder="Buscar operação, usuário ou motivo…"><button class="button secondary">Buscar</button></form></div>${movementTable(list.slice(0,historyLimit))}${list.length>historyLimit?`<div class="load-more">${actionButton('history-more','Mostrar mais registros')}</div>`:''}</section>`;
}
function materialFields(chooseThickness = true) {
  const entries = Object.entries(catalog()).filter(([,info]) => !chooseThickness || info.thicknesses.length);
  return `<label>Material<select name="material" id="stock-material" required>${entries.map(([key,info])=>`<option value="${h(key)}">${h(info.name)}</option>`).join('')}</select></label>${chooseThickness ? `<label>Espessura<select name="thickness" id="stock-thickness" required>${(entries[0]?.[1].thicknesses || []).map(t=>`<option value="${t}">${t} mm</option>`).join('')}</select></label>` : ''}`;
}
function sortOptions(value, remnant) {
  const choices = sortChoices(remnant);
  return choices.map(([key,label])=>`<option value="${key}" ${key===value?'selected':''}>${label}</option>`).join('');
}
const input = (label, name, value = '', extra = '') => `<label>${label}<input name="${name}" value="${h(value)}" ${extra}></label>`;
const dimensionInputs = r => input('Largura (mm)','width',r?.width,'type="number" min="0.01" max="1000000" step="any" required') + input('Comprimento (mm)','length',r?.length,'type="number" min="0.01" max="1000000" step="any" required');
const reasonField = `<label class="full">Motivo / Ordem de produção<input name="reason" maxlength="500" placeholder="Ex.: OP 2048 · corte de suportes"></label>`;
function openForm(action, id) {
  const dialog = document.getElementById('inventory-dialog');
  if (dialog.open) return;
  const item = (action.startsWith('sheet')?data().sheets:data().remnants)?.[id];
  context = { type: action, id, revision: item?.revision }; draftId = uniqueId();
  let content = '', heading = '';
  if (action === 'material-add') {
    heading = 'Novo material'; content = `${input('Nome do material','name','','required maxlength="80" placeholder="Ex.: Chapa piso"')}${input('Densidade (kg/m³)','density',7850,'type="number" min="0.01" max="30000" step="any" required')}<p class="form-note full">Densidade usada nos pesos e no Excel. Referências: carbono 7.850 kg/m³ e inox 8.000 kg/m³. Depois, use Adicionar espessura para cadastrar 3 mm, 4,76 mm ou outras medidas.</p>`;
  } else if (action === 'sheet-add') {
    heading = 'Adicionar espessura'; content = `${materialFields(false)}${input('Espessura (mm)','thickness','','type="number" min="0.001" max="1000" step="any" required')}${dimensionInputs({width:1500,length:3000})}${input('Ponto de reposição (un.)','reorderPoint',2,'type="number" min="0" max="1000000" step="1" required')}${input('Localização / Prateleira','location','','maxlength="140"')}<p class="form-note full">A nova espessura começa com saldo zero. Cadastre a entrada para adicionar chapas. Se ela já tiver sido removida, será reativada com o histórico preservado.</p>`;
  } else if (action === 'sheet-select') {
    heading = 'Movimentar estoque'; content = `<label class="full">Chapa<select name="id">${activeSheets(data()).map(s=>`<option value="${s.id}">${h(sheetLabel(s))} · ${s.quantity} un.</option>`).join('')}</select></label><label>Movimentação<select name="type"><option value="sheet-in">Entrada</option><option value="sheet-out">Baixa por corte</option></select></label>${input('Quantidade','quantity','','type="number" min="1" max="1000000" required step="1"')}${reasonField}`;
  } else if (action === 'sheet-in' || action === 'sheet-out') {
    heading = action === 'sheet-in' ? 'Registrar entrada de chapas' : 'Dar baixa por corte';
    content = `<div class="full selected-stock">${materialTag(item)}<strong>${item.thickness}mm</strong><span>Disponível: ${item.quantity} chapa(s)</span></div>${input('Quantidade de chapas','quantity','','type="number" min="1" max="1000000" required step="1"')}${reasonField}`;
  } else if (action === 'sheet-edit') {
    heading = `Editar ${h(sheetLabel(item))}`; content = `${dimensionInputs(item)}${input('Ponto de reposição (un.)','reorderPoint',reorderPoint(item),'type="number" min="0" max="1000000" step="1" required')}${input('Localização / Prateleira','location',item.location,'maxlength="140"')}${reasonField}`;
  } else if (action === 'remnant-add') {
    heading = 'Cadastrar retalho'; content = `${materialFields()}${dimensionInputs()}${input('Quantidade de peças iguais','quantity',1,'type="number" min="1" max="1000000" required step="1"')}${input('Identificação / Prateleira','location','','required maxlength="140"')}<label class="full">Observações de formato<textarea name="notes" maxlength="2000" rows="3" placeholder="Ex.: corte em L, furo no canto…"></textarea></label>${reasonField}`;
  } else if (action === 'remnant-resize') {
    heading = 'Cortar e registrar sub-retalho'; content = `<div class="notice full"><div><strong>Atual: ${item.width} × ${item.length}mm · ${item.quantity} peça(s)</strong><p>Informe a sobra de UMA peça após o corte. As demais peças continuam com as dimensões originais.</p></div></div>${dimensionInputs()}${input('Identificação / Prateleira','location',item.location,'required maxlength="140"')}<label class="full">Observações da sobra<textarea name="notes" maxlength="2000" rows="3">${h(item.notes)}</textarea></label>${reasonField}`;
  }
  document.getElementById('inventory-content').innerHTML = `<form data-inventory-form="save"><div class="dialog-heading"><div><span class="eyebrow">CONTROLE DE CHAPARIA</span><h2 id="inventory-dialog-title">${heading}</h2></div><button type="button" class="icon-button" data-inventory-action="close" aria-label="Fechar">${icon('close')}</button></div><div class="form-grid">${content}</div><p class="inline-error inventory-error" role="alert" hidden></p><p class="form-note">A operação será confirmada no Firebase e registrada no histórico.</p><div class="dialog-footer"><button type="button" class="button secondary" data-inventory-action="close">Cancelar</button><button class="button primary" type="submit">Confirmar e salvar</button></div></form>`;
  if (action === 'sheet-add' && sheetMaterial && catalog()[sheetMaterial]) dialog.querySelector('[name=material]').value = sheetMaterial;
  dialog.showModal(); dialog.querySelector('input,select')?.focus();
}
export function initializeInventory(options) {
  ({ redraw, notify, confirm } = options);
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-inventory-action]'); if (!el) return;
    const action = el.dataset.inventoryAction, id = el.dataset.id;
    try {
      if (action === 'close') { if (!cloudState().saving) document.getElementById('inventory-dialog').close(); return; }
      if (action === 'material') { sheetMaterial = id; redraw(); return; }
      if (action === 'clear-remnant') { remnantFilter={material:'',thickness:'',width:'',length:'',rotate:true}; redraw(); return; }
      if (action === 'sheet-remove') {
        const item = data().sheets?.[id];
        if (!item) return;
        const revision = item.revision;
        if (await confirm('Remover esta espessura?', `${sheetLabel(item)} sairá do catálogo ativo. O histórico será preservado. Só é possível remover quando não houver chapas nem retalhos disponíveis desta combinação.`, 'Remover espessura')) { await mutate({type:action,id,revision}); notify('Espessura removida do catálogo ativo. Histórico preservado.'); }
        return;
      }
      if (action === 'remnant-add' && !activeSheets(data()).length) throw new Error('Adicione uma espessura no módulo Chapas antes de cadastrar retalhos.');
      if (action === 'copy-purchase') {
        const value = purchaseText(data().sheets, data());
        try { await navigator.clipboard.writeText(value); notify('Lista de compra copiada.'); }
        catch { const box=document.getElementById('inventory-content'); box.innerHTML=`<div class="dialog-heading"><h2 id="inventory-dialog-title">Lista de compra</h2><button class="button secondary" data-inventory-action="close">Fechar</button></div><p>Selecione e copie a lista abaixo.</p><textarea class="copy-list" rows="15" readonly>${h(value)}</textarea>`; document.getElementById('inventory-dialog').showModal(); box.querySelector('textarea').select(); }
        return;
      }
      if (action === 'history-retry') { ensureMovementHistory(true); return; }
      if (action === 'history-more') { historyLimit+=100; redraw(); return; }
      if (action === 'export-inventory') { if (cloudState().historyLoaded === false) throw new Error('Aguarde o carregamento do histórico completo antes de exportar.'); download(JSON.stringify({ format:'chaparia-export', version:1, exportedAt:new Date().toISOString(), data:data() },null,2),'chaparia-estoque-historico','json','application/json'); notify('Exportação de estoque e histórico iniciada.'); return; }
      if (action === 'movement-detail') {
        const m=data().movements[id]; document.getElementById('inventory-content').innerHTML=`<div class="dialog-heading"><h2 id="inventory-dialog-title">Detalhes da movimentação</h2><button class="button secondary" data-inventory-action="close">Fechar</button></div><p>${h(m.description)}</p><p>${h(m.actor?.email)} · ${time(m.timestamp)}</p><p>${h(m.reason||'Sem motivo informado.')}</p><div class="audit-states"><div><h3>Antes</h3><pre>${h(JSON.stringify(m.before||{},null,2))}</pre></div><div><h3>Depois</h3><pre>${h(JSON.stringify(m.after||{},null,2))}</pre></div></div>`; document.getElementById('inventory-dialog').showModal(); return;
      }
      if (action === 'remnant-consume') {
        const item=data().remnants[id], revision=item.revision;
        if (await confirm('Dar baixa total no retalho?', `Serão consumidas todas as ${item.quantity} peça(s) de ${item.width} × ${item.length}mm em ${item.location}.`, 'Confirmar baixa')) { await mutate({type:action,id,revision}); notify('Retalho consumido. Histórico registrado.'); }
        return;
      }
      openForm(action,id);
    } catch (error) { notify(error.message,true); }
  });
  document.addEventListener('change', event => {
    if (event.target.id==='sheet-order') { sheetOrder=event.target.value; redraw(); return; }
    if (event.target.id==='remnant-order') { remnantOrder=event.target.value; redraw(); return; }
    if (event.target.id==='stock-material' && document.getElementById('stock-thickness')) document.getElementById('stock-thickness').innerHTML=(catalog()[event.target.value]?.thicknesses || []).map(t=>`<option value="${t}">${t} mm</option>`).join('');
    if (event.target.id==='remnant-material-filter') { const options=event.target.value?(catalog()[event.target.value]?.thicknesses || []):[...new Set(Object.values(catalog()).flatMap(m=>m.thicknesses))].sort((a,b)=>a-b); document.getElementById('remnant-thickness-filter').innerHTML='<option value="">Todas</option>'+options.map(t=>`<option value="${t}">${t} mm</option>`).join(''); }
  });
  document.addEventListener('submit', async event => {
    const form=event.target.closest('[data-inventory-form]'); if (!form) return;
    event.preventDefault(); const values=Object.fromEntries(new FormData(form)), action=form.dataset.inventoryForm;
    if (action==='sheet-search') { sheetSearch=values.search; redraw(); return; }
    if (action==='history-search') { historySearch=values.search; historyLimit=100; redraw(); return; }
    if (action==='remnant-search') {
      const error=form.querySelector('.inline-error'); error?.remove();
      if (!!values.width !== !!values.length) { form.insertAdjacentHTML('beforeend','<p class="inline-error full" role="alert">Informe largura e comprimento juntos para buscar aproveitamento.</p>'); return; }
      remnantFilter={...values,rotate:values.rotate==='on'}; redraw(); return;
    }
    if (action==='save') {
      const button=form.querySelector('[type=submit]'), error=form.querySelector('.inventory-error');
      if (button.disabled) return; button.disabled=true; error.hidden=true;
      button.textContent='Aguardando confirmação da nuvem…';
      try {
        const command={...context,...values};
        if (context.type==='sheet-select') command.type=values.type;
        if (context.type==='remnant-add') command.id=draftId;
        if (context.type==='material-add') command.id=`mat-${draftId}`;
        if (context.type==='remnant-resize') command.childId=draftId;
        await mutate(command); document.getElementById('inventory-dialog').close(); notify('Operação confirmada na nuvem. Histórico registrado.');
      } catch (err) { error.textContent=err.message; error.hidden=false; }
      finally { button.disabled=false; button.textContent='Confirmar e salvar'; }
    }
  });
  document.getElementById('inventory-dialog').addEventListener('cancel', event => { if (cloudState().saving) event.preventDefault(); });
}
