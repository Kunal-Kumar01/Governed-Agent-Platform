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
**Superseded 2026-10-19:** see the dedicated entries near the bottom of this log — switched to `voyage-4-lite`, with dimension further revised 2026-10-20. Left as originally written here rather than edited, for the history; the later entries are the correction.

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

---

## 2026-10-19 — Document ingestion pipeline, file format support, and document lifecycle

*Revised same day — see note at the end of each subsection below. The pipeline was initially drafted with diagram handling and Word support in scope; both were pulled back into the backlog within the same day, before any implementation, once the added cost (and its knock-on need for a payment gateway) became clear. Kept here rather than silently rewritten, since the reasoning on both sides is worth keeping.*

### Chunking pipeline

**Decided (v1):** Plain text extraction (`unpdf`, the existing Oct 1 pick) feeding recursive character chunking, splitting at natural heading/paragraph boundaries. Structure-aware from the start — this still resolves the "fixed-size vs. structure-aware chunking" open question from `project-scope.md`'s *Risks and open questions* in favor of structure-aware, deliberately skipping the fixed-size-first staging that doc originally proposed. That part of the Oct 19 decision stands.

**Deferred, not decided:** Diagram isolation, vision-model captioning of diagrams, and Markdown synthesis of those captions back into the document — originally drafted as the first three stages of a six-stage pipeline here. Pulled out the same day: every diagram would cost a model call at ingestion time, on top of the generation/embedding/faithfulness-check costs already in the per-query path, and that stacked cost is what surfaced the payment-gateway gap below. Rather than build diagram handling into the v1 baseline and discover the cost problem after the fact, it's tracked as its own backlog issue ("Diagram-aware document chunking") to be sized and funded on its own terms.

**Why the chunking-strategy resolution survives the descope:** recursive character chunking at heading/paragraph boundaries is a property of how already-extracted plain text gets split — it never depended on diagrams existing in the first place. Deferring diagram work doesn't reopen this part of the decision.

### File format support

**Decided (v1):** PDF only. Word (`.docx`) support, briefly decided earlier the same day, is reverted — not pursued for v1, no backlog issue filed for it (lower priority than the two issues below; revisit if it comes up again).
**Why:** Keeps v1 to one parser (`unpdf`) and one format's edge cases. Nothing about the schema or pipeline shape would need to change to add Word later — same extract-then-chunk flow, just a second parser behind the same chunking step — so deferring it costs nothing structurally. This also fully resolves `project-scope.md`'s "PDF-only vs. plain-text" open question, in the direction the question actually anticipated (plain PDF-only), superseding the PDF+Word framing from earlier the same day.

### Document deletion

**Decided:** Unchanged from earlier today — deleting an agent cascades to delete its documents (`onDelete: "cascade"` on `documents.agentId`).
**Still open:** Whether the cascade extends one level further, to a document's `chunks` — presumed yes, not yet stated explicitly.

### Document count/size limit

**Decided:** Unchanged — no per-agent document limit or size cap for v1.

### Public identifier

**Decided:** Unchanged — documents do not get a `publicId` the way `agents` did; they're agent-internal, never addressed directly by an end user.

### New: payment gateway, surfaced by cost exposure

**Decided:** A payment/funding mechanism for API spend is now treated as real, trackable scope rather than left unstated — raised the same day the diagram-aware pipeline was drafted, because per-diagram vision-model calls at ingestion, stacked on top of per-query generation, embedding, and faithfulness-check costs already committed to, make aggregate API spend a genuine financial exposure once this is more than one person's personal API key absorbing the bill.
**Why now:** The existing per-agent daily spend ceiling (`project-scope.md`'s *Cost tracking* → "The budget ceiling") stops one agent's runaway spend, but nothing stops or funds aggregate spend across all agents and organisations. `project-scope.md`'s *Non-goals* currently reads "Billing and payments... Cost tracking is observability, not invoicing" — this doesn't reverse that non-goal here, it flags that the non-goal is worth re-examining once diagram captioning (or any other cost increase) is actually built, because observability without a way to fund or cap spend doesn't resolve the exposure it reveals.
**Tracked as:** its own backlog issue ("Payment gateway for spend funding") — deliberately not sized or designed in this log entry, just raised as real scope.
**Still open:** Whether this reopens `project-scope.md`'s "Billing and payments" non-goal outright, or lands as something narrower (e.g. a funded balance behind the existing spend ceiling, short of full subscription billing). Left to the issue to resolve.

---

## 2026-10-19 — Embedding model: switch to `voyage-4-lite` (supersedes the Oct 1 pick)

**Decided:** Switch the embedding model from `voyage-3-lite` (the original Oct 1 pick, under *Stack → Embeddings*) to `voyage-4-lite`, Voyage's current-generation "latency and cost" model. Output dimension: 1024 (its default).

**Why:** `voyage-3-lite` is still callable via the API but sits in Voyage's "Older models" tier with a fixed 512-dimension output and no alternatives. `voyage-4-lite` is the current-generation model in that same latency/cost niche, and it shares the 1024-dimension default with every other model in the 4-series (`voyage-4-large`, `voyage-4`, `voyage-code-4`). That consistency is the actual reason for the switch: if a specialised model is substituted in later — a finance- or law-tuned one, say, matching the agent categories this platform already has (Law/Compliance, Marketing, HR, etc.) — staying on the 1024-dimension default now means no `pgvector` column-width migration is forced later just to make that swap.

**Caveat worth recording, even though it doesn't change this decision:** matching dimension is not the same as a compatible embedding space. Voyage's own docs state the cross-model compatibility guarantee specifically for the 4-series ("all embeddings created with the 4-series are compatible with each other"). `voyage-finance-2` and `voyage-law-2` also default to 1024 but are not 4-series models, so a future swap to either wouldn't carry that same guarantee even though the column width would already fit — the dimension match avoids a schema migration, it doesn't by itself guarantee old and new vectors are comparable. Already flagged once (Oct 19, chunking-considerations discussion) and judged a non-concern at this project's scale; recorded here again only because it's directly relevant to why a future specialised-model swap was named as the reason for this change.

**Schema impact (superseded the next day — see below):** `chunks.ts`'s `EMBEDDING_DIMENSIONS` constant changed from `512` to `1024`.

**`project-scope.md` impact:** none — it never names Voyage or a specific dimension, only "an embeddings model" generically, so nothing there needs updating.

---

## 2026-10-20 — Embedding dimension: 512, not the 1024 default

**Decided:** Stay on `voyage-4-lite` (the Oct 19 pick) as the model, but configure it for **512-dimension output** instead of accepting its 1024 default. `voyage-4-lite` supports 256/512/1024/2048 as explicit, first-class output-dimension options — this is a parameter choice on the same model, not a reversion to `voyage-3-lite`.

**Why:** Keeps everything gained by moving off `voyage-3-lite` the day before — current-generation model, the 200-million free-token allowance — while avoiding the storage/compute cost of a 1024-dimension vector per chunk, which the Oct 19 entry already flagged as a minor-but-real trade-off. `voyage-3-lite` was also 512-dimensional, but fixed at that size and without the free tier; `voyage-4-lite` configured at 512 strictly dominates it — same vector footprint, newer model, free tokens, and still inside the 4-series cross-compatibility guarantee if a 4-series specialised model is ever substituted in later.

**Schema impact:** `chunks.ts`'s `EMBEDDING_DIMENSIONS` constant moves back to `512` — this time as an explicitly configured `voyage-4-lite` output dimension, not `voyage-3-lite`'s fixed one.

**`project-scope.md` impact:** none, same reason as the Oct 19 entry — no dimension is named there.