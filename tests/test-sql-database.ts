import { DatabaseSync } from "node:sqlite";
import type {
    SqlDatabase,
    SqlPreparedStatement,
    SqlRunResult,
} from "../platform/cloudflare-bindings.ts";

type NativeStatement = ReturnType<DatabaseSync["prepare"]>;
type TestSqlInput = null | number | bigint | string;

function sqlValues(values: unknown[]): TestSqlInput[] {
    return values.map((value) => {
        if (
            value === null ||
            typeof value === "number" ||
            typeof value === "bigint" ||
            typeof value === "string"
        ) {
            return value;
        }
        throw new TypeError("Unsupported SQLite test binding.");
    });
}

class TestSqlStatement implements SqlPreparedStatement {
    private readonly statement: NativeStatement;
    private values: unknown[] = [];

    constructor(statement: NativeStatement) {
        this.statement = statement;
    }

    all(): Promise<{ results: unknown[] }> {
        return Promise.resolve({
            results: this.statement.all(...sqlValues(this.values)),
        });
    }

    bind(...values: unknown[]): SqlPreparedStatement {
        this.values = values;
        return this;
    }

    first(): Promise<unknown | null> {
        return Promise.resolve(
            this.statement.get(...sqlValues(this.values)) ?? null
        );
    }

    run(): Promise<SqlRunResult> {
        const result = this.statement.run(...sqlValues(this.values));
        return Promise.resolve({ meta: { changes: Number(result.changes) } });
    }
}

export class TestSqlDatabase implements SqlDatabase {
    readonly native: DatabaseSync;

    constructor() {
        this.native = new DatabaseSync(":memory:");
    }

    prepare(query: string): SqlPreparedStatement {
        return new TestSqlStatement(this.native.prepare(query));
    }
}
