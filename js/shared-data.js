import { ref, onValue, query, orderByChild, limitToLast, runTransaction } from 'firebase/database';
import { initialState } from './domain.js';

// Read the operational collections independently. Audit history must never block entry.
export function watchSharedData(db, { onChange, onError, timeoutMs = 15000 }) {
  const collections = ['schemaVersion', 'sheets', 'remnants', 'materials', 'tasks'];
  const stops = [], first = new Set();
  let data = {}, stopped = false, loaded = false, seeding = false;
  let stopRecent, stopHistory, recentStarted = false, historyStarted = false, historyLoaded = false, historyError = '';
  let scheduled = false, readinessScheduled = false;
  // A disconnected SDK retries silently. Give the operator a way out while
  // keeping listeners alive so a recovered connection still opens the stock.
  const deadline = setTimeout(() => {
    if (!stopped && !loaded) onError(new Error('A conexão com o estoque demorou mais que o esperado. Verifique a internet e clique em Tentar novamente.'));
  }, timeoutMs);
  const fail = error => { clearTimeout(deadline); if (!stopped) { loaded = false; onError(error); } };
  const publish = () => {
    if (scheduled || stopped) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!stopped && loaded) onChange({ data, loaded, historyLoaded, historyError }); });
  };
  function startRecent() {
    if (recentStarted || stopped) return;
    recentStarted = true;
    stopRecent = onValue(query(ref(db, 'chaparia/movements'), orderByChild('timestamp'), limitToLast(100)), snap => {
      if (stopped || historyLoaded) return;
      data = { ...data, movements: snap.val() || {} }; publish();
    }, error => { if (!stopped) { historyError = error.message; publish(); } });
  }
  function checkReady() {
    if (stopped || first.size < collections.length) return;
    if (data.schemaVersion == null && data.sheets == null) {
      if (seeding) return;
      seeding = true;
      runTransaction(ref(db, 'chaparia'), current => current === null ? initialState() : undefined, { applyLocally: false })
        .then(result => { if (!result.committed && !loaded && !stopped) fail(new Error('Estrutura de dados incompatível. O conteúdo existente foi preservado.')); })
        .catch(fail).finally(() => { seeding = false; });
      return;
    }
    if (data.schemaVersion !== 1 || !data.sheets) { fail(new Error('Estrutura de dados incompatível. O conteúdo existente foi preservado.')); return; }
    loaded = true; clearTimeout(deadline); publish(); startRecent();
  }
  for (const name of collections) {
    stops.push(onValue(ref(db, `chaparia/${name}`), snap => {
      if (stopped) return;
      data = { ...data, [name]: snap.val() ?? (['materials','tasks','remnants'].includes(name) ? {} : null) };
      first.add(name);
      // One atomic server update can notify several child listeners in sequence.
      // Validate their combined state after that notification batch completes.
      if (!readinessScheduled) {
        readinessScheduled = true;
        queueMicrotask(() => { readinessScheduled = false; checkReady(); });
      }
    }, fail));
  }
  return {
    loadHistory(retry = false) {
      if (stopped || (historyStarted && !retry)) return;
      historyStarted = true; historyError = ''; stopHistory?.();
      stopHistory = onValue(ref(db, 'chaparia/movements'), snap => {
        if (stopped) return;
        historyLoaded = true; historyError = ''; stopRecent?.(); data = { ...data, movements: snap.val() || {} }; publish();
      }, error => { if (!stopped) { historyError = error.message; publish(); } });
    },
    adoptTransaction(value) {
      if (stopped) return;
      const movements = historyLoaded ? value.movements || {} : Object.fromEntries(Object.entries(value.movements || {}).sort(([,a],[,b]) => b.timestamp-a.timestamp).slice(0,100));
      data = { schemaVersion: value.schemaVersion, sheets: value.sheets, remnants: value.remnants || {}, materials: value.materials || {}, tasks: value.tasks || {}, movements }; publish();
    },
    stop() { stopped = true; clearTimeout(deadline); for (const stop of stops) stop(); stopRecent?.(); stopHistory?.(); }
  };
}

// Keep a complete root snapshot only during a write, preserving atomic stock + audit.
export async function commitSharedTransaction(root, update) {
  let stop;
  try {
    await new Promise((resolve, reject) => { stop = onValue(root, resolve, reject); });
    return await runTransaction(root, update, { applyLocally: false });
  } finally { stop?.(); }
}
