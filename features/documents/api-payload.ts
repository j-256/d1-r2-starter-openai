import type { DocumentMetadata } from "./contracts.ts";

export type DocumentApiPayload = {
    document?: DocumentMetadata;
    documents?: DocumentMetadata[];
    error?: string;
    id?: string;
    ok?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDocument(value: unknown): DocumentMetadata | null {
    if (
        !isRecord(value) ||
        typeof value["id"] !== "string" ||
        typeof value["name"] !== "string" ||
        (value["description"] !== null &&
            typeof value["description"] !== "string") ||
        typeof value["contentType"] !== "string" ||
        typeof value["size"] !== "number" ||
        !Number.isFinite(value["size"]) ||
        value["size"] < 0 ||
        typeof value["createdAt"] !== "string"
    ) {
        return null;
    }
    return {
        id: value["id"],
        name: value["name"],
        description: value["description"],
        contentType: value["contentType"],
        size: value["size"],
        createdAt: value["createdAt"],
    };
}

function parseDocuments(value: unknown): DocumentMetadata[] | null {
    if (!Array.isArray(value)) return null;
    const documents: DocumentMetadata[] = [];
    for (const candidate of value) {
        const document = parseDocument(candidate);
        if (!document) return null;
        documents.push(document);
    }
    return documents;
}

export function parseDocumentApiPayload(value: unknown): DocumentApiPayload {
    if (!isRecord(value)) {
        return { error: "The server returned an unexpected response." };
    }

    const payload: DocumentApiPayload = {};
    let recognized = false;
    if (typeof value["error"] === "string") {
        payload.error = value["error"];
        recognized = true;
    }
    if (typeof value["id"] === "string") {
        payload.id = value["id"];
        recognized = true;
    }
    if (typeof value["ok"] === "boolean") {
        payload.ok = value["ok"];
        recognized = true;
    }
    if ("document" in value) {
        const document = parseDocument(value["document"]);
        if (!document) {
            return { error: "The server returned an invalid document." };
        }
        payload.document = document;
        recognized = true;
    }
    if ("documents" in value) {
        const documents = parseDocuments(value["documents"]);
        if (!documents) {
            return { error: "The server returned an invalid document list." };
        }
        payload.documents = documents;
        recognized = true;
    }

    return recognized
        ? payload
        : { error: "The server returned an unexpected response." };
}
