import { cloudDatabase } from './cloud.js';
// Device preferences are the only local data; critical records always go to Firebase.
let preferences = {};
try { preferences = JSON.parse(localStorage.getItem('chaparia-preferences') || '{}'); } catch { /* Optional preferences. */ }
export const database = {
  ...cloudDatabase,
  settings: async () => ({ ...preferences }),
  setSetting: async (key, value) => {
    preferences[key] = value;
    try { localStorage.setItem('chaparia-preferences', JSON.stringify(preferences)); } catch { /* Theme still works for this visit. */ }
  }
};
