import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable("documents", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    objectKey: text("object_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: text("created_at")
        .notNull()
        .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});
