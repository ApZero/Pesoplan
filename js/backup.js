/* =========================================================
   Fit Bee — respaldo automático diario + exportar/importar
   ========================================================= */

const BACKUP_KEEP = 30;
const APP_VERSION = 2;

async function collectFullSnapshot() {
  const [foods, groups, days, body, settingsArr, users, containers] = await Promise.all([
    DB.getAll('foods'),
    DB.getAll('groups'),
    DB.getAll('days'),
    DB.getAll('body'),
    DB.getAll('settings'),
    DB.getAll('users'),
    DB.getAll('containers')
  ]);
  return {
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    foods, groups, days, body, users, containers,
    settings: settingsArr
  };
}

/**
 * Corre una vez por sesión: si todavía no se guardó un respaldo automático
 * hoy, genera uno, lo guarda localmente (IndexedDB) y descarta respaldos
 * viejos más allá de BACKUP_KEEP. Si appSettingsObj.autoDownloadBackup no
 * está en false, además dispara la descarga del archivo .json al celular
 * (sin que el usuario tenga que tocar nada más que abrir la app).
 *
 * appSettingsObj: la referencia en memoria de state.appSettings. Se muta
 * directamente y se persiste, para que la UI ya la vea actualizada sin
 * tener que recargar el estado.
 */
async function runAutoBackupIfNeeded(appSettingsObj) {
  const today = todayStr();
  if (appSettingsObj && appSettingsObj.lastAutoBackupDate === today) {
    return { skipped: true };
  }
  const snapshot = await collectFullSnapshot();
  await DB.put('backups', { date: today, createdAt: new Date().toISOString(), snapshot });

  const all = await DB.getAll('backups');
  if (all.length > BACKUP_KEEP) {
    const sorted = all.sort((a, b) => (a.date < b.date ? -1 : 1));
    const toRemove = sorted.slice(0, all.length - BACKUP_KEEP);
    for (const b of toRemove) await DB.delete('backups', b.date);
  }

  appSettingsObj.lastAutoBackupDate = today;
  await DB.put('settings', { key: 'app', value: appSettingsObj });

  let downloaded = false;
  if (appSettingsObj.autoDownloadBackup !== false) {
    try {
      downloadSnapshotAsFile(snapshot);
      downloaded = true;
    } catch (err) {
      downloaded = false;
    }
  }

  return { skipped: false, date: today, downloaded };
}

async function listBackups() {
  const all = await DB.getAll('backups');
  return all.sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function applySnapshot(snapshot) {
  await Promise.all(['foods', 'groups', 'days', 'body', 'users', 'containers'].map((s) => DB.clear(s)));
  if (snapshot.foods && snapshot.foods.length) await DB.putMany('foods', snapshot.foods);
  if (snapshot.groups && snapshot.groups.length) await DB.putMany('groups', snapshot.groups);
  if (snapshot.days && snapshot.days.length) await DB.putMany('days', snapshot.days);
  if (snapshot.body && snapshot.body.length) await DB.putMany('body', snapshot.body);
  if (snapshot.users && snapshot.users.length) await DB.putMany('users', snapshot.users);
  if (snapshot.containers && snapshot.containers.length) await DB.putMany('containers', snapshot.containers);
  if (snapshot.settings && snapshot.settings.length) await DB.putMany('settings', snapshot.settings);
  return {
    foods: (snapshot.foods || []).length,
    groups: (snapshot.groups || []).length,
    days: (snapshot.days || []).length,
    body: (snapshot.body || []).length,
    users: (snapshot.users || []).length,
    containers: (snapshot.containers || []).length
  };
}

async function restoreFromBackup(date) {
  const row = await DB.get('backups', date);
  if (!row) throw new Error('Respaldo no encontrado');
  return applySnapshot(row.snapshot);
}

function downloadSnapshotAsFile(snapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitbee-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportNow() {
  const snapshot = await collectFullSnapshot();
  downloadSnapshotAsFile(snapshot);
  return snapshot;
}

function readFileAsJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (err) {
        reject(new Error('El archivo no es un JSON de respaldo válido.'));
      }
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsText(file);
  });
}

async function importFromFile(file) {
  const data = await readFileAsJSON(file);
  if (!data || (!data.foods && !data.days && !data.body)) {
    throw new Error('El archivo no tiene el formato esperado de Fit Bee.');
  }
  return applySnapshot(data);
}
