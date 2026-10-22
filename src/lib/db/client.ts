import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import { env } from "@/env";

// app_user: no table ownership, no RLS bypass — every query is filtered by policies
const pool = new Pool({ connectionString: env.DATABASE_URL_APP });
const db = drizzle(pool);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TenantContext = {
  orgId: number | null;
  userId: number | null;
};

// The only way into the database for normal app code
export async function withTenant<T>(
  ctx: TenantContext,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_org_id', ${String(ctx.orgId ?? "")}, true)`,
    );
    await tx.execute(
      sql`select set_config('app.current_user_id', ${String(ctx.userId ?? "")}, true)`,
    );
    return run(tx);
  });
}
