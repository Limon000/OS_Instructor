"""FastAPI entry point — CORS from env, CSP header on every response."""

from __future__ import annotations

import os

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from backend.routes.chat import router as chat_router
from backend.routes.session import router as session_router
from backend.routes.visual import router as visual_router

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

CSP = (
    "default-src 'self'; "
    "script-src 'self' 'wasm-unsafe-eval'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "connect-src 'self';"
)

app = FastAPI(title="OS Instructor API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_csp(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = CSP
    return response


app.include_router(chat_router, prefix="/api")
app.include_router(session_router, prefix="/api/session")
app.include_router(visual_router, prefix="/api/visual")
