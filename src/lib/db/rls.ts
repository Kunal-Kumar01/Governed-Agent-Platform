import { sql } from "drizzle-orm";

// Org / user ids set per transaction via set_config(..., true); '' counts as unset
export const currentOrgId = sql`NULLIF(current_setting('app.current_org_id', true), '')::integer`;
export const currentUserId = sql`NULLIF(current_setting('app.current_user_id', true), '')::integer`;

// For tables without organisation_id: the row is visible if its agent belongs to the current org
export const agentInCurrentOrg = (agentIdColumn: string) =>
  sql`EXISTS (
    SELECT 1 FROM agents
    WHERE agents.id = ${sql.raw(agentIdColumn)}
      AND agents.organisation_id = ${currentOrgId}
  )`;
