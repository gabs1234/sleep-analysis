import { ExperimentConfig } from "@/types/experiment";
import { UserPreferences } from "@/types/preferences";
import { SyncEntityType, SyncMutation, SyncOperation } from "@/types/persistence";
import { StudyState } from "@/types/study";

type MutationIdFactory = () => string;

export function createMutationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createMutation(
  entityType: SyncEntityType,
  entityId: string,
  operation: SyncOperation,
  payload: unknown,
  occurredAt: string,
  queuedAt: string,
  idFactory: MutationIdFactory,
  clientId: string
): SyncMutation {
  return {
    schema_version: 1,
    client_id: clientId,
    outbox_key: `${entityType}:${entityId}`,
    mutation_id: idFactory(),
    entity_type: entityType,
    entity_id: entityId,
    operation,
    payload,
    occurred_at: occurredAt,
    queued_at: queuedAt,
    status: "pending",
    attempt_count: 0,
  };
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function studyMetadata(state: StudyState): Omit<StudyState, "records" | "last_active_at"> {
  const { records: _records, last_active_at: _lastActiveAt, ...metadata } = state;
  void _records;
  void _lastActiveAt;
  return metadata;
}

export function buildStudyStateMutations(
  previous: StudyState | undefined,
  next: StudyState,
  queuedAt: string,
  idFactory: MutationIdFactory = createMutationId,
  clientId = "local-browser"
): SyncMutation[] {
  const mutations: SyncMutation[] = [];
  const sameStudy = previous?.study_id === next.study_id;
  const previousRecords = new Map((sameStudy ? previous?.records || [] : []).map((record) => [record.date, record]));
  const nextRecords = new Map(next.records.map((record) => [record.date, record]));

  for (const record of next.records) {
    const prior = previousRecords.get(record.date);
    if (!prior || !equal(prior, record)) {
      mutations.push(
        createMutation(
          "night_record",
          `${next.study_id}:${record.date}`,
          "upsert",
          record,
          record.updated_at,
          queuedAt,
          idFactory,
          clientId
        )
      );
    }
  }

  for (const record of previous?.records || []) {
    if (!sameStudy || !nextRecords.has(record.date)) {
      mutations.push(
        createMutation(
          "night_record",
          `${previous?.study_id || next.study_id}:${record.date}`,
          "delete",
          { date: record.date },
          next.last_active_at,
          queuedAt,
          idFactory,
          clientId
        )
      );
    }
  }

  const previousMetadata = previous ? studyMetadata(previous) : undefined;
  const nextMetadata = studyMetadata(next);
  if (!previousMetadata || !equal(previousMetadata, nextMetadata)) {
    mutations.push(
      createMutation(
        "study",
        next.study_id,
        "upsert",
        nextMetadata,
        next.last_active_at,
        queuedAt,
        idFactory,
        clientId
      )
    );
  }

  return mutations;
}

export function buildDocumentMutation(
  entityType: "study_config" | "user_preferences",
  entityId: string,
  previous: ExperimentConfig | UserPreferences | undefined,
  next: ExperimentConfig | UserPreferences,
  queuedAt: string,
  idFactory: MutationIdFactory = createMutationId,
  clientId = "local-browser"
): SyncMutation[] {
  if (previous && equal(previous, next)) return [];
  return [
    createMutation(
      entityType,
      entityId,
      "upsert",
      next,
      queuedAt,
      queuedAt,
      idFactory,
      clientId
    ),
  ];
}
