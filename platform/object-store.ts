import type { ObjectBucket } from "./cloudflare-bindings.ts";

export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

export type StoredObject = {
    body: ArrayBuffer;
    contentType: string;
    size: number;
};

export interface ObjectStore {
    delete(key: string): Promise<void>;
    get(key: string): Promise<StoredObject | null>;
    put(key: string, body: ArrayBuffer, contentType: string): Promise<number>;
}

export class R2ObjectStore implements ObjectStore {
    private readonly bucket: ObjectBucket;

    constructor(bucket: ObjectBucket) {
        this.bucket = bucket;
    }

    async delete(key: string): Promise<void> {
        await this.bucket.delete(key);
    }

    async get(key: string): Promise<StoredObject | null> {
        const object = await this.bucket.get(key);
        if (!object) return null;

        return {
            body: await object.arrayBuffer(),
            contentType: object.httpMetadata?.contentType ?? DEFAULT_CONTENT_TYPE,
            size: object.size,
        };
    }

    async put(
        key: string,
        body: ArrayBuffer,
        contentType: string
    ): Promise<number> {
        const object = await this.bucket.put(key, body, {
            httpMetadata: { contentType },
        });
        if (!object) {
            throw new Error("R2 rejected the document upload.");
        }
        return object.size;
    }
}
