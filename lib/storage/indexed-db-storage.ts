import { ExperimentConfig } from "@/types/experiment";
import { PersistenceStatus, SyncMutation } from "@/types/persistence";
import { UserPreferences } from "@/types/preferences";
import { StudyState } from "@/types/study";
import { WearableProviderConfig } from "@/types/wearable";
import { buildDocumentMutation, buildStudyStateMutations, createMutationId } from "./sync-mutations";

const DATABASE_NAME = "sleep-analysis-hub";
const DATABASE_VERSION = 1;
const DOCUMENT_STORE = "documents";
const OUTBOX_STORE = "outbox";

type DocumentKey =
  | "study_config"
  | "study_state"
  | "wearable_config"
  | "user_preferences"
  | "legacy_backup"
  | "migration_info"
  | "client_identity";

interface StoredDocument<T = unknown> {
  key: DocumentKey;
  value: T;
  updated_at: string;
}

interface MigrationInfo {
  from_local_storage: boolean;
  migrated_at: string;
}

interface ClientIdentity {
  id: string;
  created_at: string;
}

export interface BrowserStorageSnapshot {
  config: ExperimentConfig;
  state: StudyState;
  wearableConfig: WearableProviderConfig;
  preferences: UserPreferences;
}

export interface BrowserStorageInitialization {
  snapshot: BrowserStorageSnapshot;
  status: PersistenceStatus;
}

let databasePromise: Promise<IDBDatabase> | undefined;
let writeQueue: Promise<void> = Promise.resolve();
let activeClientId: string | undefined;

function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction was aborted"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this browser"));
  }
  if (databasePromise) return databasePromise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
        database.createObjectStore(DOCUMENT_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = database.createObjectStore(OUTBOX_STORE, { keyPath: "outbox_key" });
        outbox.createIndex("queued_at", "queued_at");
        outbox.createIndex("status", "status");
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error("Could not open IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another open tab"));
  }).catch((error) => {
    databasePromise = undefined;
    throw error;
  });
  databasePromise = opening;
  return opening;
}

async function readDocument<T>(key: DocumentKey): Promise<StoredDocument<T> | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(DOCUMENT_STORE, "readonly");
  const completed = transactionComplete(transaction);
  const result = await requestResult(
    transaction.objectStore(DOCUMENT_STORE).get(key) as IDBRequest<StoredDocument<T> | undefined>
  );
  await completed;
  return result;
}

function putDocument<T>(store: IDBObjectStore, key: DocumentKey, value: T, updatedAt: string): void {
  store.put({ key, value, updated_at: updatedAt } satisfies StoredDocument<T>);
}

function putMutations(store: IDBObjectStore, mutations: SyncMutation[]): void {
  for (const mutation of mutations) store.put(mutation);
}

async function pendingMutationCount(database?: IDBDatabase): Promise<number> {
  const activeDatabase = database || (await openDatabase());
  const transaction = activeDatabase.transaction(OUTBOX_STORE, "readonly");
  const completed = transactionComplete(transaction);
  const count = await requestResult(transaction.objectStore(OUTBOX_STORE).count());
  await completed;
  return count;
}

async function storageEstimate(): Promise<{
  persistent?: boolean;
  usage?: number;
  quota?: number;
}> {
  if (typeof navigator === "undefined" || !navigator.storage) return {};
  const [persistent, estimate] = await Promise.all([
    navigator.storage.persisted?.().catch(() => false),
    navigator.storage.estimate?.().catch(() => undefined),
  ]);
  return {
    persistent,
    usage: estimate?.usage,
    quota: estimate?.quota,
  };
}

