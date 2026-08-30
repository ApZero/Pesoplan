/* =========================================================
   Fit Bee — app.js (estado, render, eventos)
   ========================================================= */

const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;

const state = {
  foods: [],
  foodsById: {},
  groups: [],
  groupsById: {},
  containers: [],
  containersById: {},
  categories: [],
  categoriesById: {},
  editingCategoryId: null,
  users: [],
  usersById: {},
  currentUserId: null,
  appSettings: { ...SEED_APP_SETTINGS },
  settings: { ...SEED_USER_SETTINGS }, // ajustes del usuario activo
  bodyLogs: [], // ascendente por fecha, del usuario activo
  activeTab: 'today',
  foodsSubview: 'foods',
  currentDateStr: todayStr(),
  currentDay: null, // { date, users: { [userId]: { meals, note } } }
  daySummaryView: 'resumen', // 'resumen' | 'alimentos'
  foodFilter: { search: '', category: 'all', sort: 'name' },
  pickerTab: 'foods',
  pickerContext: null, // {mealType, date}
  amountContext: null, // {mode, foodId, mealType, date, itemIndex}
  editingFoodId: null,
  editingGroupId: null,
  groupSheetItems: [],
  editingContainerId: null,
  editingBodyLogDate: null,
  editingUserId: null,
  userSheetEmoji: USER_EMOJIS[0],
  copyContext: null, // {sourceMealType, sourceDate, sourceUserId}
  dayGroupContext: null, // {mealType, itemIndex}
  dayGroupItems: [],
  fMealTypesSelected: []
};

/* ---------------------------------------------------------
   Utilidades UI
   --------------------------------------------------------- */

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2400);
}

function openSheet(id) {
  document.getElementById('sheet-backdrop').classList.add('is-open');
  document.getElementById(id).classList.add('is-open');
}
function closeSheet(id) {
  document.getElementById(id).classList.remove('is-open');
  const anyOpen = document.querySelectorAll('.sheet.is-open').length > 0;
  if (!anyOpen) document.getElementById('sheet-backdrop').classList.remove('is-open');
}
function closeAllSheets() {
  document.querySelectorAll('.sheet.is-open').forEach((s) => s.classList.remove('is-open'));
  document.getElementById('sheet-backdrop').classList.remove('is-open');
}

function fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('es-PY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function round1(n) { return Math.round(n * 10) / 10; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function emptyStateHtml(glyph, title, text) {
  return `<div class="empty-state"><div class="glyph">${glyph}</div><h4>${title}</h4><p>${text}</p></div>`;
}

function formatFullDate(dateStr) {
  const d = strToDate(dateStr);
  return d.toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' });
}

function dateLabelPrefix(dateStr) {
  if (dateStr === todayStr()) return 'Hoy · ';
  if (dateStr === todayStr(-1)) return 'Ayer · ';
  if (dateStr === todayStr(1)) return 'Mañana · ';
  return '';
}

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  await ensureFoodsSeed();
  await ensureCategoriesSeed();
  await migrateToMultiUserIfNeeded();
  await loadAllState();
  const backupResult = await runAutoBackupIfNeeded(state.appSettings);
  refreshAutoBackupStatus();

  populateStaticSelectors();
  wireEvents();

  state.currentDay = await loadDayRecord(state.currentDateStr);
  renderUserSwitcher();
  renderToday();
  renderFoodsTab();
  renderProgressTab();
  renderSettingsTab();

  if (!state.appSettings.onboarded) {
    showToast('¡Bienvenido a Fit Bee! Configurá tu meta en Ajustes.');
    state.appSettings.onboarded = true;
    await saveAppSettings();
  } else if (backupResult && !backupResult.skipped) {
    showToast(backupResult.downloaded
      ? 'Respaldo automático del día guardado y descargado ✓'
      : 'Respaldo automático del día guardado en la app ✓');
  }
}

async function ensureFoodsSeed() {
  const foodCount = await DB.count('foods');
  if (foodCount === 0) {
    await DB.putMany('foods', SEED_FOODS);
  }
}

async function ensureCategoriesSeed() {
  const catCount = await DB.count('categories');
  if (catCount === 0) {
    await DB.putMany('categories', SEED_CATEGORIES);
  }
}

/**
 * Migra datos de la versión de un solo usuario (settings con key 'main',
 * days/body con forma plana) hacia el modelo multiusuario. Es segura de
 * llamar siempre: si ya existe al menos un usuario, no hace nada.
 */
async function migrateToMultiUserIfNeeded() {
  const existingUsers = await DB.count('users');
  if (existingUsers > 0) return;

  const defaultUser = { id: uid('user'), name: 'Tú', emoji: USER_EMOJIS[0], createdAt: new Date().toISOString() };
  await DB.put('users', defaultUser);

  const oldSettingsRow = await DB.get('settings', 'main');
  const oldVal = oldSettingsRow ? oldSettingsRow.value : null;

  const userSettings = {
    ...SEED_USER_SETTINGS,
    dailyLimit: (oldVal && oldVal.dailyLimit) || SEED_USER_SETTINGS.dailyLimit,
    mealTargets: (oldVal && oldVal.mealTargets) || { ...SEED_USER_SETTINGS.mealTargets },
    heightCm: (oldVal && oldVal.heightCm) || null,
    goalWeightKg: (oldVal && oldVal.goalWeightKg) || null
  };
  await DB.put('settings', { key: defaultUser.id, value: userSettings });

  const appSettings = {
    ...SEED_APP_SETTINGS,
    currentUserId: defaultUser.id,
    lastAutoBackupDate: (oldVal && oldVal.lastAutoBackupDate) || null,
    onboarded: (oldVal && oldVal.onboarded) || false
  };
  await DB.put('settings', { key: 'app', value: appSettings });
  if (oldSettingsRow) await DB.delete('settings', 'main');

  const oldDays = await DB.getAll('days');
  for (const d of oldDays) {
    if (d.meals && !d.users) {
      await DB.put('days', { date: d.date, users: { [defaultUser.id]: { meals: d.meals, note: d.note || '' } } });
    }
  }

  const oldBody = await DB.getAll('body');
  for (const b of oldBody) {
    if (b.weight !== undefined && !b.users) {
      await DB.put('body', { date: b.date, users: { [defaultUser.id]: { weight: b.weight, bodyFat: b.bodyFat != null ? b.bodyFat : null } } });
    }
  }
}

async function loadAllState() {
  const [foods, groups, users, appRow, bodyAll, containers, categories] = await Promise.all([
    DB.getAll('foods'),
    DB.getAll('groups'),
    DB.getAll('users'),
    DB.get('settings', 'app'),
    DB.getAll('body'),
    DB.getAll('containers'),
    DB.getAll('categories')
  ]);
  state.foods = foods.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  state.foodsById = Object.fromEntries(foods.map((f) => [f.id, f]));
  state.groups = groups.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  state.groupsById = Object.fromEntries(groups.map((g) => [g.id, g]));
  state.containers = containers.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  state.containersById = Object.fromEntries(containers.map((c) => [c.id, c]));
  state.categories = categories.sort((a, b) => a.label.localeCompare(b.label, 'es'));
  state.categoriesById = Object.fromEntries(categories.map((c) => [c.id, c]));
  state.users = users.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  state.usersById = Object.fromEntries(users.map((u) => [u.id, u]));

  state.appSettings = appRow ? appRow.value : { ...SEED_APP_SETTINGS };
  if (!state.currentUserId || !state.usersById[state.currentUserId]) {
    state.currentUserId = (state.appSettings.currentUserId && state.usersById[state.appSettings.currentUserId])
      ? state.appSettings.currentUserId
      : (state.users[0] ? state.users[0].id : null);
  }
  state.appSettings.currentUserId = state.currentUserId;

  const userSettingsRow = state.currentUserId ? await DB.get('settings', state.currentUserId) : null;
  state.settings = userSettingsRow ? userSettingsRow.value : { ...SEED_USER_SETTINGS };

  state.bodyLogs = bodyAll
    .filter((rec) => rec.users && rec.users[state.currentUserId])
    .map((rec) => ({ date: rec.date, weight: rec.users[state.currentUserId].weight, bodyFat: rec.users[state.currentUserId].bodyFat, periodStart: !!rec.users[state.currentUserId].periodStart }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function saveSettings() {
  await DB.put('settings', { key: state.currentUserId, value: state.settings });
}

async function saveAppSettings() {
  await DB.put('settings', { key: 'app', value: state.appSettings });
}

function refreshAutoBackupStatus() {
  const el = document.getElementById('auto-backup-status');
  if (!el) return;
  if (state.appSettings.lastAutoBackupDate) {
    el.textContent = `Último respaldo: ${formatFullDate(state.appSettings.lastAutoBackupDate)}`;
  } else {
    el.textContent = 'Todavía no se generó ningún respaldo';
  }
}

function populateStaticSelectors() {
  populateCategorySelect();

  const mtWrap = document.getElementById('f-mealtypes');
  mtWrap.innerHTML = MEAL_TYPES.map((m) => `<button type="button" class="chip" data-mt="${m.id}">${m.label}</button>`).join('');
  mtWrap.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('is-selected');
      const mt = chip.dataset.mt;
      const idx = state.fMealTypesSelected.indexOf(mt);
      if (idx === -1) state.fMealTypesSelected.push(mt); else state.fMealTypesSelected.splice(idx, 1);
    });
  });

  const activitySelect = document.getElementById('calc-activity');
  if (activitySelect) {
    activitySelect.innerHTML = ACTIVITY_LEVELS.map((a) => `<option value="${a.id}">${a.label}</option>`).join('');
  }

  const copyMealSelect = document.getElementById('copy-dest-meal');
  if (copyMealSelect) {
    copyMealSelect.innerHTML = MEAL_TYPES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
  }

  const emojiWrap = document.getElementById('u-emoji');
  if (emojiWrap) {
    emojiWrap.innerHTML = USER_EMOJIS.map((e) => `<button type="button" class="chip emoji-chip" data-emoji="${e}">${e}</button>`).join('');
    emojiWrap.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.userSheetEmoji = chip.dataset.emoji;
        emojiWrap.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-selected', c === chip));
      });
    });
  }
}

function populateCategorySelect() {
  const catSelect = document.getElementById('f-category');
  const prev = catSelect.value;
  catSelect.innerHTML = state.categories.map((c) => `<option value="${c.id}">${c.emoji} ${c.label}</option>`).join('');
  if (state.categoriesById[prev]) catSelect.value = prev;
}

/* ---------------------------------------------------------
   Iconos (inline SVG mínimos)
   --------------------------------------------------------- */

