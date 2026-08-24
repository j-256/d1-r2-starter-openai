import assert from "node:assert/strict";
import test from "node:test";
import { createTextStoreRoute } from "../routes/text-store-route.ts";
import { runWithRequestContext } from "../runtime/storage-context.ts";
import type { Authorizer } from "../storage/authorizer.ts";
import type {
    PutTextItem,
    StoredTextItem,
    StorageServices,
    TextStore,
} from "../storage/contracts.ts";

class RecordingStore implements TextStore {
    calls: string[] = [];
    async delete(key: string): Promise<void> {
        this.calls.push(`delete:${key}`);
    }
    async get(key: string): Promise<StoredTextItem | null> {
        this.calls.push(`get:${key}`);
        return null;
    }
    async list(): Promise<StoredTextItem[]> {
        this.calls.push("list");
        return [];
    }
    async put(item: PutTextItem): Promise<StoredTextItem> {
        this.calls.push(`put:${item.key}`);
        return {
            key: item.key,
            size: 0,
            updatedAt: "2026-01-01T00:00:00.000Z",
            contentType: "text/plain; charset=utf-8",
        };
    }
}

function servicesWith(store: TextStore): StorageServices {
    return { d1: store, r2: store };
}

const allow: Authorizer = { async authorize() { return { ok: true }; } };
const deny: Authorizer = {
    async authorize() {
        return { ok: false, status: 401, error: "Not authorized." };
    },
};

test("denied request never touches storage", async () => {
    const store = new RecordingStore();
    const route = createTextStoreRoute("d1");
    const response = await runWithRequestContext(
        { authorizer: deny, services: servicesWith(store) },
        () => route.get(new Request("http://localhost/api/d1"))
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Not authorized." });
    assert.deepEqual(store.calls, []);
});

test("allowed request reaches storage", async () => {
    const store = new RecordingStore();
    const route = createTextStoreRoute("d1");
    const response = await runWithRequestContext(
        { authorizer: allow, services: servicesWith(store) },
        () => route.get(new Request("http://localhost/api/d1"))
    );
    assert.equal(response.status, 200);
    assert.deepEqual(store.calls, ["list"]);
});

test("allowed delete returns ok and calls storage once", async () => {
    const store = new RecordingStore();
    const route = createTextStoreRoute("d1");
    const response = await runWithRequestContext(
        { authorizer: allow, services: servicesWith(store) },
        () => route.delete(new Request("http://localhost/api/d1?key=abc"))
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, key: "abc" });
    assert.deepEqual(store.calls, ["delete:abc"]);
});
