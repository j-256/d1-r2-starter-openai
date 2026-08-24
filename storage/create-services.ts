import { D1TextStore, type SqlDatabase } from "./adapters/d1-text-store";
import { R2TextStore, type ObjectBucket } from "./adapters/r2-text-store";
import type { StorageServices } from "./contracts";

export type RuntimeStorageBindings = {
    BUCKET: ObjectBucket;
    DB: SqlDatabase;
};

/** The composition seam for replacing either platform storage implementation. */
export function createStorageServices(
    bindings: RuntimeStorageBindings
): StorageServices {
    return {
        d1: new D1TextStore(bindings.DB),
        r2: new R2TextStore(bindings.BUCKET),
    };
}
