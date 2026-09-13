# Engineering Judgment: The Anti-Over-Engineering Manual

**Audience:** every coding agent working in this repository (or any repo this file is copied into).
**Authority:** these instructions override your default coding style. When your instinct says "add structure, add a layer, make it flexible," this file wins. When the user explicitly asks for the complex version, the user wins.
**Domain:** LLM-based applications, end to end — frontend, backend, LLM workflows, and the architecture around them.

---

## 0. The Prime Directive

Act as a **lazy senior engineer**. Lazy means minimizing *total* work over the code's life: writing + reading + debugging + maintaining + explaining it. It does **not** mean skipping correctness — bugs are the most expensive work of all (see §10).

Spend your thinking budget on **"what is the easiest way to solve this?"** — not on "what is the best design for this?" Most of a senior's value is in the code they decide not to write.

- Every line of code is a liability. Code you don't write has no bugs, needs no tests, and costs no tokens to read.
- You are done when today's problem is solved and verified — not when the design is "clean," "extensible," or "scalable."
- The best diff is a deletion. The second best is a small edit to existing code. New files and new layers are the last resort.

---

## 1. TL;DR — The Ten Rules

If you retain nothing else, retain these:

1. **Solve today's stated problem.** Ignore all imagined tomorrows. "We might need" means we don't need.
2. **Least code that fully works.** Prefer deleting > editing > adding. Prefer no code > config change > library call > new code.
3. **Functions over classes. Plain code over frameworks.** Copy-paste twice; abstract on the third occurrence (Rule of Three).
4. **One implementation = zero interfaces.** No base class, factory, registry, or adapter until a second real implementation exists *today*.
5. **Hardcode single values.** Make something configurable only when the second concrete value is needed, not before.
6. **Handle errors at boundaries only.** Let impossible errors crash loudly. Never `catch`-log-continue in the middle of a stack.
7. **No performance work without a measurement.** No cache, queue, or async rewrite for imagined load.
8. **Boring tech already in the repo beats better tech that isn't.** New dependencies need to earn their place.
9. **Internal code has no backward-compatibility duty.** You own all callers — change them and delete the old path in the same diff. No shims, no deprecated params.
10. **Do exactly what was asked.** Mention adjacent problems in one sentence; don't fix them unasked. Never refactor code you're merely passing through.

Meta-rule: **complexity must be traceable to evidence** — a stated requirement, a measurement, or a failure that actually happened. If you can't name the evidence, build the simple version.

---

## 2. Tripwires — Stop and Justify

Before doing anything in the left column, you must be able to state the condition in the right column. If you can't, don't do it.

| You are about to… | Don't, unless… |
|---|---|
| Create an interface / abstract base class / adapter | ≥2 real implementations exist in this codebase **today** |
| Create a class | It holds state that outlives one call. Otherwise write a function |
| Extract a helper / create `utils` | A **second caller** exists right now |
| Add a new dependency | It replaces ≥100 lines you'd otherwise own, and stdlib/existing deps can't do it |
| Add a config option / env var / flag | A second value is needed **today**, by a stated requirement |
| Add a cache | You measured the slow path and can state the number |
| Add a queue / worker / async pipeline | Volume or latency is measured and a cron/loop can't handle it |
| Add try/catch | You can *handle* it here (retry, fallback, user-facing message) — not just log it |
| Split a file / create a new module | The file exceeds ~400 lines **and** has two unrelated reasons to change |
| Add an LLM call to a pipeline | Deterministic code (regex, SQL, string ops) can't do it acceptably (§5.10) |
| Reach for an agent framework / graph library | A fixed pipeline of plain function calls provably can't express the flow (§5.4) |
| Create a `.md` plan/summary/architecture doc | The user explicitly asked for that document |
| Keep an old code path "for compatibility" | An **external** consumer you don't control depends on it |
| Rewrite instead of patch | The patch was attempted and genuinely can't work |

---

## 3. Before Writing Code — The Decision Procedure

Run this sequence for every task. Most tasks should die at step 2 or 3.

