/* =========================================================
   PesoPlan — motor de sugerencias
   ========================================================= */

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function stepForUnit(unit) {
  if (unit === 'unidad') return 1;
  if (unit === 'ml') return 25;
  return 10; // gramos
}

function kcalForAmount(food, amount) {
  return (food.kcal * amount) / food.baseAmount;
}

/**
 * Sugiere una combinación de alimentos para un tipo de comida dado,
 * intentando acercarse a targetKcal. Devuelve [{foodId, amount}].
 */
function suggestForMeal(allFoods, mealType, targetKcal) {
  const pool = allFoods.filter((f) => f.mealTypes && f.mealTypes.includes(mealType));
  if (pool.length === 0 || !targetKcal || targetKcal <= 0) return [];

  const shuffled = shuffleArray(pool);
  const maxItems = Math.min(4, shuffled.length);
  let remaining = targetKcal;
  const items = [];

  for (let i = 0; i < shuffled.length && items.length < maxItems; i++) {
    if (remaining <= targetKcal * 0.1 && items.length > 0) break;
    const food = shuffled[i];
    const isLastSlot = items.length === maxItems - 1;
    const fraction = isLastSlot ? 1 : 0.35 + Math.random() * 0.35;
    let portionKcal = Math.max(remaining * fraction, targetKcal * 0.15);

    if (!food.kcal || food.kcal <= 0) continue;
    let amount = (portionKcal / food.kcal) * food.baseAmount;
    const step = stepForUnit(food.unit);
    amount = Math.max(step, Math.round(amount / step) * step);

    const kc = kcalForAmount(food, amount);
    if (items.length > 0 && kc > targetKcal * 1.35) continue;

    items.push({ foodId: food.id, amount });
    remaining -= kc;
  }

  if (items.length === 0 && shuffled.length > 0) {
    const food = shuffled[0];
    const step = stepForUnit(food.unit);
    items.push({ foodId: food.id, amount: step });
  }

  return items;
}

function sumItemsNutrition(items, foodsById) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  items.forEach((it) => {
    const food = foodsById[it.foodId];
    if (!food) return;
    const ratio = it.amount / food.baseAmount;
    totals.kcal += food.kcal * ratio;
    totals.protein += (food.protein || 0) * ratio;
    totals.carbs += (food.carbs || 0) * ratio;
    totals.fat += (food.fat || 0) * ratio;
    totals.fiber += (food.fiber || 0) * ratio;
  });
  return totals;
}
