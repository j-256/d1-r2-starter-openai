"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    STORAGE_KINDS,
    type StorageKind,
    type StoredTextItem,
} from "../storage/contracts";
import {
    parseStorageApiPayload,
    type StorageApiPayload,
} from "../storage/api-payload";

type View = "overview" | StorageKind;
type Theme = "system" | "light" | "dark";

type ResourceSummary = {
    bytes: number;
    count: number;
    error?: string;
    lastUpdated?: string;
    status: "loading" | "online" | "error";
};

type Operation = {
    duration: number;
    id: number;
    key: string;
    method: "GET" | "PUT" | "DELETE";
    resource: StorageKind;
    status: number;
    succeeded: boolean;
    timestamp: string;
};

type ResponseSnapshot = Operation & {
    payload: unknown;
};

const resourceCopy = {
    d1: {
        binding: "DB",
        description: "Structured key/value rows backed by SQLite.",
        itemLabel: "rows",
        name: "D1 database",
        shortName: "D1",
    },
    r2: {
        binding: "BUCKET",
        description: "Text objects addressed directly by object key.",
        itemLabel: "objects",
        name: "R2 bucket",
        shortName: "R2",
    },
} satisfies Record<StorageKind, {
    binding: string;
    description: string;
    itemLabel: string;
    name: string;
    shortName: string;
}>;

function formatDate(value?: string) {
    if (!value) return "No data yet";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes.toLocaleString()} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseTheme(value: string): Theme {
    if (value === "light" || value === "dark") return value;
    return "system";
}

async function parseResponse(response: Response): Promise<StorageApiPayload> {
    try {
        return parseStorageApiPayload(await response.json());
    } catch {
        return { error: "The server returned an unreadable response." };
    }
}

function assertStorageResponse(
    response: Response,
    payload: StorageApiPayload
): void {
    if (!response.ok || payload.error) {
        throw new Error(payload.error ?? `Request failed (${response.status})`);
    }
}

async function executeStorageRequest(
    kind: StorageKind,
    method: Operation["method"],
    targetKey: string,
    body?: { key: string; value: string }
) {
    const started = performance.now();
    let responseStatus = 0;
    let payload: StorageApiPayload = {};
    let succeeded = false;
    let response: Response | null = null;
    let requestError: unknown;

    try {
        const endpoint = `/api/${kind}`;
        const url = method === "PUT"
            ? endpoint
            : `${endpoint}?key=${encodeURIComponent(targetKey)}`;
        const requestInit: RequestInit = {
            cache: "no-store",
            method,
        };
        if (body) {
            requestInit.body = JSON.stringify(body);
            requestInit.headers = { "content-type": "application/json" };
        }
        response = await fetch(url, requestInit);
        responseStatus = response.status;
        payload = await parseResponse(response);
        succeeded = response.ok && !payload.error;
    } catch (error) {
        requestError = error;
        payload = {
            error: error instanceof Error ? error.message : "Network request failed.",
        };
    }

    const operation: Operation = {
        duration: Math.max(1, Math.round(performance.now() - started)),
        id: Date.now() + Math.round(Math.random() * 1000),
        key: targetKey,
        method,
        resource: kind,
        status: responseStatus,
        succeeded,
        timestamp: new Date().toISOString(),
    };

    return { operation, payload, requestError, response };
}

function summarize(payload: StorageApiPayload): ResourceSummary {
    const items = payload.entries ?? payload.objects ?? [];
    const lastUpdated = items.reduce<string | undefined>((latest, item) => {
        if (!latest || item.updatedAt > latest) return item.updatedAt;
        return latest;
    }, undefined);

    const summary: ResourceSummary = {
        bytes: items.reduce((total, item) => total + item.size, 0),
        count: items.length,
        status: "online",
    };
    if (lastUpdated) summary.lastUpdated = lastUpdated;
    return summary;
}

function StatusDot({ status }: { status: ResourceSummary["status"] }) {
    return <span className={`status-dot ${status}`} aria-hidden="true" />;
}

