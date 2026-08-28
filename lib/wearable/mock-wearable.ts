import { WearableSleepData, WearableProviderConfig } from "../../types/wearable";
import { RawFoodRecord } from "../../types/nutrition";
import { generateMockMacroFactorFoods } from "../nutrition/nutrition-service";
import { WearableProvider } from "./wearable-provider";

/**
 * Mock Wearable Provider
 * Silently generates realistic physiological sleep metrics and nutrition data
 * for local testing and offline operation.
 */
export class MockWearableProvider implements WearableProvider {
  readonly id = "mock";
  readonly name = "Smartwatch & Nutrition Simulator (Mock)";
  readonly description = "Generates silent realistic wearable sleep, HRV, steps, and MacroFactor nutrition streams";
  private connected = true;

  async connect(config?: WearableProviderConfig): Promise<{ success: boolean; error?: string }> {
    if (config) {
      // Configuration accepted
    }
    this.connected = true;
    return { success: true };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async fetchNutritionData(targetDate: string): Promise<RawFoodRecord[]> {
    if (!this.connected) return [];
    return generateMockMacroFactorFoods(targetDate);
  }

  async fetchSleepData(targetDate: string): Promise<WearableSleepData | null> {
    if (!this.connected) return null;

    // Deterministic pseudo-random seed based on date
    const hash = targetDate
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);

    const durationMinutes = 400 + (hash % 80); // 400 - 480 mins (~6.6 - 8 hrs)
    const awakeMinutes = 20 + (hash % 30); // 20 - 50 mins
    const efficiency = Math.round(((durationMinutes - awakeMinutes) / durationMinutes) * 1000) / 10;
    const restingHr = 50 + (hash % 14); // 50 - 64 bpm
    const avgHr = restingHr + 6 + (hash % 5);
    const hrvRmssd = 38 + (hash % 35); // 38 - 73 ms
    const respRate = Math.round((13.5 + ((hash % 20) / 10)) * 10) / 10; // 13.5 - 15.5
    const steps = 6500 + (hash % 6000);

    const [year, month, day] = targetDate.split("-").map(Number);
    const onsetDate = new Date(year, month - 1, day, 23, 15 + (hash % 25));
    const wakeDate = new Date(year, month - 1, day + 1, 7, 5 + (hash % 30));

    return {
      provider: "mock",
      synced_at: new Date().toISOString(),
      sleep_onset: onsetDate.toISOString(),
      final_awakening: wakeDate.toISOString(),
      duration_minutes: durationMinutes,
      time_in_bed_minutes: durationMinutes + awakeMinutes,
      awake_minutes: awakeMinutes,
      waso_minutes: awakeMinutes,
      awakenings_count: 2 + (hash % 3),
      sleep_efficiency_pct: efficiency,
      resting_hr: restingHr,
      avg_hr: avgHr,
      hrv_rmssd: hrvRmssd,
      respiratory_rate: respRate,
      spo2_avg: 96 + (hash % 3),
      steps,
      active_minutes: 35 + (hash % 45),
      stages: {
        deep_minutes: Math.round(durationMinutes * 0.18),
        rem_minutes: Math.round(durationMinutes * 0.22),
        light_minutes: Math.round(durationMinutes * 0.52),
        wake_minutes: awakeMinutes,
      },
      sync_status: "synced",
      raw: {
        device: "Simulated Wearable Sensor",
        battery_level: 88,
        firmware_version: "2.4.1",
      },
    };
  }
}
