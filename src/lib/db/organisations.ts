import { sql } from "drizzle-orm";
import {
  pgPolicy,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { currentOrgId } from "./rls";

export const organisations = pgTable(
  "organisations",
  {
    id: serial("id").primaryKey(),
    fullName: text("full_name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // the org row checks against itself
    pgPolicy("org_isolation", {
      for: "all",
      using: sql`${table.id} = ${currentOrgId}`,
      withCheck: sql`${table.id} = ${currentOrgId}`,
    }),
  ],
);
