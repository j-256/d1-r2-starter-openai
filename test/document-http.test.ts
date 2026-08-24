import assert from "node:assert/strict";
import test from "node:test";
import {
    documentCollectionHandlers,
    documentItemHandlers,
} from "../features/documents/http.ts";
import type {
    CreateDocumentInput,
    DocumentDownload,
    DocumentMetadata,
    DocumentService,
} from "../features/documents/contracts.ts";
import type { Authorizer } from "../platform/authorizer.ts";
import { runWithAppContext } from "../app-context.ts";

const DOCUMENT: DocumentMetadata = {
    id: "document-id",
    name: "résumé.bin",
    description: "Binary fixture",
    contentType: "application/example",
    size: 4,
    createdAt: "2026-08-11T00:00:00.000Z",
};

class RecordingDocumentService implements DocumentService {
    readonly calls: string[] = [];
    createInput: CreateDocumentInput | null = null;

    async create(input: CreateDocumentInput): Promise<DocumentMetadata> {
        this.calls.push("create");
        this.createInput = input;
        return DOCUMENT;
    }

    async delete(id: string): Promise<void> {
        this.calls.push(`delete:${id}`);
    }

    async download(id: string): Promise<DocumentDownload> {
        this.calls.push(`download:${id}`);
        return {
            body: Uint8Array.from([0, 255, 17, 128]).buffer,
            document: DOCUMENT,
        };
    }

    async list(query: string): Promise<DocumentMetadata[]> {
        this.calls.push(`list:${query}`);
        return [DOCUMENT];
    }
}

const allow: Authorizer = {
    async authorize() {
        return { ok: true };
    },
};
const deny: Authorizer = {
    async authorize() {
        return { ok: false, status: 401, error: "Not authorized." };
    },
};

function inContext<T>(
    documents: DocumentService,
    authorizer: Authorizer,
    callback: () => T
): T {
    return runWithAppContext(
        { authorizer, services: { documents } },
        callback
    );
}

test("authorization denies a document request before feature access", async () => {
    const documents = new RecordingDocumentService();
    const response = await inContext(documents, deny, () => (
        documentCollectionHandlers.post(
            new Request("http://localhost/api/documents", {
                body: "not multipart",
                method: "POST",
            })
        )
    ));

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Not authorized." });
    assert.deepEqual(documents.calls, []);
});

test("document collection uploads binary multipart content", async () => {
    const documents = new RecordingDocumentService();
    const form = new FormData();
    form.set(
        "file",
        new File([Uint8Array.from([0, 255, 17, 128])], "fixture.bin", {
            type: "application/example",
        })
    );
    form.set("description", " Binary fixture ");
    const response = await inContext(documents, allow, () => (
        documentCollectionHandlers.post(
            new Request("http://localhost/api/documents", {
                body: form,
                method: "POST",
            })
        )
    ));

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { document: DOCUMENT });
    assert.equal(documents.createInput?.name, "fixture.bin");
    assert.equal(documents.createInput?.description, "Binary fixture");
    assert.deepEqual(
        new Uint8Array(documents.createInput?.body ?? new ArrayBuffer(0)),
        Uint8Array.from([0, 255, 17, 128])
    );
});

test("document collection lists a bounded search", async () => {
    const documents = new RecordingDocumentService();
    const response = await inContext(documents, allow, () => (
        documentCollectionHandlers.get(
            new Request("http://localhost/api/documents?q=fixture")
        )
    ));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { documents: [DOCUMENT] });
    assert.deepEqual(documents.calls, ["list:fixture"]);
});

test("document item returns binary content with safe download headers", async () => {
    const documents = new RecordingDocumentService();
    const response = await inContext(documents, allow, () => (
        documentItemHandlers.get(
            new Request("http://localhost/api/documents/document-id"),
            "document-id"
        )
    ));

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/example");
    assert.equal(response.headers.get("content-length"), "4");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(
        response.headers.get("content-disposition") ?? "",
        /^attachment; filename="r_sum_.bin"; filename\*=UTF-8''/
    );
    assert.deepEqual(
        new Uint8Array(await response.arrayBuffer()),
        Uint8Array.from([0, 255, 17, 128])
    );
});

test("document deletion has a stable idempotent response", async () => {
    const documents = new RecordingDocumentService();
    const response = await inContext(documents, allow, () => (
        documentItemHandlers.delete(
            new Request("http://localhost/api/documents/document-id", {
                method: "DELETE",
            }),
            "document-id"
        )
    ));

    assert.deepEqual(await response.json(), { id: "document-id", ok: true });
    assert.deepEqual(documents.calls, ["delete:document-id"]);
});
