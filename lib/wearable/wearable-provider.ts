import { WearableSleepData, WearableProviderConfig } from "@/types/wearable";
import { RawFoodRecord } from "@/types/nutrition";

export interface WearableProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  connect(config?: WearableProviderConfig): Promise<{ success: boolean; error?: string }>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  fetchSleepData(targetDate: string): Promise<WearableSleepData | null>;
  fetchNutritionData?(targetDate: string): Promise<RawFoodRecord[]>;
}
