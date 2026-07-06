# How the Town Coordinates — Fabric, Council & Briefing

> Messaging, the Council, and the Briefing are three faces of **one** thing: hobits coordinating.
>
> **messaging = events + threads · the Council = a structured thread · the Briefing = the curated
> view of the most important posts.**

## One coordination fabric

- **Shared blackboard** — persistent threads where hobits post (visible → great for observability
  + memory). A Council topic *is* a thread; a finding *is* a post.
- **Event bus (pub/sub)** — hobits publish events ("dep X flagged malicious", "complexity spiked
  in repo Y") and others **subscribe** to what they care about → one hobit's finding *triggers*
  another, without hard-wiring them together.
- **Direct asks** — a hobit can ask another a pointed question ("cost hobit: € impact of
  reprocessing 3yr?") and await the answer (a targeted thread).

## The Council (topic workspace)

Dardan drops a **topic name + description**. Relevant hobits contribute.

- **Style: DEBATE + synthesizer** (agreed):
  1. **R1** — each relevant hobit gives an independent take.
  2. **R2** — hobits *see and challenge* each other's takes (the idempotency hobit catches what
     the backfill hobit missed).
  3. **R3** — a **"chair"** synthesizes a grounded final recommendation, with the raw takes /
     disagreement **expandable** underneath.

  This catches blind spots and realizes the self-critic + devil's-advocate goals. Costs more
  tokens than a plain panel — worth it for quality.

- **Roster: HYBRID** (agreed): the platform **auto-suggests** relevant hobits (topic ↔ domain/tags
  match); Dardan **adds/removes** before or during. The "just write a topic and the right experts
  appear" magic, plus control.

## The Briefing (signal policy)

Every hobit run ends in a **self-score** (importance / confidence / urgency), which gives the
Briefing a natural filter.

- **Policy: TIERED** (agreed):
  - **NOW** — only true P0 (e.g. a malicious dep) interrupts in near-real-time.
  - **DAILY** — everything else batches into a once-a-day Briefing Dardan opens deliberately.
  - **WEEKLY** — low-priority items roll up into a weekly roundup.
- Feedback tunes the thresholds over time.

> **Why tiered:** with many hobits running daily, a feed would bury Dardan and he'd stop opening
> the app within two weeks. Tiering keeps it **calm** while guaranteeing nothing critical is
> missed — the embodiment of *thoughtful & quiet > fast & noisy*.
