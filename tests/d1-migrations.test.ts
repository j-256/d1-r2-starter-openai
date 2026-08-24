import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

test("D1 migrations evolve the schema and add the minimal demo row", async () => {
    const database = new DatabaseSync(":memory:");
    const initialMigration = await readFile(
        new URL("../drizzle/0000_complex_thena.sql", import.meta.url),
        "utf8"
    );
    const demoMigration = await readFile(
        new URL("../drizzle/0001_add-content-type-demo.sql", import.meta.url),
        "utf8"
    );

    database.exec(initialMigration);
    database.exec(demoMigration);

    const columns = database.prepare("PRAGMA table_info(d1_values)").all();
    const contentTypeColumn = columns.find((column) => (
        isRecord(column) && column["name"] === "content_type"
    ));
    assert.ok(contentTypeColumn);
    assert.equal(contentTypeColumn["notnull"], 1);
    assert.equal(
        contentTypeColumn["dflt_value"],
        "'text/plain; charset=utf-8'"
    );

    const updatedAtColumn = columns.find((column) => (
        isRecord(column) && column["name"] === "updated_at"
    ));
    assert.ok(updatedAtColumn);
    assert.equal(
        updatedAtColumn["dflt_value"],
        "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
    );

    const row = database
        .prepare(
            `SELECT key, value, content_type AS contentType,
                    updated_at AS updatedAt
             FROM d1_values
             WHERE key = ?1`
        )
        .get("demo:migration");
    assert.ok(isRecord(row));
    assert.equal(row["key"], "demo:migration");
    assert.equal(
        row["value"],
        "Inserted by migration 0001 after content_type was added."
    );
    assert.equal(row["contentType"], "text/plain; charset=utf-8");
    assert.equal(row["updatedAt"], "2026-01-01T00:00:00.000Z");
});
