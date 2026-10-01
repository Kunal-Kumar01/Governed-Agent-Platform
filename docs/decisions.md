# Decisions Log

Running record of architecture and product decisions for the Governed Agent Platform — what was decided, why, and what was considered instead. `project-scope.md` is the product spec; this file is the "why we built it this way" companion to it. Newest at the bottom.

---

## 2026-10-01 — Stack

### Language & framework
**Decided:** TypeScript throughout. Next.js 15, App Router.
**Why:** Already implied by the auth decision below — rolling auth by hand was explicitly chosen to get hands-on Next.js practice.

### Package manager
**Decided:** pnpm.
**Why:** Strict dependency resolution catches phantom-dependency bugs early, which matters more on a project this architecturally dense.

### Database & ORM
**Decided:** Neon (serverless Postgres + pgvector). Drizzle ORM, with `drizzle-kit` for migrations and `drizzle-zod` to infer Zod schemas straight from the tables.
**Why:** Neon over Supabase — free tier covers this project's scale, scale-to-zero means no idle cost during development. Drizzle over Prisma — first-class row-level-security support written as raw SQL policies rather than bolted on, plus a native Neon driver with native pgvector typing. `drizzle-zod` avoids maintaining two parallel schema definitions when the non-negotiables already require Zod-validating model output.
**Alternatives considered:** Supabase (declined — see *Data isolation* below); Prisma (declined — weaker RLS story).

### Data isolation
**Decided:** Shared Postgres, foreign-key-enforced tenancy, row-level security keyed to the authenticated organisation. Not a bring-your-own-database model per admin.
**Why:** See *Non-goals* in `project-scope.md`. Customer-managed data residency is real production scope, correctly deferred rather than solved partially.

### Auth
**Decided:** Rolled by hand with NextAuth/Auth.js. Credentials provider **and** Google OAuth from day one.
**Why:** Keeps every data path server-side and auditable, consistent with the governance model — a bundled backend-as-a-service auth provider opens a client-direct path to the database that the trace and policy layers can't see. OAuth from day one because the scope doc's access model applies the same login/sign-up flow — OAuth included — to all roles, not just admins; deferring it would mean redoing the access-list and allowlist logic once it's added later.
**Alternatives considered:** Supabase Auth, Clerk, Auth0 (all declined for the client-direct-path reason above); Credentials-only for v1 (declined — see Why).

### Validation
**Decided:** Zod. `@t3-oss/env-nextjs` for type-safe environment variable validation at build time.
**Why:** Zod is already required for validating structured model output (the non-negotiables in `project-scope.md`); env validation is a small addition that catches a missing API key at build time instead of in production.

### LLM generation
**Decided:** Anthropic API via `@anthropic-ai/sdk`.
**Why:** Per `project-scope.md`'s architecture section. Model choice per call-site (e.g. a cheaper model for the faithfulness check vs. the main chat response) is a Phase 3/4 decision, not a stack decision — see the evaluation-design entry below for what's settled there.

### Embeddings
**Decided:** Voyage AI (`voyage-3-lite`).
**Why:** Anthropic's recommended embedding partner — pairs naturally with Claude for generation, good retrieval quality at low cost, no second unrelated vendor to onboard.
**Alternatives considered:** OpenAI `text-embedding-3-small` (comparable quality, but an unrelated API key for no real benefit here).

### Chat interface streaming
**Decided:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) for the chat UI's streaming plumbing only.
**Why:** Avoids hand-rolling SSE token streaming for a screen the scope doc itself calls "deliberately the least interesting" in the product. **Scope boundary:** this is UI plumbing only — retrieval, prompt construction, and trace logging stay hand-rolled server-side, because that pipeline is the one thing in this project that needs to be explainable on a whiteboard without a framework's abstractions in the way.

### PDF parsing & chunking
**Decided:** `unpdf` for text extraction. Chunking logic hand-rolled, no LangChain/LlamaIndex.
**Why:** `unpdf` avoids the native-binary issues `pdf-parse` can hit on Vercel's serverless functions. Hand-rolled chunking for the same reason as the streaming boundary above — `project-scope.md` names the RAG pipeline as "the one to know cold in an interview," and a framework abstracts away exactly the mechanism that claim depends on.

### File storage
**Decided:** Vercel Blob.
**Why:** Org-scoped paths and signed URLs with zero infra setup; free tier covers portfolio scale.
**Alternatives considered:** Cloudflare R2 (avoids Vercel lock-in, but one more account/API key for no gain at this scope).

