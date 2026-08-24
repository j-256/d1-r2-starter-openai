"use client";

import {
    type FormEvent,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    parseDocumentApiPayload,
    type DocumentApiPayload,
} from "../features/documents/api-payload.ts";
import {
    DOCUMENT_LIMITS,
    type DocumentMetadata,
} from "../features/documents/contracts.ts";

type Notice = {
    kind: "error" | "success";
    message: string;
};

const KIBIBYTE_BYTES = 1024;
const MEBIBYTE_BYTES = KIBIBYTE_BYTES * KIBIBYTE_BYTES;

function formatBytes(bytes: number): string {
    if (bytes < KIBIBYTE_BYTES) return `${bytes.toLocaleString()} B`;
    if (bytes < MEBIBYTE_BYTES) {
        return `${(bytes / KIBIBYTE_BYTES).toFixed(1)} KiB`;
    }
    return `${(bytes / MEBIBYTE_BYTES).toFixed(1)} MiB`;
}

function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

async function parseResponse(response: Response): Promise<DocumentApiPayload> {
    try {
        return parseDocumentApiPayload(await response.json());
    } catch {
        return { error: "The server returned an unreadable response." };
    }
}

function assertResponse(
    response: Response,
    payload: DocumentApiPayload
): void {
    if (!response.ok || payload.error) {
        throw new Error(payload.error ?? `Request failed (${response.status}).`);
    }
}

async function requestDocuments(
    search: string,
    signal?: AbortSignal
): Promise<DocumentMetadata[]> {
    const suffix = search ? `?q=${encodeURIComponent(search)}` : "";
    const response = await fetch(`/api/documents${suffix}`, {
        cache: "no-store",
        ...(signal ? { signal } : {}),
    });
    const payload = await parseResponse(response);
    assertResponse(response, payload);
    if (!payload.documents) {
        throw new Error("The server returned an invalid document list.");
    }
    return payload.documents;
}

