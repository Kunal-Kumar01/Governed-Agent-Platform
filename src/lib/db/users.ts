import {
  pgTable,
  serial,
  pgEnum,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

import { organisations } from "./organisations";

export const roleEnum = pgEnum("role", ["admin", "end_user"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: roleEnum("role").notNull(),
  organisationId: integer("organisation_id").references(() => organisations.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
