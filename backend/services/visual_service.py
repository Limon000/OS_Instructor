"""Serialises visuals.py output to JSON-safe formats for the API."""

from __future__ import annotations

import base64
import io
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Make visuals.py importable from repo root
REPO_ROOT = Path(__file__).parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from visuals import render_visual  # noqa: E402


def serialize_visual(tag_name: str, args: str) -> dict | None:
    if not tag_name:
        return None
    kind, data = render_visual(tag_name, args)
    if kind == "matplotlib":
        buf = io.BytesIO()
        data.savefig(buf, format="png", dpi=120, bbox_inches="tight")
        plt.close(data)  # prevent figure accumulation
        return {
            "kind": "matplotlib",
            "data": base64.b64encode(buf.getvalue()).decode(),
        }
    elif kind == "graphviz":
        # Return raw DOT source — browser renders via @viz-js/viz WASM
        return {"kind": "graphviz", "data": data}
    return None
