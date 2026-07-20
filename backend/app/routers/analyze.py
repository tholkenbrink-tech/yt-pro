from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_csrf
from app.models.user import User
from app.schemas.analyze import AnalyzeRequest, AnalyzeResponse
from app.services.analyze_service import PlaylistTooLargeError, analyze_multi, analyze_url
from app.services.url_validation import InvalidUrlError
from app.services.ytdlp_runner import YtdlpError

router = APIRouter(prefix="/api", tags=["analyze"])


@router.post("/analyze", response_model=AnalyzeResponse, dependencies=[Depends(require_csrf)])
async def analyze(
    body: AnalyzeRequest,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        if body.urls:
            return await analyze_multi(body.urls, db)
        return await analyze_url(body.url, db)
    except InvalidUrlError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PlaylistTooLargeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except YtdlpError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to analyze URL") from exc
