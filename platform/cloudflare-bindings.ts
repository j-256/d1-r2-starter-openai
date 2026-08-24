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

export type R2HttpMetadata = {
    contentType?: string;
};

export type R2ObjectMetadata = {
    httpMetadata?: R2HttpMetadata;
    key: string;
    size: number;
};

export type R2ObjectBody = R2ObjectMetadata & {
    arrayBuffer(): Promise<ArrayBuffer>;
};

export interface ObjectBucket {
    delete(key: string): Promise<void>;
    get(key: string): Promise<R2ObjectBody | null>;
    put(
        key: string,
        value: ArrayBuffer,
        options: { httpMetadata: { contentType: string } }
    ): Promise<R2ObjectMetadata | null>;
}

export type RuntimeBindings = {
    BUCKET: ObjectBucket;
    DB: SqlDatabase;
};
