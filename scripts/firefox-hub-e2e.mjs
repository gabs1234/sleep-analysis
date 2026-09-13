import { writeFile } from "node:fs/promises";

const mode = process.argv[2];
const bidiUrl = process.env.PWA_BIDI_URL || "ws://127.0.0.1:9222/session";
const appUrl = process.env.PWA_URL;
const capturedRequestPath = process.env.PWA_CAPTURED_REQUEST || "/tmp/pwa-test-browser-request.json";

if (!mode || !["queue-offline", "verify-retry", "queue-batch", "verify-replay"].includes(mode)) {
  throw new Error("Usage: node scripts/firefox-hub-e2e.mjs <queue-offline|verify-retry|queue-batch|verify-replay>");
}
if (!appUrl) {
  throw new Error("PWA_URL must be set to the private PWA origin");
}

class BidiClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!("id" in message)) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.type === "success") pending.resolve(message.result);
      else pending.reject(new Error(`${message.error}: ${message.message}`));
    });
    await this.send("session.new", { capabilities: {} });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

function remoteValue(result) {
  const value = result?.result;
  if (value?.type === "string" || value?.type === "number" || value?.type === "boolean") return value.value;
  if (value?.type === "null") return null;
  return value;
}

async function evaluate(client, context, expression) {
  const result = await client.send("script.evaluate", {
    expression,
    target: { context },
    awaitPromise: true,
    resultOwnership: "none",
    userActivation: true,
  });
  if (result.realm && result.type === "exception") {
    throw new Error(result.exceptionDetails?.text || "Browser evaluation failed");
  }
  return remoteValue(result);
}

