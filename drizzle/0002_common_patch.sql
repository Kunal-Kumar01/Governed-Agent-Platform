ALTER TABLE "organisations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "org_isolation" ON "organisations" AS PERMISSIVE FOR ALL TO public USING ("organisations"."id" = NULLIF(current_setting('app.current_org_id', true), '')::integer) WITH CHECK ("organisations"."id" = NULLIF(current_setting('app.current_org_id', true), '')::integer);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "users" AS PERMISSIVE FOR ALL TO public USING ("users"."organisation_id" = NULLIF(current_setting('app.current_org_id', true), '')::integer) WITH CHECK ("users"."organisation_id" = NULLIF(current_setting('app.current_org_id', true), '')::integer);--> statement-breakpoint
CREATE POLICY "self_read" ON "users" AS PERMISSIVE FOR SELECT TO public USING ("users"."id" = NULLIF(current_setting('app.current_user_id', true), '')::integer);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "agents" AS PERMISSIVE FOR ALL TO public USING ("agents"."organisation_id" = NULLIF(current_setting('app.current_org_id', true), '')::integer) WITH CHECK ("agents"."organisation_id" = NULLIF(current_setting('app.current_org_id', true), '')::integer);--> statement-breakpoint
CREATE POLICY "org_isolation" ON "documents" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
    SELECT 1 FROM agents
    WHERE agents.id = documents.agent_id
      AND agents.organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::integer
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM agents
    WHERE agents.id = documents.agent_id
      AND agents.organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::integer
  ));--> statement-breakpoint
CREATE POLICY "org_isolation" ON "chunks" AS PERMISSIVE FOR ALL TO public USING (EXISTS (
    SELECT 1 FROM agents
    WHERE agents.id = chunks.agent_id
      AND agents.organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::integer
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM agents
    WHERE agents.id = chunks.agent_id
      AND agents.organisation_id = NULLIF(current_setting('app.current_org_id', true), '')::integer
  ));