1. **Restate the requirement in one sentence.** If your restatement contains "and also," "in the future," or "to make it easy to later" — cut those clauses. They are not the requirement.
2. **Try to solve it with no new code.** An existing function, a config value, a library feature, a SQL query, deleting the broken thing. Check what the repo already has before building: `grep` first, write second.
3. **Write the call site first.** Write the one line you *wish* existed (`const result = scoreFlight(flight)`), then implement the minimum that makes that line work. This kills speculative parameters and options nobody passes.
4. **Default to the dumbest complete solution.** "Dumb" = obvious, linear, readable in one pass, no indirection. You need a *reason* to upgrade from it — a real failure, a measurement, or a requirement — never a vibe that it's "not proper engineering."
5. **Match effort to blast radius.** A one-off script gets zero ceremony. An internal endpoint gets input validation and one error path. Code touching money, auth, or user data gets the full treatment (§10). Most code is in the first two categories.
6. **If two designs seem close in effort, pick the one with fewer moving parts** (fewer files, fewer deps, fewer processes) — and stop deliberating after ~10 minutes of analysis. Simple-and-shipped beats optimal-and-theoretical.

---

## 4. Hard Rules by Category

### 4.1 Abstraction & Indirection

- **NEVER** create an abstraction with one implementation. No `BaseProvider` with one subclass, no `interface Storage` with one struct, no strategy pattern with one strategy.
- **Rule of Three:** first time, write it inline. Second time, copy-paste and tweak (yes, really). Third time, *if the copies change for the same reason*, extract. Duplication is far cheaper than the wrong abstraction.
- **Suspect class names:** `Manager`, `Orchestrator`, `Coordinator`, `Engine`, `Factory`, `Provider`, `Registry`, `Strategy`, `Context`, `Wrapper`, `Helper`, `Service`, `Processor`. Each of these is usually a function wearing a costume. Write the function.
- A class with one public method and no state that outlives the call **is a function**. A class that is instantiated exactly once **is a module** (module-level functions + constants).
- **Every layer must earn its hop.** If a call passes through a layer that makes no decision and transforms no data (`handler → service → repository` where each just forwards), delete the layer. Depth of your own call chain before real work happens: ≤2.
- Composition of plain functions > inheritance. Inheritance depth >1 in application code needs written justification.
- **Locality of behavior wins:** code should live next to its only caller. A reader landing in one file should understand the behavior without a six-file safari.

### 4.2 Speculation (YAGNI)

- **NEVER** implement anything for a requirement that is not in the current task. No speculative parameters, no unused return fields, no "extension points."
- No plugin systems, no hooks, no "pluggable backends," no feature flags for features that don't exist yet.
- Don't generalize a function beyond its actual inputs. If it's only ever called with `"gemini"`, it doesn't need a `provider` parameter.
- Building for scale you don't have is speculation too: no sharding, no microservices, no multi-region thinking for an app with 10 users. 10,000× headroom via boring tech (one Postgres/SQLite, one process) is already there.

### 4.3 Files, Size & Structure

- Prefer editing an existing file over creating a new one. New file = new thing every future reader must discover.
- Don't shatter a 200-line file into five 40-line files. File count is a cost; jumping between files is a cost. Split at ~400+ lines *and* only along a real seam.
- No barrel files / re-export indexes unless the framework requires them.
- No `utils.py` / `helpers.js` dumping grounds. A helper lives next to its caller until a second caller appears; then it moves to the nearest shared location — named for what it does (`dates.js`), not "utils."
- Folder structure: as flat as you can stand. Introduce a folder when a directory exceeds ~10–15 files, not when a diagram would look nicer.

### 4.4 Dependencies

- Order of preference: **stdlib → dependency already in the repo → new dependency → write it yourself** (for small things, writing 30 lines beats adding a package).
- A new dependency must: replace ≥100 lines of code you'd otherwise maintain, be actively maintained, and be needed by the *current* task.
- **NEVER** add a framework to solve a library-sized problem. The canonical sin: adding LangChain to make one API call (§5.1).
- Never add a second library that does the same job as an existing one (two HTTP clients, two date libs, two state managers). Use what's there, even if the new one is nicer.

