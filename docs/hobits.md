# The Hobit — Anatomy, Life, Memory & Feedback

> A **hobit** is the atomic unit: *persona + narrow expertise + tools + memory + autonomy level +
> feedback loop*. It's not just a prompt — it's an entity that persists, learns Dardan's taste,
> watches its domain, and reports back.

## Anatomy (fully configurable — Dardan wants full control)

- **Identity** — name, one-line purpose, optional avatar/vibe.
- **Charter** — its domain + operating instructions (the prompt-guided expertise).
- **Exemplars** — curated examples of a *great* response (few-shot taste Dardan maintains).
- **Tools / actions** — read the substrate, ask the semantic index, web search, subscribe to a
  feed, post to the Briefing, message another hobit, open a note.
- **Inputs** — what it watches: which repos, which links, which topics.
- **Cadence** — when it wakes: schedule, or triggered by an event / another hobit.
- **Autonomy level** — Q&A → suggest → act-and-notify → autonomous.
- **Memory config** — how much it retains and at what detail.
- **Tone / persona** — how it talks.

## Lifecycle of a run

1. **Wake** (scheduled or triggered).
2. **Load context** = charter + distilled facts + relevant substrate + **lessons learned** (from
   feedback).
3. **Work** — reason over the new deltas, or answer the topic.
4. **Self-critique** — a built-in reflection pass: *"is this non-obvious, correct, and worth
   Dardan's attention?"*
5. **Self-score** — importance / confidence / urgency → decides whether to even surface.
6. **Emit** — to the Briefing (if it clears the bar), a topic thread, or a message to another
   hobit.
7. **Distill (KISS pass)** — extract durable facts, prune episodic detail per retention config.
   This is what lets it "restart tomorrow already knowing a lot without re-reading everything."
8. **Sleep.**

## Memory — four tiers per hobit

- **Working** — this run's context (ephemeral).
- **Episodic** — a log of what it did/said and how Dardan reacted (summarizable, prunable).
- **Semantic / facts** — durable distilled truths ("repo X writes Parquet to S3", "Dardan reasons
  in €"). The "start tomorrow with context" layer.
- **Lessons / preferences** — derived from feedback; **human-readable and editable by Dardan
  directly**.

## Agreed decisions

- **Memory sharing: SHARED knowledge + PRIVATE taste.** Substrate + a shared pool of "town facts"
  everyone reads (collective brain — the security hobit benefits from what the cost hobit learned
  about repo X); each hobit keeps its own private lessons / persona / taste. **One brain, many
  personalities.**
- **Feedback: THUMBS + 1–10 + optional NOTE.** Thumbs always (zero friction), 1–10 optional
  (nuance), free-text note optional (gold — becomes a lesson). All three feed the editable
  **"lessons learned"** list injected into the charter each run, so Dardan can *watch* the hobit
  change and hand-edit it. The 1–10 score also feeds Briefing ranking + performance tracking.
- **Autonomy: MANUAL per-hobit setting.** Dardan sets each hobit's level and it stays until
  changed. Predictable, full control. *(An optional auto-promotion "trust ladder" may be added
  later as a convenience, but manual is the default.)*

## The feedback loop must visibly close

The failure mode is feedback that vanishes into a score nobody sees. So feedback is distilled into
the **editable "lessons learned" list**, injected into the hobit's charter every run — Dardan can
literally *watch* the hobit change, and edit the lessons himself. Feedback you can *see working* is
feedback you'll keep giving.
