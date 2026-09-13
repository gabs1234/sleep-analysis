import {
  flushHubOutbox,
  postMutationBatch,
  toHubMutation,
} from "../lib/storage/hub-sync";
import { SyncMutation } from "../types/persistence";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mutation(id: string, outboxKey = `night_record:pwa-test-study:${id}`): SyncMutation {
  return {
    schema_version: 1,
    client_id: "pwa-test-browser",
    outbox_key: outboxKey,
    mutation_id: id,
    entity_type: "night_record",
    entity_id: `pwa-test-study:${id}`,
    operation: "upsert",
    payload: { id: `pwa-test-record-${id}`, bowel_movements: [{ id: `pwa-test-bowel-${id}` }] },
    occurred_at: "2026-09-13T16:00:00.000Z",
    queued_at: "2026-09-13T16:00:01.000Z",
    status: "failed",
    attempt_count: 7,
    last_attempt_at: "2026-09-13T16:01:00.000Z",
    last_error: "prior network failure",
  };
}

class MemoryOutbox {
  entries = new Map<string, SyncMutation>();
  failures: string[] = [];

  constructor(mutations: SyncMutation[]) {
    for (const item of mutations) this.entries.set(item.outbox_key, item);
  }

  async list(limit = 100): Promise<SyncMutation[]> {
    return [...this.entries.values()].slice(0, limit);
  }

  async acknowledge(outboxKey: string, mutationId: string): Promise<boolean> {
    const current = this.entries.get(outboxKey);
    if (current?.mutation_id !== mutationId) return false;
    this.entries.delete(outboxKey);
    return true;
  }

  async fail(outboxKey: string, mutationId: string, error: string): Promise<boolean> {
    const current = this.entries.get(outboxKey);
    if (current?.mutation_id !== mutationId) return false;
    this.failures.push(`${mutationId}:${error}`);
    return true;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

console.log("==================================================");
console.log("  TESTING PWA ↔ DATA HUB SYNC CONTRACT");
console.log("==================================================");

const stable = toHubMutation(mutation("pwa-test-shape"));
assert(stable.created_at === stable.occurred_at, "Transport must map occurred_at to created_at");
assert(!("status" in stable), "Volatile outbox status must not affect duplicate hashing");
assert(!("attempt_count" in stable), "Retry count must not affect duplicate hashing");

let postedUrl = "";
let postedBody: { mutations: Array<Record<string, unknown>> } | undefined;
const shapeFetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
  postedUrl = String(input);
  postedBody = JSON.parse(String(init?.body));
  return jsonResponse({
    acknowledgements: [{
      mutation_id: "pwa-test-shape",
      status: "accepted",
      cursor: 1,
      server_received_at: "2026-09-13T16:00:02Z",
    }],
  });
}) as typeof fetch;
await postMutationBatch([mutation("pwa-test-shape")], shapeFetcher);
assert(postedUrl === "/api/v1/mutations", "The PWA must use the same-origin relative endpoint");
assert(postedBody?.mutations[0].created_at === stable.occurred_at, "Server request requires created_at");

const pair = [mutation("pwa-test-batch-1"), mutation("pwa-test-batch-2")];
const pairStorage = new MemoryOutbox(pair);
const pairFetcher = (async () => jsonResponse({
  acknowledgements: [
    { mutation_id: pair[0].mutation_id, status: "accepted", cursor: 2, server_received_at: "2026-09-13T16:00:02Z" },
    { mutation_id: pair[1].mutation_id, status: "duplicate", cursor: 3, server_received_at: "2026-09-13T16:00:02Z" },
  ],
})) as typeof fetch;
const pairResult = await flushHubOutbox({ storage: pairStorage, fetcher: pairFetcher, useBrowserLock: false });
assert(pairResult.acknowledged === 2 && pairStorage.entries.size === 0, "Accepted and duplicate acknowledgements must clear exact outbox revisions");

const missingAck = mutation("pwa-test-unacknowledged");
const missingStorage = new MemoryOutbox([missingAck]);
await flushHubOutbox({
  storage: missingStorage,
  fetcher: (async () => jsonResponse({ acknowledgements: [] })) as typeof fetch,
  useBrowserLock: false,
});
assert(missingStorage.entries.size === 1, "An unacknowledged mutation must remain queued");
assert(missingStorage.failures.length === 1, "An unacknowledged mutation must be marked for retry");

const unavailable = mutation("pwa-test-api-unavailable");
const unavailableStorage = new MemoryOutbox([unavailable]);
const unavailableResult = await flushHubOutbox({
  storage: unavailableStorage,
  fetcher: (async () => { throw new Error("service unavailable"); }) as typeof fetch,
  useBrowserLock: false,
});
assert(unavailableResult.outcome === "error", "Network failure must be reported");
assert(unavailableStorage.entries.size === 1, "Network failure must preserve the queued mutation");

const offlineStorage = new MemoryOutbox([mutation("pwa-test-offline")]);
const offlineResult = await flushHubOutbox({
  storage: offlineStorage,
  isOnline: () => false,
  useBrowserLock: false,
});
assert(offlineResult.outcome === "offline" && offlineStorage.entries.size === 1, "Offline mode must not consume the outbox");

const concurrentMutation = mutation("pwa-test-concurrent");
const concurrentStorage = new MemoryOutbox([concurrentMutation]);
let fetchCount = 0;
const delayedFetcher = (async () => {
  fetchCount++;
  await new Promise((resolve) => setTimeout(resolve, 20));
  return jsonResponse({
    acknowledgements: [{ mutation_id: concurrentMutation.mutation_id, status: "accepted", cursor: 4, server_received_at: "2026-09-13T16:00:02Z" }],
  });
}) as typeof fetch;
await Promise.all([
  flushHubOutbox({ storage: concurrentStorage, fetcher: delayedFetcher, useBrowserLock: false }),
  flushHubOutbox({ storage: concurrentStorage, fetcher: delayedFetcher, useBrowserLock: false }),
]);
assert(fetchCount === 1, "Concurrent in-tab flushes must share one request");

const oldRevision = mutation("pwa-test-old-revision", "night_record:pwa-test-study:shared");
const revisionStorage = new MemoryOutbox([oldRevision]);
const revisionFetcher = (async () => {
  revisionStorage.entries.set(oldRevision.outbox_key, mutation("pwa-test-new-revision", oldRevision.outbox_key));
  return jsonResponse({
    acknowledgements: [{ mutation_id: oldRevision.mutation_id, status: "accepted", cursor: 5, server_received_at: "2026-09-13T16:00:02Z" }],
  });
}) as typeof fetch;
await flushHubOutbox({ storage: revisionStorage, fetcher: revisionFetcher, useBrowserLock: false });
assert(revisionStorage.entries.get(oldRevision.outbox_key)?.mutation_id === "pwa-test-new-revision", "An old acknowledgement must not delete a newer coalesced revision");

console.log("✓ Same-origin request mapping matches the FastAPI contract.");
console.log("✓ Accepted/duplicate-only acknowledgement and exact-revision deletion passed.");
console.log("✓ Offline, unavailable, unacknowledged, concurrent, and coalesced-revision cases passed.");
