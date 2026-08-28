export type BloatingSeverity = 0 | 1 | 2 | 3; // 0: None, 1: Mild, 2: Noticeable, 3: Strong

export interface BloatingEvent {
  id: string;
  timestamp: string; // ISO timestamp
  severity: BloatingSeverity;
  note?: string;
}

export type BristolStoolType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type BowelUrgency = 0 | 1 | 2; // 0: None, 1: Some, 2: Strong

export interface BowelMovementEvent {
  id: string;
  timestamp: string; // ISO timestamp
  bristol_type: BristolStoolType;
  urgency: BowelUrgency;
  complete_evacuation: boolean;
  note?: string;
}

export interface GISymptomDayLog {
  bloating_events: BloatingEvent[];
  bowel_movements: BowelMovementEvent[];
}
