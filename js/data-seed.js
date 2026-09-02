/* =========================================================
   Fit Bee — datos iniciales
   ========================================================= */

const MEAL_TYPES = [
  { id: 'desayuno', label: 'Desayuno', icon: 'sun' },
  { id: 'colacion_manana', label: 'Snack mañana', icon: 'apple' },
  { id: 'almuerzo', label: 'Almuerzo', icon: 'bowl' },
  { id: 'colacion_tarde', label: 'Snack tarde', icon: 'apple' },
  { id: 'cena', label: 'Cena', icon: 'moon' }
];

const MEAL_LABELS = Object.fromEntries(MEAL_TYPES.map((m) => [m.id, m.label]));

/**
 * Categorías iniciales de alimentos. Se cargan una sola vez a la base
 * (store 'categories'); desde ahí son editables por el usuario en
 * Ajustes, así que en tiempo de ejecución hay que usar state.categories /
 * state.categoriesById en vez de esta constante.
 */
const SEED_CATEGORIES = [
  { id: 'fruta', label: 'Fruta', color: '#D6A24A', emoji: '🍎' },
  { id: 'verdura', label: 'Verdura', color: '#6B7353', emoji: '🥦' },
  { id: 'fruto_seco', label: 'Fruto seco', color: '#B5822F', emoji: '🥜' },
  { id: 'lacteo', label: 'Lácteo', color: '#C46A3F', emoji: '🥛' },
  { id: 'proteina', label: 'Proteína', color: '#9C4A3A', emoji: '🍗' },
  { id: 'cereal', label: 'Cereal / granos', color: '#8C8474', emoji: '🌾' },
  { id: 'dulce', label: 'Dulce / postre', color: '#C46A3F', emoji: '🍨' },
  { id: 'otro', label: 'Otro', color: '#8C8474', emoji: '🍽️' }
];

/** Paleta para asignar color automáticamente a categorías nuevas. */
const CATEGORY_COLOR_PALETTE = ['#C46A3F', '#6B7353', '#D6A24A', '#9C4A3A', '#8C8474', '#B5822F', '#A6512C', '#545B40'];

const UNIT_LABELS = { g: 'g', ml: 'ml', unidad: 'unid.' };

const USER_EMOJIS = ['🐝', '🦁', '🐻', '🦊', '🐼', '🐸', '🐢', '🦉', '🐨', '🦋', '🐶', '🐱'];

/**
 * Alimentos iniciales. baseAmount es la cantidad de referencia
 * (100 para g/ml, 1 para unidad) sobre la que se expresan los valores.
 */
