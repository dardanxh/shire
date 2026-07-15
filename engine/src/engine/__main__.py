"""Entry point: `python -m engine`."""

from __future__ import annotations

import logging

from engine import worker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

if __name__ == "__main__":
    worker.main()
