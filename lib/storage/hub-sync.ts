import { SyncMutation } from "@/types/persistence";
import {
  acknowledgeOutboxMutation,
  listOutboxMutations,
  markOutboxMutationFailed,
} from "./indexed-db-storage";

const MUTATIONS_ENDPOINT = "/api/v1/mutations";
const FLUSH_LOCK_NAME = "sleep-analysis-hub-outbox-flush";

export interface HubMutationRequest extends Omit<SyncMutation, "status" | "attempt_count" | "last_attempt_at" | "last_error"> {
  created_at: string;
}

export interface HubAcknowledgement {
  mutation_id: string;
  status: "accepted" | "duplicate";
  cursor: number;
  server_received_at: string;
}

export interface HubMutationResponse {
  acknowledgements: HubAcknowledgement[];
}

export interface HubFlushResult {
  attempted: number;
  acknowledged: number;
  remaining: number;
  outcome: "idle" | "synced" | "offline" | "error";
  error?: string;
}

interface HubFlushStorage {
  list(limit?: number): Promise<SyncMutation[]>;
  acknowledge(outboxKey: string, mutationId: string): Promise<boolean>;
  fail(outboxKey: string, mutationId: string, error: string): Promise<boolean>;
}

export interface HubFlushOptions {
  fetcher?: typeof fetch;
  storage?: HubFlushStorage;
  isOnline?: () => boolean;
  endpoint?: string;
  batchSize?: number;
  timeoutMs?: number;
  useBrowserLock?: boolean;
}

const defaultStorage: HubFlushStorage = {
  list: listOutboxMutations,
  acknowledge: acknowledgeOutboxMutation,
  fail: markOutboxMutationFailed,
};

let activeFlush: Promise<HubFlushResult> | undefined;

export function toHubMutation(mutation: SyncMutation): HubMutationRequest {
  const {
    status: _status,
    attempt_count: _attemptCount,
    last_attempt_at: _lastAttemptAt,
    last_error: _lastError,
    ...stableMutation
  } = mutation;
  void _status;
  void _attemptCount;
  void _lastAttemptAt;
  void _lastError;
  return {
    ...stableMutation,
    created_at: mutation.occurred_at,
  };
}

function isAcknowledgement(value: unknown): value is HubAcknowledgement {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<HubAcknowledgement>;
  return (
    typeof item.mutation_id === "string" &&
    (item.status === "accepted" || item.status === "duplicate") &&
    typeof item.cursor === "number" &&
    typeof item.server_received_at === "string"
  );
}

export async function postMutationBatch(
  mutations: SyncMutation[],
  fetcher: typeof fetch = fetch,
  endpoint = MUTATIONS_ENDPOINT,
  timeoutMs = 15_000
): Promise<HubMutationResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mutations: mutations.map(toHubMutation) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Hub rejected sync (${response.status})${detail ? `: ${detail}` : ""}`);
    }
    const body = await response.json() as Partial<HubMutationResponse>;
    if (!Array.isArray(body.acknowledgements) || !body.acknowledgements.every(isAcknowledgement)) {
      throw new Error("Hub returned an invalid acknowledgement payload");
    }
    return { acknowledgements: body.acknowledgements };
  } finally {
    clearTimeout(timeout);
  }
}

async function flushOnce(options: HubFlushOptions): Promise<HubFlushResult> {
  const storage = options.storage || defaultStorage;
  const batchSize = options.batchSize || 100;
  const queued = await storage.list(batchSize);
  if (queued.length === 0) {
    return { attempted: 0, acknowledged: 0, remaining: 0, outcome: "idle" };
  }
  const isOnline = options.isOnline || (() => typeof navigator === "undefined" || navigator.onLine !== false);
  if (!isOnline()) {
    return { attempted: 0, acknowledged: 0, remaining: queued.length, outcome: "offline" };
  }

  try {
    const response = await postMutationBatch(
      queued,
      options.fetcher,
      options.endpoint,
      options.timeoutMs
    );
    const acknowledgedIds = new Set(
      response.acknowledgements
        .filter((ack) => ack.status === "accepted" || ack.status === "duplicate")
        .map((ack) => ack.mutation_id)
    );
    let acknowledged = 0;
    for (const mutation of queued) {
      if (acknowledgedIds.has(mutation.mutation_id)) {
        if (await storage.acknowledge(mutation.outbox_key, mutation.mutation_id)) acknowledged++;
      } else {
        await storage.fail(
          mutation.outbox_key,
          mutation.mutation_id,
          "Hub response did not acknowledge this mutation"
        );
      }
    }
    return {
      attempted: queued.length,
      acknowledged,
      remaining: (await storage.list()).length,
      outcome: "synced",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hub sync failed";
    for (const mutation of queued) {
      await storage.fail(mutation.outbox_key, mutation.mutation_id, message);
    }
    return {
      attempted: queued.length,
      acknowledged: 0,
      remaining: (await storage.list()).length,
      outcome: "error",
      error: message,
    };
  }
}

async function withBrowserLock(
  operation: () => Promise<HubFlushResult>,
  enabled: boolean
): Promise<HubFlushResult> {
  if (!enabled || typeof navigator === "undefined" || !("locks" in navigator)) {
    return operation();
  }
  return navigator.locks.request(FLUSH_LOCK_NAME, { mode: "exclusive" }, operation);
}

/**
 * Flushes at most one batch. Concurrent calls share one in-tab promise and the
 * Web Locks API serializes cooperating tabs. Exact-revision acknowledgement in
 * IndexedDB prevents an older response from deleting a newer coalesced value.
 */
export function flushHubOutbox(options: HubFlushOptions = {}): Promise<HubFlushResult> {
  if (activeFlush) return activeFlush;
  activeFlush = withBrowserLock(
    () => flushOnce(options),
    options.useBrowserLock !== false
  ).finally(() => {
    activeFlush = undefined;
  });
  return activeFlush;
}
