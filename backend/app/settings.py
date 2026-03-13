from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


ROOT_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ROOT_ENV_PATH)


@dataclass(frozen=True)
class Settings:
    openrouter_api_key: str | None
    google_places_api_key: str | None
    openrouter_model: str
    app_base_url: str

    @property
    def openrouter_configured(self) -> bool:
        return bool(self.openrouter_api_key)

    @property
    def google_places_configured(self) -> bool:
        return bool(self.google_places_api_key)


settings = Settings(
    openrouter_api_key=os.getenv("OPENROUTER_API_KEY", "").strip() or None,
    google_places_api_key=os.getenv("GOOGLE_PLACES_API_KEY", "").strip() or None,
    openrouter_model=os.getenv("OPENROUTER_MODEL", "openai/gpt-4.1-mini"),
    app_base_url=os.getenv("APP_BASE_URL", "http://127.0.0.1:5173"),
)
