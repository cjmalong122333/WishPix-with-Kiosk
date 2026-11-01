from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration from the environment (or .env). See .env.example."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    printer_mode: Literal["mock", "cups"] = "mock"
    cups_printer: str = ""
    cups_media: str = "4x6"
    cups_extra_options: str = "fit-to-page print-quality=4"

    paper_capacity: int = 20
    state_dir: Path = Path("./data")
    keep_pages: int = 200

    hardware_token: str = ""
    font_path: str = ""

    # Mock printer: how long one page takes.
    mock_page_seconds: float = 4.5
    # A job that has not finished after this long is reported as failed.
    job_timeout_seconds: float = 240
    # How long a printer problem may last before the waiting job is cancelled.
    problem_grace_seconds: float = 30

    @property
    def pages_dir(self) -> Path:
        return self.state_dir / "pages"


@lru_cache
def get_settings() -> Settings:
    return Settings()