const MEAL_ICON_SVGS = {
  sun: '<circle cx="12" cy="12" r="4"></circle><line x1="12" y1="2" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="22"></line><line x1="4.2" y1="4.2" x2="6.3" y2="6.3"></line><line x1="17.7" y1="17.7" x2="19.8" y2="19.8"></line><line x1="2" y1="12" x2="5" y2="12"></line><line x1="19" y1="12" x2="22" y2="12"></line><line x1="4.2" y1="19.8" x2="6.3" y2="17.7"></line><line x1="17.7" y1="6.3" x2="19.8" y2="4.2"></line>',
  apple: '<path d="M12 8c-2.5-2-6-1-6 3 0 4 3 8 6 8s6-4 6-8c0-4-3.5-5-6-3z"></path><path d="M12 8V5c0-1.5 1-2 2-2"></path>',
  bowl: '<path d="M3 12h18a9 9 0 0 1-18 0z"></path><path d="M7 12c0-3 2-5 5-5s5 2 5 5"></path>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"></path>'
};

const COPY_ICON_SVG = '<rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>';

/* ---------------------------------------------------------
   Usuarios
   --------------------------------------------------------- */

function renderUserSwitcher() {
  const btn = document.getElementById('user-switch-btn');
  if (!btn) return;
  const u = state.usersById[state.currentUserId];
  btn.textContent = u ? `${u.emoji} ${u.name}` : '👤';
  btn.title = state.users.length > 1 ? 'Tocá para cambiar de perfil' : '';
}

/** Cicla al siguiente perfil en la lista (orden de creación), sin abrir ningún sheet. */
async function cycleToNextUser() {
  if (state.users.length <= 1) {
    if (state.users.length === 0) return;
    showToast('Solo tenés un perfil — creá otro desde Ajustes.');
    return;
  }
  const idx = state.users.findIndex((u) => u.id === state.currentUserId);
  const next = state.users[(idx + 1) % state.users.length];
  await switchUser(next.id);
}

function renderUsersSettingsList() {
  const wrap = document.getElementById('users-settings-list');
  if (!wrap) return;
  wrap.innerHTML = state.users.map((u) => `
    <div class="user-row ${u.id === state.currentUserId ? 'is-current' : ''}">
      <button class="user-row-main" data-action="switch-user" data-id="${u.id}">
        <span class="user-emoji">${u.emoji}</span>
        <span class="user-name">${escapeHtml(u.name)}${u.id === state.currentUserId ? ' <span class=\"current-badge\">actual</span>' : ''}</span>
      </button>
      <button class="mini-btn" data-action="edit-user" data-id="${u.id}" title="Editar">
        <svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>
      </button>
    </div>`).join('');
}

function openUserSheet(userId) {
  state.editingUserId = userId || null;
  const isEdit = !!userId;
  const user = isEdit ? state.usersById[userId] : null;

  document.getElementById('user-sheet-title').textContent = isEdit ? 'Editar perfil' : 'Nuevo perfil';
  document.getElementById('u-name').value = user ? user.name : '';
  state.userSheetEmoji = user ? user.emoji : USER_EMOJIS[0];
  document.querySelectorAll('#u-emoji .chip').forEach((c) => c.classList.toggle('is-selected', c.dataset.emoji === state.userSheetEmoji));

  const canDelete = isEdit && state.users.length > 1;
  document.getElementById('btn-delete-user').style.display = canDelete ? 'inline-flex' : 'none';

  openSheet('sheet-user');
}

async function saveUserFromSheet() {
  const name = document.getElementById('u-name').value.trim();
  if (!name) { showToast('Ponele un nombre al perfil.'); return; }

  const isNew = !state.editingUserId;
  const user = {
    id: state.editingUserId || uid('user'),
    name,
    emoji: state.userSheetEmoji,
    createdAt: isNew ? new Date().toISOString() : state.usersById[state.editingUserId].createdAt
  };
  await DB.put('users', user);

  if (isNew) {
    await DB.put('settings', { key: user.id, value: { ...SEED_USER_SETTINGS } });
  }

  closeSheet('sheet-user');

  if (isNew) {
    await switchUser(user.id);
    showToast(`Perfil de ${user.name} creado.`);
  } else {
    await loadAllState();
    renderUserSwitcher();
    renderUsersSettingsList();
    renderSettingsTab();
    showToast('Perfil actualizado.');
  }
}

async function deleteUserFromSheet() {
  if (!state.editingUserId) return;
  if (state.users.length <= 1) { showToast('Tiene que quedar al menos un perfil.'); return; }
  const user = state.usersById[state.editingUserId];
  if (!confirm(`¿Eliminar el perfil de ${user.name}? Se borra su seguimiento y objetivos (los alimentos compartidos quedan igual).`)) return;

  const userId = state.editingUserId;
  await DB.delete('users', userId);
  await DB.delete('settings', userId);
  await cleanupUserDataFromNestedStore('days', userId);
  await cleanupUserDataFromNestedStore('body', userId);

  const wasCurrent = userId === state.currentUserId;
  closeSheet('sheet-user');
  await loadAllState();

  if (wasCurrent) {
    state.currentUserId = state.users[0].id;
    state.appSettings.currentUserId = state.currentUserId;
    await saveAppSettings();
    await loadAllState();
    state.currentDay = await loadDayRecord(state.currentDateStr);
  }

  renderUserSwitcher();
  renderUsersSettingsList();
  renderToday();
  renderProgressTab();
  renderSettingsTab();
  showToast('Perfil eliminado.');
}

async function cleanupUserDataFromNestedStore(storeName, userId) {
  const all = await DB.getAll(storeName);
  for (const rec of all) {
    if (rec.users && rec.users[userId]) {
      delete rec.users[userId];
      if (Object.keys(rec.users).length === 0) await DB.delete(storeName, rec.date);
      else await DB.put(storeName, rec);
    }
  }
}

async function switchUser(userId) {
  if (userId === state.currentUserId) return;
  state.currentUserId = userId;
  state.appSettings.currentUserId = userId;
  await saveAppSettings();
  await loadAllState();
  state.currentDay = await loadDayRecord(state.currentDateStr);
  renderUserSwitcher();
  renderUsersSettingsList();
  renderToday();
  renderProgressTab();
  renderSettingsTab();
  showToast(`Ahora estás viendo a ${state.usersById[userId].name}.`);
}

/* ---------------------------------------------------------
   HOY — plan diario (registro multiusuario anidado)
   --------------------------------------------------------- */

function defaultUserDaySlice() {
  const meals = {};
  MEAL_TYPES.forEach((m) => { meals[m.id] = { skip: false, items: [] }; });
  return { meals, note: '' };
}

function ensureUserDaySlice(record, userId) {
  if (!record.users) record.users = {};
  if (!record.users[userId]) record.users[userId] = defaultUserDaySlice();
  MEAL_TYPES.forEach((m) => { if (!record.users[userId].meals[m.id]) record.users[userId].meals[m.id] = { skip: false, items: [] }; });
  return record.users[userId];
}

async function loadDayRecord(date) {
  const existing = await DB.get('days', date);
  const record = existing || { date, users: {} };
  ensureUserDaySlice(record, state.currentUserId);
  return record;
}

async function saveCurrentDay() {
  await DB.put('days', state.currentDay);
}

function currentUserSlice() {
  return ensureUserDaySlice(state.currentDay, state.currentUserId);
}

function currentMeals() {
  return currentUserSlice().meals;
}

function computeDayTotals(record, userId) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const slice = record.users && record.users[userId];
  if (!slice) return totals;
  MEAL_TYPES.forEach((m) => {
    const meal = slice.meals[m.id];
    if (!meal || meal.skip) return;
    const t = sumItemsNutrition(meal.items, state.foodsById);
    totals.kcal += t.kcal; totals.protein += t.protein; totals.carbs += t.carbs;
    totals.fat += t.fat; totals.fiber += t.fiber;
  });
  return totals;
}

function renderToday() {
  const slice = currentUserSlice();
  document.getElementById('today-date-label').textContent = dateLabelPrefix(state.currentDay.date) + formatFullDate(state.currentDay.date);
  document.getElementById('day-note').value = slice.note || '';

  const totals = computeDayTotals(state.currentDay, state.currentUserId);
  const limit = state.settings.dailyLimit || 1;
  const pct = totals.kcal / limit;
  const clampedPct = Math.max(0, Math.min(1, pct));
  const offset = RING_C * (1 - clampedPct);

  const ring = document.getElementById('budget-ring-fg');
  ring.style.strokeDasharray = `${RING_C}`;
  ring.style.strokeDashoffset = `${offset}`;
  ring.classList.toggle('is-over', pct > 1);

  document.getElementById('budget-ring-pct').textContent = `${Math.round(pct * 100)}%`;
  document.getElementById('budget-consumed').textContent = `${fmt(totals.kcal)} kcal`;
  document.getElementById('budget-total').textContent = `${fmt(limit)} kcal`;
  const remaining = limit - totals.kcal;
  document.getElementById('budget-remaining').textContent = `${remaining < 0 ? '−' : ''}${fmt(Math.abs(remaining))} kcal`;

  document.getElementById('day-macro-totals').innerHTML = `
    <div class="macro-pill"><div class="n">${fmt(totals.protein)}g</div><div class="l">Prot.</div></div>
    <div class="macro-pill"><div class="n">${fmt(totals.carbs)}g</div><div class="l">Carbs</div></div>
    <div class="macro-pill"><div class="n">${fmt(totals.fat)}g</div><div class="l">Grasas</div></div>
    <div class="macro-pill"><div class="n">${fmt(totals.fiber)}g</div><div class="l">Fibra</div></div>
  `;

  const container = document.getElementById('meals-container');
  container.innerHTML = MEAL_TYPES.map((m) => renderMealCard(slice, m)).join('');
}

function renderMealCard(slice, mealDef) {
  const meal = slice.meals[mealDef.id];
  const target = state.settings.mealTargets[mealDef.id] || 0;
  const totals = meal.skip ? { kcal: 0 } : sumItemsNutrition(meal.items, state.foodsById);

  const rows = meal.items.map((item, idx) => {
    if (item.type === 'group') {
      const t = sumItemsNutrition(item.items, state.foodsById);
      return `
      <div class="food-row" data-mt="${mealDef.id}" data-idx="${idx}" data-action="edit-group-item">
        <div class="fname">🍱 ${escapeHtml(item.name)}</div>
        <div class="famt">${item.items.length} alim.</div>
        <div class="fkcal">${fmt(t.kcal)}</div>
      </div>`;
    }
    const food = state.foodsById[item.foodId];
    if (!food) return '';
    const kc = kcalForAmount(food, item.amount);
    return `
      <div class="food-row" data-mt="${mealDef.id}" data-idx="${idx}" data-action="edit-item">
        <div class="fname">${escapeHtml(food.name)}${item.note ? `<div class="fnote">${escapeHtml(item.note)}</div>` : ''}</div>
        <div class="famt">${fmt(item.amount)} ${UNIT_LABELS[food.unit]}</div>
        <div class="fkcal">${fmt(kc)}</div>
      </div>`;
  }).join('');

  const body = meal.skip
    ? `<div class="skip-label">Sin comida en este horario</div>`
    : (meal.items.length
      ? `<div>${rows}</div><div class="meal-foot"><button class="btn btn-ghost btn-sm" data-action="add-item" data-mt="${mealDef.id}">+ Agregar</button></div>`
      : `<div class="meal-empty">Sin alimentos todavía</div><div class="meal-foot"><button class="btn btn-ghost btn-sm" data-action="add-item" data-mt="${mealDef.id}">+ Agregar</button></div>`);

  return `
    <div class="meal-card ${meal.skip ? 'is-skipped' : ''}" data-mt="${mealDef.id}">
      <div class="meal-head">
        <div class="meal-icon"><svg viewBox="0 0 24 24">${MEAL_ICON_SVGS[mealDef.icon]}</svg></div>
        <div class="meal-titles">
          <div class="t">${mealDef.label}</div>
          <div class="s">${meal.skip ? 'omitida' : `${fmt(totals.kcal)} / ${fmt(target)} kcal`}</div>
        </div>
        <div class="meal-head-actions">
          <button class="mini-btn" data-action="copy-meal" data-mt="${mealDef.id}" title="Copiar a otro lado">
            <svg viewBox="0 0 24 24">${COPY_ICON_SVG}</svg>
          </button>
          <button class="mini-btn ${meal.skip ? 'is-active' : ''}" data-action="toggle-skip" data-mt="${mealDef.id}" title="Sin comida">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><line x1="6" y1="18" x2="18" y2="6"></line></svg>
          </button>
        </div>
      </div>
      <div class="meal-body">${body}</div>
    </div>`;
}

