export type PersistenceBackend = "indexeddb" | "localstorage";
export type PersistencePhase = "loading" | "ready" | "saving" | "error";

export type SyncEntityType =
  | "study"
  | "night_record"
  | "study_config"
  | "user_preferences";

export type SyncOperation = "upsert" | "delete";
export type SyncMutationStatus = "pending" | "syncing" | "failed";

/**
 * Transport-neutral mutation kept until a future hub acknowledges it.
 * `outbox_key` coalesces unsent revisions of the same entity, while
 * `mutation_id` lets the server acknowledge the exact revision it received.
 */
export interface SyncMutation {
  schema_version: 1;
  client_id: string;
  outbox_key: string;
  mutation_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperation;
  payload?: unknown;
  occurred_at: string;
  queued_at: string;
  status: SyncMutationStatus;
  attempt_count: number;
  last_attempt_at?: string;
  last_error?: string;
}

export interface PersistenceStatus {
  backend: PersistenceBackend;
  phase: PersistencePhase;
  pending_mutations: number;
  last_saved_at?: string;
  migrated_from_local_storage: boolean;
  persistent_storage?: boolean;
  usage_bytes?: number;
  quota_bytes?: number;
  error?: string;
}
