import { initializeApp } from 'firebase/app';
import { initializeAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, sendPasswordResetEmail, updatePassword as firebaseUpdatePassword, browserSessionPersistence } from 'firebase/auth';
import { getDatabase, ref, onValue, runTransaction, serverTimestamp } from 'firebase/database';
import { firebaseConfig } from '../firebase-config.js';
import { initialState, applyOperation } from './domain.js';
import { uniqueId } from './tasks.js';

let auth, db, root, initialized, stopData, stopConnection, generation = 0;
let snapshot = null, user = null, connected = false, loaded = false, saving = false;
let status = 'loading', errorMessage = '', configured = false;
const listeners = new Set();
export const subscribeCloud = listener => { listeners.add(listener); return () => listeners.delete(listener); };
function emit() { for (const listener of listeners) listener(cloudState()); }
export function cloudState() {
  return { configured, authenticated: !!user, email: user?.email || '', uid: user?.uid || '', mode: 'cloud', status, connected, loaded, saving, error: errorMessage, data: snapshot };
}
export const friendlyError = error => ({
  'auth/invalid-credential': 'E-mail ou senha inválidos.', 'auth/invalid-email': 'Informe um e-mail válido.',
  'auth/user-disabled': 'Usuário desativado. Procure o administrador.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/network-request-failed': 'Não foi possível conectar ao Firebase. Verifique a internet.',
  'auth/requires-recent-login': 'Entre novamente antes de alterar sua senha.',
  'auth/operation-not-allowed': 'Ative o provedor E-mail/senha no console Firebase.',
  'auth/invalid-api-key': 'Confira a apiKey em firebase-config.js.',
  'PERMISSION_DENIED': 'O Firebase negou o acesso. Confira a sessão e as regras do Realtime Database.',
  'permission-denied': 'O Firebase negou o acesso. Confira a sessão e as regras do Realtime Database.'
}[error.code] || error.message || 'Não foi possível concluir a operação.');
function detach() { stopData?.(); stopConnection?.(); stopData = stopConnection = null; snapshot = null; connected = loaded = false; }
export function initializeCloud() {
  if (initialized) return initialized;
  initialized = (async () => {
    const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    if (fields.some(key => !firebaseConfig[key] || firebaseConfig[key].includes('COLE_AQUI'))) {
      status = 'setup'; errorMessage = 'Preencha os campos sinalizados em firebase-config.js com os dados do seu aplicativo Web no console Firebase.'; emit(); return;
    }
    try {
      const app = initializeApp(firebaseConfig); auth = initializeAuth(app, { persistence: browserSessionPersistence }); db = getDatabase(app); root = ref(db, 'chaparia');
      // Only the auth session persists in this tab. Stock and activities never use localStorage/IndexedDB.
      configured = true;
      onAuthStateChanged(auth, async nextUser => {
        const epoch = ++generation;
        detach(); user = nextUser; errorMessage = '';
        if (!user) { status = 'login-required'; emit(); return; }
        status = 'loading'; emit();
        stopConnection = onValue(ref(db, '.info/connected'), value => { connected = value.val() === true; if (loaded) status = connected ? 'synced' : 'offline'; emit(); });
        // Start listening immediately after authentication. A null node is seeded by a transaction.
        let seeding = false;
        stopData = onValue(root, value => {
          if (epoch !== generation) return;
          const data = value.val();
          if (data === null) {
            if (seeding) return;
            seeding = true;
            runTransaction(root, current => current === null ? initialState() : undefined, { applyLocally: false })
              .catch(error => { if (epoch === generation) { status = 'error'; errorMessage = friendlyError(error); emit(); } })
              .finally(() => { seeding = false; });
            return;
          }
          if (data.schemaVersion !== 1 || !data.sheets) { status = 'error'; errorMessage = 'Estrutura de dados incompatível. O conteúdo existente foi preservado.'; loaded = false; emit(); return; }
          snapshot = data; loaded = true; status = connected ? 'synced' : 'offline'; errorMessage = ''; emit();
        }, error => { if (epoch === generation) { loaded = false; status = 'error'; errorMessage = friendlyError(error); emit(); } });
      }, error => { status = 'error'; errorMessage = friendlyError(error); emit(); });
    } catch (error) { status = 'error'; errorMessage = friendlyError(error); emit(); }
  })();
  return initialized;
}
export async function signIn(email, password) {
  if (!configured) throw new Error(errorMessage || 'Configure o Firebase antes de entrar.');
  try { await signInWithEmailAndPassword(auth, email.trim(), password); } catch (error) { throw new Error(friendlyError(error)); }
}
export async function signOut() {
  if (saving) throw new Error('Aguarde a confirmação da gravação antes de sair.');
  await firebaseSignOut(auth);
}
export async function sendRecovery(email) {
  if (!configured) throw new Error('Configure o Firebase primeiro.');
  try { await sendPasswordResetEmail(auth, email.trim()); } catch (error) { throw new Error(friendlyError(error)); }
}
export async function updatePassword(password) {
  try { await firebaseUpdatePassword(user, password); } catch (error) { throw new Error(friendlyError(error)); }
}
export async function mutate(command) {
  if (!user || !loaded) throw new Error('Entre e aguarde o carregamento do estoque.');
  if (!connected || !navigator.onLine) throw new Error('Sem conexão. A operação não foi enviada. Reconecte e tente novamente.');
  if (saving) throw new Error('Aguarde a confirmação da operação anterior.');
  const actor = { uid: user.uid, email: user.email }, epoch = generation;
  const operation = { ...command, eventId: uniqueId() };
  saving = true; emit();
  try {
    const result = await runTransaction(root, current => applyOperation(current, operation, actor, serverTimestamp()), { applyLocally: false });
    if (!result.committed) throw new Error('A operação não foi confirmada pelo servidor. Atualize a lista.');
    if (epoch === generation) { snapshot = result.snapshot.val(); emit(); }
  } catch (error) { throw new Error(friendlyError(error)); }
  finally { saving = false; emit(); }
}
export const cloudDatabase = {
  all: async () => {
    if (!user || !loaded) throw new Error('Aguardando acesso ao banco de dados.');
    return Object.values(snapshot?.tasks || {}).map(t => ({ ...t, completedAt: t.completedAt ?? null, description: t.description || '', notes: t.notes || '', dueDate: t.dueDate || '' }));
  },
  add: task => mutate({ type: 'task-add', task }),
  put: task => mutate({ type: 'task-put', task }),
  remove: (id, revision) => mutate({ type: 'task-remove', id, revision }),
  replace: (tasks, _settings, expected = JSON.stringify(snapshot?.tasks || {})) => mutate({ type: 'task-replace', tasks, expected })
};
window.addEventListener('beforeunload', event => { if (saving) { event.preventDefault(); event.returnValue = ''; } });
