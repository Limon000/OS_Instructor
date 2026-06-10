"""Standalone visual endpoint for testing: POST /api/visual."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.models import VisualPayload, VisualRequest
from backend.services.visual_service import serialize_visual

router = APIRouter()


@router.post("", response_model=VisualPayload)
def get_visual(req: VisualRequest) -> VisualPayload:
    raw = serialize_visual(req.tag_name, req.args)
    if raw is None:
        raise HTTPException(404, detail=f"Unknown visual tag: {req.tag_name!r}")
    return VisualPayload(kind=raw["kind"], data=raw["data"])
