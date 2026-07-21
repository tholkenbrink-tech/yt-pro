from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CookieStatusOut(BaseModel):
    status: str
    uploadedAt: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CookieTestOut(BaseModel):
    status: str
    message: str
