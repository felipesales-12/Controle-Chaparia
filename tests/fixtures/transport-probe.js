// Real Firebase SDK: reproduce the HTTP transport used after a WebSocket failure.
import { initializeApp } from 'firebase/app';
import { getDatabase, forceLongPolling, goOffline } from 'firebase/database';
import { watchSharedData } from '../../js/shared-data.js';

document.addEventListener('securitypolicyviolation', event => {
  (window.__cspViolations ||= []).push({ directive: event.effectiveDirective, uri: event.blockedURI });
});
forceLongPolling();
const db = getDatabase(initializeApp({ projectId: 'demo-chaparia', databaseURL: 'https://controle-chaparia-default-rtdb.firebaseio.com/' }));
const watcher = watchSharedData(db, { onChange() {}, onError(error) { window.__syncError = error.message; }, timeoutMs: 1000 });
window.__stopProbe = () => { watcher.stop(); goOffline(db); };
