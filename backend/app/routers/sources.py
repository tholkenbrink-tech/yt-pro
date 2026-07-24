from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_csrf
from app.core.queue import enqueue_download_job
from app.models.download_profile import DownloadProfile
from app.models.monitored_source import MonitoredSource, MonitoredSourceMode
from app.models.monitored_source_item import MonitoredSourceItem, MonitoredSourceItemStatus
from app.models.source_check_run import SourceCheckRun
from app.models.user import User
from app.schemas.sources import (
    AnalyzeSourceRequest,
    AnalyzeSourceResponse,
    MonitoredSourceCreate,
    MonitoredSourceItemOut,
    MonitoredSourceOut,
    MonitoredSourceUpdate,
    SourceCheckRunOut,
)
from app.services import source_service, ytdlp_runner
from app.services.job_service import DuplicateJobError, create_job
from app.services.url_validation import validate_media_url

router = APIRouter(prefix="/api/sources", tags=["sources"])

_PENDING_ITEM_STATUSES = [
    MonitoredSourceItemStatus.DISCOVERED,
    MonitoredSourceItemStatus.AWAITING_CONFIRMATION,
]


def _has_pending_items(db: DBSession, source_id: str) -> bool:
    return (
        db.query(MonitoredSourceItem)
        .filter(MonitoredSourceItem.monitoredSourceId == source_id)
        .filter(MonitoredSourceItem.status.in_(_PENDING_ITEM_STATUSES))
        .first()
        is not None
    )


def _to_out(db: DBSession, source: MonitoredSource) -> MonitoredSourceOut:
    out = MonitoredSourceOut.model_validate(source, from_attributes=True)
    out.computedStatus = source_service.compute_source_status(source, _has_pending_items(db, source.id))
    profile = db.get(DownloadProfile, source.downloadProfileId)
    out.quality = profile.name if profile else ""
    return out


def _get_owned_source(db: DBSession, source_id: str, user: User) -> MonitoredSource:
    source = db.get(MonitoredSource, source_id)
    if not source or source.userId != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    return source


