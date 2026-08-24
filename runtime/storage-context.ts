import { AsyncLocalStorage } from "node:async_hooks";
import type { Authorizer } from "../storage/authorizer";
import type {
    StorageKind,
    StorageServices,
    TextStore,
} from "../storage/contracts";

export type RequestContext = {
    authorizer: Authorizer;
    services: StorageServices;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Keeps Worker bindings and the authorizer request-scoped while leaving
 * application code unaware of Cloudflare's environment object.
 */
export function runWithRequestContext<T>(
    context: RequestContext,
    callback: () => T
): T {
    return requestContext.run(context, callback);
}

function currentContext(): RequestContext {
    const context = requestContext.getStore();
    if (!context) {
        throw new Error("Request context is unavailable for this request.");
    }
    return context;
}

export function getStorageService(kind: StorageKind): TextStore {
    return currentContext().services[kind];
}

export function getAuthorizer(): Authorizer {
    return currentContext().authorizer;
}
