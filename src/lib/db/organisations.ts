import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const organisations = pgTable("organisations", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
