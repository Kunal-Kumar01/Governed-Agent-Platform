import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  pgEnum,
  text,
  integer,
  timestamp,
  pgPolicy,
} from "drizzle-orm/pg-core";

import { organisations } from "./organisations";
import { currentOrgId, currentUserId } from "./rls";

export const roleEnum = pgEnum("role", ["admin", "end_user"]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash"),
    role: roleEnum("role").notNull(),
    organisationId: integer("organisation_id").references(
      () => organisations.id,
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    pgPolicy("org_isolation", {
      for: "all",
      using: sql`${table.organisationId} = ${currentOrgId}`,
      withCheck: sql`${table.organisationId} = ${currentOrgId}`,
    }),
    pgPolicy("self_read", {
      for: "select",
      using: sql`${table.id} = ${currentUserId}`,
    }),
  ],
);