### UI
**Decided:** Tailwind CSS + shadcn/ui (Radix primitives) + lucide-react icons.
**Why:** Seven screens to build, several of them custom (trace viewer, policy-rule sliders) rather than generic CRUD forms. shadcn ships component code you own and edit, not a black-box dependency.

### Testing
**Decided:** Vitest (unit) + React Testing Library (component) + Playwright (e2e).
**Why:** `project-scope.md`'s success criteria explicitly call out tests on chunking boundaries, org-scoping in vector search, and policy-rule evaluation order — Vitest's speed keeps that a usable feedback loop rather than a chore.

### Lint / format
**Decided:** ESLint (`next/core-web-vitals`) + Prettier.
**Why:** Default, well-supported Next.js tooling; no need for anything more exotic at this scope.

### CI/CD & hosting
**Decided:** GitHub Actions (lint, typecheck, test on PR). Vercel for hosting and automatic preview deploys.
**Why:** Matches the "deploy after every phase" discipline the scope doc commits to, at no extra setup cost. Vercel's native Neon integration is the deciding factor over other hosts.

### Spend-ceiling bookkeeping
**Decided:** A plain Postgres aggregate query (`SUM(cost)`) per request, scoped to agent and day. No Redis.
**Why:** At this scale a query is enough. Reaching for Upstash Redis now would be solving a scaling problem the "hundred organisations" interview question is supposed to be answered in words, not in code, for v1.

### Repo shape
**Decided:** Single Next.js app, no monorepo.
**Why:** One app, one deploy target, a 22–27 day budget — Turborepo/workspace tooling buys nothing here.

---

## 2026-10-01 — Evaluation design: two confidence checks, not one

**Decided:** Two independent checks, at two different points in the request lifecycle, feeding one evaluation workflow:

1. **Similarity threshold** — computed from retrieved chunks, before generation starts. Synchronous, free, deterministic. Below threshold: a fixed fallback is returned, generation never runs. Above threshold: generation proceeds and streams immediately.
2. **Faithfulness check** — a model call comparing the completed response's claims against the chunks that were retrieved. Runs *after* the response has already streamed to the user, asynchronously, scoring the exchange on the backend only. The score is logged as a new trace field. Below threshold: the conversation is auto-flagged, using the same flag mechanism and reason field as manual flagging. No live correction in v1 — tokens already streamed can't be retracted.

**Why both:** a similarity score never looks at what the model actually wrote, so it can't catch generation drifting from, embellishing, or contradicting good retrieval. A faithfulness check never runs in time to gate anything live. Each is structurally blind to the failure the other catches — they're two stages of one workflow, not a cheap filter and an expensive backup for it.

**Why the faithfulness check runs async, not synchronously:** it's a second model call; running it inline would double generation cost and latency on every single query, which undermines exactly the responsiveness the similarity gate exists to protect.

**Resolves:** the open question in `project-scope.md` ("does the confidence check run as a second model call, or from similarity scores alone?") — not either/or, both, at different stages, for different purposes.

**Updated accordingly in `project-scope.md`:** the Policy rules section (rule types, evaluation flowchart, admin editing surface — now two threshold controls, not one), the conversation trace's field list, one success criterion, and two interview-prep questions.

**Still open — flagging before Phase 3/4 implementation:**
- **Faithfulness check model & prompt.** What model runs it (plausibly Haiku — it's a background classification task, not a generation task) and what it's actually asked to return: a binary faithful/unfaithful, or a numeric score with a configurable cutoff? The scope doc's phrasing ("falls below a configured threshold") implies numeric, but that's not yet pinned down.
- **Where "async after the response" actually runs on Vercel.** A serverless function can terminate once its response is sent — fire-and-forget inside the same request handler isn't safe. Next.js's `after()` (built on Vercel's `waitUntil`) is the mechanism that keeps a function alive just long enough to run the faithfulness check post-response, without a separate queue. Worth confirming this is how we build it before Phase 3, since it affects where the faithfulness-check code physically lives (same route handler vs. a separate function).
- **Faithfulness threshold default.** Needs an initial number before Phase 1's real test document gives us something to calibrate against — a placeholder to revisit once there's real retrieval data to look at, same as the two open questions already in `project-scope.md` about PDF-only scope and chunking strategy.