function SummaryCard({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="summary-card">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function DocumentCard({
    busy,
    document,
    onDelete,
    onDownload,
    onRequestDelete,
    pendingDelete,
}: {
    busy: boolean;
    document: DocumentMetadata;
    onDelete: (document: DocumentMetadata) => void;
    onDownload: (document: DocumentMetadata) => void;
    onRequestDelete: (id: string | null) => void;
    pendingDelete: string | null;
}) {
    const confirmingDelete = pendingDelete === document.id;

    return (
        <article className="document-card">
            <div className="document-icon" aria-hidden="true">
                <span />
            </div>
            <div className="document-copy">
                <div className="document-heading">
                    <div>
                        <h3>{document.name}</h3>
                        <p>{document.description || "No description"}</p>
                    </div>
                    <span className="type-pill">
                        {document.contentType || "Unknown type"}
                    </span>
                </div>
                <dl className="document-meta">
                    <div>
                        <dt>Size</dt>
                        <dd>{formatBytes(document.size)}</dd>
                    </div>
                    <div>
                        <dt>Added</dt>
                        <dd>{formatDate(document.createdAt)}</dd>
                    </div>
                    <div>
                        <dt>Storage</dt>
                        <dd>D1 + R2</dd>
                    </div>
                </dl>
                <div className="document-actions">
                    <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => onDownload(document)}
                        type="button"
                    >
                        Download
                    </button>
                    {confirmingDelete ? (
                        <div className="confirm-delete">
                            <span>Delete this document?</span>
                            <button
                                className="button danger"
                                disabled={busy}
                                onClick={() => onDelete(document)}
                                type="button"
                            >
                                Yes, delete
                            </button>
                            <button
                                className="button quiet"
                                disabled={busy}
                                onClick={() => onRequestDelete(null)}
                                type="button"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            className="button quiet danger-text"
                            disabled={busy}
                            onClick={() => onRequestDelete(document.id)}
                            type="button"
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>
        </article>
    );
}

export default function Home() {
    const fileInput = useRef<HTMLInputElement>(null);
    const [activeQuery, setActiveQuery] = useState("");
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [description, setDescription] = useState("");
    const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    async function loadDocuments(search: string) {
        setLoading(true);
        setNotice(null);
        try {
            setDocuments(await requestDocuments(search));
            setActiveQuery(search);
        } catch (error) {
            setNotice({
                kind: "error",
                message: error instanceof Error
                    ? error.message
                    : "Documents could not be loaded.",
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const controller = new AbortController();
        void requestDocuments("", controller.signal)
            .then((loadedDocuments) => {
                if (controller.signal.aborted) return;
                setDocuments(loadedDocuments);
                setActiveQuery("");
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                setNotice({
                    kind: "error",
                    message: error instanceof Error
                        ? error.message
                        : "Documents could not be loaded.",
                });
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, []);

    const totalBytes = documents.reduce(
        (total, document) => total + document.size,
        0
    );
    const contentTypes = new Set(
        documents.map((document) => document.contentType)
    ).size;

    async function upload(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedFile) {
            setNotice({ kind: "error", message: "Choose a file to upload." });
            return;
        }
        if (selectedFile.size > DOCUMENT_LIMITS.fileBytes) {
            setNotice({
                kind: "error",
                message: `Choose a file no larger than ${formatBytes(DOCUMENT_LIMITS.fileBytes)}.`,
            });
            return;
        }

        setBusyAction("upload");
        setNotice(null);
        try {
            const form = new FormData();
            form.set("file", selectedFile);
            if (description.trim()) form.set("description", description.trim());
            const response = await fetch("/api/documents", {
                body: form,
                method: "POST",
            });
            const payload = await parseResponse(response);
            assertResponse(response, payload);
            if (!payload.document) {
                throw new Error("The server returned an invalid document.");
            }

            setDescription("");
            setSelectedFile(null);
            setQuery("");
            if (fileInput.current) fileInput.current.value = "";
            await loadDocuments("");
            setNotice({
                kind: "success",
                message: `${payload.document.name} was uploaded.`,
            });
        } catch (error) {
            setNotice({
                kind: "error",
                message: error instanceof Error
                    ? error.message
                    : "The upload failed.",
            });
        } finally {
            setBusyAction(null);
        }
    }

    async function download(document: DocumentMetadata) {
        setBusyAction(`download:${document.id}`);
        setNotice(null);
        try {
            const response = await fetch(
                `/api/documents/${encodeURIComponent(document.id)}`,
                {
                    cache: "no-store",
                }
            );
            if (!response.ok) {
                const payload = await parseResponse(response);
                throw new Error(
                    payload.error ?? `Download failed (${response.status}).`
                );
            }
            const objectUrl = URL.createObjectURL(await response.blob());
            const anchor = window.document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = document.name;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
            setNotice({
                kind: "success",
                message: `${document.name} was downloaded.`,
            });
        } catch (error) {
            setNotice({
                kind: "error",
                message: error instanceof Error
                    ? error.message
                    : "The download failed.",
            });
        } finally {
            setBusyAction(null);
        }
    }

    async function remove(document: DocumentMetadata) {
        setBusyAction(`delete:${document.id}`);
        setNotice(null);
        try {
            const response = await fetch(
                `/api/documents/${encodeURIComponent(document.id)}`,
                { method: "DELETE" }
            );
            const payload = await parseResponse(response);
            assertResponse(response, payload);
            if (payload.ok !== true) {
                throw new Error("The server returned an invalid delete response.");
            }
            setPendingDelete(null);
            await loadDocuments(activeQuery);
            setNotice({
                kind: "success",
                message: `${document.name} was deleted.`,
            });
        } catch (error) {
            setNotice({
                kind: "error",
                message: error instanceof Error
                    ? error.message
                    : "The document could not be deleted.",
            });
        } finally {
            setBusyAction(null);
        }
    }

    function search(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void loadDocuments(query.trim());
    }

    function selectFile(file: File | null) {
        setSelectedFile(file);
        setNotice(
            file && file.size > DOCUMENT_LIMITS.fileBytes
                ? {
                    kind: "error",
                    message: `Choose a file no larger than ${formatBytes(DOCUMENT_LIMITS.fileBytes)}.`,
                }
                : null
        );
    }

    const busy = loading || busyAction !== null;

    return (
        <main>
            <header className="site-header">
                <a className="brand" href="#top" aria-label="Document Library home">
                    <span className="brand-mark" aria-hidden="true">D</span>
                    <span>Document Library</span>
                </a>
                <div className="platform-badges" aria-label="Storage services">
                    <span>D1 metadata</span>
                    <span>R2 files</span>
                </div>
            </header>

            <div className="page-shell" id="top">
                <section className="hero">
                    <p className="eyebrow">A replaceable example feature</p>
                    <h1>Structured records meet real files.</h1>
                    <p className="hero-copy">Upload a document once. Its searchable metadata lives in D1 while its original bytes live in R2. Replace this feature with your own data model without rebuilding the Cloudflare plumbing.</p>
                </section>

                <section className="workspace" aria-label="Document workspace">
                    <aside className="upload-panel">
                        <div className="section-heading">
                            <p className="eyebrow">Add a document</p>
                            <h2>Upload to the library</h2>
                            <p>Any file type is welcome up to {formatBytes(DOCUMENT_LIMITS.fileBytes)}.</p>
                        </div>

                        <form className="upload-form" onSubmit={upload}>
                            <label className="file-picker">
                                <span className="file-picker-icon" aria-hidden="true">+</span>
                                <strong>
                                    {selectedFile ? selectedFile.name : "Choose a file"}
                                </strong>
                                <small>
                                    {selectedFile
                                        ? formatBytes(selectedFile.size)
                                        : "Binary content is stored in R2"}
                                </small>
                                <input
                                    disabled={busy}
                                    onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
                                    ref={fileInput}
                                    type="file"
                                />
                            </label>

                            <label className="field">
                                <span>Description <small>optional</small></span>
                                <textarea
                                    disabled={busy}
                                    maxLength={DOCUMENT_LIMITS.descriptionCharacters}
                                    onChange={(event) => setDescription(event.target.value)}
                                    placeholder="What is this document for?"
                                    rows={4}
                                    value={description}
                                />
                                <small className="character-count">
                                    {description.length}/{DOCUMENT_LIMITS.descriptionCharacters}
                                </small>
                            </label>

                            <button
                                className="button primary full-width"
                                disabled={busy || !selectedFile || selectedFile.size > DOCUMENT_LIMITS.fileBytes}
                                type="submit"
                            >
                                {busyAction === "upload" ? "Uploading..." : "Upload document"}
                            </button>
                        </form>

                        <div className="storage-path" aria-label="Storage flow">
                            <span>Browser</span>
                            <i aria-hidden="true" />
                            <span>D1</span>
                            <i aria-hidden="true" />
                            <span>R2</span>
                        </div>
                    </aside>

                    <section className="library-panel">
                        <div className="library-heading">
                            <div>
                                <p className="eyebrow">Your library</p>
                                <h2>Documents</h2>
                            </div>
                            <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => void loadDocuments(activeQuery)}
                                type="button"
                            >
                                Refresh
                            </button>
                        </div>

                        <form className="search-form" onSubmit={search} role="search">
                            <label htmlFor="document-search">Search filenames</label>
                            <div className="search-row">
                                <input
                                    disabled={busy}
                                    id="document-search"
                                    maxLength={DOCUMENT_LIMITS.queryCharacters}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Try report, image, notes..."
                                    type="search"
                                    value={query}
                                />
                                <button className="button secondary" disabled={busy} type="submit">
                                    Search
                                </button>
                            </div>
                        </form>

                        <div className="summary-grid" aria-label="Library summary">
                            <SummaryCard label="Documents" value={String(documents.length)} />
                            <SummaryCard label="Stored bytes" value={formatBytes(totalBytes)} />
                            <SummaryCard label="File types" value={String(contentTypes)} />
                        </div>

                        {notice ? (
                            <div
                                className={`notice ${notice.kind}`}
                                role={notice.kind === "error" ? "alert" : "status"}
                            >
                                {notice.message}
                            </div>
                        ) : null}

                        <div className="document-list" aria-busy={loading}>
                            {loading ? (
                                <div className="empty-state">
                                    <span className="loading-ring" aria-hidden="true" />
                                    <h3>Loading documents</h3>
                                    <p>Reading metadata from D1...</p>
                                </div>
                            ) : documents.length ? (
                                documents.map((document) => (
                                    <DocumentCard
                                        busy={busy}
                                        document={document}
                                        key={document.id}
                                        onDelete={(item) => void remove(item)}
                                        onDownload={(item) => void download(item)}
                                        onRequestDelete={setPendingDelete}
                                        pendingDelete={pendingDelete}
                                    />
                                ))
                            ) : (
                                <div className="empty-state">
                                    <span className="empty-icon" aria-hidden="true" />
                                    <h3>{activeQuery ? "No matching documents" : "Your library is empty"}</h3>
                                    <p>
                                        {activeQuery
                                            ? `Nothing matched "${activeQuery}". Try another filename.`
                                            : "Choose a file to exercise D1 and R2 together."}
                                    </p>
                                    {activeQuery ? (
                                        <button
                                            className="button secondary"
                                            onClick={() => {
                                                setQuery("");
                                                void loadDocuments("");
                                            }}
                                            type="button"
                                        >
                                            Clear search
                                        </button>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </section>
                </section>
            </div>

            <footer>
                <span>Document data-model example</span>
                <span aria-hidden="true">/</span>
                <span>Data-model-neutral platform</span>
            </footer>
        </main>
    );
}