export async function initializeBrowserStorage(
  fallback: BrowserStorageSnapshot,
  legacyStoragePresent: boolean
): Promise<BrowserStorageInitialization> {
  return serializeWrite(async () => {
    const database = await openDatabase();
    const [storedConfig, storedState, storedWearable, storedPreferences, storedMigration, storedIdentity] = await Promise.all([
      readDocument<ExperimentConfig>("study_config"),
      readDocument<StudyState>("study_state"),
      readDocument<WearableProviderConfig>("wearable_config"),
      readDocument<UserPreferences>("user_preferences"),
      readDocument<MigrationInfo>("migration_info"),
      readDocument<ClientIdentity>("client_identity"),
    ]);

    const hasIndexedData = Boolean(storedConfig || storedState || storedWearable || storedPreferences);
    const now = new Date().toISOString();
    const clientIdentity = storedIdentity?.value || {
      id: `browser-${createMutationId()}`,
      created_at: now,
    };
    activeClientId = clientIdentity.id;
    const snapshot: BrowserStorageSnapshot = {
      config: storedConfig?.value || fallback.config,
      state: storedState?.value || fallback.state,
      wearableConfig: storedWearable?.value || fallback.wearableConfig,
      preferences: storedPreferences?.value || fallback.preferences,
    };

    if (!hasIndexedData) {
      const transaction = database.transaction([DOCUMENT_STORE, OUTBOX_STORE], "readwrite");
      const completed = transactionComplete(transaction);
      const documents = transaction.objectStore(DOCUMENT_STORE);
      const outbox = transaction.objectStore(OUTBOX_STORE);
      putDocument(documents, "study_config", snapshot.config, now);
      putDocument(documents, "study_state", snapshot.state, now);
      putDocument(documents, "wearable_config", snapshot.wearableConfig, now);
      putDocument(documents, "user_preferences", snapshot.preferences, now);
      putDocument<MigrationInfo>(documents, "migration_info", {
        from_local_storage: legacyStoragePresent,
        migrated_at: now,
      }, now);
      putDocument(documents, "client_identity", clientIdentity, now);

      if (legacyStoragePresent) {
        putDocument(documents, "legacy_backup", fallback, now);
        putMutations(outbox, [
          ...buildDocumentMutation("study_config", snapshot.config.study_id, undefined, snapshot.config, now, createMutationId, clientIdentity.id),
          ...buildDocumentMutation("user_preferences", "self", undefined, snapshot.preferences, now, createMutationId, clientIdentity.id),
          ...buildStudyStateMutations(undefined, snapshot.state, now, createMutationId, clientIdentity.id),
        ]);
      }
      await completed;
    } else {
      const missingDocuments: Array<[DocumentKey, unknown]> = [];
      if (!storedConfig) missingDocuments.push(["study_config", snapshot.config]);
      if (!storedState) missingDocuments.push(["study_state", snapshot.state]);
      if (!storedWearable) missingDocuments.push(["wearable_config", snapshot.wearableConfig]);
      if (!storedPreferences) missingDocuments.push(["user_preferences", snapshot.preferences]);
      if (!storedMigration) {
        missingDocuments.push(["migration_info", { from_local_storage: false, migrated_at: now }]);
      }
      if (!storedIdentity) missingDocuments.push(["client_identity", clientIdentity]);
      if (missingDocuments.length > 0) {
        const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
        const completed = transactionComplete(transaction);
        const documents = transaction.objectStore(DOCUMENT_STORE);
        for (const [key, value] of missingDocuments) putDocument(documents, key, value, now);
        await completed;
      }
    }

    const [pending, estimate] = await Promise.all([
      pendingMutationCount(database),
      storageEstimate(),
    ]);
    const migrationInfo = storedMigration?.value || {
      from_local_storage: !hasIndexedData && legacyStoragePresent,
      migrated_at: now,
    };

    return {
      snapshot,
      status: {
        backend: "indexeddb",
        phase: "ready",
        pending_mutations: pending,
        last_saved_at: now,
        migrated_from_local_storage: migrationInfo.from_local_storage,
        persistent_storage: estimate.persistent,
        usage_bytes: estimate.usage,
        quota_bytes: estimate.quota,
      },
    };
  });
}

