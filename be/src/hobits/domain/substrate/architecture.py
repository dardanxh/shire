"""Catalog of architecture diagrams a hobit can generate for a repository (Mermaid).

Each entry is a *possibility* the user can generate on demand — we never precompute the whole set.
A generated diagram is a single Mermaid block produced by `claude -p` after it explores the clone.
Add a new diagram by appending a `DiagramKind`; the API + UI pick it up automatically.
"""

from __future__ import annotations

from dataclasses import dataclass

# The most important elements to draw — keeps diagrams legible instead of exhaustive.
_MAX_ELEMENTS = 22


@dataclass(frozen=True)
class DiagramKind:
    slug: str
    title: str
    description: str
    category: str  # Structural | Behavioral | Data
    mermaid_type: str  # flowchart | sequenceDiagram | stateDiagram-v2 | erDiagram | classDiagram
    guidance: str  # what this diagram should capture


CATALOG: tuple[DiagramKind, ...] = (
    DiagramKind(
        "component",
        "Component map",
        "The major components/modules and how they wire together.",
        "Structural",
        "flowchart",
        "Show the top-level building blocks (apps, services, packages, layers, datastores, "
        "external systems) as nodes and their runtime or dependency relationships as edges. Group "
        "related nodes with subgraphs. This is the big-picture 'how is it put together' view.",
    ),
    DiagramKind(
        "module-deps",
        "Module dependency graph",
        "How the main packages/modules import and depend on each other.",
        "Structural",
        "flowchart",
        "Map the internal packages/modules as nodes and draw a directed edge A --> B when A "
        "depends on (imports/calls) B. Highlight the layering and call out any dependency cycles.",
    ),
    DiagramKind(
        "layers",
        "Layered architecture",
        "The architectural layers and what may call what.",
        "Structural",
        "flowchart",
        "Draw the layers top-to-bottom (e.g. entrypoints/UI, application/services, domain, data "
        "access, infrastructure) as subgraphs, place the real modules inside each, and show the "
        "allowed call direction between layers.",
    ),
    DiagramKind(
        "sequence",
        "Key sequence flow",
        "A primary end-to-end runtime flow across components.",
        "Behavioral",
        "sequenceDiagram",
        "Pick the single most important operation (e.g. the main request or job) and show the "
        "ordered messages between the participants that handle it, from entrypoint through the "
        "services and data access to the response. Use activations and note any async steps.",
    ),
    DiagramKind(
        "state",
        "State machine",
        "The lifecycle states of the system's central entity.",
        "Behavioral",
        "stateDiagram-v2",
        "Identify the core entity with a lifecycle (e.g. an order, a job, a repository) and draw "
        "its states and the transitions between them, including the initial and terminal states.",
    ),
    DiagramKind(
        "dataflow",
        "Data flow",
        "How data moves through the system, from sources to sinks.",
        "Behavioral",
        "flowchart",
        "Trace data from its external sources through the processing/transformation stages to "
        "where it is stored or emitted. Nodes are processes and datastores; edges are the data "
        "that flows between them, labelled with what is passed.",
    ),
    DiagramKind(
        "er",
        "Entity-relationship model",
        "The persistent data model and its relationships.",
        "Data",
        "erDiagram",
        "Infer the persisted entities (from models/schemas/migrations) and draw them with their "
        "key attributes and the relationships (cardinality) between them.",
    ),
    DiagramKind(
        "class",
        "Domain class model",
        "The key domain classes/types and their relationships.",
        "Data",
        "classDiagram",
        "Show the central domain classes/types with their important fields and methods, and the "
        "relationships between them (inheritance, composition, association).",
    ),
)

CATALOG_BY_SLUG: dict[str, DiagramKind] = {d.slug: d for d in CATALOG}


_PROMPT = """\
You are mapping the architecture of the repository **{repo}**, whose working tree is your current \
directory. Use your Read, Grep and Glob tools to inspect the actual source first — base it \
on what the code really does, not on assumptions.

Produce a **{title}**: {description}
{guidance}

Rules:
- Output a SINGLE Mermaid `{mermaid_type}` diagram and nothing else — no prose, no explanation.
- It must be valid Mermaid that renders as-is. Keep node/participant ids alphanumeric (letters, \
digits, underscores — no spaces or punctuation); put readable labels in brackets or after a colon.
- Stay focused and legible: at most the {max_elements} most important elements, not every file.
- Return ONLY one fenced block, starting with the diagram type keyword:
```mermaid
{mermaid_type} ...
```"""


def build_prompt(kind: DiagramKind, repo: str) -> str:
    """The `claude -p` prompt that asks for one Mermaid diagram of the given kind."""
    return _PROMPT.format(
        repo=repo,
        title=kind.title,
        description=kind.description,
        guidance=kind.guidance,
        mermaid_type=kind.mermaid_type,
        max_elements=_MAX_ELEMENTS,
    )
