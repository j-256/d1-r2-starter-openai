import type {
    PutTextItem,
    StoredTextItem,
    TextStore,
} from "../contracts";
import { DEFAULT_CONTENT_TYPE } from "../contracts.ts";

export type ObjectMetadata = {
    customMetadata?: Record<string, string>;
    httpMetadata?: { contentType?: string };
    key: string;
    size: number;
    uploaded: Date;
};

export type TextObjectBody = ObjectMetadata & {
    text(): Promise<string>;
};

export interface ObjectBucket {
    delete(key: string): Promise<void>;
    get(key: string): Promise<TextObjectBody | null>;
    list(options: {
        include: Array<"customMetadata" | "httpMetadata">;
        limit: number;
    }): Promise<{ objects: ObjectMetadata[] }>;
    put(
        key: string,
        value: string,
        options: {
            customMetadata: Record<string, string>;
            httpMetadata: { contentType: string };
        }
    ): Promise<ObjectMetadata>;
}

type Clock = () => string;

function systemClock(): string {
    return new Date().toISOString();
}

function updatedAtFor(object: ObjectMetadata): string {
    return object.customMetadata?.["updatedAt"] ?? object.uploaded.toISOString();
}

function contentTypeFor(object: ObjectMetadata): string {
    return object.httpMetadata?.contentType ?? DEFAULT_CONTENT_TYPE;
}

/** Adapts an R2-compatible object bucket to the provider-neutral TextStore API. */
export class R2TextStore implements TextStore {
    private readonly bucket: ObjectBucket;
    private readonly clock: Clock;

    constructor(bucket: ObjectBucket, clock: Clock = systemClock) {
        this.bucket = bucket;
        this.clock = clock;
    }

    async delete(key: string): Promise<void> {
        await this.bucket.delete(key);
    }

    async get(key: string): Promise<StoredTextItem | null> {
        const object = await this.bucket.get(key);
        if (!object) return null;

        return {
            key: object.key,
            size: object.size,
            updatedAt: updatedAtFor(object),
            contentType: contentTypeFor(object),
            value: await object.text(),
        };
    }

    async list(limit: number): Promise<StoredTextItem[]> {
        const result = await this.bucket.list({
            include: ["customMetadata", "httpMetadata"],
            limit,
        });

        return result.objects.map((object) => ({
            key: object.key,
            size: object.size,
            updatedAt: updatedAtFor(object),
            contentType: contentTypeFor(object),
        }));
    }

    async put(item: PutTextItem): Promise<StoredTextItem> {
        const updatedAt = this.clock();
        const contentType = item.contentType ?? DEFAULT_CONTENT_TYPE;
        const object = await this.bucket.put(item.key, item.value, {
            customMetadata: { updatedAt },
            httpMetadata: { contentType },
        });

        return {
            key: item.key,
            size: object.size,
            updatedAt,
            contentType,
            value: item.value,
        };
    }
}