async function writeDocumentWithMutations<T>(
  key: DocumentKey,
  value: T,
  mutations: SyncMutation[]
): Promise<PersistenceStatus> {
  const database = await openDatabase();
  const now = new Date().toISOString();
  const transaction = database.transaction([DOCUMENT_STORE, OUTBOX_STORE], "readwrite");
  const completed = transactionComplete(transaction);
  putDocument(transaction.objectStore(DOCUMENT_STORE), key, value, now);
  putMutations(transaction.objectStore(OUTBOX_STORE), mutations);
  await completed;
  const pending = await pendingMutationCount(database);
  const migration = await readDocument<MigrationInfo>("migration_info");
  return {
    backend: "indexeddb",
    phase: "ready",
    pending_mutations: pending,
    last_saved_at: now,
    migrated_from_local_storage: migration?.value.from_local_storage || false,
  };
}

export function persistStudyState(state: StudyState): Promise<PersistenceStatus> {
  return serializeWrite(async () => {
    const previous = await readDocument<StudyState>("study_state");
    const now = new Date().toISOString();
    return writeDocumentWithMutations(
      "study_state",
      state,
      buildStudyStateMutations(previous?.value, state, now, createMutationId, activeClientId || "local-browser")
    );
  });
}

export function persistStudyConfig(config: ExperimentConfig): Promise<PersistenceStatus> {
  return serializeWrite(async () => {
    const previous = await readDocument<ExperimentConfig>("study_config");
    const now = new Date().toISOString();
    return writeDocumentWithMutations(
      "study_config",
      config,
      buildDocumentMutation("study_config", config.study_id, previous?.value, config, now, createMutationId, activeClientId || "local-browser")
    );
  });
}

export function persistUserPreferences(preferences: UserPreferences): Promise<PersistenceStatus> {
  return serializeWrite(async () => {
    const previous = await readDocument<UserPreferences>("user_preferences");
    const now = new Date().toISOString();
    return writeDocumentWithMutations(
      "user_preferences",
      preferences,
      buildDocumentMutation("user_preferences", "self", previous?.value, preferences, now, createMutationId, activeClientId || "local-browser")
    );
  });
}

export function persistWearableConfig(config: WearableProviderConfig): Promise<PersistenceStatus> {
  // OAuth credentials deliberately never enter the hub outbox.
  return serializeWrite(() => writeDocumentWithMutations("wearable_config", config, []));
}

export async function listOutboxMutations(limit = 100): Promise<SyncMutation[]> {
  const database = await openDatabase();
  const transaction = database.transaction(OUTBOX_STORE, "readonly");
  const completed = transactionComplete(transaction);
  const values = await requestResult(transaction.objectStore(OUTBOX_STORE).getAll()) as SyncMutation[];
  await completed;
  return values
    .sort((left, right) => left.queued_at.localeCompare(right.queued_at))
    .slice(0, limit);
}

export function acknowledgeOutboxMutation(outboxKey: string, mutationId: string): Promise<boolean> {
  return serializeWrite(async () => {
    const database = await openDatabase();
    const readTransaction = database.transaction(OUTBOX_STORE, "readonly");
    const readCompleted = transactionComplete(readTransaction);
    const existing = await requestResult(readTransaction.objectStore(OUTBOX_STORE).get(outboxKey)) as SyncMutation | undefined;
    await readCompleted;
    if (!existing || existing.mutation_id !== mutationId) return false;
    const transaction = database.transaction(OUTBOX_STORE, "readwrite");
    const completed = transactionComplete(transaction);
    transaction.objectStore(OUTBOX_STORE).delete(outboxKey);
    await completed;
    return true;
  });
}

export function markOutboxMutationFailed(
  outboxKey: string,
  mutationId: string,
  error: string
): Promise<boolean> {
  return serializeWrite(async () => {
    const database = await openDatabase();
    const transaction = database.transaction(OUTBOX_STORE, "readwrite");
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(OUTBOX_STORE);
    const existing = await requestResult(store.get(outboxKey)) as SyncMutation | undefined;
    if (!existing || existing.mutation_id !== mutationId) {
      await completed;
      return false;
    }
    store.put({
      ...existing,
      status: "failed",
      attempt_count: existing.attempt_count + 1,
      last_attempt_at: new Date().toISOString(),
      last_error: error,
    } satisfies SyncMutation);
    await completed;
    return true;
  });
}
