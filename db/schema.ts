import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const d1Values = sqliteTable("d1_values", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    contentType: text("content_type")
        .notNull()
        .default("text/plain; charset=utf-8"),
    updatedAt: text("updated_at")
        .notNull()
        .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});