async function toggleMealSkip(mealType) {
  const meal = currentMeals()[mealType];
  meal.skip = !meal.skip;
  await saveCurrentDay();
  renderToday();
}

/* ---------------------------------------------------------
   Copiar comida a otro usuario / día / sección
   --------------------------------------------------------- */

function openCopyMealSheet(mealType) {
  state.copyContext = { sourceMealType: mealType, sourceDate: state.currentDay.date, sourceUserId: state.currentUserId };

  document.getElementById('copy-source-label').textContent = `Copiando ${MEAL_LABELS[mealType]} de ${state.usersById[state.currentUserId].name}, ${formatFullDate(state.currentDay.date)}`;

  const userSelect = document.getElementById('copy-dest-user');
  userSelect.innerHTML = state.users.map((u) => `<option value="${u.id}" ${u.id === state.currentUserId ? 'selected' : ''}>${u.emoji} ${escapeHtml(u.name)}</option>`).join('');

  document.getElementById('copy-dest-date').value = state.currentDay.date;
  document.getElementById('copy-dest-meal').value = mealType;

  openSheet('sheet-copy-meal');
}

async function confirmCopyMeal() {
  const ctx = state.copyContext;
  if (!ctx) return;

  const destUserId = document.getElementById('copy-dest-user').value;
  const destDate = document.getElementById('copy-dest-date').value;
  const destMealType = document.getElementById('copy-dest-meal').value;
  if (!destDate) { showToast('Elegí una fecha de destino.'); return; }

  const sourceRecord = ctx.sourceDate === state.currentDay.date ? state.currentDay : await DB.get('days', ctx.sourceDate);
  const sourceSlice = sourceRecord && sourceRecord.users && sourceRecord.users[ctx.sourceUserId];
  const sourceMeal = sourceSlice && sourceSlice.meals[ctx.sourceMealType];
  if (!sourceMeal || sourceMeal.items.length === 0) {
    showToast('Esa sección no tiene alimentos para copiar.');
    return;
  }

  const sameRecord = destDate === state.currentDay.date;
  const destRecord = sameRecord ? state.currentDay : ((await DB.get('days', destDate)) || { date: destDate, users: {} });
  const destSlice = ensureUserDaySlice(destRecord, destUserId);

  if (destSlice.meals[destMealType].items.length > 0) {
    if (!confirm('Ya hay alimentos en el destino. ¿Reemplazarlos?')) return;
  }

  destSlice.meals[destMealType] = { skip: false, items: sourceMeal.items.map(cloneMealItem) };
  await DB.put('days', destRecord);
  if (sameRecord) state.currentDay = destRecord;

  closeSheet('sheet-copy-meal');
  if (destDate === state.currentDateStr && destUserId === state.currentUserId) {
    state.currentDay = await loadDayRecord(state.currentDateStr);
    renderToday();
  }
  showToast('Comida copiada ✓');
}

/* ---------------------------------------------------------
   Resumen del día (sheet, se abre al tocar el anillo)
   --------------------------------------------------------- */

function openDaySummary() {
  state.daySummaryView = 'resumen';
  renderDaySummarySheet();
  openSheet('sheet-day-summary');
}

function renderDaySummarySheet() {
  const slice = currentUserSlice();
  const prefix = dateLabelPrefix(state.currentDay.date).replace(' · ', '');
  document.getElementById('summary-sheet-title').textContent = prefix
    ? `Resumen — ${prefix}, ${formatFullDate(state.currentDay.date)}`
    : `Resumen — ${formatFullDate(state.currentDay.date)}`;

  const toggle = `
    <div class="chip-select" style="margin-bottom:16px;">
      <button class="chip ${state.daySummaryView === 'resumen' ? 'is-selected' : ''}" data-summary-view="resumen">Resumen</button>
      <button class="chip ${state.daySummaryView === 'alimentos' ? 'is-selected' : ''}" data-summary-view="alimentos">Alimentos del día</button>
    </div>`;

  const body = state.daySummaryView === 'alimentos' ? renderDaySummaryFoodsView(slice) : renderDaySummaryResumenView(slice);
  document.getElementById('summary-sheet-body').innerHTML = toggle + body;
}

function renderDaySummaryResumenView(slice) {
  const totals = computeDayTotals(state.currentDay, state.currentUserId);
  const limit = state.settings.dailyLimit || 0;
  const delta = limit - totals.kcal;
  const deltaClass = delta >= 0 ? 'pos' : 'neg';
  const deltaTxt = delta >= 0 ? `${fmt(delta)} kcal disponibles` : `${fmt(Math.abs(delta))} kcal por encima del presupuesto`;

  let html = `
    <div class="summary-block summary-hero">
      <div class="n">${fmt(totals.kcal)}</div>
      <div class="l">de ${fmt(limit)} kcal planificadas</div>
      <div class="delta ${deltaClass}">${deltaTxt}</div>
    </div>
    <div class="summary-block">
      <div class="day-totals" style="margin:0 0 4px;">
        <div class="macro-pill"><div class="n">${fmt(totals.protein)}g</div><div class="l">Prot.</div></div>
        <div class="macro-pill"><div class="n">${fmt(totals.carbs)}g</div><div class="l">Carbs</div></div>
        <div class="macro-pill"><div class="n">${fmt(totals.fat)}g</div><div class="l">Grasas</div></div>
        <div class="macro-pill"><div class="n">${fmt(totals.fiber)}g</div><div class="l">Fibra</div></div>
      </div>
    </div>
    <div class="summary-block">
      <div class="eyebrow" style="margin-bottom:8px;">Por comida</div>
      ${MEAL_TYPES.map((m) => {
        const meal = slice.meals[m.id];
        if (meal.skip) {
          return `<div class="summary-meal-row is-skipped"><div class="label"><span class="dot" style="background:var(--ink-faint);"></span>${m.label}</div><div class="val">omitida</div></div>`;
        }
        const t = sumItemsNutrition(meal.items, state.foodsById);
        const target = state.settings.mealTargets[m.id] || 0;
        return `<div class="summary-meal-row"><div class="label"><span class="dot" style="background:var(--terracotta);"></span>${m.label}</div><div class="val">${fmt(t.kcal)} / ${fmt(target)} kcal</div></div>`;
      }).join('')}
    </div>`;

  const allItems = gatherDayItems(slice);
  if (allItems.length === 0) {
    html += `<div class="summary-block"><p class="small text-faint">Todavía no agregaste alimentos hoy.</p></div>`;
  } else if (allItems.length <= 3) {
    const sorted = allItems.slice().sort((a, b) => b.kcal - a.kcal);
    html += `<div class="summary-block"><div class="eyebrow" style="margin-bottom:8px;">Alimentos del día</div>${sorted.map(summaryItemRow).join('')}</div>`;
  } else {
    const sortedDesc = allItems.slice().sort((a, b) => b.kcal - a.kcal);
    const top = sortedDesc.slice(0, 3);
    const bottom = sortedDesc.slice(-3).reverse();
    html += `
      <div class="summary-block">
        <div class="eyebrow" style="margin-bottom:8px;">Más calorías</div>
        ${top.map(summaryItemRow).join('')}
      </div>
      <div class="summary-block">
        <div class="eyebrow" style="margin-bottom:8px;">Menos calorías</div>
        ${bottom.map(summaryItemRow).join('')}
      </div>`;
  }
  return html;
}

function renderDaySummaryFoodsView(slice) {
  const mealsWithFood = MEAL_TYPES.filter((m) => !slice.meals[m.id].skip && slice.meals[m.id].items.length > 0);
  if (mealsWithFood.length === 0) {
    return `<div class="summary-block">${emptyStateHtml('📋', 'Nada planificado todavía', 'Agregá alimentos en cualquier sección de Hoy para verlos acá.')}</div>`;
  }
  return mealsWithFood.map((m) => {
    const meal = slice.meals[m.id];
    const t = sumItemsNutrition(meal.items, state.foodsById);
    const rows = meal.items.map((it) => {
      if (it.type === 'group') {
        const gt = sumItemsNutrition(it.items, state.foodsById);
        const subRows = it.items.map((sub) => {
          const food = state.foodsById[sub.foodId];
          if (!food) return '';
          return `<div class="compact-food-row compact-sub-row"><span class="cf-name">${escapeHtml(food.name)}</span><span class="cf-amt">${fmt(sub.amount)}${UNIT_LABELS[food.unit]}</span><span class="cf-kcal">${fmt(kcalForAmount(food, sub.amount))}</span></div>`;
        }).join('');
        return `<div class="compact-food-row compact-group-row"><span class="cf-name">🍱 ${escapeHtml(it.name)}</span><span class="cf-kcal">${fmt(gt.kcal)}</span></div>${subRows}`;
      }
      const food = state.foodsById[it.foodId];
      if (!food) return '';
      return `<div class="compact-food-row"><span class="cf-name">${escapeHtml(food.name)}${it.note ? ` <span class="cf-note">— ${escapeHtml(it.note)}</span>` : ''}</span><span class="cf-amt">${fmt(it.amount)}${UNIT_LABELS[food.unit]}</span><span class="cf-kcal">${fmt(kcalForAmount(food, it.amount))}</span></div>`;
    }).join('');
    return `
    <div class="compact-meal-block">
      <div class="compact-meal-head"><span>${m.label}</span><span class="mono">${fmt(t.kcal)} kcal</span></div>
      ${rows}
    </div>`;
  }).join('');
}

