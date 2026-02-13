"""
document_store.py
Persists the set of already-posted document URLs to a JSON file so the bot
doesn't re-post documents after a restart.
"""

import json
import logging
import os

log = logging.getLogger("DocumentStore")

_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "data", "seen_docs.json")


class DocumentStore:
    def __init__(self, path: str = _DEFAULT_PATH):
        self._path = path
        self._seen: set[str] = set()
        self._load()

    # ── Public API ─────────────────────────────────────────────────────────────
    def is_known(self, doc_id: str) -> bool:
        return doc_id in self._seen

    def mark_known(self, doc_id: str) -> None:
        self._seen.add(doc_id)
        self._save()

    def clear(self) -> None:
        """Wipe all known documents (useful for testing)."""
        self._seen.clear()
        self._save()

    # ── Persistence ────────────────────────────────────────────────────────────
    def _load(self) -> None:
        if os.path.exists(self._path):
            try:
                with open(self._path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._seen = set(data.get("seen", []))
                log.info("Loaded %d known document(s) from store.", len(self._seen))
            except (json.JSONDecodeError, KeyError) as exc:
                log.warning("Could not parse store file (%s) — starting fresh.", exc)
                self._seen = set()
        else:
            log.info("No existing store found — starting fresh.")

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self._path), exist_ok=True)
        with open(self._path, "w", encoding="utf-8") as f:
            json.dump({"seen": list(self._seen)}, f, indent=2)
