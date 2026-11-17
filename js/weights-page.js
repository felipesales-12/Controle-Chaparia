import { cloudState } from './cloud.js';
import { stockWeightSummary } from './weights.js';
import { icon } from './icons.js';
const kg = value => `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} kg`;
const decimal = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const count = value => new Intl.NumberFormat('pt-BR').format(value);

export function weightsPage() {
  const summary = stockWeightSummary(cloudState().data || {});
  const cards = [
    ['sheet', 'Chapas inteiras', summary.sheetKg, `${count(summary.sheetQuantity)} chapa(s) disponíveis`, 'layers'],
    ['remnant', 'Retalhos', summary.remnantKg, `${count(summary.remnantQuantity)} peça(s) aproveitáveis`, 'cut'],
    ['total', 'Peso total em estoque', summary.totalKg, 'Chapas inteiras + retalhos', 'weight']
  ];
  return `<div class="page-heading"><div><span class="eyebrow">MASSA DOS MATERIAIS</span><h1>Pesos do estoque<span class="heading-dot">.</span></h1><p>Chapas inteiras e retalhos separados por tipo de aço e espessura.</p></div><span class="badge slate">${icon('weight')}Peso estimado</span></div>
    <section class="weight-metrics" aria-label="Resumo de pesos">${cards.map(([key, label, mass, caption, symbol]) => `<article class="weight-metric" data-weight-summary="${key}"><div><span>${label}</span>${icon(symbol)}</div><strong>${kg(mass)}</strong><small>${caption}</small></article>`).join('')}</section>
    <div class="notice weight-method">${icon('info')}<div><strong>Calculado pelas medidas cadastradas e pelo saldo disponível</strong><p>Peso (kg) = largura (mm) × comprimento (mm) × espessura (mm) × quantidade × densidade (kg/m³) ÷ 1.000.000.000.</p><p>Densidades de referência: Aço Carbono <b>7.850 kg/m³</b> · Aço Inox <b>8.000 kg/m³</b>. A liga específica pode alterar o peso real. Retalhos em L ou com furos são estimados pelo retângulo das medidas cadastradas, sem descontar recortes.</p></div></div>
    ${summary.materials.map(group => `<section class="panel weight-panel" aria-labelledby="weight-title-${group.material}" data-weight-material="${group.material}"><div class="panel-heading"><div><h2 id="weight-title-${group.material}"><span class="material-tag ${group.material}"><i></i></span>${group.name}</h2><p>Densidade adotada: ${count(group.density)} kg/m³ · somente peças em estoque.</p></div><div class="weight-material-total"><span>Total do material</span><strong>${kg(group.totalKg)}</strong></div></div><div class="table-scroll" role="region" tabindex="0" aria-label="Pesos por espessura — ${group.name}"><table class="weight-table"><caption class="sr-only">Quantidade e peso estimado de chapas inteiras e retalhos de ${group.name}, por espessura.</caption><thead><tr><th scope="col">ESPESSURA</th><th scope="col">CHAPAS (UN.)</th><th scope="col">PESO CHAPAS (KG)</th><th scope="col">RETALHOS (UN.)</th><th scope="col">PESO RETALHOS (KG)</th><th scope="col">PESO TOTAL (KG)</th></tr></thead><tbody>${group.rows.map(row => `<tr data-weight-thickness="${row.thickness}"><th scope="row">${decimal(row.thickness)} <small>mm</small></th><td>${count(row.sheetQuantity)}</td><td data-weight-cell="sheet">${kg(row.sheetKg)}</td><td>${count(row.remnantQuantity)}</td><td data-weight-cell="remnant">${kg(row.remnantKg)}</td><td class="weight-combined" data-weight-cell="total">${kg(row.totalKg)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Subtotal ${group.name}</th><td>${count(group.sheetQuantity)}</td><td>${kg(group.sheetKg)}</td><td>${count(group.remnantQuantity)}</td><td>${kg(group.remnantKg)}</td><td>${kg(group.totalKg)}</td></tr></tfoot></table></div></section>`).join('')}
    <p class="section-note">Os pesos acompanham automaticamente as entradas, baixas e novas dimensões recebidas do estoque sincronizado. Itens consumidos, com saldo zero, não acrescentam peso aos totais.</p>`;
}
