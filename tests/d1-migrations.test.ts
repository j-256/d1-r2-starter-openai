import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

test("D1 migrations create the document metadata schema", async () => {
    const database = new DatabaseSync(":memory:");
    const migration = await readFile(
        new URL("../drizzle/0000_create-documents.sql", import.meta.url),
        "utf8"
    );
    database.exec(migration);

    const columns = database.prepare("PRAGMA table_info(documents)").all();
    const contentTypeColumn = columns.find((column) => (
        isRecord(column) && column["name"] === "content_type"
    ));
    assert.ok(contentTypeColumn);
    assert.equal(contentTypeColumn["notnull"], 1);

    const createdAtColumn = columns.find((column) => (
        isRecord(column) && column["name"] === "created_at"
    ));
    assert.ok(createdAtColumn);
    assert.equal(
        createdAtColumn["dflt_value"],
        "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
    );

    database.prepare(
        `INSERT INTO documents (
            id, name, description, object_key, content_type, size
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).run(
        "document-id",
        "fixture.bin",
        "Binary fixture",
        "documents/document-id",
        "application/example",
        4
    );
    const row = database.prepare(
        `SELECT id, name, description, object_key AS objectKey,
                content_type AS contentType, size, created_at AS createdAt
         FROM documents WHERE id = ?1`
    ).get("document-id");
    assert.ok(isRecord(row));
    assert.equal(row["name"], "fixture.bin");
    assert.equal(row["objectKey"], "documents/document-id");
    assert.equal(row["contentType"], "application/example");
    assert.equal(row["size"], 4);

    database.prepare("DELETE FROM documents WHERE id = ?1").run("document-id");
    assert.equal(
        database.prepare("SELECT id FROM documents WHERE id = ?1").get(
            "document-id"
        ),
        undefined
    );
});
