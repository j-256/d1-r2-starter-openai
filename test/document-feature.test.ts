import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { D1DocumentRepository } from "../features/documents/d1-document-repository.ts";
import {
    DefaultDocumentService,
    DocumentContentMissingError,
} from "../features/documents/document-service.ts";
import type {
    CreateDocumentInput,
    DocumentRecord,
    DocumentRepository,
} from "../features/documents/contracts.ts";
import type {
    ObjectStore,
    StoredObject,
} from "../platform/object-store.ts";
import { TestSqlDatabase } from "./test-sql-database.ts";

const NOW = "2026-08-11T00:00:00.000Z";
const ID = "00000000-0000-4000-8000-000000000001";

class MemoryRepository implements DocumentRepository {
    readonly documents = new Map<string, DocumentRecord>();
    readonly events: string[];
    failDelete = false;
    failInsert = false;

    constructor(events: string[] = []) {
        this.events = events;
    }

    async delete(id: string): Promise<void> {
        this.events.push("repository:delete");
        if (this.failDelete) {
            this.failDelete = false;
            throw new Error("delete failed");
        }
        this.documents.delete(id);
    }

    async find(id: string): Promise<DocumentRecord | null> {
        this.events.push("repository:find");
        return this.documents.get(id) ?? null;
    }

    async insert(document: DocumentRecord): Promise<void> {
        this.events.push("repository:insert");
        if (this.failInsert) throw new Error("insert failed");
        this.documents.set(document.id, document);
    }

    async list(query: string, limit: number): Promise<DocumentRecord[]> {
        this.events.push("repository:list");
        return [...this.documents.values()]
            .filter((document) => document.name.includes(query))
            .slice(0, limit);
    }
}

class MemoryObjectStore implements ObjectStore {
    readonly events: string[];
    readonly objects = new Map<string, StoredObject>();

    constructor(events: string[] = []) {
        this.events = events;
    }

    async delete(key: string): Promise<void> {
        this.events.push("objects:delete");
        this.objects.delete(key);
    }

    async get(key: string): Promise<StoredObject | null> {
        this.events.push("objects:get");
        return this.objects.get(key) ?? null;
    }

    async put(
        key: string,
        body: ArrayBuffer,
        contentType: string
    ): Promise<number> {
        this.events.push("objects:put");
        this.objects.set(key, {
            body: body.slice(0),
            contentType,
            size: body.byteLength,
        });
        return body.byteLength;
    }
}

function input(): CreateDocumentInput {
    return {
        body: Uint8Array.from([0, 255, 1]).buffer,
        contentType: "application/example",
        description: "Binary fixture",
        name: "fixture.bin",
    };
}

function service(
    repository: MemoryRepository,
    objects: MemoryObjectStore
): DefaultDocumentService {
    return new DefaultDocumentService({
        clock: () => NOW,
        idGenerator: () => ID,
        objects,
        repository,
    });
}

test("document service coordinates D1 metadata and binary object content", async () => {
    const repository = new MemoryRepository();
    const objects = new MemoryObjectStore();
    const documents = service(repository, objects);

    const created = await documents.create(input());
    assert.deepEqual(created, {
        id: ID,
        name: "fixture.bin",
        description: "Binary fixture",
        contentType: "application/example",
        size: 3,
        createdAt: NOW,
    });
    assert.equal(repository.documents.get(ID)?.objectKey, `documents/${ID}`);

    const download = await documents.download(ID);
    assert.deepEqual(new Uint8Array(download.body), Uint8Array.from([0, 255, 1]));
    assert.deepEqual(download.document, created);
    assert.deepEqual(await documents.list("fixture"), [created]);
});

test("document service removes an R2 object when its D1 insert fails", async () => {
    const repository = new MemoryRepository();
    repository.failInsert = true;
    const objects = new MemoryObjectStore();

    await assert.rejects(service(repository, objects).create(input()), /insert failed/);
    assert.equal(objects.objects.has(`documents/${ID}`), false);
    assert.deepEqual(objects.events, ["objects:put", "objects:delete"]);
});

test("document deletion removes R2 before D1 and remains idempotent", async () => {
    const events: string[] = [];
    const repository = new MemoryRepository(events);
    const objects = new MemoryObjectStore(events);
    const documents = service(repository, objects);
    await documents.create(input());

    events.length = 0;
    await documents.delete(ID);
    assert.deepEqual(events, [
        "repository:find",
        "objects:delete",
        "repository:delete",
    ]);

    events.length = 0;
    await documents.delete(ID);
    assert.deepEqual(events, ["repository:find"]);
});

test("document deletion can finish after a D1 failure", async () => {
    const events: string[] = [];
    const repository = new MemoryRepository(events);
    const objects = new MemoryObjectStore(events);
    const documents = service(repository, objects);
    await documents.create(input());

    events.length = 0;
    repository.failDelete = true;
    await assert.rejects(documents.delete(ID), /delete failed/);
    assert.equal(objects.objects.has(`documents/${ID}`), false);
    assert.equal(repository.documents.has(ID), true);

    events.length = 0;
    await documents.delete(ID);
    assert.deepEqual(events, [
        "repository:find",
        "objects:delete",
        "repository:delete",
    ]);
    assert.equal(repository.documents.has(ID), false);
});

test("document download reports metadata without an R2 object", async () => {
    const repository = new MemoryRepository();
    repository.documents.set(ID, {
        id: ID,
        name: "missing.bin",
        description: null,
        objectKey: `documents/${ID}`,
        contentType: "application/octet-stream",
        size: 1,
        createdAt: NOW,
    });

    await assert.rejects(
        service(repository, new MemoryObjectStore()).download(ID),
        DocumentContentMissingError
    );
});

test("D1 repository stores typed metadata and escapes filename search", async () => {
    const database = new TestSqlDatabase();
    const migration = await readFile(
        new URL("../drizzle/0000_create-documents.sql", import.meta.url),
        "utf8"
    );
    database.native.exec(migration);
    const repository = new D1DocumentRepository(database);
    const newer: DocumentRecord = {
        id: "newer",
        name: "100% complete.bin",
        description: null,
        objectKey: "documents/newer",
        contentType: "application/octet-stream",
        size: 4,
        createdAt: "2026-08-11T01:00:00.000Z",
    };
    const older: DocumentRecord = {
        id: "older",
        name: "100x complete.bin",
        description: "comparison",
        objectKey: "documents/older",
        contentType: "application/octet-stream",
        size: 5,
        createdAt: "2026-08-11T00:00:00.000Z",
    };
    const records = [newer, older];
    await repository.insert(older);
    await repository.insert(newer);

    assert.deepEqual(await repository.list("", 50), records);
    assert.deepEqual(await repository.list("%", 50), [newer]);
    assert.deepEqual(await repository.find("older"), older);
    await repository.delete("older");
    assert.equal(await repository.find("older"), null);
});