### 4.5 Configuration

- A value used in one place with one value is a **named constant**, not config: `MAX_RETRIES = 3` at the top of the file that uses it.
- Env vars are for things that genuinely differ between machines/environments: secrets, URLs, ports, mode toggles. Read them in **one** config file with defaults (`server/config.js`, `rca/thresholds.py` pattern); everything else imports from there.
- No config hierarchies, no config schemas, no "config service." No YAML for what a constant can do.
- Business thresholds that domain experts tune are a legitimate exception — keep them in one obvious, documented place (this repo: `THRESHOLDS.txt` → `rca/thresholds.py`).

### 4.6 Error Handling & Defensive Code

- Handle errors at **boundaries**: the HTTP handler, the job entry point, the CLI `main`, the external API call. Interior code assumes valid inputs and lets exceptions propagate.
- Only catch what you can **meaningfully handle**: retry it, fall back, or turn it into a user-facing message. A `catch` that only logs and re-raises (or worse, logs and continues) is noise — delete it.
- **NEVER** swallow errors: no `except: pass`, no `.catch(() => {})`, no defaulting to `{}`/`null` and limping on. Corrupt-but-running is worse than crashed — it fails later, further from the cause.
- Validate external input **once at the edge** (request body, LLM output, file contents), then trust it. Do not re-validate the same data in four layers. Do not null-check values the types/schema already guarantee.
- Log an error **once**, at the boundary that handles it, with context. Not at every level it passes through.
- Timeouts on every network call. That's boundary robustness, not over-engineering — external calls hang; that's evidence-backed.
- One error response shape per API: `{ "error": "human-readable message" }` + correct status code. No error-code taxonomies for internal apps.

### 4.7 Performance & Scale

- **No optimization without a measurement.** State the number ("this endpoint takes 4s, the query is 3.8s of it") before changing anything.
- O(n²) on n<1,000 is fine. A nightly job looping over 10k rows in sequence is fine. Readable-but-slower wins until slowness is *observed*.
- No caching layer until the un-cached path is measured too slow. First cache: an in-process dict or a SQLite table — not Redis.
- No concurrency machinery (queues, workers, async rewrites) below measured need. A cron job or a `setInterval` poller covers most "background processing."
- Never memoize/`useMemo`/`React.memo` preemptively (§7).

### 4.8 Backward Compatibility (Internal Code)

- This app owns all of its callers. When changing an internal function, **change every call site and delete the old path in the same diff.**
- **NEVER**: deprecated parameters kept "just in case," `functionV2` beside `function`, re-export shims, dead branches guarded by flags nobody sets.
- Migration layers, versioned internal APIs, and deprecation cycles are for *published* libraries and *external* consumers only.

### 4.9 Comments, Docs & Artifacts

- Comments state **constraints the code can't express** ("Databricks rate-limits at 10 qps," "order matters: gate before load"). Never narrate what the next line does, and never address the reviewer ("refactored to improve clarity").
- Don't generate `IMPLEMENTATION_PLAN.md`, `ARCHITECTURE.md`, `SUMMARY.md`, or diagram files unless explicitly asked. Deliver the code; explain in your reply. (This repo has already had to purge a pile of generated docs.)
- Docstrings on public entry points and anything with a non-obvious contract; nothing on self-explanatory internals.

### 4.10 Testing

- Test **behavior at seams**, not implementation: the endpoint returns the right JSON; the rule engine classifies the fixture correctly; the parser handles the malformed case. Follow the repo's existing pattern (e.g. `rca/tests/` + fixtures).
- A few high-value tests over exhaustive coverage. Test the code most likely to be wrong: parsing, branching logic, boundary math. Don't test getters, framework glue, or the language.
- **No mock forests.** If a test needs five mocks, you're testing wiring, not behavior — test one level higher with real objects, or lower with pure functions.
- Deterministic parts of LLM pipelines (prompt builders, output parsers, routing rules) get unit tests. Model behavior gets evals (§5.8) — never 50 mocked-LLM unit tests chasing coverage.
- Don't add a test framework to a repo that has a working pattern. Don't write tests for a throwaway script.

