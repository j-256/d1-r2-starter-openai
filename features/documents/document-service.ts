import {
    DOCUMENT_LIMITS,
    type CreateDocumentInput,
    type DocumentDownload,
    type DocumentMetadata,
    type DocumentRecord,
    type DocumentService,
    type DocumentServiceDependencies,
} from "./contracts.ts";

const OBJECT_PREFIX = "documents";

export class DocumentNotFoundError extends Error {
    constructor() {
        super("The requested document was not found.");
        this.name = "DocumentNotFoundError";
    }
}

export class DocumentContentMissingError extends Error {
    constructor() {
        super("The document metadata exists but its object is missing.");
        this.name = "DocumentContentMissingError";
    }
}

function defaultClock(): string {
    return new Date().toISOString();
}

function defaultIdGenerator(): string {
    return crypto.randomUUID();
}

function toMetadata(document: DocumentRecord): DocumentMetadata {
    return {
        id: document.id,
        name: document.name,
        description: document.description,
        contentType: document.contentType,
        size: document.size,
        createdAt: document.createdAt,
    };
}

export class DefaultDocumentService implements DocumentService {
    private readonly clock: () => string;
    private readonly idGenerator: () => string;
    private readonly objects: DocumentServiceDependencies["objects"];
    private readonly repository: DocumentServiceDependencies["repository"];

    constructor(dependencies: DocumentServiceDependencies) {
        this.clock = dependencies.clock ?? defaultClock;
        this.idGenerator = dependencies.idGenerator ?? defaultIdGenerator;
        this.objects = dependencies.objects;
        this.repository = dependencies.repository;
    }

    async create(input: CreateDocumentInput): Promise<DocumentMetadata> {
        const id = this.idGenerator();
        const objectKey = `${OBJECT_PREFIX}/${id}`;
        const size = await this.objects.put(
            objectKey,
            input.body,
            input.contentType
        );

        try {
            const document: DocumentRecord = {
                id,
                name: input.name,
                description: input.description,
                objectKey,
                contentType: input.contentType,
                size,
                createdAt: this.clock(),
            };
            await this.repository.insert(document);
            return toMetadata(document);
        } catch (metadataError) {
            try {
                await this.objects.delete(objectKey);
            } catch (cleanupError) {
                throw new AggregateError(
                    [metadataError, cleanupError],
                    "Document metadata failed and its object could not be cleaned up."
                );
            }
            throw metadataError;
        }
    }

    async delete(id: string): Promise<void> {
        const document = await this.repository.find(id);
        if (!document) return;

        await this.objects.delete(document.objectKey);
        await this.repository.delete(id);
    }

    async download(id: string): Promise<DocumentDownload> {
        const document = await this.repository.find(id);
        if (!document) throw new DocumentNotFoundError();

        const object = await this.objects.get(document.objectKey);
        if (!object) throw new DocumentContentMissingError();

        return {
            body: object.body,
            document: {
                ...toMetadata(document),
                contentType: object.contentType,
                size: object.size,
            },
        };
    }

    async list(query: string): Promise<DocumentMetadata[]> {
        const documents = await this.repository.list(
            query,
            DOCUMENT_LIMITS.listItems
        );
        return documents.map(toMetadata);
    }
}
