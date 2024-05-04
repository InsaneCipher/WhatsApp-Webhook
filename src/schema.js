import { serial, text, pgTable } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
    id: text("id").primaryKey(),
    thread_id: text("thread_id"),
});
