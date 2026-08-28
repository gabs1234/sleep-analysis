import {
  RawFoodRecord,
  DerivedNutritionSummary,
  FoodLogCompleteness,
  MissingEatingEvent,
  DailyNutritionFallback,
  GIExposureCategory,
  MealSize,
} from "../../types/nutrition";

export const GI_EXPOSURE_CATEGORIES: Array<{
  key: GIExposureCategory;
  label: string;
  desc: string;
}> = [
  { key: "dairy", label: "Dairy", desc: "Milk, cheese, yogurt, whey, ice cream" },
  { key: "wheat_bread_pasta", label: "Wheat / bread / pasta", desc: "Bread, pasta, pizza, cereal, gluten foods" },
  { key: "legumes", label: "Legumes", desc: "Beans, lentils, chickpeas, peanuts, soy" },
  { key: "onion_garlic", label: "Onion / garlic", desc: "Raw or cooked onion, garlic, leeks, shallots" },
  { key: "fruit", label: "Fruit", desc: "Apples, pears, stone fruit, berries, citrus" },
  { key: "cruciferous", label: "Cruciferous vegetables", desc: "Broccoli, cauliflower, cabbage, Brussels sprouts" },
  { key: "high_fat_fried", label: "High-fat / fried food", desc: "Fried foods, heavy oil, fatty meat, rich sauces" },
  { key: "sugary_food", label: "Very sugary food", desc: "Sweets, pastry, honey, syrup, dessert" },
  { key: "sugar_alcohols", label: "Sugar-free / sugar alcohols", desc: "Erythritol, xylitol, sorbitol, diet snacks" },
  { key: "carbonated_drink", label: "Carbonated drink", desc: "Sparkling water, soda, beer, kombucha" },
  { key: "alcohol", label: "Alcohol", desc: "Beer, wine, spirits" },
  { key: "other", label: "Other", desc: "Other notable food exposure" },
  { key: "unsure", label: "Unsure", desc: "Uncertain ingredients" },
];

export const MEAL_SIZE_OPTIONS: Array<{
  key: MealSize;
  label: string;
  desc: string;
}> = [
  { key: "small", label: "Small", desc: "Snack or light bite (~100-300 kcal)" },
  { key: "normal", label: "Normal", desc: "Standard satisfying meal (~400-800 kcal)" },
  { key: "large", label: "Large", desc: "Substantial feast or heavy meal (>800 kcal)" },
];

export const INTAKE_RELATIVE_OPTIONS: Array<{
  val: number;
  label: string;
  desc: string;
}> = [
  { val: 0, label: "0 — Much less", desc: "Skipped meals, far below hunger/target" },
  { val: 1, label: "1 — Less", desc: "Slightly below normal intake" },
  { val: 2, label: "2 — About right", desc: "On target, standard normal eating" },
  { val: 3, label: "3 — More", desc: "A bit more than intended" },
  { val: 4, label: "4 — Much more", desc: "Heavy overeating or binge" },
];

/**
 * Calculates derived nutrition variables with strict provenance tracking.
 * Never silently mixes imported, estimated, and derived values without recording source.
 */
