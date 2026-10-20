import {
  pgTable,
  serial,
  pgEnum,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

import { agents } from "./agents";

export const documentStatusEnum = pgEnum("document_status", [
  "processing",
  "ready",
  "failed",
]);

export const documentFileTypeEnum = pgEnum("document_file_type", ["pdf"]);

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  fileType: documentFileTypeEnum("file_type").notNull().default("pdf"),
  storagePath: text("storage_path").notNull(),
  status: documentStatusEnum("status").notNull().default("processing"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