function gatherDayItems(slice) {
  const allItems = [];
  MEAL_TYPES.forEach((m) => {
    const meal = slice.meals[m.id];
    if (meal.skip) return;
    meal.items.forEach((it) => {
      if (it.type === 'group') {
        it.items.forEach((sub) => {
          const food = state.foodsById[sub.foodId];
          if (!food) return;
          allItems.push({ name: food.name, mealLabel: `${m.label} · ${it.name}`, amount: sub.amount, unit: food.unit, kcal: kcalForAmount(food, sub.amount) });
        });
        return;
      }
      const food = state.foodsById[it.foodId];
      if (!food) return;
      allItems.push({ name: food.name, mealLabel: m.label, amount: it.amount, unit: food.unit, kcal: kcalForAmount(food, it.amount), note: it.note });
    });
  });
  return allItems;
}

function summaryItemRow(it) {
  return `<div class="summary-item-row">
    <div><div class="n">${escapeHtml(it.name)}</div><div class="m">${it.mealLabel} · ${fmt(it.amount)} ${UNIT_LABELS[it.unit]}${it.note ? ` · ${escapeHtml(it.note)}` : ''}</div></div>
    <div class="k">${fmt(it.kcal)} kcal</div>
  </div>`;
}

/* ---------------------------------------------------------
   Sheet: cantidad (agregar / editar item de comida)
   --------------------------------------------------------- */

function openAmountSheet(ctx) {
  state.amountContext = ctx;
  const food = state.foodsById[ctx.foodId];
  if (!food) { showToast('Ese alimento ya no existe.'); return; }

  document.getElementById('amount-food-name').textContent = food.name;
  document.getElementById('amount-sheet-title').textContent = ctx.mode === 'edit' ? 'Editar cantidad' : 'Agregar cantidad';
  document.getElementById('amount-unit-label').textContent = UNIT_LABELS[food.unit];

  const defaultAmount = ctx.mode === 'edit' ? ctx.currentAmount : food.baseAmount;
  const input = document.getElementById('amount-value');
  input.value = defaultAmount;
  input.step = stepForUnit(food.unit);
  document.getElementById('amount-note').value = ctx.mode === 'edit' ? (ctx.currentNote || '') : '';
  updateAmountPreview();

  document.getElementById('btn-remove-amount').style.display = ctx.mode === 'edit' ? 'inline-flex' : 'none';
  document.getElementById('btn-confirm-amount').textContent = ctx.mode === 'edit' ? 'Guardar' : 'Agregar';

  openSheet('sheet-amount');
}

function updateAmountPreview() {
  const ctx = state.amountContext;
  if (!ctx) return;
  const food = state.foodsById[ctx.foodId];
  const amount = parseFloat(document.getElementById('amount-value').value) || 0;
  const kc = kcalForAmount(food, amount);
  document.getElementById('amount-kcal-preview').textContent = `≈ ${fmt(kc)} kcal`;
}

async function confirmAmountSheet() {
  const ctx = state.amountContext;
  if (!ctx) return;
  const amount = parseFloat(document.getElementById('amount-value').value);
  if (!amount || amount <= 0) { showToast('Ingresá una cantidad válida.'); return; }
  const note = document.getElementById('amount-note').value.trim();

  const meal = currentMeals()[ctx.mealType];
  if (ctx.mode === 'edit') {
    meal.items[ctx.itemIndex].amount = amount;
    if (note) meal.items[ctx.itemIndex].note = note;
    else delete meal.items[ctx.itemIndex].note;
  } else {
    const newItem = { foodId: ctx.foodId, amount };
    if (note) newItem.note = note;
    meal.items.push(newItem);
  }
  meal.skip = false;
  await saveCurrentDay();
  closeSheet('sheet-amount');
  closeSheet('sheet-picker');
  renderToday();
}

async function removeAmountItem() {
  const ctx = state.amountContext;
  if (!ctx || ctx.mode !== 'edit') return;
  const meal = currentMeals()[ctx.mealType];
  meal.items.splice(ctx.itemIndex, 1);
  await saveCurrentDay();
  closeSheet('sheet-amount');
  renderToday();
}

/* ---------------------------------------------------------
   Sheet: agregar a comida (picker de alimentos / grupos)
   --------------------------------------------------------- */

function openPicker(mealType) {
  state.pickerContext = { mealType, date: state.currentDay.date };
  state.pickerTab = 'foods';
  document.getElementById('picker-sheet-title').textContent = `Agregar a ${MEAL_LABELS[mealType]}`;
  document.getElementById('picker-search').value = '';
  setPickerTab('foods');
  openSheet('sheet-picker');
}

function setPickerTab(tab) {
  state.pickerTab = tab;
  document.getElementById('picker-tab-foods').classList.toggle('is-selected', tab === 'foods');
  document.getElementById('picker-tab-groups').classList.toggle('is-selected', tab === 'groups');
  renderPickerList();
}

function renderPickerList() {
  const search = document.getElementById('picker-search').value.trim().toLowerCase();
  const list = document.getElementById('picker-list');
  const mealType = state.pickerContext.mealType;

  if (state.pickerTab === 'foods') {
    const items = state.foods.filter((f) => f.mealTypes.includes(mealType) && f.name.toLowerCase().includes(search));
    if (items.length === 0) {
      list.innerHTML = emptyStateHtml('🥗', 'Sin alimentos para esta comida', 'Agregá alimentos marcados para este horario desde la pestaña Alimentos.');
      return;
    }
    list.innerHTML = items.map((f) => {
      const cat = state.categoriesById[f.category] || state.categoriesById.otro || { emoji: '🍽️', color: '#8C8474' };
      return `
      <div class="food-list-item" data-action="pick-food" data-id="${f.id}">
        <div class="food-swatch" style="background:${cat.color}22;">${cat.emoji}</div>
        <div class="food-list-info">
          <div class="n">${escapeHtml(f.name)}</div>
          <div class="m">por ${f.baseAmount} ${UNIT_LABELS[f.unit]}</div>
        </div>
        <div class="food-list-kcal">${fmt(f.kcal)}<span class="u">kcal</span></div>
      </div>`;
    }).join('');
  } else {
    const items = state.groups.filter((g) => g.name.toLowerCase().includes(search));
    if (items.length === 0) {
      list.innerHTML = emptyStateHtml('🍱', 'Todavía no hay grupos', 'Creá combos de alimentos que sueles comer juntos desde la pestaña Alimentos.');
      return;
    }
    list.innerHTML = items.map((g) => {
      const totals = sumItemsNutrition(g.items, state.foodsById);
      return `
      <div class="food-list-item" data-action="pick-group" data-id="${g.id}">
        <div class="food-swatch" style="background:#6B735322;">🍱</div>
        <div class="food-list-info">
          <div class="n">${escapeHtml(g.name)}</div>
          <div class="m">${g.items.length} alimento${g.items.length === 1 ? '' : 's'}</div>
        </div>
        <div class="food-list-kcal">${fmt(totals.kcal)}<span class="u">kcal</span></div>
      </div>`;
    }).join('');
  }
}

/**
 * Clona un item de comida en profundidad. Los items de tipo 'group'
 * llevan su propia copia de ingredientes — clonarla evita que dos
 * instancias (por ejemplo tras copiar una comida) compartan el mismo
 * array y se editen entre sí sin querer.
 */
function cloneMealItem(item) {
  if (item.type === 'group') {
    return { ...item, instanceId: uid('gi'), items: item.items.map((it) => ({ ...it })) };
  }
  return { ...item };
}

async function addGroupToMeal(groupId) {
  const group = state.groupsById[groupId];
  if (!group) return;
  const { mealType } = state.pickerContext;
  const meal = currentMeals()[mealType];
  meal.items.push({
    type: 'group',
    instanceId: uid('gi'),
    groupId: group.id,
    name: group.name,
    items: group.items.map((it) => ({ ...it }))
  });
  meal.skip = false;
  await saveCurrentDay();
  closeSheet('sheet-picker');
  renderToday();
  showToast(`"${group.name}" agregado como grupo.`);
}

/* ---------------------------------------------------------
   Editar una instancia de grupo dentro de un día
   (no afecta la plantilla original del grupo)
   --------------------------------------------------------- */

function openDayGroupSheet(mealType, itemIndex) {
  const item = currentMeals()[mealType].items[itemIndex];
  if (!item || item.type !== 'group') return;

  state.dayGroupContext = { mealType, itemIndex };
  state.dayGroupItems = item.items.map((it) => ({ ...it }));

  document.getElementById('day-group-sheet-title').textContent = item.name;
  document.getElementById('dg-multiplier').value = 1;
  renderDayGroupItemsEditor();
  openSheet('sheet-day-group');
}

function renderDayGroupItemsEditor() {
  const wrap = document.getElementById('dg-items-list');
  wrap.innerHTML = state.dayGroupItems.map((it, idx) => {
    const food = state.foodsById[it.foodId];
    if (!food) return '';
    return `
    <div class="field-row" style="align-items:end; margin-bottom:8px;">
      <div class="field" style="flex:1; margin-bottom:0;">
        <label class="small" style="margin-bottom:4px;">${escapeHtml(food.name)}</label>
        <div class="unit-suffix"><input type="number" data-dg-idx="${idx}" value="${fmt(it.amount)}" step="${stepForUnit(food.unit)}"><span class="suffix">${UNIT_LABELS[food.unit]}</span></div>
      </div>
      <button class="mini-btn" data-dg-remove="${idx}" style="margin-bottom:1px;">✕</button>
    </div>`;
  }).join('');
  updateDayGroupKcalTotal();
}

function updateDayGroupKcalTotal() {
  const t = sumItemsNutrition(state.dayGroupItems, state.foodsById);
  document.getElementById('dg-kcal-total').textContent = `${fmt(t.kcal)} kcal en total`;
}

function applyDayGroupMultiplier() {
  const factor = parseFloat(document.getElementById('dg-multiplier').value);
  if (!factor || factor <= 0) { showToast('Ingresá un multiplicador válido.'); return; }
  state.dayGroupItems.forEach((it) => {
    const food = state.foodsById[it.foodId];
    const step = food ? stepForUnit(food.unit) : 1;
    it.amount = Math.max(step, Math.round((it.amount * factor) / step) * step);
  });
  document.getElementById('dg-multiplier').value = 1;
  renderDayGroupItemsEditor();
}

async function saveDayGroupFromSheet() {
  const ctx = state.dayGroupContext;
  if (!ctx) return;
  if (state.dayGroupItems.length === 0) { showToast('El grupo quedó sin alimentos — usá "Quitar del día" si querés eliminarlo.'); return; }

  const meal = currentMeals()[ctx.mealType];
  const item = meal.items[ctx.itemIndex];
  if (!item || item.type !== 'group') return;
  item.items = state.dayGroupItems.map((it) => ({ ...it }));

  await saveCurrentDay();
  closeSheet('sheet-day-group');
  renderToday();
  showToast('Grupo actualizado.');
}

async function removeDayGroupFromMeal() {
  const ctx = state.dayGroupContext;
  if (!ctx) return;
  if (!confirm('¿Quitar este grupo de la comida?')) return;

  const meal = currentMeals()[ctx.mealType];
  meal.items.splice(ctx.itemIndex, 1);
  await saveCurrentDay();
  closeSheet('sheet-day-group');
  renderToday();
}

