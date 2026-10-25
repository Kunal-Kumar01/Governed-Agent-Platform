import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { agents, organisations, users } from "./schema";

// Owner role: bypasses RLS. Only for lookups that happen before the org is known.
// Import is restricted by ESLint — see eslint.config.mjs.
const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool);

const normaliseEmail = (email: string) => email.trim().toLowerCase();

export async function findUserForLogin(email: string) {
  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      role: users.role,
      organisationId: users.organisationId,
    })
    .from(users)
    .where(eq(users.email, normaliseEmail(email)))
    .limit(1);
  return user ?? null;
}

export async function emailExists(email: string) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normaliseEmail(email)))
    .limit(1);
  return row !== undefined;
}

export async function createEndUser(input: {
  fullName: string;
  email: string;
  passwordHash: string | null;
}) {
  const [user] = await db
    .insert(users)
    .values({
      fullName: input.fullName,
      email: normaliseEmail(input.email),
      passwordHash: input.passwordHash,
      role: "end_user",
      organisationId: null,
    })
    .returning({ id: users.id });
  return user;
}

export async function createOrganisationWithAdmin(input: {
  orgName: string;
  fullName: string;
  email: string;
  passwordHash: string | null;
}) {
  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organisations)
      .values({ fullName: input.orgName })
      .returning({ id: organisations.id });
    const [user] = await tx
      .insert(users)
      .values({
        fullName: input.fullName,
        email: normaliseEmail(input.email),
        passwordHash: input.passwordHash,
        role: "admin",
        organisationId: org.id,
      })
      .returning({ id: users.id });
    return { organisationId: org.id, userId: user.id };
  });
}

export async function resolveAgentByPublicId(publicId: string) {
  if (!z.string().uuid().safeParse(publicId).success) return null;
  const [agent] = await db
    .select({
      id: agents.id,
      organisationId: agents.organisationId,
      access: agents.access,
    })
    .from(agents)
    .where(eq(agents.publicId, publicId))
    .limit(1);
  return agent ?? null;
}
