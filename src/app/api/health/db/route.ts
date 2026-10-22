import { withTenant } from "@/lib/db/client";

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    await withTenant({ orgId: null, userId: null }, (tx) =>
      tx.execute(sql`select 1`),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Database connection failed:", error);
    return NextResponse.json(
      { ok: false, error: "Database connection failed" },
      { status: 500 },
    );
  }
}
