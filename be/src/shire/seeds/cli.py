"""Console entry point: `shire-seed [--only name ...]`.

Registers every domain seeder; each runs in its own transaction and prints its stats.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable

from sqlalchemy.orm import Session

from shire.core.db import unit_of_work
from shire.seeds.blueprint import seed_blueprints
from shire.seeds.modelling import seed_modelling_strategies
from shire.seeds.principles import seed_principles
from shire.seeds.qualities import seed_qualities
from shire.seeds.security import seed_security
from shire.seeds.technology import seed_technology

# Order matters: blueprints/modelling strategies resolve technology slugs, so the
# catalog/corpus must exist first.
SEEDERS: dict[str, Callable[[Session], dict[str, int]]] = {
    "technology": seed_technology,
    "modelling": seed_modelling_strategies,
    "security": seed_security,
    "blueprint": seed_blueprints,
    "qualities": seed_qualities,
    "principles": seed_principles,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Load Shire seed data (idempotent).")
    parser.add_argument(
        "--only",
        nargs="*",
        choices=sorted(SEEDERS),
        help="Run only these seeders (default: all).",
    )
    args = parser.parse_args()
    # Registry order, not alphabetical — seeders may depend on earlier ones.
    names = args.only or list(SEEDERS)

    for name in names:
        with unit_of_work() as session:
            stats = SEEDERS[name](session)
        summary = ", ".join(f"{key}={value}" for key, value in stats.items())
        print(f"[seed:{name}] {summary}")


if __name__ == "__main__":
    main()