async function waitFor(client, context, expression, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(client, context, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

const outboxCountExpression = `new Promise((resolve, reject) => {
  const request = indexedDB.open("sleep-analysis-hub");
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction("outbox", "readonly");
    const count = tx.objectStore("outbox").count();
    count.onsuccess = () => resolve(count.result);
    count.onerror = () => reject(count.error);
  };
})`;

const client = new BidiClient(bidiUrl);
await client.open();
try {
  const tree = await client.send("browsingContext.getTree", {});
  const context = tree.contexts[0].context;

  if (mode === "queue-offline") {
    await client.send("script.addPreloadScript", {
      contexts: [context],
      functionDeclaration: `() => {
        const realFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = (input, init) => String(input).includes("/api/v1/mutations")
          ? Promise.reject(new TypeError("pwa-test simulated API outage"))
          : realFetch(input, init);
      }`,
    });
    await client.send("browsingContext.navigate", { context, url: appUrl, wait: "complete" });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    console.log(JSON.stringify({ browser_body_preview: await evaluate(client, context, `document.body.innerText.slice(0, 300)`) }));
    await waitFor(client, context, `document.body.innerText.includes("GI SYMPTOM TRACKING")`);
    await evaluate(client, context, `(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent.includes("+ Bowel movement"));
      if (!button) throw new Error("Bowel movement button not found");
      button.click();
      return true;
    })()`);
    await waitFor(client, context, `document.body.innerText.includes("BRISTOL STOOL FORM SCALE")`);
    await evaluate(client, context, `(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent.includes("Type 4:"));
      if (!button) throw new Error("Bristol Type 4 button not found");
      button.click();
      return true;
    })()`);
    await waitFor(client, context, `document.body.innerText.includes("Save Bowel Movement Log")`);
    await evaluate(client, context, `(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent.includes("Save Bowel Movement Log"));
      if (!button) throw new Error("Save bowel movement button not found");
      button.click();
      return true;
    })()`);
    await waitFor(client, context, `(${outboxCountExpression}).then((count) => count > 0)`);

    const captured = await evaluate(client, context, `(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("sleep-analysis-hub");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const mutations = await new Promise((resolve, reject) => {
        const tx = db.transaction("outbox", "readonly");
        const request = tx.objectStore("outbox").getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const original = mutations.find((item) => item.entity_type === "night_record" && item.payload?.bowel_movements?.length);
      if (!original) throw new Error("Bowel mutation not found in IndexedDB");
      const testId = "pwa-test-browser-bowel-reload";
      const updated = structuredClone(original);
      updated.mutation_id = testId;
      updated.client_id = "pwa-test-firefox";
      updated.entity_id = "pwa-test-night-browser-bowel-reload";
      updated.outbox_key = "night_record:pwa-test-night-browser-bowel-reload";
      updated.payload.synthetic_test_id = testId;
      updated.payload.bowel_movements[updated.payload.bowel_movements.length - 1].id = "pwa-test-bowel-browser-reload";
      await new Promise((resolve, reject) => {
        const tx = db.transaction("outbox", "readwrite");
        const store = tx.objectStore("outbox");
        store.delete(original.outbox_key);
        store.put(updated);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      const { status, attempt_count, last_attempt_at, last_error, ...stable } = updated;
      void status; void attempt_count; void last_attempt_at; void last_error;
      return JSON.stringify({ mutations: [{ ...stable, created_at: updated.occurred_at }] });
    })()`);
    await writeFile(capturedRequestPath, captured);

    await client.send("browsingContext.reload", { context, wait: "complete" });
    await waitFor(client, context, `document.body.innerText.includes("GI SYMPTOM TRACKING")`);
    const afterReload = await evaluate(client, context, outboxCountExpression);
    if (afterReload < 1) throw new Error("Pending outbox entry did not survive PWA reload");
    console.log(JSON.stringify({ mode, pending_after_reload: afterReload, captured_request: capturedRequestPath }));
  }

  if (mode === "verify-retry") {
    await client.send("browsingContext.navigate", { context, url: appUrl, wait: "complete" });
    await waitFor(client, context, `document.body.innerText.includes("GI SYMPTOM TRACKING")`);
    await waitFor(client, context, `(${outboxCountExpression}).then((count) => count === 0)`);
    console.log(JSON.stringify({ mode, outbox_after_acknowledgement: 0 }));
  }

  if (mode === "queue-batch") {
    await client.send("browsingContext.navigate", { context, url: appUrl, wait: "complete" });
    await waitFor(client, context, `document.body.innerText.includes("GI SYMPTOM TRACKING")`);
    await evaluate(client, context, `(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("sleep-analysis-hub");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const now = new Date().toISOString();
      const make = (suffix) => ({
        schema_version: 1,
        mutation_id: "pwa-test-browser-batch-" + suffix,
        client_id: "pwa-test-firefox",
        outbox_key: "night_record:pwa-test-browser-batch-" + suffix,
        entity_type: "night_record",
        entity_id: "pwa-test-browser-batch-" + suffix,
        operation: "upsert",
        payload: { id: "pwa-test-browser-batch-" + suffix, bowel_movements: [{ id: "pwa-test-bowel-batch-" + suffix, bristol_type: 4 }] },
        occurred_at: now,
        queued_at: now,
        status: "pending",
        attempt_count: 0,
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("outbox", "readwrite");
        tx.objectStore("outbox").put(make("one"));
        tx.objectStore("outbox").put(make("two"));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      return true;
    })()`);
    await client.send("browsingContext.reload", { context, wait: "complete" });
    await waitFor(client, context, `document.body.innerText.includes("GI SYMPTOM TRACKING")`);
    await waitFor(client, context, `(${outboxCountExpression}).then((count) => count === 0)`);
    console.log(JSON.stringify({ mode, queued: 2, outbox_after_acknowledgement: 0 }));
  }

  if (mode === "verify-replay") {
    await client.send("browsingContext.navigate", { context, url: appUrl, wait: "complete" });
    const replay = await evaluate(client, context, `(async () => {
      let cursor = 0;
      const ids = [];
      let hasMore = true;
      while (hasMore) {
        const response = await fetch("/api/v1/changes?cursor=" + cursor + "&limit=100");
        if (!response.ok) throw new Error("changes replay failed: " + response.status);
        const page = await response.json();
        ids.push(...page.changes.map((change) => change.mutation.mutation_id));
        cursor = page.next_cursor;
        hasMore = page.has_more;
      }
      return JSON.stringify({ cursor, ids: ids.filter((id) => id.startsWith("pwa-test-")) });
    })()`);
    const parsed = JSON.parse(replay);
    const required = ["pwa-test-browser-bowel-reload", "pwa-test-browser-batch-one", "pwa-test-browser-batch-two"];
    if (!required.every((id) => parsed.ids.includes(id))) throw new Error("Fresh-browser replay did not contain all test mutations");
    console.log(JSON.stringify({ mode, next_cursor: parsed.cursor, replayed_test_ids: parsed.ids }));
  }
} finally {
  await client.send("session.end", {}).catch(() => undefined);
  client.close();
}
