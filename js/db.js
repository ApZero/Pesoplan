/* =========================================================
   Fit Bee — capa de datos (IndexedDB)
   ========================================================= */

const DB_NAME = 'pesoplan-db';
const DB_VERSION = 4;
const STORES = ['foods', 'groups', 'days', 'body', 'settings', 'backups', 'users', 'containers', 'categories'];

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('foods')) {
        db.createObjectStore('foods', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('groups')) {
        db.createObjectStore('groups', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('days')) {
        db.createObjectStore('days', { keyPath: 'date' }); // date = 'YYYY-MM-DD', ver 2+: { date, users: { [userId]: {meals, note} } }
      }
      if (!db.objectStoreNames.contains('body')) {
        db.createObjectStore('body', { keyPath: 'date' }); // ver 2+: { date, users: { [userId]: {weight, bodyFat} } }
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' }); // key = userId, or 'app' for app-level settings
      }
      if (!db.objectStoreNames.contains('backups')) {
        db.createObjectStore('backups', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('containers')) {
        db.createObjectStore('containers', { keyPath: 'id' }); // recipientes: { id, name, weight (g), notes }
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' }); // { id, label, emoji, color }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  async getAll(store) {
    const os = await tx(store);
    return reqToPromise(os.getAll());
  },
  async get(store, key) {
    const os = await tx(store);
    return reqToPromise(os.get(key));
  },
  async put(store, value) {
    const os = await tx(store, 'readwrite');
    return reqToPromise(os.put(value));
  },
  async putMany(store, values) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      const os = t.objectStore(store);
      values.forEach((v) => os.put(v));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  async delete(store, key) {
    const os = await tx(store, 'readwrite');
    return reqToPromise(os.delete(key));
  },
  async clear(store) {
    const os = await tx(store, 'readwrite');
    return reqToPromise(os.clear());
  },
  async count(store) {
    const os = await tx(store);
    return reqToPromise(os.count());
  }
};

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return dateToStr(d);
}

function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function strToDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDaysStr(s, n) {
  const d = strToDate(s);
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}
