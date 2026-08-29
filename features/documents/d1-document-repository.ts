import type { SqlDatabase } from "../../platform/cloudflare-bindings.ts";
import type { DocumentRecord, DocumentRepository } from "./contracts.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDocumentRow(value: unknown): DocumentRecord {
    if (
        !isRecord(value) ||
        typeof value["id"] !== "string" ||
        typeof value["name"] !== "string" ||
        (value["description"] !== null &&
            typeof value["description"] !== "string") ||
        typeof value["objectKey"] !== "string" ||
        typeof value["contentType"] !== "string" ||
        typeof value["size"] !== "number" ||
        !Number.isFinite(value["size"]) ||
        value["size"] < 0 ||
        typeof value["createdAt"] !== "string"
    ) {
        throw new Error("D1 returned an invalid documents row.");
    }

    return {
        id: value["id"],
        name: value["name"],
        description: value["description"],
        objectKey: value["objectKey"],
        contentType: value["contentType"],
        size: value["size"],
        createdAt: value["createdAt"],
    };
}

function escapeLike(value: string): string {
    return value
        .replaceAll("!", "!!")
        .replaceAll("%", "!%")
        .replaceAll("_", "!_");
}

const SELECT_COLUMNS = `
    SELECT id, name, description, object_key AS objectKey,
           content_type AS contentType, size, created_at AS createdAt
    FROM documents`;

export class D1DocumentRepository implements DocumentRepository {
    private readonly database: SqlDatabase;

    constructor(database: SqlDatabase) {
        this.database = database;
    }

    async delete(id: string): Promise<void> {
        await this.database
            .prepare("DELETE FROM documents WHERE id = ?1")
            .bind(id)
            .run();
    }

    async find(id: string): Promise<DocumentRecord | null> {
        const row = await this.database
            .prepare(`${SELECT_COLUMNS} WHERE id = ?1 LIMIT 1`)
            .bind(id)
            .first();
        return row === null ? null : parseDocumentRow(row);
    }

    async insert(document: DocumentRecord): Promise<void> {
        await this.database
            .prepare(
                `INSERT INTO documents (
                    id, name, description, object_key,
                    content_type, size, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
            )
            .bind(
                document.id,
                document.name,
                document.description,
                document.objectKey,
                document.contentType,
                document.size,
                document.createdAt
            )
            .run();
    }

    async list(query: string, limit: number): Promise<DocumentRecord[]> {
        const statement = query
            ? this.database
                .prepare(
                    `${SELECT_COLUMNS}
                     WHERE name LIKE ?1 ESCAPE '!'
                        OR description LIKE ?1 ESCAPE '!'
                     ORDER BY created_at DESC, id ASC
                     LIMIT ?2`
                )
                .bind(`%${escapeLike(query)}%`, limit)
            : this.database
                .prepare(
                    `${SELECT_COLUMNS}
                     ORDER BY created_at DESC, id ASC
                     LIMIT ?1`
                )
                .bind(limit);
        const result = await statement.all();
        return result.results.map(parseDocumentRow);
    }
}