---

## 5. LLM Application Playbook

This is the domain where over-engineering is most rampant, most expensive, and most fatal. Every unnecessary LLM hop adds latency, cost, and a new probabilistic failure mode.

### 5.0 The Escalation Ladder

Start at the lowest rung that could plausibly work. Move up **one rung at a time**, only when the current rung demonstrably fails on real cases (you have the failing examples in hand):

1. **No LLM** — regex, string ops, SQL, a lookup table (§5.10)
2. **One prompt, one call**
3. **One call + structured output** (schema-enforced)
4. **Fixed workflow** — a hand-written pipeline of calls: chain, route, or parallelize (§5.4)
5. **Single agent** — one model, tools, a loop; the model picks the path
6. **Multi-agent** — only when a single context window measurably can't hold the task

Rungs 5–6 need explicit justification in your reply. Most production LLM features live on rungs 2–4 forever, and that is a sign of good engineering, not a lack of ambition.

### 5.1 Calling Models

- Call the provider SDK **directly** (`anthropic`, `openai`, `google-genai`). No LangChain/LlamaIndex/framework wrapper to make API calls — a chat loop is ~20 lines of SDK code, and frameworks hide exactly the things you must control (prompts, retries, token counts).
- **No provider-adapter hierarchy.** One `llm.py` (or `llm/_common.py`) owns: client init, model-name constants, timeout, retry, and call logging. Everything else imports `call_llm()` from it. That single file **is** the abstraction layer — it needs no interface, no factory, no plugins.
- A second provider, when it truly arrives, is an `if provider == "..."` inside that one function. An adapter hierarchy is justified only at 3+ providers actively used in production.
- Retries: the SDK's built-in `max_retries`, or a ≤10-line loop with backoff on 429/5xx. No circuit breakers, no hedged requests, no fallback-across-providers chains for a v1.

### 5.2 Prompts

- Prompts are **string constants or templates in the same module that uses them** (or one `prompts.py` per pipeline). f-strings / template literals are enough. Jinja only when a prompt genuinely needs loops/conditionals.
- Prompts are versioned by git, like all other code. No prompt-management platform, no prompts-in-database, no A/B infrastructure until multiple non-engineers need to edit prompts in production.
- **One good prompt beats a chain of three mediocre ones.** Splitting one call into several is an escalation (ladder rung 4) and needs eval evidence that the split wins.
- When output quality is the problem, iterate on the **prompt and the inputs** before adding code complexity. Moving a quality fix from code into the prompt is usually the lazy-correct move.

### 5.3 Structured Output

- Use the API's native mechanism: structured output / `response_format` / tool-calling with a schema. **Do not write regex-based JSON extractors with five fallback strategies.**
- One schema (Pydantic/Zod), validated **once** at the boundary. On validation failure: one retry with the validation error appended to the prompt, then fail loudly. No "self-healing parser" frameworks.
- Keep schemas flat and small. Nested optional-everything schemas produce garbage fills; if the model keeps hallucinating a field, remove or restructure the field.

### 5.4 Workflows vs Agents

- **If you can write the steps down in order, it's a workflow — write it as plain code.** Function calls, an LLM call per step, values passed as arguments:

  ```python
  def analyze(flight):
      facts = build_facts(flight)                     # deterministic
      cause = classify_cause(facts)                   # LLM call 1
      actions = propose_actions(facts, cause)         # LLM call 2, schema-enforced
      return actions
  ```

  No graph library, no state-machine framework, no agent runtime. `if`/`for`/function composition already express: chaining, routing, parallel fan-out, and retries.
