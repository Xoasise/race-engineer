"""
wrc_results.py
Récupère le top 10 du dernier rallye WRC terminé depuis racetrackmasters.com.

Source : https://www.racetrackmasters.com/full-rally-<slug>-2026-results/
Exemple : https://www.racetrackmasters.com/full-rally-sweden-2026-results/

Retourne : [ { position, driver, car, gap }, ... ]
"""

import logging
import re
import aiohttp
from bs4 import BeautifulSoup

log = logging.getLogger("WRCResults")

_BASE_URL = "https://www.racetrackmasters.com"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Referer": "https://www.racetrackmasters.com/",
}

# Mapping : clé courte du rallye → slug racetrackmasters
_RALLY_SLUGS = {
    "MC":  "monte-carlo",
    "SWE": "sweden",
    "KEN": "kenya",
    "CRO": "croatia",
    "CAN": "canarias",  # ou islas-canarias
    "POR": "portugal",
    "JPN": "japan",
    "GRC": "greece",
    "EST": "estonia",
    "FIN": "finland",
    "PRY": "paraguay",
    "CHL": "chile",
    "SAR": "sardinia",   # ou italy
    "SAU": "saudi-arabia",
}


class WRCResultsScraper:
    def __init__(self, timeout: int = 20):
        self.timeout = aiohttp.ClientTimeout(total=timeout)

    # ── Public API ─────────────────────────────────────────────────────────────
    async def fetch_rally_results(self, rally_key: str, top_n: int = 10) -> list[dict]:
        """
        Récupère les résultats finaux d'un rallye.
        rally_key : clé courte (ex: 'SWE', 'MC')
        top_n     : nombre de résultats à retourner (défaut 10)
        
        Retourne : [ { position, driver, car, gap }, ... ]
        """
        slug = _RALLY_SLUGS.get(rally_key.upper())
        if not slug:
            raise ValueError(f"Aucun slug défini pour le rallye '{rally_key}'.")

        url = f"{_BASE_URL}/full-rally-{slug}-2026-results/"
        html = await self._get_html(url)
        soup = BeautifulSoup(html, "html.parser")

        # Le site utilise un <table> pour les résultats
        table = soup.find("table")
        if not table:
            raise RuntimeError(f"Aucun tableau trouvé sur {url}")

        results = self._parse_results(table)
        log.info("Parsed %d results from %s", len(results), url)
        return results[:top_n]

    # ── HTTP ───────────────────────────────────────────────────────────────────
    async def _get_html(self, url: str) -> str:
        async with aiohttp.ClientSession(headers=_HEADERS, timeout=self.timeout) as session:
            async with session.get(url) as resp:
                resp.raise_for_status()
                return await resp.text()

    # ── Parser ─────────────────────────────────────────────────────────────────
    @staticmethod
    def _parse_results(table) -> list[dict]:
        """
        Parse le tableau HTML des résultats.
        Colonnes : Pos | Driver | No. | Car | Time/Gap
        """
        rows = table.find_all("tr")[1:]  # skip header
        results = []
        for row in rows:
            cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"])]
            if len(cells) < 5:
                continue
            pos_str = cells[0].strip()
            # Ignore DNF rows
            if pos_str.upper() == "DNF":
                continue
            try:
                position = int(pos_str.rstrip("."))
            except ValueError:
                continue
            driver = cells[1].strip()
            car    = cells[3].strip()
            gap    = cells[4].strip()
            if not driver:
                continue
            results.append({
                "position": position,
                "driver":   driver,
                "car":      car,
                "gap":      gap,
            })

        return results
