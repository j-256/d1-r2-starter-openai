import assert from "node:assert/strict";
import test from "node:test";
import {
    D1TextStore,
    type SqlDatabase,
    type SqlPreparedStatement,
    type SqlRunResult,
} from "../storage/adapters/d1-text-store.ts";
import {
    R2TextStore,
    type ObjectBucket,
    type ObjectMetadata,
    type TextObjectBody,
} from "../storage/adapters/r2-text-store.ts";
import { parseStorageApiPayload } from "../storage/api-payload.ts";
import type { TextStore } from "../storage/contracts.ts";

type TestRow = {
    key: string;
    size: number;
    updatedAt: string;
    contentType: string;
    value: string;
};

class FakeSqlStatement implements SqlPreparedStatement {
    private readonly database: FakeSqlDatabase;
    private readonly query: string;
    private values: unknown[] = [];

    constructor(database: FakeSqlDatabase, query: string) {
        this.database = database;
        this.query = query;
    }

    bind(...values: unknown[]): SqlPreparedStatement {
        this.values = values;
        return this;
    }

    async all(): Promise<{ results: unknown[] }> {
        const limit = this.numberAt(0);
        return {
            results: [...this.database.rows.values()]
                .sort((left, right) => (
                    right.updatedAt.localeCompare(left.updatedAt) ||
                    left.key.localeCompare(right.key)
                ))
                .slice(0, limit)
                .map((row) => ({
                    key: row.key,
                    size: row.size,
                    contentType: row.contentType,
                    updatedAt: row.updatedAt,
                })),
        };
    }

    async first(): Promise<unknown | null> {
        const row = this.database.rows.get(this.stringAt(0));
        return row ?? null;
    }

    async run(): Promise<SqlRunResult> {
        if (this.query.includes("INSERT INTO d1_values")) {
            const value = this.stringAt(1);
            const row: TestRow = {
                key: this.stringAt(0),
                size: new TextEncoder().encode(value).byteLength,
                value,
                contentType: this.stringAt(2),
                updatedAt: this.stringAt(3),
            };
            this.database.rows.set(row.key, row);
            return { meta: { changes: 1 } };
        }
        if (this.query.includes("DELETE FROM d1_values")) {
            const deleted = this.database.rows.delete(this.stringAt(0));
            return { meta: { changes: deleted ? 1 : 0 } };
        }
        throw new Error(`Unsupported test query: ${this.query}`);
    }

    private numberAt(index: number): number {
        const value = this.values[index];
        if (typeof value !== "number") throw new TypeError("Expected a number.");
        return value;
    }

    private stringAt(index: number): string {
        const value = this.values[index];
        if (typeof value !== "string") throw new TypeError("Expected a string.");
        return value;
    }
}

class FakeSqlDatabase implements SqlDatabase {
    readonly rows = new Map<string, TestRow>();

    prepare(query: string): SqlPreparedStatement {
        return new FakeSqlStatement(this, query);
    }
}

class FakeObjectBucket implements ObjectBucket {
    private readonly objects = new Map<string, TextObjectBody>();

    async delete(key: string): Promise<void> {
        this.objects.delete(key);
    }

    async get(key: string): Promise<TextObjectBody | null> {
        return this.objects.get(key) ?? null;
    }

    async list(): Promise<{ objects: ObjectMetadata[] }> {
        return { objects: [...this.objects.values()] };
    }

    async put(
        key: string,
        value: string,
        options: {
            customMetadata: Record<string, string>;
            httpMetadata: { contentType: string };
        }
    ): Promise<ObjectMetadata> {
        const metadata: ObjectMetadata = {
            customMetadata: options.customMetadata,
            httpMetadata: options.httpMetadata,
            key,
            size: new TextEncoder().encode(value).byteLength,
            uploaded: new Date("2026-01-01T00:00:00.000Z"),
        };
        this.objects.set(key, {
            ...metadata,
            async text() {
                return value;
            },
        });
        return metadata;
    }
}

async function verifyTextStore(store: TextStore): Promise<void> {
    const key = "portable:test";
    const value = "strict TypeScript";

    assert.equal(await store.get(key), null);

    const written = await store.put({ key, value });
    assert.equal(written.key, key);
    assert.equal(written.value, value);
    assert.equal(written.contentType, "text/plain; charset=utf-8");

    assert.deepEqual(await store.get(key), written);

    // Explicit contentType is preserved
    const custom = await store.put({
        key: "portable:json",
        value: "{}",
        contentType: "application/json",
    });
    assert.equal(custom.contentType, "application/json");
    assert.equal((await store.get("portable:json"))?.contentType, "application/json");

    // list() returns metadata only, never the body
    const listed = await store.list(50);
    const listedKeys = listed.map((item) => item.key).sort();
    assert.deepEqual(listedKeys, ["portable:json", "portable:test"]);
    for (const item of listed) {
        assert.equal(item.value, undefined);
        assert.equal(typeof item.contentType, "string");
    }

    // delete() is idempotent and returns void
    assert.equal(await store.delete(key), undefined);
    assert.equal(await store.get(key), null);
    assert.equal(await store.delete(key), undefined); // second delete: no throw
}

test("D1 and R2 adapters honor the same TextStore contract", async (context) => {
    const now = () => "2026-08-09T00:00:00.000Z";

    await context.test("D1", async () => {
        await verifyTextStore(new D1TextStore(new FakeSqlDatabase(), now));
    });

    await context.test("R2", async () => {
        await verifyTextStore(new R2TextStore(new FakeObjectBucket(), now));
    });
});

test("API payload parsing rejects malformed provider data", () => {
    const validEntry = {
        key: "k",
        size: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        contentType: "text/plain; charset=utf-8",
    };
    assert.deepEqual(parseStorageApiPayload({ entries: [validEntry] }), {
        entries: [validEntry],
    });
    assert.deepEqual(parseStorageApiPayload({ entries: [{ key: 1 }] }), {
        error: "The server returned an invalid D1 list.",
    });
    assert.deepEqual(parseStorageApiPayload({ ok: true, key: "k" }), {
        ok: true,
        key: "k",
    });
    assert.deepEqual(parseStorageApiPayload({}), {
        error: "The server returned an unexpected response.",
    });
});
