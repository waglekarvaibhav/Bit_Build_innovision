"""CrewNest FastAPI application entrypoint.

Serves the REST API and the single-page-app static files from the same process.
Static uploads are mounted read-only under /uploads.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, engine
from .routers import auth, bookings, catalogue, photos, profiles, provider_packages

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
UPLOAD_ROOT = settings.absolute_upload_dir

app = FastAPI(title="CrewNest", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables on startup (dev-friendly; use schema scripts for prod-style DDL).
Base.metadata.create_all(bind=engine)

# API routers. Order matters for Starlette (first match wins): register
# static-segment routes BEFORE route-param routes. Catalogue has catch-all
# /api/providers/{profile_id} and /api/packages/{package_id}, so it goes last.
app.include_router(auth.router)
app.include_router(profiles.router)
app.include_router(provider_packages.router)
app.include_router(bookings.router)
app.include_router(photos.router)
app.include_router(catalogue.router)

# Uploaded images (read-only static mount)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_ROOT)), name="uploads")

# Static assets MUST be mounted BEFORE the SPA catch-all below so that real
# files under /css, /js, /pages, /assets are served (not index.html). Starlette
# matches mounts/routes in registration order.
css_dir = STATIC_DIR / "css"
if css_dir.exists():
    app.mount("/css", StaticFiles(directory=str(css_dir)), name="css")
js_dir = STATIC_DIR / "js"
if js_dir.exists():
    app.mount("/js", StaticFiles(directory=str(js_dir)), name="js")
pages_dir = STATIC_DIR / "pages"
if pages_dir.exists():
    app.mount("/pages", StaticFiles(directory=str(pages_dir), html=True), name="pages")
assets_dir = STATIC_DIR / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

_STATIC_INDEX = STATIC_DIR / "index.html"


@app.get("/")
def index():
    if _STATIC_INDEX.exists():
        return FileResponse(str(_STATIC_INDEX))
    return {"detail": "Frontend not built yet"}


@app.get("/health")
def health():
    return {"status": "ok", "app": "crewneat"}


# SPA fallback: any non-API, non-static path serves index.html so client-side
# routes like /login and /home work on direct navigation and refresh.
# Must be registered LAST so the static mounts and API routers take precedence.
@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    if full_path.startswith(("api/", "css/", "js/", "pages/", "assets/", "uploads/")):
        raise HTTPException(status_code=404, detail="Not found")
    if _STATIC_INDEX.exists():
        return FileResponse(str(_STATIC_INDEX))
    raise HTTPException(status_code=404, detail="Not found")
