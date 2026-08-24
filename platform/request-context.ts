import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContextAccessor<TContext> = {
    get(): TContext;
    run<TResult>(context: TContext, callback: () => TResult): TResult;
};

export function createRequestContext<TContext>(): RequestContextAccessor<TContext> {
    const storage = new AsyncLocalStorage<TContext>();
    return {
        get(): TContext {
            const context = storage.getStore();
            if (!context) {
                throw new Error("Request context is unavailable for this request.");
            }
            return context;
        },
        run<TResult>(context: TContext, callback: () => TResult): TResult {
            return storage.run(context, callback);
        },
    };
}
