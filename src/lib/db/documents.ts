import {
  pgTable,
  serial,
  pgEnum,
  text,
  integer,
  timestamp,
  pgPolicy,
} from "drizzle-orm/pg-core";

import { agents } from "./agents";
import { agentInCurrentOrg } from "./rls";

export const documentStatusEnum = pgEnum("document_status", [
  "processing",
  "ready",
  "failed",
]);

export const documentFileTypeEnum = pgEnum("document_file_type", ["pdf"]);

export const documents = pgTable(
  "documents",
  {
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
  },
  () => [
    // no organisation_id here, so hop through agents
    pgPolicy("org_isolation", {
      for: "all",
      using: agentInCurrentOrg("documents.agent_id"),
      withCheck: agentInCurrentOrg("documents.agent_id"),
    }),
  ],
);
