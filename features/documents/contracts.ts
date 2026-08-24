import type { ObjectStore } from "../../platform/object-store.ts";

export const DOCUMENT_LIMITS = Object.freeze({
    contentTypeCharacters: 200,
    descriptionCharacters: 500,
    fileBytes: 5 * 1024 * 1024,
    idCharacters: 64,
    listItems: 50,
    nameCharacters: 200,
    queryCharacters: 100,
});

export type DocumentMetadata = {
    contentType: string;
    createdAt: string;
    description: string | null;
    id: string;
    name: string;
    size: number;
};

export type DocumentRecord = DocumentMetadata & {
    objectKey: string;
};

export type CreateDocumentInput = {
    body: ArrayBuffer;
    contentType: string;
    description: string | null;
    name: string;
};

export type DocumentDownload = {
    body: ArrayBuffer;
    document: DocumentMetadata;
};

export interface DocumentRepository {
    delete(id: string): Promise<void>;
    find(id: string): Promise<DocumentRecord | null>;
    insert(document: DocumentRecord): Promise<void>;
    list(query: string, limit: number): Promise<DocumentRecord[]>;
}

export interface DocumentService {
    create(input: CreateDocumentInput): Promise<DocumentMetadata>;
    delete(id: string): Promise<void>;
    download(id: string): Promise<DocumentDownload>;
    list(query: string): Promise<DocumentMetadata[]>;
}

export type DocumentServiceDependencies = {
    clock?: () => string;
    idGenerator?: () => string;
    objects: ObjectStore;
    repository: DocumentRepository;
};
