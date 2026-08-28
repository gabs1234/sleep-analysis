export type FoodLogCompleteness = "yes" | "mostly" | "no";

export type MealSize = "small" | "normal" | "large";

export type NutritionSource =
  | "macrofactor"
  | "health_connect"
  | "manual_exact"
  | "manual_approximate"
  | "derived";

export type GIExposureCategory =
  | "dairy"
  | "wheat_bread_pasta"
  | "legumes"
  | "onion_garlic"
  | "fruit"
  | "cruciferous"
  | "high_fat_fried"
  | "sugary_food"
  | "sugar_alcohols"
  | "carbonated_drink"
  | "alcohol"
  | "other"
  | "unsure";

export interface MissingEatingEvent {
  id: string;
  timestamp: string; // ISO timestamp
  time_is_approximate?: boolean;
  meal_size: MealSize;
  categories: GIExposureCategory[];
  rough_calories?: number;
  note?: string;
  source: NutritionSource;
}

export interface DailyNutritionFallback {
  completed_at: string; // ISO timestamp
  intake_relative_to_intent?: number; // 0: Much less, 1: Less, 2: About right, 3: More, 4: Much more
  eating_out_of_control?: number; // 0: No, 1: Somewhat, 2: Yes
  final_caloric_timestamp?: string; // ISO timestamp
  final_meal_unusually_large?: boolean; // false: No, true: Yes
  notable_exposures?: GIExposureCategory[];
  source: "manual_approximate";
}

export interface RawFoodRecord {
  id: string;
  timestamp: string; // ISO timestamp
  name: string;
  quantity?: number;
  unit?: string;
  meal_type?: "breakfast" | "lunch" | "dinner" | "snack" | "other" | string;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sugar_g?: number;
  caffeine_mg?: number;
  micronutrients?: Record<string, number>;
  source_app?: string;
  source?: NutritionSource;
  meal_size?: MealSize;
  categories?: GIExposureCategory[];
  raw?: Record<string, unknown>;
}

export interface DerivedNutritionSummary {
  total_calories: number;
  target_calories?: number;
  calorie_deviation?: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  total_fiber_g: number;
  total_sugar_g: number;
  total_caffeine_mg: number;
  eating_events_count: number;
  first_meal_time?: string; // ISO
  final_meal_time?: string; // ISO
  final_caloric_timestamp?: string; // ISO
  meal_to_lights_out_minutes?: number;
  caffeine_to_lights_out_minutes?: number;
  completeness?: FoodLogCompleteness;
  data_provenance_summary?: string; // e.g. "3 macrofactor, 1 manual_approximate"
}

export interface DayNutritionLog {
  completeness: FoodLogCompleteness;
  raw_food_records: RawFoodRecord[];
  missing_eating_events?: MissingEatingEvent[];
  nutrition_fallback?: DailyNutritionFallback;
  derived_summary?: DerivedNutritionSummary;
  eating_out_of_control?: number; // 0: No, 1: Somewhat, 2: Yes
}
