import assert from "node:assert/strict";
import test from "node:test";
import type {
    ObjectBucket,
    R2ObjectBody,
    R2ObjectMetadata,
} from "../platform/cloudflare-bindings.ts";
import {
    DEFAULT_CONTENT_TYPE,
    R2ObjectStore,
} from "../platform/object-store.ts";

class FakeObjectBucket implements ObjectBucket {
    readonly objects = new Map<string, R2ObjectBody>();

    async delete(key: string): Promise<void> {
        this.objects.delete(key);
    }

    async get(key: string): Promise<R2ObjectBody | null> {
        return this.objects.get(key) ?? null;
    }

    async put(
        key: string,
        value: ArrayBuffer,
        options: { httpMetadata: { contentType: string } }
    ): Promise<R2ObjectMetadata> {
        const body = value.slice(0);
        const object: R2ObjectBody = {
            key,
            size: body.byteLength,
            httpMetadata: options.httpMetadata,
            async arrayBuffer() {
                return body.slice(0);
            },
        };
        this.objects.set(key, object);
        return object;
    }
}

test("R2ObjectStore preserves binary bytes and HTTP metadata", async () => {
    const bucket = new FakeObjectBucket();
    const store = new R2ObjectStore(bucket);
    const bytes = Uint8Array.from([0, 255, 17, 128]).buffer;

    assert.equal(await store.put("documents/id", bytes, "image/example"), 4);
    const stored = await store.get("documents/id");
    assert.ok(stored);
    assert.deepEqual(new Uint8Array(stored.body), new Uint8Array(bytes));
    assert.equal(stored.contentType, "image/example");
    assert.equal(stored.size, 4);

    await store.delete("documents/id");
    assert.equal(await store.get("documents/id"), null);
});

test("R2ObjectStore supplies a binary default content type", async () => {
    const bucket = new FakeObjectBucket();
    bucket.objects.set("documents/id", {
        key: "documents/id",
        size: 0,
        async arrayBuffer() {
            return new ArrayBuffer(0);
        },
    });

    const stored = await new R2ObjectStore(bucket).get("documents/id");
    assert.equal(stored?.contentType, DEFAULT_CONTENT_TYPE);
});
