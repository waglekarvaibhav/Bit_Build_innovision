"""Provider-side package management and package-related booking flow.

Multitasking package: owned by one provider, bundles 2+ of their own services,
priced at package hourly rate x booked hours (computed server-side).

Team package: 2+ distinct providers, a lead that receives/accepts/rejects the
request and requests completion, team hourly rate x booked hours (not x member
count). All members see the booking in activity but only the lead acts as lead.

Booking-time snapshots preserve the agreement after later package edits/archival.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_role
from ..models import (
    Package,
    PackageMember,
    PackageServiceBundle,
    PackageStatus,
    PackageType,
    Role,
    User,
)
from ..schemas import PackageCreateIn, PackageUpdateIn
from ..services import validate_package

router = APIRouter(prefix="/api/providers", tags=["packages"])


def _package_service_names(pkg: Package) -> list[str]:
    return [b.service.name for b in pkg.services]


def _package_dict(pkg: Package) -> dict:
    lead = pkg.lead
    members = [
        {"user_id": pm.user_id, "name": pm.user.full_name, "role": pm.role, "is_lead": pm.is_lead}
        for pm in pkg.members
    ]
    return {
        "id": pkg.id,
        "name": pkg.name,
        "description": pkg.description,
        "package_type": pkg.package_type.value,
        "hourly_rate": pkg.hourly_rate,
        "status": pkg.status.value,
        "owner_id": pkg.owner_id,
        "owner_name": pkg.owner.full_name,
        "locality": pkg.locality,
        "services": _package_service_names(pkg),
        "service_ids": [b.service_id for b in pkg.services],
        "service_count": len(pkg.services),
        "member_count": len(members),
        "lead": {"user_id": lead.user_id, "name": lead.user.full_name} if lead else None,
        "members": members,
    }


@router.get("/me/packages")
def my_packages(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    rows = db.query(Package).filter(Package.owner_id == user.id).order_by(Package.created_at.desc()).all()
    return {"packages": [_package_dict(p) for p in rows]}


@router.post("/me/packages", status_code=201)
def create_package(
    payload: PackageCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    for sid in payload.service_ids:
        from ..models import Service
        if db.get(Service, sid) is None:
            raise HTTPException(status_code=400, detail=f"Unknown service id {sid}")

    pkg = Package(
        name=payload.name.strip(),
        description=payload.description.strip(),
        package_type=payload.package_type,
        hourly_rate=payload.hourly_rate,
        status=payload.status,
        owner_id=user.id,
        locality=payload.locality.strip(),
    )
    # Validate structure (needs pkg fields set before validation).
    if payload.package_type == PackageType.multitasking:
        members_for_validate = []
    else:
        members_for_validate = payload.member_ids
    validate_package(pkg, payload.service_ids, members_for_validate, payload.lead_member_id, user)

    db.add(pkg)
    db.flush()
    for sid in payload.service_ids:
        db.add(PackageServiceBundle(package_id=pkg.id, service_id=sid))

    if payload.package_type == PackageType.team:
        if not payload.member_ids:
            raise HTTPException(status_code=400, detail="Team package requires members")
        for mid in payload.member_ids:
            member = db.get(User, mid)
            if member is None or member.role != Role.provider or member.provider_profile is None:
                raise HTTPException(
                    status_code=400, detail=f"Member id {mid} is not a valid provider"
                )
            db.add(
                PackageMember(
                    package_id=pkg.id,
                    user_id=mid,
                    is_lead=(mid == payload.lead_member_id),
                    role="Lead" if mid == payload.lead_member_id else "Member",
                )
            )
    db.commit()
    db.refresh(pkg)
    return _package_dict(pkg)


@router.get("/me/packages/{package_id}")
def get_my_package(
    package_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    pkg = db.get(Package, package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    # Ownership + membership access: owner or any team member may view.
    member_ids = [m.user_id for m in pkg.members]
    if pkg.owner_id != user.id and user.id not in member_ids:
        raise HTTPException(status_code=403, detail="Not authorized for this package")
    return _package_dict(pkg)


@router.put("/me/packages/{package_id}")
def update_package(
    package_id: int,
    payload: PackageUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    pkg = db.get(Package, package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    if pkg.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the package owner can edit it")
    data = payload.model_dump(exclude_unset=True)

    if "name" in data:
        pkg.name = data["name"].strip()
    if "description" in data:
        pkg.description = data["description"].strip()
    if "hourly_rate" in data:
        pkg.hourly_rate = data["hourly_rate"]
    if "status" in data:
        pkg.status = data["status"]
    if "locality" in data:
        pkg.locality = data["locality"].strip()

    if "service_ids" in data:
        existing = {b.service_id for b in pkg.services}
        new_ids = set(data["service_ids"])
        for b in list(pkg.services):
            if b.service_id not in new_ids:
                db.delete(b)
        for sid in new_ids - existing:
            from ..models import Service
            if db.get(Service, sid) is None:
                raise HTTPException(status_code=400, detail=f"Unknown service id {sid}")
            db.add(PackageServiceBundle(package_id=pkg.id, service_id=sid))

    if "member_ids" in data or "lead_member_id" in data:
        if pkg.package_type == PackageType.team:
            current = {m.user_id for m in pkg.members}
            target_ids = set(data.get("member_ids", list(current)))
            lead_target = data.get("lead_member_id")
            if lead_target is None:
                existing_lead = pkg.lead
                lead_target = existing_lead.user_id if existing_lead else None
            if lead_target not in target_ids:
                raise HTTPException(status_code=400, detail="Lead must be a member")
            for m in list(pkg.members):
                if m.user_id not in target_ids:
                    db.delete(m)
            for uid in target_ids:
                member_row = next((m for m in pkg.members if m.user_id == uid), None)
                if member_row is None:
                    member_obj = db.get(User, uid)
                    if member_obj is None or member_obj.role != Role.provider:
                        raise HTTPException(status_code=400, detail=f"Invalid provider id {uid}")
                    db.add(
                        PackageMember(
                            package_id=pkg.id,
                            user_id=uid,
                            is_lead=(uid == lead_target),
                            role="Lead" if uid == lead_target else "Member",
                        )
                    )
                else:
                    member_row.is_lead = (uid == lead_target)
                    member_row.role = "Lead" if uid == lead_target else "Member"
        else:
            # multitasking packages have no members
            if "member_ids" in data and data["member_ids"]:
                raise HTTPException(status_code=400, detail="Multitasking packages cannot have members")

    validate_package(
        pkg,
        [b.service_id for b in pkg.services],
        [m.user_id for m in pkg.members],
        (pkg.lead.user_id if pkg.lead else None),
        user,
    )
    db.commit()
    db.refresh(pkg)
    return _package_dict(pkg)


@router.post("/me/packages/{package_id}/archive")
def archive_package(
    package_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.provider)),
):
    pkg = db.get(Package, package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")
    if pkg.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the package owner can archive it")
    pkg.status = PackageStatus.archived
    db.commit()
    db.refresh(pkg)
    return _package_dict(pkg)
