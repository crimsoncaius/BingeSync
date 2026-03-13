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

    @property
    def openrouter_configured(self) -> bool:
        return bool(self.openrouter_api_key)


settings = Settings(
    openrouter_api_key=os.getenv("OPENROUTER_API_KEY", "").strip() or None,
)
