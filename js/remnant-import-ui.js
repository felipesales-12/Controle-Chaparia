import { cloudState, mutate } from './cloud.js';
import { prepareRemnantImport } from './domain.js';
import { materialName } from './catalog.js';
import { escapeHTML as h } from './ui.js';
import { readRemnantFile, readPreparedRemnantLink, applyRemnantCorrections, validateRemnantCorrections } from './remnant-file.js';

let draft = null, notify = () => {}, linkCorrections = null;
const content = () => document.getElementById('inventory-content');
function failure(error) {
  const message = content().querySelector('.import-error');
  if (message) { message.textContent = error.message; message.hidden = false; }
}
export function openRemnantImport(onNotify) {
  if (document.getElementById('inventory-dialog').open) return;
  draft = null; linkCorrections = null; notify = onNotify;
  content().innerHTML = `<div class="dialog-heading"><div><span class="eyebrow">CADASTRO EM LOTE</span><h2 id="inventory-dialog-title">Importar retalhos</h2></div><button type="button" class="icon-button" data-inventory-action="close" aria-label="Fechar">×</button></div><p id="remnant-import-help">Selecione a planilha com a aba Cadastro de retalhos. Os circulares serão cadastrados como diâmetro × diâmetro, com o formato indicado nas observações.</p><form data-remnant-import><label class="import-file">Planilha de retalhos (.xlsx) ou arquivo preparado (.json)<input id="remnant-import-file" type="file" accept=".xlsx,.json" required></label><div id="remnant-import-preview"></div><p class="inline-error import-error" role="alert" hidden></p><div class="dialog-footer"><button type="button" class="button secondary" data-inventory-action="close">Cancelar</button><button type="submit" class="button primary" disabled>Importar para a nuvem</button></div></form>`;
  document.getElementById('inventory-dialog').showModal();
}
function showPreview(parsed, form) {
  const button = form.querySelector('[type=submit]');
  const preview = document.getElementById('remnant-import-preview');
  const state = cloudState().data;
  const plan = parsed.batch.records.length ? prepareRemnantImport(parsed.batch, state) : { entries: [], additions: [], pieces: 0, skipped: 0 };
  draft = parsed;
  preview.innerHTML = `<div class="notice"><div><strong>${plan.entries.length} registros novos · ${plan.pieces} peças</strong><p>${plan.skipped} já importados serão ignorados. Códigos da planilha são usados como identificação; a prateleira não informada fica indicada nas observações.</p>${plan.additions.length ? `<p>Novas espessuras com saldo de chapas zero: ${plan.additions.map(s => h(`${materialName(s.material, state)} ${s.thickness} mm`)).join(', ')}. Espessuras diferentes permanecem separadas.</p>` : ''}<p>A gravação inclui o histórico de cada retalho. Registros existentes e baixas anteriores serão preservados.</p></div></div>${parsed.warnings.map(w => `<p class="form-note">${h(w)}</p>`).join('')}${parsed.pending.length ? `<h3>Conferência · ${parsed.pending.length} registros</h3><p>Preencha as medidas corrigidas para incluir cada item. Deixe as duas medidas em branco para mantê-lo pendente. Para círculos, repita o diâmetro. Confira a quantidade se a anotação original trouxer um número adicional.</p><div class="table-scroll import-pending"><table><thead><tr><th>Código / anotação</th><th>Espessura</th><th>Comprimento (mm)</th><th>Largura (mm)</th><th>Quantidade</th></tr></thead><tbody>${parsed.pending.map((r, i) => `<tr><td><strong>${h(r.code)}</strong><small>${h(r.original)}</small></td><td>${h(r.thickness)} mm</td><td><input type="number" min="0.01" max="1000000" step="any" name="pending-length-${i}" aria-label="Comprimento ${h(r.code)}"></td><td><input type="number" min="0.01" max="1000000" step="any" name="pending-width-${i}" aria-label="Largura ${h(r.code)}"></td><td><input type="number" min="1" max="1000000" step="1" name="pending-quantity-${i}" value="${h(r.quantity)}" aria-label="Quantidade ${h(r.code)}"></td></tr>`).join('')}</tbody></table></div>` : ''}<details class="import-records"><summary>Conferir registros com medidas definidas (${parsed.batch.records.length})</summary><div class="table-scroll"><table><thead><tr><th>Código</th><th>Material / espessura</th><th>Comprimento × largura</th><th>Qtd.</th></tr></thead><tbody>${parsed.batch.records.map(r => `<tr><td>${h(r.code)}</td><td>${h(materialName(r.material, state))} ${h(r.thickness)} mm</td><td>${h(r.length)} × ${h(r.width)} mm</td><td>${h(r.quantity)}</td></tr>`).join('')}</tbody></table></div></details>`;
  button.disabled = !plan.entries.length && !parsed.pending.length;
}
document.addEventListener('change', async event => {
  if (event.target.id !== 'remnant-import-file') return;
  const form = event.target.form, button = form.querySelector('[type=submit]'), file = event.target.files[0];
  const uid = cloudState().uid;
  draft = null; button.disabled = true; form.querySelector('.import-error').hidden = true;
  const preview = document.getElementById('remnant-import-preview');
  preview.textContent = file ? 'Conferindo a planilha…' : '';
  if (!file) return;
  try {
    let parsed = await readRemnantFile(file);
    if (linkCorrections) parsed = applyRemnantCorrections(parsed, linkCorrections);
    if (event.target.files[0] !== file || !form.isConnected || !cloudState().authenticated || cloudState().uid !== uid) return;
    showPreview(parsed, form);
  } catch (error) { preview.textContent = ''; failure(error); }
});
document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-remnant-import]');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('[type=submit]');
  if (!draft || button.disabled) return;
  const uid = cloudState().uid;
  form.querySelector('.import-error').hidden = true; button.disabled = true;
  try {
    const batch = structuredClone(draft.batch);
    draft.pending.forEach((r, i) => {
      const length = form.elements[`pending-length-${i}`].value, width = form.elements[`pending-width-${i}`].value;
      if (!length && !width) return;
      if (!length || !width) throw new Error(`${r.code}: preencha comprimento e largura juntos.`);
      const { original, ...record } = r;
      batch.records.push({ ...record, length, width, quantity: form.elements[`pending-quantity-${i}`].value, notes: `${r.notes} Medidas conferidas pelo operador a partir da anotação ${original}.` });
    });
    const plan = prepareRemnantImport(batch, cloudState().data);
    button.textContent = 'Aguardando confirmação da nuvem…';
    await mutate({ type: 'remnant-import', batch, reason: `Importação de ${batch.source}` });
    if (cloudState().authenticated && cloudState().uid === uid) {
      document.getElementById('inventory-dialog').close();
      notify(`Importação confirmada na nuvem: ${plan.entries.length} registros novos. Histórico registrado.`);
    }
    draft = null; linkCorrections = null;
  } catch (error) { failure(error); }
  finally { button.disabled = false; button.textContent = 'Importar para a nuvem'; }
});