/* ---------------------------------------------------------
   ALIMENTOS — lista y filtro (compartida entre usuarios)
   --------------------------------------------------------- */

function renderCategoryFilterChips() {
  const wrap = document.getElementById('category-filter');
  const chips = [
    { id: 'all', label: 'Todos' },
    { id: 'favorites', label: '★ Favoritos' },
    ...state.categories.map((c) => ({ id: c.id, label: `${c.emoji} ${c.label}` }))
  ];
  wrap.innerHTML = chips.map((c) => `<button class="chip ${state.foodFilter.category === c.id ? 'is-selected' : ''}" data-cat="${c.id}">${c.label}</button>`).join('');
}

function renderFoodsList() {
  const search = state.foodFilter.search.toLowerCase();
  const cat = state.foodFilter.category;
  let items = state.foods.filter((f) => f.name.toLowerCase().includes(search));
  if (cat === 'favorites') items = items.filter((f) => f.favorite);
  else if (cat !== 'all') items = items.filter((f) => f.category === cat);

  items = items.slice().sort((a, b) => {
    if (state.foodFilter.sort === 'kcal') return b.kcal - a.kcal;
    return a.name.localeCompare(b.name, 'es');
  });

  const list = document.getElementById('foods-list');
  if (items.length === 0) {
    list.innerHTML = emptyStateHtml('🍽️', 'No hay alimentos', 'Probá otra búsqueda o agregá uno nuevo con el botón +.');
    return;
  }
  list.innerHTML = items.map((f) => {
    const catDef = state.categoriesById[f.category] || state.categoriesById.otro || { emoji: '🍽️', color: '#8C8474' };
    return `
    <div class="food-list-item" data-action="edit-food" data-id="${f.id}">
      <div class="food-swatch" style="background:${catDef.color}22;">${catDef.emoji}</div>
      <div class="food-list-info">
        <div class="n">${escapeHtml(f.name)}</div>
        <div class="m">${f.mealTypes.map((mt) => MEAL_LABELS[mt].split(' ')[0]).join(' · ') || 'sin comidas asignadas'}</div>
      </div>
      <div class="food-list-kcal">${fmt(f.kcal)}<span class="u">/${f.baseAmount}${UNIT_LABELS[f.unit]}</span></div>
      <button class="star-btn" data-action="toggle-fav" data-id="${f.id}">${f.favorite ? '★' : '☆'}</button>
    </div>`;
  }).join('');
}

function renderGroupsList() {
  const list = document.getElementById('groups-list');
  if (state.groups.length === 0) {
    list.innerHTML = emptyStateHtml('🍱', 'Sin grupos todavía', 'Creá combos de alimentos que sueles comer juntos, para agregarlos con un toque.');
    return;
  }
  list.innerHTML = state.groups.map((g) => {
    const totals = sumItemsNutrition(g.items, state.foodsById);
    const itemsTxt = g.items.map((it) => {
      const f = state.foodsById[it.foodId];
      return f ? `${f.name} (${fmt(it.amount)}${UNIT_LABELS[f.unit]})` : null;
    }).filter(Boolean).join(', ');
    return `
    <div class="card group-card" data-action="edit-group" data-id="${g.id}">
      <div class="g-name">🍱 ${escapeHtml(g.name)}</div>
      <div class="g-items">${itemsTxt || 'sin alimentos'}</div>
      <div class="g-kcal">${fmt(totals.kcal)} kcal</div>
    </div>`;
  }).join('');
}

function renderFoodsTab() {
  renderCategoryFilterChips();
  renderFoodsList();
  renderGroupsList();
  renderContainersTab();
}

/* ---------------------------------------------------------
   Sheet: alimento
   --------------------------------------------------------- */

function openFoodSheet(foodId) {
  state.editingFoodId = foodId;
  const isEdit = !!foodId;
  const food = isEdit ? state.foodsById[foodId] : null;

  document.getElementById('food-sheet-title').textContent = isEdit ? 'Editar alimento' : 'Nuevo alimento';
  populateCategorySelect();
  document.getElementById('f-name').value = food ? food.name : '';
  document.getElementById('f-category').value = food ? food.category : 'otro';
  document.getElementById('f-unit').value = food ? food.unit : 'g';
  document.getElementById('f-kcal').value = food ? food.kcal : '';
  document.getElementById('f-protein').value = food ? food.protein : '';
  document.getElementById('f-carbs').value = food ? food.carbs : '';
  document.getElementById('f-fat').value = food ? food.fat : '';
  document.getElementById('f-fiber').value = food ? food.fiber : '';
  document.getElementById('f-favorite').checked = food ? !!food.favorite : false;
  document.getElementById('f-notes').value = food ? (food.notes || '') : '';
  document.getElementById('btn-delete-food').style.display = isEdit ? 'inline-flex' : 'none';

  state.fMealTypesSelected = food ? [...food.mealTypes] : [];
  document.querySelectorAll('#f-mealtypes .chip').forEach((chip) => {
    chip.classList.toggle('is-selected', state.fMealTypesSelected.includes(chip.dataset.mt));
  });

  updateFoodBaseHint();
  openSheet('sheet-food');
}

function updateFoodBaseHint() {
  const unit = document.getElementById('f-unit').value;
  const hint = document.getElementById('f-base-hint');
  if (unit === 'unidad') hint.textContent = 'Los valores nutricionales son por 1 unidad.';
  else hint.textContent = `Los valores nutricionales son por 100 ${unit}.`;
}

async function saveFoodFromSheet() {
  const name = document.getElementById('f-name').value.trim();
  const kcal = parseFloat(document.getElementById('f-kcal').value);
  if (!name) { showToast('Ponele un nombre al alimento.'); return; }
  if (!kcal || kcal < 0) { showToast('Ingresá las calorías.'); return; }
  if (state.fMealTypesSelected.length === 0) { showToast('Elegí al menos una comida donde usarlo.'); return; }

  const unit = document.getElementById('f-unit').value;
  const baseAmount = unit === 'unidad' ? 1 : 100;

  const food = {
    id: state.editingFoodId || uid('food'),
    name,
    category: document.getElementById('f-category').value,
    unit,
    baseAmount,
    kcal,
    protein: parseFloat(document.getElementById('f-protein').value) || 0,
    carbs: parseFloat(document.getElementById('f-carbs').value) || 0,
    fat: parseFloat(document.getElementById('f-fat').value) || 0,
    fiber: parseFloat(document.getElementById('f-fiber').value) || 0,
    mealTypes: [...state.fMealTypesSelected],
    favorite: document.getElementById('f-favorite').checked,
    notes: document.getElementById('f-notes').value.trim()
  };

  await DB.put('foods', food);
  await loadAllState();
  closeSheet('sheet-food');
  renderFoodsTab();
  renderToday();
  showToast('Alimento guardado.');
}

async function deleteFoodFromSheet() {
  if (!state.editingFoodId) return;
  if (!confirm('¿Eliminar este alimento? Se quitará de la lista, pero no de los días ya planificados.')) return;
  await DB.delete('foods', state.editingFoodId);
  await loadAllState();
  closeSheet('sheet-food');
  renderFoodsTab();
  renderToday();
  showToast('Alimento eliminado.');
}

async function toggleFoodFavorite(foodId) {
  const food = state.foodsById[foodId];
  if (!food) return;
  food.favorite = !food.favorite;
  await DB.put('foods', food);
  await loadAllState();
  renderFoodsList();
}

/* ---------------------------------------------------------
   Sheet: grupo
   --------------------------------------------------------- */

function openGroupSheet(groupId) {
  state.editingGroupId = groupId;
  const isEdit = !!groupId;
  const group = isEdit ? state.groupsById[groupId] : null;

  document.getElementById('group-sheet-title').textContent = isEdit ? 'Editar grupo' : 'Nuevo grupo';
  document.getElementById('g-name').value = group ? group.name : '';
  document.getElementById('btn-delete-group').style.display = isEdit ? 'inline-flex' : 'none';

  state.groupSheetItems = group ? group.items.map((it) => ({ ...it })) : [];
  if (state.groupSheetItems.length === 0 && state.foods.length > 0) {
    state.groupSheetItems.push({ foodId: state.foods[0].id, amount: state.foods[0].baseAmount });
  }
  renderGroupItemsEditor();
  openSheet('sheet-group');
}

