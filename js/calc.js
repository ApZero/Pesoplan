/* =========================================================
   Fit Bee — calculadora de calorías necesarias
   ========================================================= */

const ACTIVITY_LEVELS = [
  { id: 'sedentario', label: 'Sedentario (poco o nada de ejercicio)', mult: 1.2 },
  { id: 'ligero', label: 'Actividad ligera (1-3 días/semana)', mult: 1.375 },
  { id: 'moderado', label: 'Actividad moderada (3-5 días/semana)', mult: 1.55 },
  { id: 'activo', label: 'Activo (6-7 días/semana)', mult: 1.725 },
  { id: 'muy_activo', label: 'Muy activo (trabajo físico o 2 veces/día)', mult: 1.9 }
];

const KCAL_PER_KG_FAT = 7700;
const SAFE_FLOOR = { male: 1500, female: 1200 };

/**
 * Fórmula de Mifflin-St Jeor + factor de actividad + ajuste por
 * objetivo semanal de peso (kg/semana, negativo para bajar).
 * Devuelve null si faltan datos.
 */
function computeSuggestedCalories({ sex, age, heightCm, weightKg, activityLevel, weeklyRateKg }) {
  if (!sex || !age || !heightCm || !weightKg) return null;
  const level = ACTIVITY_LEVELS.find((a) => a.id === activityLevel) || ACTIVITY_LEVELS[0];
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const tdee = bmr * level.mult;
  const dailyDelta = ((weeklyRateKg || 0) * KCAL_PER_KG_FAT) / 7;
  const rawTarget = tdee + dailyDelta;
  const target = Math.max(0, Math.round(rawTarget / 10) * 10);
  const floor = SAFE_FLOOR[sex] || 1200;
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), target, belowFloor: target < floor, floor };
}