let openingLink = false;
export async function consumeRemnantImportLink(onNotify) {
  const hash = location.hash;
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const payload = params.get('import'), corrections = params.get('corrections');
  if ((!payload && !corrections) || openingLink || !cloudState().authenticated || !cloudState().loaded || document.getElementById('inventory-dialog').open) return;
  const uid = cloudState().uid;
  openingLink = true;
  try {
    if (corrections) {
      if (corrections.length > 64000) throw new Error('Link de correções muito grande.');
      const prepared = validateRemnantCorrections(JSON.parse(corrections));
      openRemnantImport(onNotify);
      linkCorrections = prepared;
      document.getElementById('remnant-import-help').textContent = `Selecione a planilha original. As ${prepared.length} correções de medidas e quantidades deste link serão aplicadas automaticamente antes de importar.`;
    } else {
      const batch = await readPreparedRemnantLink(payload);
      if (hash !== location.hash || !cloudState().authenticated || cloudState().uid !== uid || !cloudState().loaded) return;
      openRemnantImport(onNotify);
      const form = content().querySelector('form');
      form.querySelector('input[type=file]').required = false;
      form.querySelector('.import-file').hidden = true;
      document.getElementById('remnant-import-help').textContent = 'O lote preparado já está carregado. Confira os registros e clique em Importar para a nuvem para concluir o cadastro.';
      showPreview({ batch, pending: [], warnings: [] }, form);
    }
    // Data stays in the browser fragment, never a server query or public file.
    history.replaceState(null, '', location.pathname + location.search + '#retalhos');
  } catch (error) {
    history.replaceState(null, '', location.pathname + location.search + '#retalhos');
    onNotify(error.message, true);
  } finally { openingLink = false; }
}
