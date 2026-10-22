import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  uuid,
  pgEnum,
  text,
  integer,
  timestamp,
  pgPolicy,
} from "drizzle-orm/pg-core";

import { organisations } from "./organisations";
import { currentOrgId } from "./rls";

export const agentCategoryEnum = pgEnum("agent_category", [
  "law_compliance",
  "marketing",
  "hr",
  "it_knowledge_base",
  "customer_support",
]);

export const agentAccessEnum = pgEnum("agent_access", ["public", "restricted"]);

export const agents = pgTable(
  "agents",
  {
    id: serial("id").primaryKey(),
    publicId: uuid("public_id").defaultRandom().notNull().unique(),
    organisationId: integer("organisation_id")
      .notNull()
      .references(() => organisations.id),
    name: text("name").notNull(),
    category: agentCategoryEnum("category").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    access: agentAccessEnum("access").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    pgPolicy("org_isolation", {
      for: "all",
      using: sql`${table.organisationId} = ${currentOrgId}`,
      withCheck: sql`${table.organisationId} = ${currentOrgId}`,
    }),
  ],
);