def _resolve_download_profile(db: DBSession, download_profile_id: str) -> DownloadProfile:
    profile = db.get(DownloadProfile, download_profile_id)
    if not profile:
        profile = db.execute(
            select(DownloadProfile).where(DownloadProfile.name == download_profile_id)
        ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown downloadProfileId")
    return profile


@router.post("/analyze", response_model=AnalyzeSourceResponse)
async def analyze_source(
    body: AnalyzeSourceRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    validated = validate_media_url(body.url)
    data = await ytdlp_runner.dump_json(validated, flat_playlist=True)
    entries = list(data.get("entries") or [])
    return AnalyzeSourceResponse(
        playlistTitle=data.get("title"),
        thumbnail=data.get("thumbnails", [{}])[-1].get("url") if data.get("thumbnails") else None,
        itemCount=len(entries) or (1 if data.get("id") else 0),
        externalPlaylistId=data.get("id"),
        channelName=data.get("channel") or data.get("uploader"),
    )


@router.get("", response_model=list[MonitoredSourceOut])
def list_sources(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    sources = db.execute(
        select(MonitoredSource).where(MonitoredSource.userId == user.id).order_by(MonitoredSource.createdAt.desc())
    ).scalars().all()
    return [_to_out(db, s) for s in sources]


@router.post("", response_model=MonitoredSourceOut, dependencies=[Depends(require_csrf)])
async def create_source(
    body: MonitoredSourceCreate, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    validated = validate_media_url(body.sourceUrl)
    profile = _resolve_download_profile(db, body.downloadProfileId)

    data = await ytdlp_runner.dump_json(validated, flat_playlist=True)

    source = MonitoredSource(
        userId=user.id,
        name=body.name,
        sourceUrl=validated,
        sourceType="playlist" if data.get("entries") is not None else "video",
        externalPlaylistId=data.get("id"),
        playlistTitle=data.get("title"),
        thumbnailUrl=data.get("thumbnails", [{}])[-1].get("url") if data.get("thumbnails") else None,
        downloadProfileId=profile.id,
        mode=body.mode,
        scheduleType=body.scheduleType,
        cronExpression=body.cronExpression,
        maximumNewItemsPerRun=body.maximumNewItemsPerRun,
        maximumBytesPerRun=body.maximumBytesPerRun,
        maximumDurationSeconds=body.maximumDurationSeconds,
        includeShorts=body.includeShorts,
        includeLivestreams=body.includeLivestreams,
        includePastLivestreams=body.includePastLivestreams,
        onlyPublishedAfter=body.onlyPublishedAfter,
        retentionPolicy=body.retentionPolicy,
        notificationsEnabled=body.notificationsEnabled,
        isQuickAccess=body.isQuickAccess,
    )
    source.nextCheckAt = source_service.compute_next_check(source.scheduleType, source.cronExpression, datetime.utcnow())
    db.add(source)
    db.commit()
    db.refresh(source)
    return _to_out(db, source)


@router.get("/{source_id}", response_model=MonitoredSourceOut)
def get_source(source_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    return _to_out(db, _get_owned_source(db, source_id, user))


@router.put("/{source_id}", response_model=MonitoredSourceOut, dependencies=[Depends(require_csrf)])
def update_source(
    source_id: str,
    body: MonitoredSourceUpdate,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    source = _get_owned_source(db, source_id, user)
    for field, value in body.model_dump(exclude_unset=True).items():
        if field == "downloadProfileId":
            value = _resolve_download_profile(db, value).id
        setattr(source, field, value)
    if body.scheduleType is not None or body.cronExpression is not None:
        source.nextCheckAt = source_service.compute_next_check(
            source.scheduleType, source.cronExpression, datetime.utcnow()
        )
    db.commit()
    db.refresh(source)
    return _to_out(db, source)


@router.delete("/{source_id}", dependencies=[Depends(require_csrf)])
def delete_source(source_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    source = _get_owned_source(db, source_id, user)
    db.delete(source)
    db.commit()
    return {"detail": "deleted"}


@router.post("/{source_id}/pause", response_model=MonitoredSourceOut, dependencies=[Depends(require_csrf)])
def pause_source(source_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    source = _get_owned_source(db, source_id, user)
    source.enabled = False
    db.commit()
    db.refresh(source)
    return _to_out(db, source)


@router.post("/{source_id}/resume", response_model=MonitoredSourceOut, dependencies=[Depends(require_csrf)])
def resume_source(source_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    source = _get_owned_source(db, source_id, user)
    source.enabled = True
    if not source.nextCheckAt:
        source.nextCheckAt = source_service.compute_next_check(
            source.scheduleType, source.cronExpression, datetime.utcnow()
        )
    db.commit()
    db.refresh(source)
    return _to_out(db, source)


@router.post("/{source_id}/check-now", response_model=MonitoredSourceOut, dependencies=[Depends(require_csrf)])
async def check_now(source_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    source = _get_owned_source(db, source_id, user)
    await source_service.check_source(source.id)
    db.refresh(source)
    return _to_out(db, source)


@router.get("/{source_id}/runs", response_model=list[SourceCheckRunOut])
def list_runs(source_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    _get_owned_source(db, source_id, user)
    runs = db.execute(
        select(SourceCheckRun)
        .where(SourceCheckRun.monitoredSourceId == source_id)
        .order_by(SourceCheckRun.startedAt.desc())
    ).scalars().all()
    return [SourceCheckRunOut.model_validate(r) for r in runs]


@router.get("/{source_id}/items", response_model=list[MonitoredSourceItemOut])
def list_source_items(source_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    _get_owned_source(db, source_id, user)
    items = db.execute(
        select(MonitoredSourceItem)
        .where(MonitoredSourceItem.monitoredSourceId == source_id)
        .order_by(MonitoredSourceItem.discoveredAt.desc())
    ).scalars().all()
    return [MonitoredSourceItemOut.model_validate(i) for i in items]


def _get_owned_source_item(db: DBSession, source_id: str, item_id: str, user: User) -> MonitoredSourceItem:
    _get_owned_source(db, source_id, user)
    item = db.get(MonitoredSourceItem, item_id)
    if not item or item.monitoredSourceId != source_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source item not found")
    return item


@router.post("/{source_id}/items/{item_id}/prepare", dependencies=[Depends(require_csrf)])
def prepare_source_item(
    source_id: str, item_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    source = _get_owned_source(db, source_id, user)
    item = _get_owned_source_item(db, source_id, item_id, user)
    profile = db.get(DownloadProfile, source.downloadProfileId)
    if not profile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown downloadProfileId")

    try:
        job = create_job(
            db,
            user_id=user.id,
            source_url=f"https://www.youtube.com/watch?v={item.youtubeId}",
            source_type="video",
            quality=profile.name,
            items=[
                {
                    "youtubeId": item.youtubeId,
                    "title": item.title,
                    "channelName": item.channelName,
                    "thumbnailPath": item.thumbnailUrl,
                    "duration": item.durationSeconds,
                }
            ],
            monitored_source_id=source.id,
            is_automatically_prepared=True,
        )
    except DuplicateJobError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "A matching job is already in progress", "existingJobId": exc.existing_job_id},
        ) from exc

    download_item = job.items[0] if job.items else None
    item.status = MonitoredSourceItemStatus.QUEUED
    item.downloadItemId = download_item.id if download_item else None
    db.commit()

    enqueue_download_job(job.id)
    return {"jobId": job.id, "status": item.status}


@router.post("/{source_id}/items/{item_id}/ignore", dependencies=[Depends(require_csrf)])
def ignore_source_item(
    source_id: str, item_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    item = _get_owned_source_item(db, source_id, item_id, user)
    item.status = MonitoredSourceItemStatus.IGNORED
    item.ignoredAt = datetime.utcnow()
    db.commit()
    return MonitoredSourceItemOut.model_validate(item)