- The three workflow patterns, in order of preference: **chain** (fixed sequence), **route** (one cheap classify call picks a branch), **parallelize** (independent calls, then merge). Use the first that fits.
- Give a model tools-and-a-loop (a real agent) **only** when the path genuinely cannot be predetermined — open-ended research, debugging, "keep going until solved" tasks.
- **Single agent before multi-agent, always.** Multi-agent buys context isolation and parallelism at the cost of coordination bugs you cannot unit-test. It needs evidence a single context can't do the job.
- No planner/executor/critic architectures by default. Add a critic/review step only when evals show the failures it would catch.
- Inter-step state is a plain dict or dataclass passed as an argument. Not a "context manager," not a blackboard, not a framework's State object.

### 5.5 Tools (Function Calling)

- A tool is a plain function plus a JSON-schema/docstring. The "tool registry" is a list. No plugin architecture, no dynamic discovery, no tool base classes.
- Fewer, sharper tools beat many overlapping ones. If two tools always run together, merge them.
- Validate tool arguments the same as any external input (once, at entry), because the model **will** eventually send garbage.

### 5.6 RAG

- **Rung 0 — no retrieval:** if the whole corpus fits comfortably in the context window (rough guide: <100k tokens), put it in the prompt. Long context beats a vector database you must now operate.
- **v1 (the default):** fixed-size chunks with overlap → embed → store in the boring option (pgvector / `sqlite-vec` / FAISS file — not a new managed vector-DB service) → cosine top-k → stuff into the prompt. That's ~150 lines. Ship it, collect real failing queries.
- Escalate **one step at a time**, each step targeted at an *observed* failure category and measured by evals: metadata filtering → hybrid (BM25 + vector) → reranker → query rewriting → agentic retrieval. Never install the full stack preemptively.
- The highest-leverage RAG fix is usually **better chunking or better source data**, not a fancier retriever.

### 5.7 Chat History & Memory

- A conversation is a **list of messages in one table or JSON column**. Truncate oldest-first, or summarize-then-truncate when past the limit. That's the whole design.
- No event sourcing, no vector "memory subsystem," no knowledge graphs of user facts — until real users hit real limits that truncation can't handle, proven by real transcripts.

### 5.8 Evals, Logging & Caching

- Evals v1: **a script + 10–30 real cases** in a JSON/YAML file. Plain asserts for checkable outputs; an LLM-judge call for fuzzy ones. Runnable locally in one command. No eval platform, no dashboards.
- Every LLM call is logged by the one `call_llm()` function: prompt, response, model, tokens, latency, cost — to SQLite or a JSONL file. Adopt an observability SaaS only when grep-over-JSONL actually fails you.
- Cache LLM calls in dev by hashing `(model, prompt, params)` → disk/SQLite (this repo: `rca/disk_cache.py`). Makes retries and reruns free and deterministic. This is the cheapest reliability win in the entire stack — do it early.
- Pipelines are **idempotent by input hash**: re-running the same input must be safe and cheap.

### 5.9 Cost & Latency

- Default to the **cheap/fast model tier**; escalate a given step to the expensive model only when evals show that step needs it. Routing by difficulty is one `if`, not a "model router service."
- Streaming only where a human is watching tokens appear. Batch/offline jobs: no streaming, use batch APIs where they exist (~50% cheaper).
- Latency budget thinking: every sequential LLM hop is typically +1–10s. A five-hop chain is a 30-second feature — cut hops before you optimize anything else.

### 5.10 Don't Use an LLM Where Code Works

The laziest LLM call is the one you don't make. Before adding an LLM step ask: can regex, string ops, SQL, or a lookup table do this with acceptable accuracy? Deterministic code is free, instant, and testable.

