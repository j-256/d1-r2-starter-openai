import {
    DEFAULT_DEVICE_SIZES,
    DEFAULT_IMAGE_SIZES,
    handleImageOptimization,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runWithAppContext } from "../app-context.ts";
import { createAppServices } from "../app-services.ts";
import type { Authorizer } from "../platform/authorizer.ts";
import type { RuntimeBindings } from "../platform/cloudflare-bindings.ts";

/**
 * Sites enforces authorization upstream with its audience policy, so this
 * authorizer allows every request that reaches the Worker; self-hosted
 * deployments must inject an application-level authorizer
 */
const platformTrustAuthorizer: Authorizer = {
    async authorize() {
        return { ok: true };
    },
};

interface AssetFetcher {
    fetch(request: Request): Promise<Response>;
}

interface ImageTransformer {
    output(options: {
        format: string;
        quality: number;
    }): Promise<{ response(): Response }>;
}

interface ImageInput {
    transform(options: Record<string, unknown>): ImageTransformer;
}

interface ImageBinding {
    input(stream: ReadableStream): ImageInput;
}

interface Env extends RuntimeBindings {
    ASSETS: AssetFetcher;
    IMAGES: ImageBinding;
}

interface ExecutionContext {
    passThroughOnException(): void;
    waitUntil(promise: Promise<unknown>): void;
}

const worker = {
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/_vinext/image") {
            const allowedWidths = [
                ...DEFAULT_DEVICE_SIZES,
                ...DEFAULT_IMAGE_SIZES,
            ];
            return handleImageOptimization(
                request,
                {
                    fetchAsset: (path) => env.ASSETS.fetch(
                        new Request(new URL(path, request.url))
                    ),
                    transformImage: async (
                        body,
                        { width, format, quality }
                    ) => {
                        const transformOptions = width > 0 ? { width } : {};
                        const result = await env.IMAGES
                            .input(body)
                            .transform(transformOptions)
                            .output({ format, quality });
                        return result.response();
                    },
                },
                allowedWidths
            );
        }

        const services = createAppServices(env);
        return runWithAppContext(
            { authorizer: platformTrustAuthorizer, services },
            () => handler.fetch(request, env, ctx)
        );
    },
};

export default worker;
