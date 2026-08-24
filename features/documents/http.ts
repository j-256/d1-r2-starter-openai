import { getAppContext } from "../../app-context.ts";
import { DEFAULT_CONTENT_TYPE } from "../../platform/object-store.ts";
import { DOCUMENT_LIMITS } from "./contracts.ts";
import {
    DocumentContentMissingError,
    DocumentNotFoundError,
} from "./document-service.ts";

type ValidationResult<T> =
    | { ok: true; value: T }
    | { error: string; ok: false; status: number };

function json(payload: unknown, init?: ResponseInit): Response {
    const headers = new Headers(init?.headers);
    headers.set("cache-control", "no-store");
    return Response.json(payload, { ...init, headers });
}

async function guard(request: Request): Promise<Response | null> {
    const result = await getAppContext().authorizer.authorize(request);
    return result.ok
        ? null
        : json({ error: result.error }, { status: result.status });
}

function validateId(value: string): ValidationResult<string> {
    const id = value.trim();
    if (!id) {
        return { error: "A document id is required.", ok: false, status: 400 };
    }
    if (id.length > DOCUMENT_LIMITS.idCharacters) {
        return { error: "The document id is too long.", ok: false, status: 400 };
    }
    return { ok: true, value: id };
}

function validateQuery(value: string | null): ValidationResult<string> {
    const query = value?.trim() ?? "";
    if (query.length > DOCUMENT_LIMITS.queryCharacters) {
        return { error: "The search query is too long.", ok: false, status: 400 };
    }
    return { ok: true, value: query };
}

type FormField = File | string;

function isFile(value: FormField | null): value is File {
    return value !== null && typeof value !== "string";
}

function validateDescription(
    value: FormField | null
): ValidationResult<string | null> {
    if (value === null) return { ok: true, value: null };
    if (typeof value !== "string") {
        return {
            error: "The description must be text.",
            ok: false,
            status: 400,
        };
    }
    const description = value.trim();
    if (description.length > DOCUMENT_LIMITS.descriptionCharacters) {
        return { error: "The description is too long.", ok: false, status: 400 };
    }
    return { ok: true, value: description || null };
}

function validateFile(value: FormField | null): ValidationResult<File> {
    if (!isFile(value)) {
        return { error: "Choose a file to upload.", ok: false, status: 400 };
    }
    const name = value.name.trim();
    if (!name) {
        return { error: "The file must have a name.", ok: false, status: 400 };
    }
    if (name.length > DOCUMENT_LIMITS.nameCharacters) {
        return { error: "The filename is too long.", ok: false, status: 400 };
    }
    if (value.size > DOCUMENT_LIMITS.fileBytes) {
        return {
            error: `Files may be at most ${DOCUMENT_LIMITS.fileBytes.toLocaleString()} bytes.`,
            ok: false,
            status: 413,
        };
    }
    const contentType = value.type.trim();
    if (contentType.length > DOCUMENT_LIMITS.contentTypeCharacters) {
        return { error: "The content type is too long.", ok: false, status: 400 };
    }
    return { ok: true, value };
}

function errorResponse(error: unknown): Response {
    if (error instanceof DocumentNotFoundError) {
        return json({ error: error.message }, { status: 404 });
    }
    if (error instanceof DocumentContentMissingError) {
        console.error("Document content is missing", error);
        return json(
            { error: "The document content is unavailable." },
            { status: 500 }
        );
    }
    console.error("Document request failed", error);
    return json(
        { error: "The document operation could not be completed." },
        { status: 500 }
    );
}

function contentDisposition(name: string): string {
    const fallback = name
        .replace(/[^A-Za-z0-9._-]+/g, "_")
        .replace(/^\.+/, "") || "document";
    const encoded = encodeURIComponent(name).replace(
        /['()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const documentCollectionHandlers = {
    async get(request: Request): Promise<Response> {
        try {
            const denied = await guard(request);
            if (denied) return denied;

            const query = validateQuery(
                new URL(request.url).searchParams.get("q")
            );
            if (!query.ok) {
                return json({ error: query.error }, { status: query.status });
            }

            const documents = await getAppContext().services.documents.list(
                query.value
            );
            return json({ documents });
        } catch (error) {
            return errorResponse(error);
        }
    },

    async post(request: Request): Promise<Response> {
        try {
            const denied = await guard(request);
            if (denied) return denied;

            let formData: FormData;
            try {
                formData = await request.formData();
            } catch {
                return json(
                    { error: "The request must contain multipart form data." },
                    { status: 400 }
                );
            }

            const file = validateFile(formData.get("file"));
            if (!file.ok) {
                return json({ error: file.error }, { status: file.status });
            }
            const description = validateDescription(formData.get("description"));
            if (!description.ok) {
                return json(
                    { error: description.error },
                    { status: description.status }
                );
            }

            const document = await getAppContext().services.documents.create({
                body: await file.value.arrayBuffer(),
                contentType: file.value.type.trim() || DEFAULT_CONTENT_TYPE,
                description: description.value,
                name: file.value.name.trim(),
            });
            return json({ document }, { status: 201 });
        } catch (error) {
            return errorResponse(error);
        }
    },
};

export const documentItemHandlers = {
    async delete(request: Request, rawId: string): Promise<Response> {
        try {
            const denied = await guard(request);
            if (denied) return denied;

            const id = validateId(rawId);
            if (!id.ok) {
                return json({ error: id.error }, { status: id.status });
            }
            await getAppContext().services.documents.delete(id.value);
            return json({ id: id.value, ok: true });
        } catch (error) {
            return errorResponse(error);
        }
    },

    async get(request: Request, rawId: string): Promise<Response> {
        try {
            const denied = await guard(request);
            if (denied) return denied;

            const id = validateId(rawId);
            if (!id.ok) {
                return json({ error: id.error }, { status: id.status });
            }
            const download = await getAppContext().services.documents.download(
                id.value
            );
            return new Response(download.body, {
                headers: {
                    "cache-control": "no-store",
                    "content-disposition": contentDisposition(
                        download.document.name
                    ),
                    "content-length": String(download.body.byteLength),
                    "content-type": download.document.contentType,
                    "x-content-type-options": "nosniff",
                },
            });
        } catch (error) {
            return errorResponse(error);
        }
    },
};
