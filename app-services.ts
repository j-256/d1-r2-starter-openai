import { D1DocumentRepository } from "./features/documents/d1-document-repository.ts";
import { DefaultDocumentService } from "./features/documents/document-service.ts";
import type { DocumentService } from "./features/documents/contracts.ts";
import type { RuntimeBindings } from "./platform/cloudflare-bindings.ts";
import { R2ObjectStore } from "./platform/object-store.ts";

export type AppServices = Readonly<{
    documents: DocumentService;
}>;

export function createAppServices(bindings: RuntimeBindings): AppServices {
    return {
        documents: new DefaultDocumentService({
            objects: new R2ObjectStore(bindings.BUCKET),
            repository: new D1DocumentRepository(bindings.DB),
        }),
    };
}