function renderGroupItemsEditor() {
  const wrap = document.getElementById('g-items-list');
  if (state.foods.length === 0) {
    wrap.innerHTML = `<p class="small text-faint">Agregá alimentos primero en la pestaña Alimentos.</p>`;
    return;
  }
  wrap.innerHTML = state.groupSheetItems.map((item, idx) => {
    const food = state.foodsById[item.foodId] || state.foods[0];
    const options = state.foods.map((f) => `<option value="${f.id}" ${f.id === item.foodId ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('');
    return `
    <div class="field-row" style="align-items:end; margin-bottom:8px;" data-gidx="${idx}">
      <div class="field" style="flex:1.3; margin-bottom:0;">
        <select data-g-action="food" data-gidx="${idx}">${options}</select>
      </div>
      <div class="field" style="margin-bottom:0;">
        <div class="unit-suffix"><input type="number" data-g-action="amount" data-gidx="${idx}" value="${item.amount}" step="${stepForUnit(food.unit)}"><span class="suffix">${UNIT_LABELS[food.unit]}</span></div>
      </div>
      <button class="mini-btn" data-g-action="remove" data-gidx="${idx}" style="margin-bottom:1px;">✕</button>
    </div>`;
  }).join('');
}

async function saveGroupFromSheet() {
  const name = document.getElementById('g-name').value.trim();
  if (!name) { showToast('Ponele un nombre al grupo.'); return; }
  if (state.groupSheetItems.length === 0) { showToast('Agregá al menos un alimento.'); return; }
  const invalid = state.groupSheetItems.some((it) => !it.foodId || !it.amount || it.amount <= 0);
  if (invalid) { showToast('Revisá las cantidades del grupo.'); return; }

  const group = {
    id: state.editingGroupId || uid('group'),
    name,
    items: state.groupSheetItems.map((it) => ({ foodId: it.foodId, amount: it.amount }))
  };
  await DB.put('groups', group);
  await loadAllState();
  closeSheet('sheet-group');
  renderFoodsTab();
  showToast('Grupo guardado.');
}

async function deleteGroupFromSheet() {
  if (!state.editingGroupId) return;
  if (!confirm('¿Eliminar este grupo?')) return;
  await DB.delete('groups', state.editingGroupId);
  await loadAllState();
  closeSheet('sheet-group');
  renderFoodsTab();
  showToast('Grupo eliminado.');
}

/* ---------------------------------------------------------
   RECIPIENTES — tara para pesar comida por diferencia
   --------------------------------------------------------- */

function renderContainerCalc() {
  const select = document.getElementById('calc-container-select');
  if (state.containers.length === 0) {
    select.innerHTML = `<option value="">Sin recipientes registrados</option>`;
    select.disabled = true;
  } else {
    select.disabled = false;
    select.innerHTML = state.containers.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${fmt(c.weight)} g)</option>`).join('');
  }
  updateContainerCalcResult();
}

function updateContainerCalcResult() {
  const select = document.getElementById('calc-container-select');
  const container = state.containersById[select.value];
  const grossInput = document.getElementById('calc-gross-weight');
  const gross = parseFloat(grossInput.value);
  const resultEl = document.getElementById('container-calc-result');

  if (!container) {
    resultEl.textContent = '';
    return;
  }
  if (!gross || gross <= 0) {
    resultEl.textContent = `Tara: ${fmt(container.weight)} g`;
    return;
  }
  const net = gross - container.weight;
  if (net < 0) {
    resultEl.innerHTML = `<span style="color:var(--rust);">El peso bruto es menor que la tara (${fmt(container.weight)} g) — revisá la balanza.</span>`;
    return;
  }
  resultEl.innerHTML = `Contenido neto: <b>${fmt(net)} g</b> <span class="text-faint">(bruto ${fmt(gross)} g − tara ${fmt(container.weight)} g)</span>`;
}

function renderContainersList() {
  const list = document.getElementById('containers-list');
  if (state.containers.length === 0) {
    list.innerHTML = emptyStateHtml('🥡', 'Sin recipientes todavía', 'Registrá el peso vacío de tus tuppers y potes para poder pesar comida por diferencia.');
    return;
  }
  list.innerHTML = state.containers.map((c) => `
    <div class="food-list-item" data-action="edit-container" data-id="${c.id}">
      <div class="food-swatch" style="background:#6B735322;">🥡</div>
      <div class="food-list-info">
        <div class="n">${escapeHtml(c.name)}</div>
        <div class="m">${c.notes ? escapeHtml(c.notes) : 'tara registrada'}</div>
      </div>
      <div class="food-list-kcal">${fmt(c.weight)}<span class="u">g</span></div>
    </div>`).join('');
}

function renderContainersTab() {
  renderContainerCalc();
  renderContainersList();
}

function openContainerSheet(containerId) {
  state.editingContainerId = containerId;
  const isEdit = !!containerId;
  const container = isEdit ? state.containersById[containerId] : null;

  document.getElementById('container-sheet-title').textContent = isEdit ? 'Editar recipiente' : 'Nuevo recipiente';
  document.getElementById('c-name').value = container ? container.name : '';
  document.getElementById('c-weight').value = container ? container.weight : '';
  document.getElementById('c-notes').value = container ? (container.notes || '') : '';
  document.getElementById('btn-delete-container').style.display = isEdit ? 'inline-flex' : 'none';

  openSheet('sheet-container');
}

async function saveContainerFromSheet() {
  const name = document.getElementById('c-name').value.trim();
  const weight = parseFloat(document.getElementById('c-weight').value);
  if (!name) { showToast('Ponele un nombre al recipiente.'); return; }
  if (!weight || weight <= 0) { showToast('Ingresá el peso vacío (tara) en gramos.'); return; }

  const container = {
    id: state.editingContainerId || uid('container'),
    name,
    weight,
    notes: document.getElementById('c-notes').value.trim()
  };
  await DB.put('containers', container);
  await loadAllState();
  closeSheet('sheet-container');
  renderContainersTab();
  showToast('Recipiente guardado.');
}

async function deleteContainerFromSheet() {
  if (!state.editingContainerId) return;
  if (!confirm('¿Eliminar este recipiente?')) return;
  await DB.delete('containers', state.editingContainerId);
  await loadAllState();
  closeSheet('sheet-container');
  renderContainersTab();
  showToast('Recipiente eliminado.');
}

/* ---------------------------------------------------------
   CATEGORÍAS de alimentos (editables desde Ajustes)
   --------------------------------------------------------- */

function renderCategoriesSettingsList() {
  const wrap = document.getElementById('categories-settings-list');
  if (!wrap) return;
  wrap.innerHTML = state.categories.map((c) => `
    <div class="user-row">
      <button class="user-row-main" data-action="edit-category" data-id="${c.id}">
        <span class="user-emoji">${c.emoji}</span>
        <span class="user-name">${escapeHtml(c.label)}</span>
      </button>
    </div>`).join('');
}

function openCategorySheet(categoryId) {
  state.editingCategoryId = categoryId || null;
  const isEdit = !!categoryId;
  const cat = isEdit ? state.categoriesById[categoryId] : null;

  document.getElementById('category-sheet-title').textContent = isEdit ? 'Editar categoría' : 'Nueva categoría';
  document.getElementById('cat-label').value = cat ? cat.label : '';
  document.getElementById('cat-emoji').value = cat ? cat.emoji : '';

  const isProtected = isEdit && categoryId === 'otro';
  document.getElementById('btn-delete-category').style.display = (isEdit && !isProtected) ? 'inline-flex' : 'none';

  openSheet('sheet-category');
}

async function saveCategoryFromSheet() {
  const label = document.getElementById('cat-label').value.trim();
  const emoji = document.getElementById('cat-emoji').value.trim() || '🍽️';
  if (!label) { showToast('Ponele un nombre a la categoría.'); return; }

  const isNew = !state.editingCategoryId;
  const color = isNew
    ? CATEGORY_COLOR_PALETTE[state.categories.length % CATEGORY_COLOR_PALETTE.length]
    : state.categoriesById[state.editingCategoryId].color;

  const category = {
    id: state.editingCategoryId || uid('cat'),
    label,
    emoji,
    color
  };
  await DB.put('categories', category);
  await loadAllState();
  closeSheet('sheet-category');
  populateCategorySelect();
  renderCategoriesSettingsList();
  renderFoodsList();
  renderCategoryFilterChips();
  showToast('Categoría guardada.');
}

async function deleteCategoryFromSheet() {
  if (!state.editingCategoryId) return;
  if (state.editingCategoryId === 'otro') { showToast('Esta categoría no se puede eliminar.'); return; }
  const inUse = state.foods.some((f) => f.category === state.editingCategoryId);
  if (inUse) {
    showToast('Hay alimentos usando esta categoría — cambialos a otra categoría primero.');
    return;
  }
  if (!confirm('¿Eliminar esta categoría?')) return;
  await DB.delete('categories', state.editingCategoryId);
  if (state.foodFilter.category === state.editingCategoryId) state.foodFilter.category = 'all';
  await loadAllState();
  closeSheet('sheet-category');
  populateCategorySelect();
  renderCategoriesSettingsList();
  renderFoodsList();
  renderCategoryFilterChips();
  showToast('Categoría eliminada.');
}

/* ---------------------------------------------------------
   PROGRESO
   --------------------------------------------------------- */

function computeBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  return weightKg / (h * h);
}

function bmiCategory(bmi) {
  if (bmi == null) return '';
  if (bmi < 18.5) return 'Bajo peso';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Sobrepeso';
  return 'Obesidad';
}

function renderProgressTab() {
  const logs = state.bodyLogs;
  const last = logs.length ? logs[logs.length - 1] : null;
  const height = state.settings.heightCm;
  const goal = state.settings.goalWeightKg;

  const currentBmi = last ? computeBMI(last.weight, height) : null;
  const toGoal = last && goal ? last.weight - goal : null;

  const statsWrap = document.getElementById('progress-stats');
  statsWrap.innerHTML = `
    <div class="stat-card">
      <div class="l">Peso actual</div>
      <div class="v">${last ? fmt(last.weight, 1) : '—'}</div>
      <div class="d text-faint">kg</div>
    </div>
    <div class="stat-card">
      <div class="l">IMC</div>
      <div class="v">${currentBmi ? fmt(currentBmi, 1) : '—'}</div>
      <div class="d text-faint">${currentBmi ? bmiCategory(currentBmi) : 'faltan datos'}</div>
    </div>
    <div class="stat-card">
      <div class="l">${toGoal == null ? 'Meta' : (toGoal > 0 ? 'Para bajar' : 'Para subir')}</div>
      <div class="v">${toGoal == null ? '—' : fmt(Math.abs(toGoal), 1)}</div>
      <div class="d ${toGoal != null && Math.abs(toGoal) < 0.05 ? 'pos' : ''} text-faint">${toGoal == null ? 'configurá tu meta' : (Math.abs(toGoal) < 0.05 ? '¡lograda! 🎉' : 'kg')}</div>
    </div>
  `;

  const etaSlot = document.getElementById('eta-banner-slot');
  if (!last || logs.length < 2 || !goal) {
    etaSlot.innerHTML = `<div class="eta-banner"><div class="icon">📈</div><div class="txt">Registrá tu peso algunos días más ${!goal ? 'y definí tu peso objetivo en Ajustes ' : ''}para estimar una fecha aproximada de logro.</div></div>`;
  } else {
    const entries = logs.map((l) => ({ date: l.date, value: l.weight }));
    const projection = estimateGoalDate(entries, goal);
    if (projection) {
      const rate = Math.abs(round1(projection.weeklyRate));
      etaSlot.innerHTML = `<div class="eta-banner"><div class="icon">🎯</div><div class="txt">Al ritmo actual (<b>${rate} kg</b>/semana), alcanzarías tu meta el <b>${projection.date.toLocaleDateString('es-PY', { day: 'numeric', month: 'long', year: 'numeric' })}</b> (~${projection.daysAway} días).</div></div>`;
    } else {
      etaSlot.innerHTML = `<div class="eta-banner is-warn"><div class="icon">⚠️</div><div class="txt">Tu tendencia reciente no se está acercando a la meta. Ajustá el plan de comidas o revisá el presupuesto calórico.</div></div>`;
    }
  }

  const weightEntries = logs.map((l) => ({ date: l.date, value: l.weight }));
  const periodDates = new Set(logs.filter((l) => l.periodStart).map((l) => l.date));
  drawProgressChart(document.getElementById('chart-weight'), weightEntries, { goal, showProjection: true, periodDates });

  const fatEntries = logs.filter((l) => l.bodyFat != null).map((l) => ({ date: l.date, value: l.bodyFat }));
  drawProgressChart(document.getElementById('chart-fat'), fatEntries, {});

  const bmiEntries = height ? logs.map((l) => ({ date: l.date, value: computeBMI(l.weight, height) })) : [];
  drawProgressChart(document.getElementById('chart-bmi'), bmiEntries, { goal: height ? 24.9 : null });

  const listWrap = document.getElementById('body-log-list');
  if (logs.length === 0) {
    listWrap.innerHTML = emptyStateHtml('⚖️', 'Sin registros todavía', 'Tocá "Registrar" para anotar tu primer peso.');
  } else {
    listWrap.innerHTML = [...logs].reverse().map((l) => {
      const bmi = computeBMI(l.weight, height);
      return `
      <div class="log-item" data-action="edit-body-log" data-date="${l.date}">
        <div class="d">${formatShortDate(l.date)}${l.periodStart ? ' <span class="period-dot" title="Inicio de período"></span>' : ''}</div>
        <div class="v">${fmt(l.weight, 1)} kg${l.bodyFat != null ? ` · ${fmt(l.bodyFat, 1)}% grasa` : ''}${bmi ? ` · IMC ${fmt(bmi, 1)}` : ''}</div>
      </div>`;
    }).join('');
  }
}