- Extracting a flight number from a fixed format → regex, not an extraction prompt.
- "Classify" into categories that are actually rule-defined → `if` statements (this repo's `rca/rules/` does exactly this — deterministic rules first, LLM only for narrative).
- Never ask a model to do arithmetic, date math, sorting, or aggregation — compute in code, hand the model the computed result.
- Hybrid is the sweet spot: **deterministic skeleton, LLM for the genuinely fuzzy 10%** (language, judgment, unstructured input).

---

## 6. Backend Playbook

- **One process, one repo, one database.** Split a service only when team boundaries or measured scaling force it — never for "clean architecture."
- A CRUD endpoint is a route handler with a query in it. `handler → service → repository → mapper` for CRUD is forbidden; extract a function only when real logic exists or a second caller appears.

  ```js
  // ✅ The whole endpoint
  app.get('/api/flights/:id', (req, res) => {
    const flight = db.prepare('SELECT * FROM flights WHERE id = ?').get(req.params.id)
    if (!flight) return res.status(404).json({ error: 'flight not found' })
    res.json(flight)
  })
  ```

- Database: use what the repo uses (here: `better-sqlite3`, direct SQL). SQLite is a real production database for single-node apps. No ORM introduction, no repository-pattern wrapper around a DB client (the client *is* the repository).
- Background work ladder: `setInterval`/cron → a `jobs` table + poller → an actual queue system. Each step needs measured volume the previous can't handle.
- APIs: plain REST JSON, correct status codes, one error shape. No GraphQL, gRPC, or HATEOAS for internal apps.
- Auth & crypto: always a maintained library/platform, never hand-rolled — this is a §10 zone, not a lazy zone.
- Validation once at the route boundary; parameterized queries always (`?` placeholders — non-negotiable, §10).

---

## 7. Frontend Playbook

- Build the page as **one component first**. Extract a child component only when it's reused elsewhere or the file passes ~300 lines *and* has a clean seam. Three similar-looking blocks copy-pasted beat one `<GenericConfigurableCard>` with nine props.
- **State ladder:** `useState` in the component → lift to the nearest common parent → context for genuinely global concerns (auth, theme) → a store library only when context causes *measured, observed* pain. Do not install Redux/Zustand/Jotai by default.
- Server data: `fetch` in the component (or the router loader) is fine. React Query only when you actually need caching/refetching/invalidation across many views.
- No new component library or design system for an internal tool — this repo already has Tailwind + Radix primitives in `src/components/ui`; compose those.
- Forms: controlled inputs + one submit handler. A form library only for large dynamic forms with cross-field validation.
- **No preemptive `useMemo`/`useCallback`/`React.memo`.** Add them only for a re-render problem you observed in the profiler.
- Match robustness to audience: an internal dashboard needs a loading state and an error message — not skeleton screens, optimistic updates, retry-with-backoff, and offline support.
- Chat/streaming UI: rendering an SSE stream is ~30 lines of `fetch` + reader loop. Either hand-roll that or use one maintained hook — never build a custom streaming state-machine layer.

---

## 8. Boring-Tech Defaults

When a need arises, take the left-column default. Escalate right only with evidence.

| Need | Default (lazy, correct) | Escalate to (only with evidence) |
|---|---|---|
| Database | SQLite / one Postgres | Read replicas, sharding |
| Cache | In-process `Map`/dict, or a SQLite table | Redis |
| Background jobs | cron / `setInterval` + a `jobs` table | Celery / BullMQ / real queue |
| Search | SQL `LIKE` / SQLite FTS5 | Elasticsearch |
| Vector store | pgvector / sqlite-vec / FAISS file | Managed vector DB |
| Pub/sub between parts of one app | A function call | An event bus (almost never) |
| File storage | Local disk | S3-compatible object store |
| Deploy | One VM / one PaaS app | Kubernetes (requires org-level evidence) |
| Secrets/config | `.env` + one config module | Config service |
| LLM orchestration | Plain functions + SDK | (there is no second column) |

---

## 9. Worked Examples — ❌ → ✅

**Provider wrapper (the classic LLM-app sin):**

```python
# ❌ 6 files, 0 extra capability
class BaseLLMProvider(ABC):
    @abstractmethod
    def generate(self, req: LLMRequest) -> LLMResponse: ...
class GeminiProvider(BaseLLMProvider): ...
class LLMProviderFactory:
    def create(self, name: str) -> BaseLLMProvider: ...

# ✅ the entire abstraction layer (llm.py)
_client = genai.Client()

def call_llm(prompt: str, *, model: str = DEFAULT_MODEL, schema=None) -> str:
    t0 = time.monotonic()
    resp = _client.models.generate_content(model=model, contents=prompt,
                                           config=_config(schema))
    log_call(model, prompt, resp, time.monotonic() - t0)
    return resp.text
```

**Speculative generality:**

```python
# ❌ nobody asked for any of this
def export_report(data, format="json", compress=False, encoding="utf-8",
                  chunk_size=None, on_progress=None): ...

# ✅ what the task asked for
def export_report(data) -> str:
    return json.dumps(data, indent=2)
```

**Fixed pipeline dressed up as an agent:**

```python
# ❌ a graph framework, a State class, and a planner — for 3 steps that never vary
# ✅ the steps never vary, so it's code:
def run_rca(flight):
    metrics = compute_metrics(flight)          # deterministic
    if not is_weak(metrics):                   # deterministic gate — no LLM needed
        return healthy_result(metrics)
    causes = classify_causes(metrics)          # LLM, schema output
    return build_report(metrics, causes)       # deterministic
```

**Error theater:**

```js
// ❌ swallows the failure, ships corrupt state downstream
try { result = await computeShare(rows) }
catch (e) { console.error(e); result = {} }

// ✅ boundary handles it once, loudly
app.post('/api/share', async (req, res) => {
  try { res.json(await computeShare(req.body.rows)) }
  catch (e) { res.status(500).json({ error: e.message }) }   // logged by middleware once
})
```

---

## 10. When Complexity IS Justified — Do Not Be Lazy Here

The rules above are defaults, not dogma. Complexity is **bought with evidence**, and these areas come pre-loaded with evidence. Cutting corners here creates more total work, which violates the Prime Directive:

- **Trust boundaries:** validate/escape all external input; parameterized SQL always; secrets never in code or logs. No exceptions, no "it's internal."
- **Auth, crypto, payments, irreversible operations:** use maintained libraries; make destructive operations idempotent and transactional; confirm before irreversible actions.
- **Data loss:** real migrations for schema changes, backups before destructive scripts.
- **Actual concurrency:** if two writers genuinely race, use the real fix (transactions, locks, unique constraints) — not hope.
- **External API calls:** timeouts and bounded retries always (they *will* hang and flake — that's pre-paid evidence).
- **Published interfaces:** APIs/libraries with external consumers do need versioning and compatibility discipline (§4.8 applies to internal code only).
- **Measured problems:** once you have the number, fixing the measured path properly is not over-engineering — it's the job.
- **The user explicitly asked** for the robust/configurable/scalable version: build it, and build only the parts they named.

And the inverse guardrail: **simple ≠ sloppy.** Clear names, correct edge-case behavior at boundaries, and tests for real behavior are always required. The goal is the least *code*, never the least *care*.

---

## 11. Final Self-Review — Run Before Declaring Done

Check your diff against each item. Fix violations before finishing; don't explain them away.

1. Could a strong senior solve this in noticeably fewer lines or files? If yes, that's your rewrite.
2. Does every new file, class, dependency, and config option have ≥2 users or a stated requirement? Delete the ones that don't.
3. Did I build anything the task didn't ask for? Remove it (mention it in the reply instead).
4. Is there an abstraction with one implementation, a layer that makes no decision, or a parameter with one value? Inline it.
5. Can anything be deleted with all tests/behavior still passing? Delete it.
6. Does any `catch` swallow an error or merely log-and-continue mid-stack? Move handling to the boundary.
7. For LLM code: am I on the lowest workable rung of the ladder (§5.0)? Is every LLM hop necessary? Could a rung be deterministic code?
8. Scan your own reasoning for the red-flag vocabulary: *"for flexibility," "extensible," "future-proof," "in case," "pluggable," "generic," "framework," "scalable"* (with no number attached), *"best practice"* (with no failure it prevents). Each occurrence marks something to cut.
9. Would every hunk of the diff survive the question **"what breaks if I delete this?"** with a concrete answer?
10. Is the summary of what I did honest — including what I skipped and what I didn't verify?
