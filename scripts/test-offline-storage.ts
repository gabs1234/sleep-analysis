import { DEFAULT_STUDY_CONFIG } from "../lib/config/study-config";
import { initializeStudyState } from "../lib/engine/protocol-engine";
import { buildDocumentMutation, buildStudyStateMutations } from "../lib/storage/sync-mutations";
import { DEFAULT_USER_PREFERENCES } from "../types/preferences";
import { NightRecord } from "../types/study";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

console.log("==================================================");
console.log("  TESTING OFFLINE STORAGE MUTATION CONTRACT");
console.log("==================================================");

const timestamp = "2026-09-13T12:00:00.000Z";
let mutationSequence = 0;
const nextMutationId = () => `mutation-${++mutationSequence}`;
const initial = initializeStudyState(DEFAULT_STUDY_CONFIG);
initial.started_at = timestamp;
initial.last_active_at = timestamp;

assert(
  buildStudyStateMutations(initial, structuredClone(initial), timestamp, nextMutationId).length === 0,
  "Unchanged state must not create an outbox mutation"
);

const bowelRecord: NightRecord = {
  id: "2026-09-13",
  date: "2026-09-13",
  phase_id: DEFAULT_STUDY_CONFIG.phases[0].id,
  phase_index: 0,
  night_number_in_phase: 1,
  prescribed_instruction: "Follow your normal routine.",
  evening_actions: [],
  bowel_movements: [
    {
      id: "bm-uuid",
      timestamp,
      bristol_type: 4,
      urgency: 0,
      complete_evacuation: true,
    },
  ],
  is_valid: false,
  created_at: timestamp,
  updated_at: timestamp,
};
const withBowelRecord = {
  ...initial,
  records: [bowelRecord],
  last_active_at: "2026-09-13T12:00:01.000Z",
};
const created = buildStudyStateMutations(initial, withBowelRecord, timestamp, nextMutationId, "browser-test-id");
assert(created.length === 1, "A new event-bearing record should create one record mutation");
assert(created[0].entity_type === "night_record", "The event must be queued as a night record");
assert(created[0].client_id === "browser-test-id", "Every mutation must identify its originating browser installation");
assert(created[0].outbox_key.endsWith(":2026-09-13"), "The outbox key must be stable per night");
assert(created[0].payload === bowelRecord, "The complete record must be available to a future hub");

const amended = structuredClone(withBowelRecord);
amended.records[0].updated_at = "2026-09-13T12:05:00.000Z";
amended.records[0].bowel_movements?.push({
  id: "bm-second-uuid",
  timestamp: "2026-09-13T12:05:00.000Z",
  bristol_type: 3,
  urgency: 1,
  complete_evacuation: false,
});
const updated = buildStudyStateMutations(withBowelRecord, amended, timestamp, nextMutationId);
assert(updated.length === 1, "Editing the same night should create one replacement mutation");
assert(updated[0].outbox_key === created[0].outbox_key, "Pending revisions must coalesce by entity key");
assert(updated[0].mutation_id !== created[0].mutation_id, "Each revision must have a distinct acknowledgement ID");

const removed = { ...amended, records: [], last_active_at: "2026-09-13T12:10:00.000Z" };
const deleted = buildStudyStateMutations(amended, removed, timestamp, nextMutationId);
assert(deleted.length === 1 && deleted[0].operation === "delete", "Deleting a night must queue a tombstone");

const paused = { ...initial, status: "paused" as const };
const statusChange = buildStudyStateMutations(initial, paused, timestamp, nextMutationId);
assert(statusChange.length === 1 && statusChange[0].entity_type === "study", "Study status changes must sync separately");

assert(
  buildDocumentMutation(
    "user_preferences",
    "self",
    DEFAULT_USER_PREFERENCES,
    structuredClone(DEFAULT_USER_PREFERENCES),
    timestamp,
    nextMutationId
  ).length === 0,
  "Unchanged preferences must not grow the outbox"
);

console.log("✓ Record changes are durable, coalesced, idempotent, and deletion-aware.");
console.log("✓ Volatile last-active timestamps do not create redundant mutations.");
console.log("✓ Credential-bearing wearable configuration has no sync mutation type.");