export function deriveNutritionSummary(
  records: RawFoodRecord[] = [],
  missingEvents: MissingEatingEvent[] = [],
  fallback?: DailyNutritionFallback,
  completeness: FoodLogCompleteness = "yes",
  lightsOutTimestamp?: string
): DerivedNutritionSummary {
  // If completely unlogged day (fallback mode)
  if (completeness === "no" && fallback) {
    let mealToLightsOut: number | undefined = undefined;
    if (lightsOutTimestamp && fallback.final_caloric_timestamp) {
      const lightsOutMs = new Date(lightsOutTimestamp).getTime();
      const mealMs = new Date(fallback.final_caloric_timestamp).getTime();
      mealToLightsOut = Math.round((lightsOutMs - mealMs) / (1000 * 60));
    }

    return {
      total_calories: 0,
      total_protein_g: 0,
      total_carbs_g: 0,
      total_fat_g: 0,
      total_fiber_g: 0,
      total_sugar_g: 0,
      total_caffeine_mg: 0,
      eating_events_count: 0,
      final_caloric_timestamp: fallback.final_caloric_timestamp,
      meal_to_lights_out_minutes: mealToLightsOut,
      completeness: "no",
      data_provenance_summary: "1 daily_fallback (manual_approximate)",
    };
  }

  // Combine raw records and missing events for timestamp & calorie ordering
  interface TimePoint {
    timestamp: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sugar_g: number;
    caffeine_mg: number;
    source: string;
    isMissingEvent?: boolean;
  }

  const points: TimePoint[] = [];

  for (const item of records) {
    points.push({
      timestamp: item.timestamp,
      calories: item.calories || 0,
      protein_g: item.protein_g || 0,
      carbs_g: item.carbs_g || 0,
      fat_g: item.fat_g || 0,
      fiber_g: item.fiber_g || 0,
      sugar_g: item.sugar_g || 0,
      caffeine_mg: item.caffeine_mg || 0,
      source: item.source || item.source_app || "macrofactor",
    });
  }

  for (const ev of missingEvents) {
    // Missing events only have rough calories if specified, do not synthesize fake macros
    points.push({
      timestamp: ev.timestamp,
      calories: ev.rough_calories || 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      caffeine_mg: 0,
      source: ev.source || "manual_approximate",
      isMissingEvent: true,
    });
  }

  if (points.length === 0) {
    return {
      total_calories: 0,
      total_protein_g: 0,
      total_carbs_g: 0,
      total_fat_g: 0,
      total_fiber_g: 0,
      total_sugar_g: 0,
      total_caffeine_mg: 0,
      eating_events_count: 0,
      completeness,
      data_provenance_summary: "none",
    };
  }

  // Chronological sort
  points.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let totalFiber = 0;
  let totalSugar = 0;
  let totalCaffeine = 0;

  const provenanceCounts: Record<string, number> = {};

  let firstMealTime: string | undefined = points[0]?.timestamp;
  let finalMealTime: string | undefined = points[points.length - 1]?.timestamp;
  let finalCaloricTime: string | undefined = undefined;
  let finalCaffeineTime: string | undefined = undefined;

  for (const p of points) {
    totalCalories += p.calories;
    totalProtein += p.protein_g;
    totalCarbs += p.carbs_g;
    totalFat += p.fat_g;
    totalFiber += p.fiber_g;
    totalSugar += p.sugar_g;
    totalCaffeine += p.caffeine_mg;

    provenanceCounts[p.source] = (provenanceCounts[p.source] || 0) + 1;

    if (p.calories > 15 || p.isMissingEvent) {
      finalCaloricTime = p.timestamp;
    }
    if (p.caffeine_mg > 5) {
      finalCaffeineTime = p.timestamp;
    }
  }

  let mealToLightsOutMinutes: number | undefined = undefined;
  let caffeineToLightsOutMinutes: number | undefined = undefined;

  if (lightsOutTimestamp) {
    const lightsOutMs = new Date(lightsOutTimestamp).getTime();
    if (finalCaloricTime) {
      const mealMs = new Date(finalCaloricTime).getTime();
      mealToLightsOutMinutes = Math.round((lightsOutMs - mealMs) / (1000 * 60));
    }
    if (finalCaffeineTime) {
      const caffMs = new Date(finalCaffeineTime).getTime();
      caffeineToLightsOutMinutes = Math.round((lightsOutMs - caffMs) / (1000 * 60));
    }
  }

  const provenanceSummary = Object.entries(provenanceCounts)
    .map(([src, count]) => `${count} ${src}`)
    .join(", ");

  return {
    total_calories: Math.round(totalCalories),
    total_protein_g: Math.round(totalProtein * 10) / 10,
    total_carbs_g: Math.round(totalCarbs * 10) / 10,
    total_fat_g: Math.round(totalFat * 10) / 10,
    total_fiber_g: Math.round(totalFiber * 10) / 10,
    total_sugar_g: Math.round(totalSugar * 10) / 10,
    total_caffeine_mg: Math.round(totalCaffeine),
    eating_events_count: points.length,
    first_meal_time: firstMealTime,
    final_meal_time: finalMealTime,
    final_caloric_timestamp: finalCaloricTime || finalMealTime,
    meal_to_lights_out_minutes: mealToLightsOutMinutes,
    caffeine_to_lights_out_minutes: caffeineToLightsOutMinutes,
    completeness,
    data_provenance_summary: provenanceSummary,
  };
}

/**
 * Generates realistic synthetic MacroFactor raw food records for a given date.
 * Used for mock provider and offline simulation testing.
 */
export function generateMockMacroFactorFoods(targetDate: string): RawFoodRecord[] {
  const [year, month, day] = targetDate.split("-").map(Number);

  return [
    {
      id: `${targetDate}_bfast_1`,
      timestamp: new Date(year, month - 1, day, 8, 30).toISOString(),
      name: "Oatmeal with whey protein & berries",
      quantity: 1,
      unit: "bowl",
      meal_type: "breakfast",
      calories: 460,
      protein_g: 38,
      carbs_g: 58,
      fat_g: 8,
      fiber_g: 9,
      sugar_g: 12,
      caffeine_mg: 0,
      source_app: "macrofactor",
      source: "macrofactor",
      meal_size: "normal",
      categories: ["wheat_bread_pasta", "fruit", "dairy"],
    },
    {
      id: `${targetDate}_coffee_1`,
      timestamp: new Date(year, month - 1, day, 9, 0).toISOString(),
      name: "Double Espresso",
      quantity: 2,
      unit: "shots",
      meal_type: "breakfast",
      calories: 5,
      protein_g: 0.5,
      carbs_g: 1,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      caffeine_mg: 150,
      source_app: "macrofactor",
      source: "macrofactor",
      meal_size: "small",
    },
    {
      id: `${targetDate}_lunch_1`,
      timestamp: new Date(year, month - 1, day, 13, 15).toISOString(),
      name: "Grilled Chicken Breast with White Rice & Broccoli",
      quantity: 1,
      unit: "meal",
      meal_type: "lunch",
      calories: 680,
      protein_g: 54,
      carbs_g: 78,
      fat_g: 14,
      fiber_g: 6,
      sugar_g: 3,
      caffeine_mg: 0,
      source_app: "macrofactor",
      source: "macrofactor",
      meal_size: "normal",
      categories: ["cruciferous"],
    },
    {
      id: `${targetDate}_caffeine_2`,
      timestamp: new Date(year, month - 1, day, 14, 30).toISOString(),
      name: "Cold Brew Coffee",
      quantity: 1,
      unit: "cup",
      meal_type: "snack",
      calories: 5,
      protein_g: 0,
      carbs_g: 1,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      caffeine_mg: 120,
      source_app: "macrofactor",
      source: "macrofactor",
      meal_size: "small",
    },
    {
      id: `${targetDate}_dinner_1`,
      timestamp: new Date(year, month - 1, day, 19, 45).toISOString(),
      name: "Salmon Fillet, Sweet Potato & Asparagus",
      quantity: 1,
      unit: "plate",
      meal_type: "dinner",
      calories: 720,
      protein_g: 48,
      carbs_g: 52,
      fat_g: 28,
      fiber_g: 7,
      sugar_g: 9,
      caffeine_mg: 0,
      source_app: "macrofactor",
      source: "macrofactor",
      meal_size: "normal",
      categories: ["high_fat_fried"],
    },
  ];
}
