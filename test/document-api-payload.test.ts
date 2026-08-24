import assert from "node:assert/strict";
import test from "node:test";
import { parseDocumentApiPayload } from "../features/documents/api-payload.ts";
import type { DocumentMetadata } from "../features/documents/contracts.ts";

const DOCUMENT: DocumentMetadata = {
    id: "document-id",
    name: "fixture.bin",
    description: "Binary fixture",
    contentType: "application/example",
    size: 4,
    createdAt: "2026-08-11T00:00:00.000Z",
};

test("document payload parsing validates client response data", () => {
    assert.deepEqual(parseDocumentApiPayload({ documents: [DOCUMENT] }), {
        documents: [DOCUMENT],
    });
    assert.deepEqual(parseDocumentApiPayload({ document: DOCUMENT }), {
        document: DOCUMENT,
    });
    assert.deepEqual(parseDocumentApiPayload({ id: DOCUMENT.id, ok: true }), {
        id: DOCUMENT.id,
        ok: true,
    });
    assert.deepEqual(parseDocumentApiPayload({ documents: [{ id: 1 }] }), {
        error: "The server returned an invalid document list.",
    });
    assert.deepEqual(
        parseDocumentApiPayload({
            document: { ...DOCUMENT, size: Number.POSITIVE_INFINITY },
        }),
        { error: "The server returned an invalid document." }
    );
    assert.deepEqual(parseDocumentApiPayload(null), {
        error: "The server returned an unexpected response.",
    });
    assert.deepEqual(parseDocumentApiPayload({}), {
        error: "The server returned an unexpected response.",
    });
});
