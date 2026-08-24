import type { AppServices } from "./app-services.ts";
import type { Authorizer } from "./platform/authorizer.ts";
import { createRequestContext } from "./platform/request-context.ts";

export type AppRequestContext = {
    authorizer: Authorizer;
    services: AppServices;
};

const context = createRequestContext<AppRequestContext>();

export const getAppContext = context.get;
export const runWithAppContext = context.run;
