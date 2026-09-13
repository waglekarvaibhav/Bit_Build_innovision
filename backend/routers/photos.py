"""Job photo uploads for before/after images.

Files are validated by content type and size, stored under the local uploads
directory, and served from the same app. Access to a booking's photo metadata is
limited to the booking customer and participating providers.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..dependencies import get_current_user
from ..models import Booking, BookingPhoto, PhotoType, User
from ..services import is_participant

router = APIRouter(prefix="/api/bookings", tags=["photos"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = 5 * 1024 * 1024  # 5 MB

# Ensure upload root and subfolders exist before FastAPI mounts /uploads.
UPLOAD_ROOT = settings.absolute_upload_dir
for _sub in ("booking-photos", "profile-images"):
    _d = UPLOAD_ROOT / _sub
    if not _d.exists():
        _d.mkdir(parents=True, exist_ok=True)


def _photo_url(rel_path: str) -> str:
    """Return the browser URL for a file stored below UPLOAD_ROOT."""
    rel = rel_path.replace("\\", "/").lstrip("/")
    return f"/uploads/{rel}"


def _served_photo_url(stored_url: str) -> str:
    """Normalize legacy photo URLs created before the /uploads mount fix."""
    url = (stored_url or "").replace("\\", "/")
    if url.startswith("/uploads/"):
        return url
    if url.startswith("/booking-photos/") or url.startswith("/profile-images/"):
        return "/uploads" + url
    return url


@router.get("/{booking_id}/photos")
def list_photos(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    b = db.get(Booking, booking_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not is_participant(b, user.id):
        raise HTTPException(status_code=403, detail="Only booking participants can view photos")
    rows = (
        db.query(BookingPhoto)
        .filter(BookingPhoto.booking_id == b.id)
        .order_by(BookingPhoto.created_at.desc())
        .all()
    )
    return [
        {
            "id": p.id,
            "photo_type": p.photo_type.value,
            "url": _served_photo_url(p.url),
            "created_at": p.created_at.isoformat(),
        }
        for p in rows
    ]


def _authorize_for_upload(booking: Booking, user: User) -> bool:
    """Customer, provider, or any participant may upload before/after photos."""
    return is_participant(booking, user.id)


@router.post("/{booking_id}/photos", status_code=201)
async def upload_photo(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    photo_type: PhotoType = ...,
    file: UploadFile = File(...),
):
    b = db.get(Booking, booking_id)
    if b is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not _authorize_for_upload(b, user):
        raise HTTPException(status_code=403, detail="Only booking participants can add photos")
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400, detail="Only JPEG, PNG, or WebP images are allowed"
        )
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Image exceeds 5 MB")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "img"
    if file.content_type == "image/jpeg":
        ext = "jpg"
    elif file.content_type == "image/png":
        ext = "png"
    elif file.content_type == "image/webp":
        ext = "webp"

    fname = f"b{b.id}_{uuid.uuid4().hex}.{ext}"
    rel_dir = "booking-photos"
    abs_dir = UPLOAD_ROOT / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)
    abs_path = abs_dir / fname
    with open(abs_path, "wb") as fh:
        fh.write(data)

    url = _photo_url(f"{rel_dir}/{fname}")
    rec = BookingPhoto(
        booking_id=b.id,
        photo_type=photo_type,
        filename=fname,
        url=url,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {"id": rec.id, "photo_type": rec.photo_type.value, "url": rec.url}
