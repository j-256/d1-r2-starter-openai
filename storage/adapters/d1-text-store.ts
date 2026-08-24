import type {
    PutTextItem,
    StoredTextItem,
    TextStore,
} from "../contracts";
import { DEFAULT_CONTENT_TYPE } from "../contracts.ts";

export type SqlRunResult = {
    meta: {
        changes: number;
    };
};

export interface SqlPreparedStatement {
    all(): Promise<{ results: unknown[] }>;
    bind(...values: unknown[]): SqlPreparedStatement;
    first(): Promise<unknown | null>;
    run(): Promise<SqlRunResult>;
}

export interface SqlDatabase {
    prepare(query: string): SqlPreparedStatement;
}

type Clock = () => string;

function systemClock(): string {
    return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseValueRow(value: unknown, includeValue: boolean): StoredTextItem {
    if (
        !isRecord(value) ||
        typeof value["key"] !== "string" ||
        typeof value["size"] !== "number" ||
        !Number.isFinite(value["size"]) ||
        value["size"] < 0 ||
        typeof value["updatedAt"] !== "string" ||
        typeof value["contentType"] !== "string" ||
        (includeValue && typeof value["value"] !== "string")
    ) {
        throw new Error("D1 returned an invalid d1_values row.");
    }

    const item: StoredTextItem = {
        key: value["key"],
        size: value["size"],
        updatedAt: value["updatedAt"],
        contentType: value["contentType"],
    };
    if (includeValue) {
        item.value = value["value"] as string;
    }
    return item;
}

/** Adapts a D1-compatible SQLite binding to the provider-neutral TextStore API. */
export class D1TextStore implements TextStore {
    private readonly clock: Clock;
    private readonly database: SqlDatabase;

    constructor(database: SqlDatabase, clock: Clock = systemClock) {
        this.database = database;
        this.clock = clock;
    }

    async delete(key: string): Promise<void> {
        await this.database
            .prepare("DELETE FROM d1_values WHERE key = ?1")
            .bind(key)
            .run();
    }

    async get(key: string): Promise<StoredTextItem | null> {
        const row = await this.database
            .prepare(
                `SELECT key, value, length(CAST(value AS BLOB)) AS size,
                        content_type AS contentType,
                        updated_at AS updatedAt
                 FROM d1_values
                 WHERE key = ?1`
            )
            .bind(key)
            .first();
        return row === null ? null : parseValueRow(row, true);
    }

    async list(limit: number): Promise<StoredTextItem[]> {
        const result = await this.database
            .prepare(
                `SELECT key, length(CAST(value AS BLOB)) AS size,
                        content_type AS contentType,
                        updated_at AS updatedAt
                 FROM d1_values
                 ORDER BY updated_at DESC, key ASC
                 LIMIT ?1`
            )
            .bind(limit)
            .all();
        return result.results.map((row) => parseValueRow(row, false));
    }

    async put(item: PutTextItem): Promise<StoredTextItem> {
        const updatedAt = this.clock();
        const contentType = item.contentType ?? DEFAULT_CONTENT_TYPE;
        await this.database
            .prepare(
                `INSERT INTO d1_values (key, value, content_type, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(key) DO UPDATE SET
                     value = excluded.value,
                     content_type = excluded.content_type,
                     updated_at = excluded.updated_at`
            )
            .bind(item.key, item.value, contentType, updatedAt)
            .run();

        return {
            key: item.key,
            size: new TextEncoder().encode(item.value).byteLength,
            updatedAt,
            contentType,
            value: item.value,
        };
    }
}
