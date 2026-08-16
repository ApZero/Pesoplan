/* =========================================================
   PesoPlan — app.js (estado, render, eventos)
   ========================================================= */

const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;

const state = {
  foods: [],
  foodsById: {},
  groups: [],
  groupsById: {},
  settings: { ...SEED_SETTINGS },
  bodyLogs: [], // ascendente por fecha
  activeTab: 'today',
  foodsSubview: 'foods',
  currentDateStr: todayStr(),
  currentDay: null,
  foodFilter: { search: '', category: 'all' },
  pickerTab: 'foods',
  pickerContext: null, // {mealType, date}
  amountContext: null, // {mode, foodId, mealType, date, itemIndex}
  editingFoodId: null,
  editingGroupId: null,
  groupSheetItems: [],
  editingBodyLogDate: null,
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

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  await ensureSeedData();
  await loadAllState();
  await runAutoBackupIfNeeded(state.settings);
  refreshAutoBackupStatus();

  populateStaticSelectors();
  wireEvents();

  state.currentDay = await loadDay(state.currentDateStr);
  renderToday();
  renderFoodsTab();
  renderProgressTab();
  renderSettingsTab();

  if (!state.settings.onboarded) {
    showToast('¡Bienvenido a PesoPlan! Configurá tu meta en Ajustes.');
    state.settings.onboarded = true;
    await saveSettings();
  }

  window.addEventListener('scroll', () => {}, { passive: true });
}

async function ensureSeedData() {
  const foodCount = await DB.count('foods');
  if (foodCount === 0) {
    await DB.putMany('foods', SEED_FOODS);
  }
  const settingsRow = await DB.get('settings', 'main');
  if (!settingsRow) {
    await DB.put('settings', { key: 'main', value: { ...SEED_SETTINGS } });
  }
}