function Overview({
    onNavigate,
    operations,
    summaries,
}: {
    onNavigate: (view: StorageKind) => void;
    operations: Operation[];
    summaries: Record<StorageKind, ResourceSummary>;
}) {
    return (
        <div className="overview-stack">
            <section className="summary-grid" aria-label="Resource summary">
                {STORAGE_KINDS.map((kind) => {
                    const copy = resourceCopy[kind];
                    const summary = summaries[kind];
                    return (
                        <article className="summary-card" key={kind}>
                            <div className="summary-card-heading">
                                <div className={`resource-mark ${kind}`}>
                                    {copy.shortName}
                                </div>
                                <div>
                                    <h2>{copy.name}</h2>
                                    <p>{copy.binding}</p>
                                </div>
                                <span className="health-label">
                                    <StatusDot status={summary.status} />
                                    {summary.status === "loading"
                                        ? "Connecting"
                                        : summary.status === "online"
                                            ? "Online"
                                            : "Error"}
                                </span>
                            </div>
                            <p className="summary-description">{copy.description}</p>
                            <div className="summary-metrics">
                                <div>
                                    <span>Loaded {copy.itemLabel}</span>
                                    <strong>{summary.count.toLocaleString()}</strong>
                                </div>
                                <div>
                                    <span>{kind === "r2" ? "Loaded size" : "Value data"}</span>
                                    <strong>{formatBytes(summary.bytes)}</strong>
                                </div>
                                <div>
                                    <span>Latest update</span>
                                    <strong className="date-value">
                                        {formatDate(summary.lastUpdated)}
                                    </strong>
                                </div>
                            </div>
                            {summary.error && (
                                <p className="resource-error">{summary.error}</p>
                            )}
                            <button
                                className="open-resource"
                                onClick={() => onNavigate(kind)}
                                type="button"
                            >
                                Open {copy.shortName} explorer
                                <span aria-hidden="true">→</span>
                            </button>
                        </article>
                    );
                })}
            </section>

            <section className="activity-card" aria-labelledby="activity-title">
                <div className="section-heading">
                    <div>
                        <p className="section-kicker">This session</p>
                        <h2 id="activity-title">Recent operations</h2>
                    </div>
                    <span>{operations.length} recorded</span>
                </div>
                {operations.length ? (
                    <div className="activity-table-wrap">
                        <table className="activity-table">
                            <thead>
                                <tr>
                                    <th>Resource</th>
                                    <th>Operation</th>
                                    <th>Key</th>
                                    <th>Result</th>
                                    <th>Latency</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {operations.slice(0, 10).map((operation) => (
                                    <tr key={operation.id}>
                                        <td>{resourceCopy[operation.resource].shortName}</td>
                                        <td><code>{operation.method}</code></td>
                                        <td className="key-cell">{operation.key || "List"}</td>
                                        <td>
                                            <span className={operation.succeeded ? "result-ok" : "result-error"}>
                                                {operation.status || "Network error"}
                                            </span>
                                        </td>
                                        <td>{operation.duration} ms</td>
                                        <td>{new Date(operation.timestamp).toLocaleTimeString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="activity-empty">
                        <p>No operations yet.</p>
                        <span>Reads, writes, and deletes will appear here as you work.</span>
                    </div>
                )}
            </section>
        </div>
    );
}

function ResourceConsole({
    kind,
    onOperation,
    onSummary,
    refreshSeed,
}: {
    kind: StorageKind;
    onOperation: (operation: Operation, payload: unknown) => void;
    onSummary: (kind: StorageKind, summary: ResourceSummary) => void;
    refreshSeed: number;
}) {
    const copy = resourceCopy[kind];
    const [items, setItems] = useState<StoredTextItem[]>([]);
    const [key, setKey] = useState("");
    const [value, setValue] = useState("");
    const [filter, setFilter] = useState("");
    const [status, setStatus] = useState("Select an item or create a new one.");
    const [statusType, setStatusType] = useState<"neutral" | "success" | "error">("neutral");
    const [busy, setBusy] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const endpoint = `/api/${kind}`;

    const loadList = useCallback(async (quiet = false) => {
        if (!quiet) {
            setBusy(true);
            setStatus("Refreshing resource…");
            setStatusType("neutral");
        }
        try {
            const response = await fetch(endpoint, { cache: "no-store" });
            const payload = await parseResponse(response);
            assertStorageResponse(response, payload);
            const loadedItems = payload.entries ?? payload.objects ?? [];
            setItems(loadedItems);
            onSummary(kind, summarize(payload));
            if (!quiet) {
                setStatus(`Loaded ${loadedItems.length} ${copy.itemLabel}.`);
                setStatusType("success");
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Refresh failed.";
            setStatus(message);
            setStatusType("error");
            onSummary(kind, { bytes: 0, count: 0, error: message, status: "error" });
        } finally {
            if (!quiet) setBusy(false);
        }
    }, [copy.itemLabel, endpoint, kind, onSummary]);

    useEffect(() => {
        const timeout = window.setTimeout(() => void loadList(true), 0);
        return () => window.clearTimeout(timeout);
    }, [loadList, refreshSeed]);

    const filteredItems = useMemo(() => {
        const query = filter.trim().toLocaleLowerCase();
        if (!query) return items;
        return items.filter((item) => item.key.toLocaleLowerCase().includes(query));
    }, [filter, items]);

    async function request(
        method: Operation["method"],
        targetKey: string,
        body?: { key: string; value: string }
    ) {
        const result = await executeStorageRequest(kind, method, targetKey, body);
        onOperation(result.operation, result.payload);
        if (result.requestError) throw result.requestError;
        if (!result.response) throw new Error(result.payload.error ?? "Network request failed.");
        return { payload: result.payload, response: result.response };
    }

    function newItem() {
        setKey("");
        setValue("");
        setStatus(`New ${kind === "d1" ? "row" : "object"}. Enter a key and value.`);
        setStatusType("neutral");
    }

    async function read(targetKey = key) {
        const normalizedKey = targetKey.trim();
        if (!normalizedKey) {
            setStatus("Enter or select a key first.");
            setStatusType("error");
            return;
        }

        setBusy(true);
        setStatus(`Reading "${normalizedKey}"…`);
        setStatusType("neutral");
        try {
            const { payload, response } = await request("GET", normalizedKey);
            assertStorageResponse(response, payload);
            setKey(payload.entry?.key ?? normalizedKey);
            setValue(payload.entry?.value ?? "");
            setStatus(`Read "${normalizedKey}" successfully.`);
            setStatusType("success");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Read failed.");
            setStatusType("error");
        } finally {
            setBusy(false);
        }
    }

    async function save() {
        const normalizedKey = key.trim();
        if (!normalizedKey) {
            setStatus("A key is required before saving.");
            setStatusType("error");
            return;
        }

        setBusy(true);
        setStatus(`Saving "${normalizedKey}"…`);
        setStatusType("neutral");
        try {
            const { payload, response } = await request(
                "PUT",
                normalizedKey,
                { key: normalizedKey, value }
            );
            assertStorageResponse(response, payload);
            setKey(payload.entry?.key ?? normalizedKey);
            await loadList(true);
            setStatus(`Saved "${normalizedKey}" successfully.`);
            setStatusType("success");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Save failed.");
            setStatusType("error");
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        if (!pendingDelete) return;
        const targetKey = pendingDelete;
        setPendingDelete(null);
        setBusy(true);
        setStatus(`Deleting "${targetKey}"…`);
        setStatusType("neutral");
        try {
            const { payload, response } = await request("DELETE", targetKey);
            assertStorageResponse(response, payload);
            setKey("");
            setValue("");
            await loadList(true);
            setStatus(`Deleted "${targetKey}".`);
            setStatusType("success");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Delete failed.");
            setStatusType("error");
        } finally {
            setBusy(false);
        }
    }

    async function copyValue() {
        try {
            await navigator.clipboard.writeText(value);
            setStatus("Value copied to the clipboard.");
            setStatusType("success");
        } catch {
            setStatus("Clipboard access was unavailable.");
            setStatusType("error");
        }
    }

    return (
        <div className="resource-console">
            <section className="explorer-card" aria-labelledby={`${kind}-explorer-title`}>
                <div className="section-heading compact">
                    <div>
                        <p className="section-kicker">{copy.binding}</p>
                        <h2 id={`${kind}-explorer-title`}>{copy.shortName} explorer</h2>
                    </div>
                    <button className="primary-button small" onClick={newItem} type="button">
                        New {kind === "d1" ? "row" : "object"}
                    </button>
                </div>

                <div className="search-control">
                    <label htmlFor={`${kind}-filter`}>Filter keys</label>
                    <input
                        id={`${kind}-filter`}
                        onChange={(event) => setFilter(event.target.value)}
                        placeholder="Search loaded keys"
                        type="search"
                        value={filter}
                    />
                </div>

                <div className="list-summary">
                    <span>{filteredItems.length} of {items.length} loaded</span>
                    <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void loadList()}
                        type="button"
                    >
                        Refresh
                    </button>
                </div>

                {filteredItems.length ? (
                    <ul className="resource-list">
                        {filteredItems.map((item) => (
                            <li key={item.key}>
                                <button
                                    className={key === item.key ? "selected" : ""}
                                    onClick={() => {
                                        setKey(item.key);
                                        if (typeof item.value === "string") setValue(item.value);
                                        void read(item.key);
                                    }}
                                    type="button"
                                >
                                    <span className="resource-key">{item.key}</span>
                                    <span className="resource-meta">
                                        {formatBytes(item.size)}
                                        <span aria-hidden="true">·</span>
                                        {formatDate(item.updatedAt)}
                                    </span>
                                    {item.value !== undefined && (
                                        <span className="value-preview">
                                            {item.value || "Empty value"}
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="list-empty">
                        <p>{items.length ? "No matching keys" : `No ${copy.itemLabel} yet`}</p>
                        <span>{items.length ? "Try a different filter." : "Create one to test the binding."}</span>
                    </div>
                )}
            </section>

            <section className="editor-card" aria-labelledby={`${kind}-editor-title`}>
                <div className="editor-heading">
                    <div>
                        <p className="section-kicker">Inspector</p>
                        <h2 id={`${kind}-editor-title`}>
                            {key ? "Edit stored value" : `New ${kind === "d1" ? "row" : "object"}`}
                        </h2>
                    </div>
                    <span className="binding-chip">{copy.binding}</span>
                </div>

                <div className={`editor-status ${statusType}`} role="status" aria-live="polite">
                    <span aria-hidden="true" />
                    {status}
                </div>

                <form onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}>
                    <div className="field">
                        <div className="field-label">
                            <label htmlFor={`${kind}-key`}>Key</label>
                            <span>{key.length}/256</span>
                        </div>
                        <input
                            autoComplete="off"
                            id={`${kind}-key`}
                            maxLength={256}
                            onChange={(event) => setKey(event.target.value)}
                            placeholder={kind === "d1" ? "settings:theme" : "config/example.txt"}
                            spellCheck={false}
                            value={key}
                        />
                    </div>
                    <div className="field value-field">
                        <div className="field-label">
                            <label htmlFor={`${kind}-value`}>Text value</label>
                            <span>{new TextEncoder().encode(value).byteLength.toLocaleString()}/100,000 bytes</span>
                        </div>
                        <textarea
                            id={`${kind}-value`}
                            // soft cap; server enforces the byte limit
                            maxLength={100000}
                            onChange={(event) => setValue(event.target.value)}
                            placeholder="Enter the value to store…"
                            rows={14}
                            value={value}
                        />
                    </div>

                    <div className="editor-actions">
                        <button className="primary-button" disabled={busy} type="submit">
                            {busy ? "Working…" : kind === "d1" ? "Upsert row" : "Put object"}
                        </button>
                        <button
                            className="secondary-button"
                            disabled={busy || !key.trim()}
                            onClick={() => void read()}
                            type="button"
                        >
                            Read latest
                        </button>
                        <button
                            className="secondary-button"
                            disabled={!value}
                            onClick={() => void copyValue()}
                            type="button"
                        >
                            Copy value
                        </button>
                        <button
                            className="danger-button"
                            disabled={busy || !key.trim()}
                            onClick={() => setPendingDelete(key.trim())}
                            type="button"
                        >
                            Delete
                        </button>
                    </div>
                </form>
            </section>

            {pendingDelete && (
                <div className="modal-backdrop" role="presentation">
                    <section
                        aria-describedby="delete-description"
                        aria-labelledby="delete-title"
                        aria-modal="true"
                        className="confirm-modal"
                        role="dialog"
                    >
                        <div className="danger-icon" aria-hidden="true">!</div>
                        <h2 id="delete-title">Delete stored value?</h2>
                        <p id="delete-description">
                            <code>{pendingDelete}</code> will be permanently removed from {copy.name}.
                        </p>
                        <div className="modal-actions">
                            <button
                                className="secondary-button"
                                onClick={() => setPendingDelete(null)}
                                type="button"
                            >
                                Cancel
                            </button>
                            <button className="destructive-button" onClick={() => void remove()} type="button">
                                Delete permanently
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

export default function Home() {
    const [activeView, setActiveView] = useState<View>("overview");
    const [theme, setTheme] = useState<Theme>("system");
    const [refreshSeed, setRefreshSeed] = useState(0);
    const [operations, setOperations] = useState<Operation[]>([]);
    const [lastResponse, setLastResponse] = useState<ResponseSnapshot | null>(null);
    const [summaries, setSummaries] = useState<Record<StorageKind, ResourceSummary>>({
        d1: { bytes: 0, count: 0, status: "loading" },
        r2: { bytes: 0, count: 0, status: "loading" },
    });

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            const storedTheme = window.localStorage.getItem("starter-control-plane:theme:v1");
            if (storedTheme === "system" || storedTheme === "light" || storedTheme === "dark") {
                setTheme(storedTheme);
            }
        }, 0);
        return () => window.clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (theme === "system") {
            delete document.documentElement.dataset["theme"];
        } else {
            document.documentElement.dataset["theme"] = theme;
        }
        window.localStorage.setItem("starter-control-plane:theme:v1", theme);
    }, [theme]);

    const updateSummary = useCallback((kind: StorageKind, summary: ResourceSummary) => {
        setSummaries((current) => ({ ...current, [kind]: summary }));
    }, []);

    const loadOverview = useCallback(async () => {
        await Promise.all(STORAGE_KINDS.map(async (kind) => {
            updateSummary(kind, { bytes: 0, count: 0, status: "loading" });
            try {
                const response = await fetch(`/api/${kind}`, { cache: "no-store" });
                const payload = await parseResponse(response);
                assertStorageResponse(response, payload);
                updateSummary(kind, summarize(payload));
            } catch (error) {
                updateSummary(kind, {
                    bytes: 0,
                    count: 0,
                    error: error instanceof Error ? error.message : "Connection failed.",
                    status: "error",
                });
            }
        }));
    }, [updateSummary]);

    useEffect(() => {
        void loadOverview();
    }, [loadOverview, refreshSeed]);

    const recordOperation = useCallback((operation: Operation, payload: unknown) => {
        setOperations((current) => [operation, ...current].slice(0, 30));
        setLastResponse({ ...operation, payload });
    }, []);

    const title = activeView === "overview"
        ? "Overview"
        : `${resourceCopy[activeView].shortName} explorer`;

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark">S</div>
                    <div>
                        <strong>starter</strong>
                        <span>Control plane</span>
                    </div>
                </div>

                <nav aria-label="Control plane navigation">
                    <p>Workspace</p>
                    <button
                        aria-current={activeView === "overview" ? "page" : undefined}
                        className={activeView === "overview" ? "active" : ""}
                        onClick={() => setActiveView("overview")}
                        type="button"
                    >
                        <span className="nav-icon" aria-hidden="true">⌂</span>
                        Overview
                    </button>
                    <p>Resources</p>
                    <button
                        aria-current={activeView === "d1" ? "page" : undefined}
                        className={activeView === "d1" ? "active" : ""}
                        onClick={() => setActiveView("d1")}
                        type="button"
                    >
                        <span className="nav-icon resource-nav d1" aria-hidden="true">D1</span>
                        Database
                        <StatusDot status={summaries.d1.status} />
                    </button>
                    <button
                        aria-current={activeView === "r2" ? "page" : undefined}
                        className={activeView === "r2" ? "active" : ""}
                        onClick={() => setActiveView("r2")}
                        type="button"
                    >
                        <span className="nav-icon resource-nav r2" aria-hidden="true">R2</span>
                        Object storage
                        <StatusDot status={summaries.r2.status} />
                    </button>
                </nav>

                <div className="sidebar-footer">
                    <div>
                        <span className="environment-dot" aria-hidden="true" />
                        <span>Production</span>
                    </div>
                    <small>Private · owner only</small>
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div>
                        <p>Storage control plane</p>
                        <h1>{title}</h1>
                    </div>
                    <div className="topbar-actions">
                        <label className="theme-control">
                            <span>Theme</span>
                            <select
                                value={theme}
                                onChange={(event) => setTheme(parseTheme(event.target.value))}
                            >
                                <option value="system">System</option>
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                            </select>
                        </label>
                        <button
                            className="secondary-button refresh-all"
                            onClick={() => setRefreshSeed((value) => value + 1)}
                            type="button"
                        >
                            Refresh all
                        </button>
                    </div>
                </header>

                <div className="content-area">
                    {activeView === "overview" ? (
                        <Overview
                            onNavigate={setActiveView}
                            operations={operations}
                            summaries={summaries}
                        />
                    ) : (
                        <ResourceConsole
                            key={activeView}
                            kind={activeView}
                            onOperation={recordOperation}
                            onSummary={updateSummary}
                            refreshSeed={refreshSeed}
                        />
                    )}

                    <details className="response-inspector">
                        <summary>
                            <span>
                                <strong>Last response</strong>
                                {lastResponse
                                    ? `${resourceCopy[lastResponse.resource].shortName} ${lastResponse.method} · ${lastResponse.status || "Network error"} · ${lastResponse.duration} ms`
                                    : "No operation selected"}
                            </span>
                            <span aria-hidden="true">⌄</span>
                        </summary>
                        <pre>{lastResponse
                            ? JSON.stringify(lastResponse.payload, null, 2)
                            : "Run a read, write, or delete operation to inspect its response."}</pre>
                    </details>
                </div>
            </main>
        </div>
    );
}
