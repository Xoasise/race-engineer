"""
config.py
Centralises all configuration.

Required environment variables:
    DISCORD_TOKEN       – Discord bot token
    WRC_CHANNEL_ID      – ID of the text channel where documents are posted

Optional environment variables:
    SPORTITY_URLS_FILE  – Path to the JSON file that maps rally keys → Sportity URLs
                          Defaults to ./data/sportity_urls.json
"""

import json
import logging
import os

log = logging.getLogger("Config")

_DEFAULT_URLS_FILE = os.path.join(os.path.dirname(__file__), "data", "sportity_urls.json")


class Config:
    def __init__(self):
        # ── Discord settings ───────────────────────────────────────────────────
        raw_channel = os.environ.get("WRC_CHANNEL_ID", "0")
        try:
            self.WRC_CHANNEL_ID: int = int(raw_channel)
        except ValueError:
            log.error("WRC_CHANNEL_ID is not a valid integer: %r", raw_channel)
            self.WRC_CHANNEL_ID = 0

        # ── Sportity URL mapping ───────────────────────────────────────────────
        self._urls_file: str = os.environ.get("SPORTITY_URLS_FILE", _DEFAULT_URLS_FILE)
        self._rally_urls: dict[str, str] = {}
        self._load()

    # ── Public API ─────────────────────────────────────────────────────────────
    def get_rally_url(self, rally_key: str) -> str | None:
        return self._rally_urls.get(rally_key.upper())

    def set_rally_url(self, rally_key: str, url: str) -> None:
        self._rally_urls[rally_key.upper()] = url

    def save(self) -> None:
        os.makedirs(os.path.dirname(self._urls_file), exist_ok=True)
        with open(self._urls_file, "w", encoding="utf-8") as f:
            json.dump(self._rally_urls, f, indent=2)
        log.info("Saved %d Sportity URL(s).", len(self._rally_urls))

    # ── Internal ───────────────────────────────────────────────────────────────
    def _load(self) -> None:
        if os.path.exists(self._urls_file):
            try:
                with open(self._urls_file, "r", encoding="utf-8") as f:
                    self._rally_urls = json.load(f)
                log.info("Loaded %d Sportity URL(s) from file.", len(self._rally_urls))
            except (json.JSONDecodeError, OSError) as exc:
                log.warning("Could not load Sportity URLs (%s) — starting empty.", exc)
        else:
            log.info("No Sportity URL file found — starting empty.")
