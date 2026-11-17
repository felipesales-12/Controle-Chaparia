import { cloudState } from './cloud.js';
import { stockWeightSummary, stockWeightDetails } from './weights.js';
import { icon } from './icons.js';
import { escapeHTML as h } from './ui.js';
import { download } from './backup.js';
import { orderInventory, sortChoices } from './catalog.js';
let showDetails = false, exporting = false;
let sheetWeightOrder = 'material', remnantWeightOrder = 'thickness-length-asc';
const kg = value => `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} kg`;
const decimal = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const count = value => new Intl.NumberFormat('pt-BR').format(value);

function detailTable(title, records, category) {
  const order = category === 'sheets' ? sheetWeightOrder : remnantWeightOrder;
  records = orderInventory(records, order, cloudState().data || {});
  return `<section class="panel weight-panel" data-weight-detail="${category}" aria-labelledby="weight-detail-title-${category}"><div class="panel-heading"><div><h2 id="weight-detail-title-${category}">${title}</h2><p>${records.length} cadastro(s) · peso de uma peça e peso do saldo, separados.</p></div><label class="inventory-sort">Ordenar pesos de ${category === 'sheets' ? 'chapas' : 'retalhos'}<select data-weight-sort="${category}">${sortChoices(category === 'remnants').map(([key,label])=>`<option value="${key}" ${key===order?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="table-scroll" role="region" tabindex="0" aria-label="Peso unitário — ${title}"><table class="weight-detail-table"><thead><tr><th scope="col">CADASTRO / MATERIAL</th><th scope="col">ESPESSURA</th><th scope="col">MEDIDAS (L × C)</th><th scope="col">QUANTIDADE</th><th scope="col">PESO DE 1 PEÇA</th><th scope="col">PESO EM ESTOQUE</th><th scope="col">LOCAL / OBSERVAÇÕES</th><th scope="col">SITUAÇÃO</th></tr></thead><tbody>${records.map(record => `<tr data-weight-record="${h(record.id)}"><td><strong>${h(record.materialLabel)}</strong><small class="weight-record-id">${h(record.id)}</small></td><td>${decimal(record.thickness)} mm</td><td>${decimal(record.width)} × ${decimal(record.length)} mm</td><td>${count(record.quantity)} un.</td><td class="weight-per-piece" data-weight-cell="unit">${kg(record.unitKg)}</td><td class="weight-combined" data-weight-cell="stock">${kg(record.totalKg)}</td><td class="weight-record-notes"><strong>${h(record.location || 'Local não definido')}</strong><small>${h(record.notes || 'Sem observações.')}</small></td><td><span class="badge ${record.quantity > 0 ? 'green' : 'slate'}">${record.status}</span></td></tr>`).join('') || '<tr><td colspan="8" class="empty-message">Nenhum retalho cadastrado. Os registros aparecerão aqui após o cadastro.</td></tr>'}</tbody></table></div></section>`;
}

export function weightsPage() {
  const data = cloudState().data || {};
  const summary = stockWeightSummary(data);
  const details = stockWeightDetails(data);
  const cards = [
    ['sheet', 'Chapas inteiras', summary.sheetKg, `${count(summary.sheetQuantity)} chapa(s) disponíveis`, 'layers'],
    ['remnant', 'Retalhos', summary.remnantKg, `${count(summary.remnantQuantity)} peça(s) aproveitáveis`, 'cut'],
    ['total', 'Peso total em estoque', summary.totalKg, 'Chapas inteiras + retalhos', 'weight']
  ];
  return `<div class="page-heading"><div><span class="eyebrow">MASSA DOS MATERIAIS</span><h1>Pesos do estoque<span class="heading-dot">.</span></h1><p>Chapas inteiras e retalhos separados por tipo de aço e espessura.</p></div><button type="button" id="export-weights-excel" class="button primary" data-weight-action="export" ${exporting ? 'disabled' : ''}>${icon('download')}${exporting ? 'Preparando planilha…' : 'Exportar Excel (.xlsx)'}</button></div><div class="weight-controls"><div class="segmented" role="group" aria-label="Visualização dos pesos"><button type="button" data-weight-action="summary" class="${!showDetails ? 'selected' : ''}" aria-pressed="${!showDetails}">Resumo por espessura</button><button type="button" data-weight-action="details" class="${showDetails ? 'selected' : ''}" aria-pressed="${showDetails}">Peso por peça</button></div><span>Excel com resumo e todos os cadastros, inclusive sem saldo.</span></div>
    <section class="weight-metrics" aria-label="Resumo de pesos">${cards.map(([key, label, mass, caption, symbol]) => `<article class="weight-metric" data-weight-summary="${key}"><div><span>${label}</span>${icon(symbol)}</div><strong>${kg(mass)}</strong><small>${caption}</small></article>`).join('')}</section>
    <div class="notice weight-method">${icon('info')}<div><strong>Calculado pelas medidas cadastradas e pelo saldo disponível</strong><p>Peso (kg) = largura (mm) × comprimento (mm) × espessura (mm) × quantidade × densidade (kg/m³) ÷ 1.000.000.000.</p><p>Densidades de referência: Aço Carbono <b>7.850 kg/m³</b> · Aço Inox <b>8.000 kg/m³</b>. Novos materiais usam a densidade cadastrada. A liga específica pode alterar o peso real. Retalhos em L ou com furos são estimados pelo retângulo das medidas cadastradas, sem descontar recortes.</p></div></div>
    ${showDetails ? `<p class="weight-detail-note">Cada linha representa um cadastro de peças iguais. <strong>Peso de 1 peça</strong> é o peso unitário; <strong>Peso em estoque</strong> multiplica esse valor pela quantidade disponível.</p>${detailTable('Chapas inteiras — peso por peça', details.sheets, 'sheets')}${detailTable('Retalhos — peso por peça', details.remnants, 'remnants')}` : summary.materials.map(group => `<section class="panel weight-panel" aria-labelledby="weight-title-${group.material}" data-weight-material="${group.material}"><div class="panel-heading"><div><h2 id="weight-title-${group.material}"><span class="material-tag ${group.material}"><i></i></span>${h(group.name)}</h2><p>Densidade adotada: ${count(group.density)} kg/m³ · somente peças em estoque.</p></div><div class="weight-material-total"><span>Total do material</span><strong>${kg(group.totalKg)}</strong></div></div><div class="table-scroll" role="region" tabindex="0" aria-label="Pesos por espessura — ${h(group.name)}"><table class="weight-table"><caption class="sr-only">Quantidade e peso estimado de chapas inteiras e retalhos de ${h(group.name)}, por espessura.</caption><thead><tr><th scope="col">ESPESSURA</th><th scope="col">CHAPAS (UN.)</th><th scope="col">PESO CHAPAS (KG)</th><th scope="col">RETALHOS (UN.)</th><th scope="col">PESO RETALHOS (KG)</th><th scope="col">PESO TOTAL (KG)</th></tr></thead><tbody>${group.rows.map(row => `<tr data-weight-thickness="${row.thickness}"><th scope="row">${decimal(row.thickness)} <small>mm</small></th><td>${count(row.sheetQuantity)}</td><td data-weight-cell="sheet">${kg(row.sheetKg)}</td><td>${count(row.remnantQuantity)}</td><td data-weight-cell="remnant">${kg(row.remnantKg)}</td><td class="weight-combined" data-weight-cell="total">${kg(row.totalKg)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Subtotal ${h(group.name)}</th><td>${count(group.sheetQuantity)}</td><td>${kg(group.sheetKg)}</td><td>${count(group.remnantQuantity)}</td><td>${kg(group.remnantKg)}</td><td>${kg(group.totalKg)}</td></tr></tfoot></table></div></section>`).join('')}
    <p class="section-note">Os pesos acompanham automaticamente as entradas, baixas e novas dimensões recebidas do estoque sincronizado. Itens consumidos, com saldo zero, não acrescentam peso aos totais.</p>`;
}

export function initializeWeights({ redraw, notify }) {
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-weight-sort]')) return;
    if (event.target.dataset.weightSort === 'sheets') sheetWeightOrder = event.target.value;
    else remnantWeightOrder = event.target.value;
    redraw();
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-weight-action]');
    if (!button) return;
    const action = button.dataset.weightAction;
    if (action === 'summary' || action === 'details') {
      showDetails = action === 'details'; redraw();
      document.querySelector(`[data-weight-action="${action}"]`)?.focus();
      return;
    }
    if (action !== 'export' || exporting) return;
    const state = cloudState();
    if (!state.authenticated || !state.loaded) return notify('Entre e aguarde o carregamento do estoque antes de exportar.', true);
    // Capture only the stock once: changes during file generation belong to the next export.
    const snapshot = structuredClone({ materials: state.data?.materials || {}, sheets: state.data?.sheets || {}, remnants: state.data?.remnants || {} });
    const meta = { generatedAt: new Date(), email: state.email, connected: state.connected };
    exporting = true; button.disabled = true; button.textContent = 'Preparando planilha…';
    try {
      const { weightsExcelBuffer } = await import('./weights-excel.js');
      const buffer = await weightsExcelBuffer(snapshot, meta);
      const current = cloudState();
      if (!current.authenticated || current.uid !== state.uid || current.email !== state.email) throw new Error('A sessão mudou. Entre novamente e exporte o estoque da sua conta.');
      download(buffer, 'chaparia-pesos', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      notify('Planilha Excel gerada com resumo, chapas inteiras e retalhos separados.');
    } catch (error) { notify(`Não foi possível gerar a planilha. ${error.message || 'Tente novamente.'}`, true); }
    finally { exporting = false; if (location.hash === '#pesos') redraw(); }
  });
}