function openBodyLogSheet(date) {
  state.editingBodyLogDate = date || null;
  const entry = date ? state.bodyLogs.find((l) => l.date === date) : null;

  document.getElementById('bl-date').value = date || todayStr();
  document.getElementById('bl-weight').value = entry ? entry.weight : (state.bodyLogs.length ? state.bodyLogs[state.bodyLogs.length - 1].weight : '');
  document.getElementById('bl-fat').value = entry && entry.bodyFat != null ? entry.bodyFat : '';
  document.getElementById('bl-period-start').checked = entry ? !!entry.periodStart : false;
  document.getElementById('btn-delete-body-log').style.display = entry ? 'inline-flex' : 'none';
  updateBmiPreview();
  openSheet('sheet-body-log');
}

function updateBmiPreview() {
  const w = parseFloat(document.getElementById('bl-weight').value);
  const h = state.settings.heightCm;
  const el = document.getElementById('bl-bmi-preview');
  if (w && h) {
    el.textContent = `IMC estimado: ${fmt(computeBMI(w, h), 1)}`;
  } else if (!h) {
    el.textContent = 'Configurá tu altura en Ajustes para calcular el IMC.';
  } else {
    el.textContent = '';
  }
}

async function saveBodyLogFromSheet() {
  const date = document.getElementById('bl-date').value;
  const weight = parseFloat(document.getElementById('bl-weight').value);
  if (!date) { showToast('Elegí una fecha.'); return; }
  if (!weight || weight <= 0) { showToast('Ingresá un peso válido.'); return; }
  const fatVal = document.getElementById('bl-fat').value;

  const rec = (await DB.get('body', date)) || { date, users: {} };
  if (!rec.users) rec.users = {};
  rec.users[state.currentUserId] = {
    weight,
    bodyFat: fatVal !== '' ? parseFloat(fatVal) : null,
    periodStart: document.getElementById('bl-period-start').checked
  };
  await DB.put('body', rec);

  await loadAllState();
  closeSheet('sheet-body-log');
  renderProgressTab();
  showToast('Registro guardado.');
}

async function deleteBodyLogFromSheet() {
  if (!state.editingBodyLogDate) return;
  if (!confirm('¿Eliminar este registro?')) return;
  const rec = await DB.get('body', state.editingBodyLogDate);
  if (rec && rec.users && rec.users[state.currentUserId]) {
    delete rec.users[state.currentUserId];
    if (Object.keys(rec.users).length === 0) await DB.delete('body', state.editingBodyLogDate);
    else await DB.put('body', rec);
  }
  await loadAllState();
  closeSheet('sheet-body-log');
  renderProgressTab();
  showToast('Registro eliminado.');
}

/* ---------------------------------------------------------
   AJUSTES
   --------------------------------------------------------- */

function renderSettingsTab() {
  renderUsersSettingsList();
  renderCategoriesSettingsList();

  document.getElementById('set-goal-weight').value = state.settings.goalWeightKg || '';
  document.getElementById('set-height').value = state.settings.heightCm || '';
  document.getElementById('set-daily-limit').value = state.settings.dailyLimit || '';

  const wrap = document.getElementById('meal-targets-list');
  wrap.innerHTML = MEAL_TYPES.map((m) => `
    <div class="settings-row">
      <div class="label-block"><div class="t">${m.label}</div></div>
      <div class="unit-suffix" style="width:120px;"><input type="number" data-meal-target="${m.id}" value="${state.settings.mealTargets[m.id] || ''}" step="10"><span class="suffix">kcal</span></div>
    </div>`).join('');

  document.querySelectorAll('#calc-sex .chip').forEach((c) => c.classList.toggle('is-selected', c.dataset.sex === state.settings.sex));
  document.getElementById('calc-age').value = state.settings.age || '';
  const lastWeight = state.bodyLogs.length ? state.bodyLogs[state.bodyLogs.length - 1].weight : null;
  document.getElementById('calc-weight').value = state.settings.calcWeightKg || lastWeight || '';
  document.getElementById('calc-activity').value = state.settings.activityLevel || 'sedentario';
  document.getElementById('calc-weekly-rate').value = state.settings.weeklyRateKg != null ? state.settings.weeklyRateKg : -0.5;
  document.getElementById('calc-result').innerHTML = '';

  document.getElementById('set-auto-download').checked = state.appSettings.autoDownloadBackup !== false;

  refreshAutoBackupStatus();
  renderBackupList();
}

async function renderBackupList() {
  const backups = await listBackups();
  const wrap = document.getElementById('backup-list');
  if (backups.length === 0) {
    wrap.innerHTML = `<p class="small text-faint">Todavía no hay respaldos guardados. Se genera uno automáticamente cada día que abrís la app.</p>`;
    return;
  }
  wrap.innerHTML = backups.map((b) => `
    <div class="log-item">
      <div class="d">${formatShortDate(b.date)}</div>
      <div class="actions"><button class="btn btn-subtle btn-sm" data-action="restore-backup" data-date="${b.date}">Restaurar</button></div>
    </div>`).join('');
}

async function saveSettingsField() {
  state.settings.goalWeightKg = parseFloat(document.getElementById('set-goal-weight').value) || null;
  state.settings.heightCm = parseFloat(document.getElementById('set-height').value) || null;
  state.settings.dailyLimit = parseFloat(document.getElementById('set-daily-limit').value) || 0;
  document.querySelectorAll('[data-meal-target]').forEach((input) => {
    state.settings.mealTargets[input.dataset.mealTarget] = parseFloat(input.value) || 0;
  });
  await saveSettings();
  renderToday();
}

function calcSelectSex(sex) {
  state.settings.sex = sex;
  document.querySelectorAll('#calc-sex .chip').forEach((c) => c.classList.toggle('is-selected', c.dataset.sex === sex));
}

async function runCalorieCalculation() {
  const sex = state.settings.sex;
  const age = parseFloat(document.getElementById('calc-age').value) || null;
  const weight = parseFloat(document.getElementById('calc-weight').value) || null;
  const heightCm = state.settings.heightCm;
  const activityLevel = document.getElementById('calc-activity').value;
  const weeklyRateKg = parseFloat(document.getElementById('calc-weekly-rate').value);

  state.settings.age = age;
  state.settings.calcWeightKg = weight;
  state.settings.activityLevel = activityLevel;
  state.settings.weeklyRateKg = isNaN(weeklyRateKg) ? 0 : weeklyRateKg;
  await saveSettings();

  const resultEl = document.getElementById('calc-result');
  if (!heightCm) {
    resultEl.innerHTML = `<p class="small" style="color:var(--rust);">Falta tu altura — completala arriba, en "Meta y medidas".</p>`;
    return;
  }
  const result = computeSuggestedCalories({ sex, age, heightCm, weightKg: weight, activityLevel, weeklyRateKg: state.settings.weeklyRateKg });
  if (!result) {
    resultEl.innerHTML = `<p class="small" style="color:var(--rust);">Completá sexo, edad y peso actual para calcular.</p>`;
    return;
  }

  resultEl.innerHTML = `
    <div class="calc-result-box">
      <div class="l">Calorías diarias sugeridas</div>
      <div class="n">${fmt(result.target)} <span>kcal</span></div>
      <div class="s">Gasto estimado (TDEE): ${fmt(result.tdee)} kcal · ${state.settings.weeklyRateKg === 0 ? 'objetivo: mantener peso' : `objetivo: ${state.settings.weeklyRateKg > 0 ? 'subir' : 'bajar'} ${fmt(Math.abs(state.settings.weeklyRateKg), 1)} kg/semana`}</div>
      ${result.belowFloor ? `<div class="calc-warn">⚠️ Este valor está por debajo de lo generalmente recomendado sin supervisión médica (~${result.floor} kcal). Considerá un objetivo semanal menos agresivo.</div>` : ''}
      <button class="btn btn-primary btn-sm btn-block" id="btn-use-calc-result" style="margin-top:10px;">Usar ${fmt(result.target)} kcal como mi límite diario</button>
    </div>`;

  document.getElementById('btn-use-calc-result').addEventListener('click', async () => {
    document.getElementById('set-daily-limit').value = result.target;
    await saveSettingsField();
    showToast('Límite diario actualizado. Podés seguir ajustándolo a mano cuando quieras.');
  });
}

async function handleRestoreBackup(date) {
  if (!confirm(`¿Restaurar el respaldo del ${formatFullDate(date)}? Se reemplazarán los datos actuales.`)) return;
  await restoreFromBackup(date);
  showToast('Respaldo restaurado. Recargando…');
  setTimeout(() => location.reload(), 900);
}

async function handleImportFile(file) {
  try {
    await importFromFile(file);
    showToast('Datos importados. Recargando…');
    setTimeout(() => location.reload(), 900);
  } catch (err) {
    showToast(err.message || 'No se pudo importar el archivo.');
  }
}

async function handleResetAll() {
  if (!confirm('Esto borra TODOS los perfiles, alimentos, grupos, planes y registros de este dispositivo. ¿Continuar?')) return;
  if (!confirm('Última confirmación: esta acción no se puede deshacer. ¿Borrar todo?')) return;
  await Promise.all(STORES.map((s) => DB.clear(s)));
  showToast('Datos borrados. Recargando…');
  setTimeout(() => location.reload(), 900);
}

/* ---------------------------------------------------------
   Navegación de pestañas
   --------------------------------------------------------- */

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('is-active'));
  document.getElementById(`view-${tab}`).classList.add('is-active');

  const fab = document.getElementById('fab-add-food');
  fab.style.display = (tab === 'foods' && state.foodsSubview === 'foods') ? 'flex' : 'none';

  if (tab === 'progress') renderProgressTab();
  if (tab === 'settings') renderSettingsTab();
}

function switchFoodsSubview(sub) {
  state.foodsSubview = sub;
  document.getElementById('subtab-foods').classList.toggle('is-selected', sub === 'foods');
  document.getElementById('subtab-groups').classList.toggle('is-selected', sub === 'groups');
  document.getElementById('subtab-containers').classList.toggle('is-selected', sub === 'containers');
  document.getElementById('foods-subview').style.display = sub === 'foods' ? 'block' : 'none';
  document.getElementById('groups-subview').style.display = sub === 'groups' ? 'block' : 'none';
  document.getElementById('containers-subview').style.display = sub === 'containers' ? 'block' : 'none';
  document.getElementById('fab-add-food').style.display = sub === 'foods' ? 'flex' : 'none';
}

/* ---------------------------------------------------------
   Eventos
   --------------------------------------------------------- */

