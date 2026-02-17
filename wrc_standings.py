"""
wrc_standings.py
Récupère les classements pilotes et constructeurs depuis rallyjournal.com.

Source : https://rallyjournal.com/wrc-standings-2026/
Page HTML statique avec deux tableaux bien structurés — aucune API bloquée.

Retourne :
  drivers       : [ { position, driver, manufacturer, points }, ... ]
  manufacturers : [ { position, manufacturer, points }, ... ]
"""

import logging
import re
import aiohttp
from bs4 import BeautifulSoup

log = logging.getLogger("WRCStandings")

_URL = "https://rallyjournal.com/wrc-standings-2026/"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Referer": "https://rallyjournal.com/",
}


class WRCStandingsScraper:
    def __init__(self, timeout: int = 20):
        self.timeout = aiohttp.ClientTimeout(total=timeout)

    # ── Public API ─────────────────────────────────────────────────────────────
    async def fetch_all(self) -> tuple[list[dict], list[dict]]:
        """
        Returns (drivers_standings, manufacturers_standings).
        """
        html = await self._get_html()
        soup = BeautifulSoup(html, "html.parser")
        tables = soup.find_all("table")

        if len(tables) < 2:
            raise RuntimeError(
                f"Page rallyjournal.com : seulement {len(tables)} tableau(x) trouvé(s), "
                "attendu 2 (pilotes + constructeurs)."
            )

        drivers       = self._parse_drivers(tables[0])
        manufacturers = self._parse_manufacturers(tables[1])
        return drivers, manufacturers

    # ── HTTP ───────────────────────────────────────────────────────────────────
    async def _get_html(self) -> str:
        async with aiohttp.ClientSession(headers=_HEADERS, timeout=self.timeout) as session:
            async with session.get(_URL) as resp:
                resp.raise_for_status()
                return await resp.text()

    # ── Parsers ────────────────────────────────────────────────────────────────
    @staticmethod
    def _clean_points(raw: str) -> int:
        """Extrait le total de points depuis une cellule comme '**60**' ou '60'."""
        raw = raw.strip()
        # Cherche le premier nombre dans la chaîne
        m = re.search(r"\d+", raw)
        return int(m.group()) if m else 0

    @staticmethod
    def _clean_pos(raw: str) -> int | str:
        """Convertit '1.' ou 'x.' en int ou 'x'."""
        raw = raw.strip().rstrip(".")
        try:
            return int(raw)
        except ValueError:
            return raw  # cas "x" pour les pilotes sans points

    def _parse_drivers(self, table) -> list[dict]:
        """
        Tableau pilotes — colonnes :
        Position | Driver | Manufacturer | Total | MON | SWE | ...
        """
        rows = table.find_all("tr")[1:]  # skip header
        result = []
        for row in rows:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if len(cells) < 4:
                continue
            pos    = self._clean_pos(cells[0])
            driver = cells[1].strip()
            manu   = cells[2].strip()
            points = self._clean_points(cells[3])
            if not driver:
                continue
            result.append({
                "position":     pos,
                "driver":       driver,
                "manufacturer": manu,
                "points":       points,
            })

        log.info("Parsed %d driver standings from rallyjournal.com", len(result))
        return result

    def _parse_manufacturers(self, table) -> list[dict]:
        """
        Tableau constructeurs — colonnes :
        POS | Manufacturer | Total | MON | SWE | ...
        """
        rows = table.find_all("tr")[1:]  # skip header
        result = []
        for row in rows:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if len(cells) < 3:
                continue
            pos    = self._clean_pos(cells[0])
            manu   = cells[1].strip()
            points = self._clean_points(cells[2])
            if not manu:
                continue
            result.append({
                "position":     pos,
                "manufacturer": manu,
                "points":       points,
            })

        log.info("Parsed %d manufacturer standings from rallyjournal.com", len(result))
        return result
