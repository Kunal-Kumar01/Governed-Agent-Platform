import {
  pgTable,
  serial,
  integer,
  text,
  vector,
  timestamp,
  index,
  uniqueIndex,
  pgPolicy,
} from "drizzle-orm/pg-core";

import { documents } from "./documents";
import { agents } from "./agents";
import { agentInCurrentOrg } from "./rls";

// voyage-4-lite's default dimen
export const EMBEDDING_DIMENSIONS = 1024;

export const chunks = pgTable(
  "chunks",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", {
      dimensions: EMBEDDING_DIMENSIONS,
    }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chunks_agent_id_idx").on(table.agentId),
    index("chunks_document_id_idx").on(table.documentId),
    uniqueIndex("chunks_document_id_chunk_index_idx").on(
      table.documentId,
      table.chunkIndex,
    ),
    // hop through agents
    pgPolicy("org_isolation", {
      for: "all",
      using: agentInCurrentOrg("chunks.agent_id"),
      withCheck: agentInCurrentOrg("chunks.agent_id"),
    }),
  ],
);