function wireEvents() {
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  document.getElementById('btn-prev-day').addEventListener('click', async () => {
    state.currentDateStr = addDaysStr(state.currentDateStr, -1);
    state.currentDay = await loadDayRecord(state.currentDateStr);
    renderToday();
  });
  document.getElementById('btn-next-day').addEventListener('click', async () => {
    state.currentDateStr = addDaysStr(state.currentDateStr, 1);
    state.currentDay = await loadDayRecord(state.currentDateStr);
    renderToday();
  });

  document.getElementById('day-note').addEventListener('change', async (e) => {
    currentUserSlice().note = e.target.value;
    await saveCurrentDay();
  });

  document.getElementById('budget-card').addEventListener('click', openDaySummary);
  document.getElementById('budget-card').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDaySummary(); }
  });

  document.getElementById('summary-sheet-body').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-summary-view]');
    if (!chip) return;
    state.daySummaryView = chip.dataset.summaryView;
    renderDaySummarySheet();
  });

  document.getElementById('meals-container').addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const mt = actionEl.dataset.mt;
    if (action === 'toggle-skip') toggleMealSkip(mt);
    else if (action === 'add-item') openPicker(mt);
    else if (action === 'copy-meal') openCopyMealSheet(mt);
    else if (action === 'edit-item') {
      const idx = parseInt(actionEl.dataset.idx, 10);
      const item = currentMeals()[mt].items[idx];
      openAmountSheet({ mode: 'edit', foodId: item.foodId, mealType: mt, itemIndex: idx, currentAmount: item.amount, currentNote: item.note });
    } else if (action === 'edit-group-item') {
      const idx = parseInt(actionEl.dataset.idx, 10);
      openDayGroupSheet(mt, idx);
    }
  });

  // Usuarios
  document.getElementById('user-switch-btn').addEventListener('click', cycleToNextUser);
  document.getElementById('users-settings-list').addEventListener('click', (e) => {
    const switchBtn = e.target.closest('[data-action="switch-user"]');
    if (switchBtn) { switchUser(switchBtn.dataset.id); return; }
    const editBtn = e.target.closest('[data-action="edit-user"]');
    if (editBtn) openUserSheet(editBtn.dataset.id);
  });
  document.getElementById('btn-new-user').addEventListener('click', () => openUserSheet(null));
  document.getElementById('btn-save-user').addEventListener('click', saveUserFromSheet);
  document.getElementById('btn-delete-user').addEventListener('click', deleteUserFromSheet);

  // Copiar comida
  document.getElementById('btn-confirm-copy').addEventListener('click', confirmCopyMeal);

  // Editar grupo del día
  document.getElementById('dg-items-list').addEventListener('input', (e) => {
    const idx = parseInt(e.target.dataset.dgIdx, 10);
    if (isNaN(idx)) return;
    state.dayGroupItems[idx].amount = parseFloat(e.target.value) || 0;
    updateDayGroupKcalTotal();
  });
  document.getElementById('dg-items-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-dg-remove]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.dgRemove, 10);
    state.dayGroupItems.splice(idx, 1);
    renderDayGroupItemsEditor();
  });
  document.getElementById('btn-apply-multiplier').addEventListener('click', applyDayGroupMultiplier);
  document.getElementById('btn-save-day-group').addEventListener('click', saveDayGroupFromSheet);
  document.getElementById('btn-remove-day-group').addEventListener('click', removeDayGroupFromMeal);

  // Alimentos tab
  document.getElementById('subtab-foods').addEventListener('click', () => switchFoodsSubview('foods'));
  document.getElementById('subtab-groups').addEventListener('click', () => switchFoodsSubview('groups'));
  document.getElementById('subtab-containers').addEventListener('click', () => switchFoodsSubview('containers'));
  document.getElementById('food-search').addEventListener('input', (e) => { state.foodFilter.search = e.target.value; renderFoodsList(); });
  document.getElementById('food-sort').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-sort]');
    if (!chip) return;
    state.foodFilter.sort = chip.dataset.sort;
    document.querySelectorAll('#food-sort [data-sort]').forEach((c) => c.classList.toggle('is-selected', c === chip));
    renderFoodsList();
  });
  document.getElementById('category-filter').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    state.foodFilter.category = chip.dataset.cat;
    renderCategoryFilterChips();
    renderFoodsList();
  });
  document.getElementById('foods-list').addEventListener('click', (e) => {
    const star = e.target.closest('[data-action="toggle-fav"]');
    if (star) { toggleFoodFavorite(star.dataset.id); return; }
    const row = e.target.closest('[data-action="edit-food"]');
    if (row) openFoodSheet(row.dataset.id);
  });
  document.getElementById('fab-add-food').addEventListener('click', () => openFoodSheet(null));
  document.getElementById('btn-save-food').addEventListener('click', saveFoodFromSheet);
  document.getElementById('btn-delete-food').addEventListener('click', deleteFoodFromSheet);
  document.getElementById('f-unit').addEventListener('change', updateFoodBaseHint);

  // Grupos
  document.getElementById('groups-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-action="edit-group"]');
    if (row) openGroupSheet(row.dataset.id);
  });
  document.getElementById('btn-new-group').addEventListener('click', () => openGroupSheet(null));
  document.getElementById('btn-save-group').addEventListener('click', saveGroupFromSheet);
  document.getElementById('btn-delete-group').addEventListener('click', deleteGroupFromSheet);
  document.getElementById('btn-add-group-item').addEventListener('click', () => {
    if (state.foods.length === 0) { showToast('Agregá alimentos primero.'); return; }
    state.groupSheetItems.push({ foodId: state.foods[0].id, amount: state.foods[0].baseAmount });
    renderGroupItemsEditor();
  });
  document.getElementById('g-items-list').addEventListener('input', (e) => {
    const idx = parseInt(e.target.dataset.gidx, 10);
    if (isNaN(idx)) return;
    if (e.target.dataset.gAction === 'food') {
      state.groupSheetItems[idx].foodId = e.target.value;
      const food = state.foodsById[e.target.value];
      if (food) state.groupSheetItems[idx].amount = food.baseAmount;
      renderGroupItemsEditor();
    } else if (e.target.dataset.gAction === 'amount') {
      state.groupSheetItems[idx].amount = parseFloat(e.target.value) || 0;
    }
  });
  document.getElementById('g-items-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-g-action="remove"]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.gidx, 10);
    state.groupSheetItems.splice(idx, 1);
    renderGroupItemsEditor();
  });

  // Recipientes
  document.getElementById('containers-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-action="edit-container"]');
    if (row) openContainerSheet(row.dataset.id);
  });
  document.getElementById('btn-new-container').addEventListener('click', () => openContainerSheet(null));
  document.getElementById('btn-save-container').addEventListener('click', saveContainerFromSheet);
  document.getElementById('btn-delete-container').addEventListener('click', deleteContainerFromSheet);
  document.getElementById('calc-container-select').addEventListener('change', updateContainerCalcResult);
  document.getElementById('calc-gross-weight').addEventListener('input', updateContainerCalcResult);

  // Categorías
  document.getElementById('categories-settings-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-action="edit-category"]');
    if (row) openCategorySheet(row.dataset.id);
  });
  document.getElementById('btn-new-category').addEventListener('click', () => openCategorySheet(null));
  document.getElementById('btn-save-category').addEventListener('click', saveCategoryFromSheet);
  document.getElementById('btn-delete-category').addEventListener('click', deleteCategoryFromSheet);

  // Picker
  document.getElementById('picker-tab-foods').addEventListener('click', () => setPickerTab('foods'));
  document.getElementById('picker-tab-groups').addEventListener('click', () => setPickerTab('groups'));
  document.getElementById('picker-search').addEventListener('input', renderPickerList);
  document.getElementById('picker-list').addEventListener('click', (e) => {
    const foodRow = e.target.closest('[data-action="pick-food"]');
    if (foodRow) {
      closeSheet('sheet-picker');
      openAmountSheet({ mode: 'add', foodId: foodRow.dataset.id, mealType: state.pickerContext.mealType });
      return;
    }
    const groupRow = e.target.closest('[data-action="pick-group"]');
    if (groupRow) addGroupToMeal(groupRow.dataset.id);
  });

  // Amount sheet
  document.getElementById('amount-value').addEventListener('input', updateAmountPreview);
  document.getElementById('amount-minus').addEventListener('click', () => {
    const input = document.getElementById('amount-value');
    const step = parseFloat(input.step) || 10;
    input.value = Math.max(0, (parseFloat(input.value) || 0) - step);
    updateAmountPreview();
  });
  document.getElementById('amount-plus').addEventListener('click', () => {
    const input = document.getElementById('amount-value');
    const step = parseFloat(input.step) || 10;
    input.value = (parseFloat(input.value) || 0) + step;
    updateAmountPreview();
  });
  document.getElementById('btn-confirm-amount').addEventListener('click', confirmAmountSheet);
  document.getElementById('btn-remove-amount').addEventListener('click', removeAmountItem);

  // Progreso
  document.getElementById('btn-add-body-log').addEventListener('click', () => openBodyLogSheet(null));
  document.getElementById('bl-weight').addEventListener('input', updateBmiPreview);
  document.getElementById('btn-save-body-log').addEventListener('click', saveBodyLogFromSheet);
  document.getElementById('btn-delete-body-log').addEventListener('click', deleteBodyLogFromSheet);
  document.getElementById('body-log-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-action="edit-body-log"]');
    if (row) openBodyLogSheet(row.dataset.date);
  });
  window.addEventListener('resize', debounce(() => { if (state.activeTab === 'progress') renderProgressTab(); }, 250));

  // Ajustes
  ['set-goal-weight', 'set-height', 'set-daily-limit'].forEach((id) => {
    document.getElementById(id).addEventListener('change', saveSettingsField);
  });
  document.getElementById('meal-targets-list').addEventListener('change', (e) => {
    if (e.target.dataset.mealTarget) saveSettingsField();
  });

  document.getElementById('calc-sex').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-sex]');
    if (chip) calcSelectSex(chip.dataset.sex);
  });
  document.getElementById('btn-run-calc').addEventListener('click', runCalorieCalculation);

  document.getElementById('set-auto-download').addEventListener('change', async (e) => {
    state.appSettings.autoDownloadBackup = e.target.checked;
    await saveAppSettings();
  });
  document.getElementById('btn-export-now').addEventListener('click', async () => { await exportNow(); showToast('Respaldo descargado.'); });
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file-input').click());
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) handleImportFile(e.target.files[0]);
  });
  document.getElementById('backup-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="restore-backup"]');
    if (btn) handleRestoreBackup(btn.dataset.date);
  });
  document.getElementById('btn-reset-all').addEventListener('click', handleResetAll);

  // Sheets: cierre
  document.querySelectorAll('[data-close-sheet]').forEach((btn) => {
    btn.addEventListener('click', () => closeSheet(btn.dataset.closeSheet));
  });
  document.getElementById('sheet-backdrop').addEventListener('click', closeAllSheets);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

document.addEventListener('DOMContentLoaded', init);
