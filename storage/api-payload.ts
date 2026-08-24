import type { StoredTextItem } from "./contracts";

export type StorageApiPayload = {
    ok?: boolean;
    entries?: StoredTextItem[];
    entry?: StoredTextItem;
    error?: string;
    key?: string;
    objects?: StoredTextItem[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseItem(value: unknown): StoredTextItem | null {
    if (!isRecord(value)) return null;
    if (
        typeof value["key"] !== "string" ||
        typeof value["size"] !== "number" ||
        !Number.isFinite(value["size"]) ||
        value["size"] < 0 ||
        typeof value["updatedAt"] !== "string" ||
        typeof value["contentType"] !== "string"
    ) {
        return null;
    }

    const item: StoredTextItem = {
        key: value["key"],
        size: value["size"],
        updatedAt: value["updatedAt"],
        contentType: value["contentType"],
    };
    if (typeof value["value"] === "string") {
        item.value = value["value"];
    }

    return item;
}

function parseItems(value: unknown): StoredTextItem[] | null {
    if (!Array.isArray(value)) return null;

    const items: StoredTextItem[] = [];
    for (const candidate of value) {
        const item = parseItem(candidate);
        if (!item) return null;
        items.push(item);
    }
    return items;
}

/** Validates the internal HTTP boundary instead of trusting a JSON assertion. */
export function parseStorageApiPayload(value: unknown): StorageApiPayload {
    if (!isRecord(value)) {
        return { error: "The server returned an unexpected response." };
    }

    const payload: StorageApiPayload = {};
    let recognizedField = false;
    if (typeof value["ok"] === "boolean") {
        payload.ok = value["ok"];
        recognizedField = true;
    }
    if (typeof value["error"] === "string") {
        payload.error = value["error"];
        recognizedField = true;
    }
    if (typeof value["key"] === "string") payload.key = value["key"];

    if ("entry" in value) {
        const entry = parseItem(value["entry"]);
        if (!entry) return { error: "The server returned an invalid entry." };
        payload.entry = entry;
        recognizedField = true;
    }

    if ("entries" in value) {
        const entries = parseItems(value["entries"]);
        if (!entries) return { error: "The server returned an invalid D1 list." };
        payload.entries = entries;
        recognizedField = true;
    }

    if ("objects" in value) {
        const objects = parseItems(value["objects"]);
        if (!objects) return { error: "The server returned an invalid R2 list." };
        payload.objects = objects;
        recognizedField = true;
    }

    return recognizedField
        ? payload
        : { error: "The server returned an unexpected response." };
}