const SEED_FOODS = [
  {
    id: 'seed_fruta', name: 'Fruta (genérica)', category: 'fruta', unit: 'g', baseAmount: 100,
    kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4,
    mealTypes: ['desayuno', 'colacion_manana', 'colacion_tarde'],
    favorite: true, notes: 'Promedio tipo manzana/pera. Duplicá y ajustá para banana, mandarina, etc.'
  },
  {
    id: 'seed_verdura', name: 'Verdura (genérica)', category: 'verdura', unit: 'g', baseAmount: 100,
    kcal: 25, protein: 2, carbs: 5, fat: 0.3, fiber: 2.5,
    mealTypes: ['almuerzo', 'cena'],
    favorite: true, notes: 'Promedio de verdura de hoja/mixta cocida o cruda.'
  },
  {
    id: 'seed_frutos_secos', name: 'Frutos secos (mix)', category: 'fruto_seco', unit: 'g', baseAmount: 100,
    kcal: 600, protein: 15, carbs: 20, fat: 50, fiber: 7,
    mealTypes: ['colacion_manana', 'colacion_tarde'],
    favorite: false, notes: 'Mix de nueces, almendras y castañas. Porciones chicas: 15-20 g.'
  },
  {
    id: 'seed_leche', name: 'Leche entera', category: 'lacteo', unit: 'ml', baseAmount: 100,
    kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0,
    mealTypes: ['desayuno', 'colacion_manana', 'colacion_tarde'],
    favorite: true, notes: 'No descremada.'
  },
  {
    id: 'seed_yogur', name: 'Yogur natural entero', category: 'lacteo', unit: 'g', baseAmount: 100,
    kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.3, fiber: 0,
    mealTypes: ['desayuno', 'colacion_manana', 'colacion_tarde'],
    favorite: true, notes: 'No descremado, sin azúcar agregada.'
  },
  {
    id: 'seed_queso', name: 'Queso semiduro', category: 'lacteo', unit: 'g', baseAmount: 100,
    kcal: 330, protein: 22, carbs: 2, fat: 27, fiber: 0,
    mealTypes: ['desayuno', 'almuerzo', 'cena', 'colacion_manana', 'colacion_tarde'],
    favorite: true, notes: 'Tipo Paraguay/criollo. Ajustá según la variedad exacta.'
  },
  {
    id: 'seed_helado', name: 'Helado', category: 'dulce', unit: 'g', baseAmount: 100,
    kcal: 207, protein: 3.5, carbs: 24, fat: 11, fiber: 0.5,
    mealTypes: ['colacion_tarde', 'cena'],
    favorite: false, notes: 'Para gusto ocasional dentro del presupuesto calórico.'
  },
  {
    id: 'seed_huevo', name: 'Huevo', category: 'proteina', unit: 'unidad', baseAmount: 1,
    kcal: 70, protein: 6, carbs: 0.4, fat: 5, fiber: 0,
    mealTypes: ['desayuno', 'almuerzo', 'cena'],
    favorite: true, notes: 'Huevo mediano (~50 g).'
  },
  {
    id: 'seed_pollo', name: 'Pechuga de pollo', category: 'proteina', unit: 'g', baseAmount: 100,
    kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0,
    mealTypes: ['almuerzo', 'cena'],
    favorite: true, notes: 'Cocida, sin piel.'
  },
  {
    id: 'seed_arroz', name: 'Arroz integral cocido', category: 'cereal', unit: 'g', baseAmount: 100,
    kcal: 123, protein: 2.7, carbs: 26, fat: 1, fiber: 1.8,
    mealTypes: ['almuerzo', 'cena'],
    favorite: false, notes: ''
  },
  {
    id: 'seed_pan', name: 'Pan integral', category: 'cereal', unit: 'g', baseAmount: 100,
    kcal: 246, protein: 9, carbs: 41, fat: 4.2, fiber: 6,
    mealTypes: ['desayuno', 'colacion_manana', 'colacion_tarde'],
    favorite: false, notes: ''
  },
  {
    id: 'seed_atun', name: 'Atún al natural', category: 'proteina', unit: 'g', baseAmount: 100,
    kcal: 116, protein: 26, carbs: 0, fat: 1, fiber: 0,
    mealTypes: ['almuerzo', 'cena'],
    favorite: false, notes: 'Escurrido, en agua.'
  }
];

/**
 * Ajustes por usuario: cada perfil tiene su propio presupuesto, objetivos
 * de comida, altura, meta de peso y datos para la calculadora de calorías.
 * Los alimentos y grupos son compartidos entre todos los usuarios.
 */
const SEED_USER_SETTINGS = {
  dailyLimit: 1600,
  mealTargets: {
    desayuno: 350,
    colacion_manana: 150,
    almuerzo: 500,
    colacion_tarde: 150,
    cena: 450
  },
  heightCm: null,
  goalWeightKg: null,
  sex: null,
  age: null,
  calcWeightKg: null,
  activityLevel: 'sedentario',
  weeklyRateKg: -0.5
};

/**
 * Ajustes a nivel app (no por usuario): quién es el usuario activo,
 * estado del respaldo automático y si se onboardeó alguna vez.
 */
const SEED_APP_SETTINGS = {
  currentUserId: null,
  lastAutoBackupDate: null,
  autoDownloadBackup: true,
  onboarded: false,
  itemsSnapshotted: false
};