async function loadAllState() {
  const [foods, groups, settingsRow, bodyLogs] = await Promise.all([
    DB.getAll('foods'),
    DB.getAll('groups'),
    DB.get('settings', 'main'),
    DB.getAll('body')
  ]);
  state.foods = foods.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  state.foodsById = Object.fromEntries(foods.map((f) => [f.id, f]));
  state.groups = groups.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  state.groupsById = Object.fromEntries(groups.map((g) => [g.id, g]));
  state.settings = settingsRow ? settingsRow.value : { ...SEED_SETTINGS };
  state.bodyLogs = bodyLogs.sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function saveSettings() {
  await DB.put('settings', { key: 'main', value: state.settings });
}

function refreshAutoBackupStatus() {
  const el = document.getElementById('auto-backup-status');
  if (!el) return;
  if (state.settings.lastAutoBackupDate) {
    el.textContent = `Último respaldo: ${formatFullDate(state.settings.lastAutoBackupDate)}`;
  } else {
    el.textContent = 'Todavía no se generó ningún respaldo';
  }
}

function populateStaticSelectors() {
  const catSelect = document.getElementById('f-category');
  catSelect.innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.emoji} ${c.label}</option>`).join('');

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
}

/* ---------------------------------------------------------
   Iconos de comida (inline SVG mínimos)
   --------------------------------------------------------- */

const MEAL_ICON_SVGS = {
  sun: '<circle cx="12" cy="12" r="4"></circle><line x1="12" y1="2" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="22"></line><line x1="4.2" y1="4.2" x2="6.3" y2="6.3"></line><line x1="17.7" y1="17.7" x2="19.8" y2="19.8"></line><line x1="2" y1="12" x2="5" y2="12"></line><line x1="19" y1="12" x2="22" y2="12"></line><line x1="4.2" y1="19.8" x2="6.3" y2="17.7"></line><line x1="17.7" y1="6.3" x2="19.8" y2="4.2"></line>',
  apple: '<path d="M12 8c-2.5-2-6-1-6 3 0 4 3 8 6 8s6-4 6-8c0-4-3.5-5-6-3z"></path><path d="M12 8V5c0-1.5 1-2 2-2"></path>',
  bowl: '<path d="M3 12h18a9 9 0 0 1-18 0z"></path><path d="M7 12c0-3 2-5 5-5s5 2 5 5"></path>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"></path>'
};

/* ---------------------------------------------------------
   HOY — plan diario
   --------------------------------------------------------- */

function defaultDay(date) {
  const meals = {};
  MEAL_TYPES.forEach((m) => { meals[m.id] = { skip: false, items: [] }; });
  return { date, meals, note: '' };
}

async function loadDay(date) {
  const existing = await DB.get('days', date);
  if (existing) {
    // asegurar que existan todas las comidas aunque se hayan agregado tipos nuevos
    MEAL_TYPES.forEach((m) => { if (!existing.meals[m.id]) existing.meals[m.id] = { skip: false, items: [] }; });
    return existing;
  }
  return defaultDay(date);
}

async function saveCurrentDay() {
  await DB.put('days', state.currentDay);
}

function computeDayTotals(day) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  MEAL_TYPES.forEach((m) => {
    const meal = day.meals[m.id];
    if (!meal || meal.skip) return;
    const t = sumItemsNutrition(meal.items, state.foodsById);
    totals.kcal += t.kcal; totals.protein += t.protein; totals.carbs += t.carbs;
    totals.fat += t.fat; totals.fiber += t.fiber;
  });
  return totals;
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

function renderToday() {
  const day = state.currentDay;
  document.getElementById('today-date-label').textContent = dateLabelPrefix(day.date) + formatFullDate(day.date);
  document.getElementById('day-note').value = day.note || '';

  const totals = computeDayTotals(day);
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
  container.innerHTML = MEAL_TYPES.map((m) => renderMealCard(day, m)).join('');
}

function renderMealCard(day, mealDef) {
  const meal = day.meals[mealDef.id];
  const target = state.settings.mealTargets[mealDef.id] || 0;
  const totals = meal.skip ? { kcal: 0 } : sumItemsNutrition(meal.items, state.foodsById);

  const rows = meal.items.map((item, idx) => {
    const food = state.foodsById[item.foodId];
    if (!food) return '';
    const kc = kcalForAmount(food, item.amount);
    return `
      <div class="food-row" data-mt="${mealDef.id}" data-idx="${idx}" data-action="edit-item">
        <div class="fname">${escapeHtml(food.name)}</div>
        <div class="famt">${fmt(item.amount)} ${UNIT_LABELS[food.unit]}</div>
        <div class="fkcal">${fmt(kc)}</div>
      </div>`;
  }).join('');

  const body = meal.skip
    ? `<div class="skip-label">Sin comida en este horario</div>`
    : (meal.items.length
      ? `<div>${rows}</div><div class="meal-foot"><button class="btn btn-ghost btn-sm" data-action="add-item" data-mt="${mealDef.id}">+ Agregar</button><button class="btn btn-subtle btn-sm" data-action="scramble" data-mt="${mealDef.id}">🎲 Mezclar</button></div>`
      : `<div class="meal-empty">Sin alimentos todavía</div><div class="meal-foot"><button class="btn btn-ghost btn-sm" data-action="add-item" data-mt="${mealDef.id}">+ Agregar</button><button class="btn btn-olive btn-sm" data-action="suggest" data-mt="${mealDef.id}">✨ Sugerir</button></div>`);

  return `
    <div class="meal-card ${meal.skip ? 'is-skipped' : ''}" data-mt="${mealDef.id}">
      <div class="meal-head">
        <div class="meal-icon"><svg viewBox="0 0 24 24">${MEAL_ICON_SVGS[mealDef.icon]}</svg></div>
        <div class="meal-titles">
          <div class="t">${mealDef.label}</div>
          <div class="s">${meal.skip ? 'omitida' : `${fmt(totals.kcal)} / ${fmt(target)} kcal`}</div>
        </div>
        <div class="meal-head-actions">
          <button class="mini-btn ${meal.skip ? 'is-active' : ''}" data-action="toggle-skip" data-mt="${mealDef.id}" title="Sin comida">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><line x1="6" y1="18" x2="18" y2="6"></line></svg>
          </button>
        </div>
      </div>
      <div class="meal-body">${body}</div>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function toggleMealSkip(mealType) {
  const meal = state.currentDay.meals[mealType];
  meal.skip = !meal.skip;
  await saveCurrentDay();
  renderToday();
}

async function suggestMeal(mealType) {
  const target = state.settings.mealTargets[mealType] || 300;
  const items = suggestForMeal(state.foods, mealType, target);
  if (items.length === 0) {
    showToast('No hay alimentos configurados para esta comida todavía.');
    return;
  }
  state.currentDay.meals[mealType].items = items;
  state.currentDay.meals[mealType].skip = false;
  await saveCurrentDay();
  renderToday();
  showToast('Sugerencia lista. Podés mezclar si no te convence.');
}

async function suggestFullDay() {
  let any = false;
  MEAL_TYPES.forEach((m) => {
    const meal = state.currentDay.meals[m.id];
    if (meal.skip) return;
    const items = suggestForMeal(state.foods, m.id, state.settings.mealTargets[m.id] || 300);
    if (items.length) { meal.items = items; any = true; }
  });
  await saveCurrentDay();
  renderToday();
  showToast(any ? 'Día sugerido. Mezclá cualquier sección si querés cambiarla.' : 'Agregá alimentos con tipos de comida para poder sugerir.');
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

  const meal = state.currentDay.meals[ctx.mealType];
  if (ctx.mode === 'edit') {
    meal.items[ctx.itemIndex].amount = amount;
  } else {
    meal.items.push({ foodId: ctx.foodId, amount });
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
  const meal = state.currentDay.meals[ctx.mealType];
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
      const cat = CATEGORY_MAP[f.category] || CATEGORY_MAP.otro;
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

function emptyStateHtml(glyph, title, text) {
  return `<div class="empty-state"><div class="glyph">${glyph}</div><h4>${title}</h4><p>${text}</p></div>`;
}

async function addGroupToMeal(groupId) {
  const group = state.groupsById[groupId];
  if (!group) return;
  const { mealType } = state.pickerContext;
  const meal = state.currentDay.meals[mealType];
  group.items.forEach((it) => meal.items.push({ foodId: it.foodId, amount: it.amount }));
  meal.skip = false;
  await saveCurrentDay();
  closeSheet('sheet-picker');
  renderToday();
  showToast(`"${group.name}" agregado.`);
}

/* ---------------------------------------------------------
   ALIMENTOS — lista y filtro
   --------------------------------------------------------- */

function renderCategoryFilterChips() {
  const wrap = document.getElementById('category-filter');
  const chips = [
    { id: 'all', label: 'Todos' },
    { id: 'favorites', label: '★ Favoritos' },
    ...CATEGORIES.map((c) => ({ id: c.id, label: `${c.emoji} ${c.label}` }))
  ];
  wrap.innerHTML = chips.map((c) => `<button class="chip ${state.foodFilter.category === c.id ? 'is-selected' : ''}" data-cat="${c.id}">${c.label}</button>`).join('');
}

function renderFoodsList() {
  const search = state.foodFilter.search.toLowerCase();
  const cat = state.foodFilter.category;
  let items = state.foods.filter((f) => f.name.toLowerCase().includes(search));
  if (cat === 'favorites') items = items.filter((f) => f.favorite);
  else if (cat !== 'all') items = items.filter((f) => f.category === cat);

  const list = document.getElementById('foods-list');
  if (items.length === 0) {
    list.innerHTML = emptyStateHtml('🍽️', 'No hay alimentos', 'Probá otra búsqueda o agregá uno nuevo con el botón +.');
    return;
  }
  list.innerHTML = items.map((f) => {
    const catDef = CATEGORY_MAP[f.category] || CATEGORY_MAP.otro;
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
}

/* ---------------------------------------------------------
   Sheet: alimento
   --------------------------------------------------------- */

function openFoodSheet(foodId) {
  state.editingFoodId = foodId;
  const isEdit = !!foodId;
  const food = isEdit ? state.foodsById[foodId] : null;

  document.getElementById('food-sheet-title').textContent = isEdit ? 'Editar alimento' : 'Nuevo alimento';
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
  drawProgressChart(document.getElementById('chart-weight'), weightEntries, { goal, showProjection: true });

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
        <div class="d">${formatShortDate(l.date)}</div>
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

  await DB.put('body', {
    date,
    weight,
    bodyFat: fatVal !== '' ? parseFloat(fatVal) : null
  });
  await loadAllState();
  closeSheet('sheet-body-log');
  renderProgressTab();
  showToast('Registro guardado.');
}

async function deleteBodyLogFromSheet() {
  if (!state.editingBodyLogDate) return;
  if (!confirm('¿Eliminar este registro?')) return;
  await DB.delete('body', state.editingBodyLogDate);
  await loadAllState();
  closeSheet('sheet-body-log');
  renderProgressTab();
  showToast('Registro eliminado.');
}

/* ---------------------------------------------------------
   AJUSTES
   --------------------------------------------------------- */

function renderSettingsTab() {
  document.getElementById('set-goal-weight').value = state.settings.goalWeightKg || '';
  document.getElementById('set-height').value = state.settings.heightCm || '';
  document.getElementById('set-daily-limit').value = state.settings.dailyLimit || '';

  const wrap = document.getElementById('meal-targets-list');
  wrap.innerHTML = MEAL_TYPES.map((m) => `
    <div class="settings-row">
      <div class="label-block"><div class="t">${m.label}</div></div>
      <div class="unit-suffix" style="width:120px;"><input type="number" data-meal-target="${m.id}" value="${state.settings.mealTargets[m.id] || ''}" step="10"><span class="suffix">kcal</span></div>
    </div>`).join('');

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
  if (!confirm('Esto borra TODOS los alimentos, grupos, planes y registros de este dispositivo. ¿Continuar?')) return;
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
  document.getElementById('foods-subview').style.display = sub === 'foods' ? 'block' : 'none';
  document.getElementById('groups-subview').style.display = sub === 'groups' ? 'block' : 'none';
  document.getElementById('fab-add-food').style.display = sub === 'foods' ? 'flex' : 'none';
}

/* ---------------------------------------------------------
   Eventos
   --------------------------------------------------------- */

function wireEvents() {
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  document.getElementById('btn-prev-day').addEventListener('click', async () => {
    state.currentDateStr = addDaysStr(state.currentDateStr, -1);
    state.currentDay = await loadDay(state.currentDateStr);
    renderToday();
  });
  document.getElementById('btn-next-day').addEventListener('click', async () => {
    state.currentDateStr = addDaysStr(state.currentDateStr, 1);
    state.currentDay = await loadDay(state.currentDateStr);
    renderToday();
  });

  document.getElementById('day-note').addEventListener('change', async (e) => {
    state.currentDay.note = e.target.value;
    await saveCurrentDay();
  });

  document.getElementById('btn-suggest-day').addEventListener('click', suggestFullDay);
  document.getElementById('btn-scramble-day').addEventListener('click', suggestFullDay);

  document.getElementById('meals-container').addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const mt = actionEl.dataset.mt;
    if (action === 'toggle-skip') toggleMealSkip(mt);
    else if (action === 'suggest') suggestMeal(mt);
    else if (action === 'scramble') suggestMeal(mt);
    else if (action === 'add-item') openPicker(mt);
    else if (action === 'edit-item') {
      const idx = parseInt(actionEl.dataset.idx, 10);
      const item = state.currentDay.meals[mt].items[idx];
      openAmountSheet({ mode: 'edit', foodId: item.foodId, mealType: mt, itemIndex: idx, currentAmount: item.amount });
    }
  });

  // Alimentos tab
  document.getElementById('subtab-foods').addEventListener('click', () => switchFoodsSubview('foods'));
  document.getElementById('subtab-groups').addEventListener('click', () => switchFoodsSubview('groups'));
  document.getElementById('food-search').addEventListener('input', (e) => { state.foodFilter.search = e.target.value; renderFoodsList(); });
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
