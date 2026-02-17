"""
wrc_standings.py
Récupère les classements pilotes et constructeurs depuis l'API officielle WRC.

API base : https://api.wrc.com/results-api
Endpoints utilisés :
  - /season                        → liste des saisons
  - /championship-standings/{id}   → classements d'une saison
"""

import logging
import aiohttp

log = logging.getLogger("WRCStandings")

_BASE_URL   = "https://api.wrc.com/results-api"
_SEASON_URL = "https://api.wrc.com/contel-page/83388/calendar/active-season/"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://www.wrc.com/",
}


class WRCStandingsScraper:
    def __init__(self, timeout: int = 20):
        self.timeout = aiohttp.ClientTimeout(total=timeout)

    # ── Public API ─────────────────────────────────────────────────────────────
    async def fetch_all(self) -> tuple[list[dict], list[dict]]:
        """
        Returns (drivers_standings, manufacturers_standings).
        Each item is a dict with keys:
          drivers:       position, driver, nationality, points
          manufacturers: position, manufacturer, points
        """
        async with aiohttp.ClientSession(headers=_HEADERS, timeout=self.timeout) as session:
            season_id = await self._get_active_season_id(session)
            log.info("Active WRC season ID: %s", season_id)
            drivers, manufacturers = await self._get_standings(session, season_id)
        return drivers, manufacturers

    # ── Internal ───────────────────────────────────────────────────────────────
    async def _get_active_season_id(self, session: aiohttp.ClientSession) -> int:
        """Fetch the current active season ID from the WRC calendar API."""
        async with session.get(_SEASON_URL) as resp:
            resp.raise_for_status()
            data = await resp.json(content_type=None)

        # The active season endpoint returns { rallyEvents: { items: [...] } }
        # or sometimes a direct season object. We try both structures.
        if isinstance(data, dict):
            # Try to get season ID directly
            if "id" in data:
                return data["id"]
            # Or from nested structure
            items = (data.get("rallyEvents") or {}).get("items") or []
            if items:
                # All events belong to the same season; extract from first item's context
                pass

        # Fallback: use the /season endpoint to find the current year
        async with session.get(f"{_BASE_URL}/season") as resp2:
            resp2.raise_for_status()
            seasons = await resp2.json(content_type=None)

        # seasons is a list of { id, name, year, ... }
        import datetime
        current_year = datetime.datetime.now().year
        for s in (seasons if isinstance(seasons, list) else []):
            if s.get("year") == current_year or str(current_year) in str(s.get("name", "")):
                log.info("Found season: %s (id=%s)", s.get("name"), s.get("id"))
                return s["id"]

        # Last resort: return the most recent season
        if seasons:
            return seasons[0]["id"]

        raise RuntimeError("Could not determine active WRC season ID.")

    async def _get_standings(self, session: aiohttp.ClientSession,
                             season_id: int) -> tuple[list[dict], list[dict]]:
        """Fetch championship standings for a given season."""
        url = f"{_BASE_URL}/championship-standings/{season_id}"
        async with session.get(url) as resp:
            resp.raise_for_status()
            data = await resp.json(content_type=None)

        drivers       = self._parse_drivers(data)
        manufacturers = self._parse_manufacturers(data)
        return drivers, manufacturers

    # ── Parsers ────────────────────────────────────────────────────────────────
    @staticmethod
    def _parse_drivers(data: dict) -> list[dict]:
        """
        Extract drivers' championship standings.
        WRC API returns: { driverStandings: [ { position, points, driver: {...} }, ... ] }
        """
        raw = []

        # Try different possible keys
        for key in ("driverStandings", "driversStandings", "drivers"):
            if key in data:
                raw = data[key]
                break

        if not raw:
            # Sometimes it's under a nested "championships" key
            for champ in (data.get("championships") or []):
                if "driver" in (champ.get("type") or "").lower():
                    raw = champ.get("standings") or champ.get("items") or []
                    break

        result = []
        for i, entry in enumerate(raw, start=1):
            driver_info = entry.get("driver") or {}
            first  = driver_info.get("firstName") or driver_info.get("first_name") or ""
            last   = driver_info.get("lastName")  or driver_info.get("last_name")  or ""
            name   = f"{first} {last}".strip() or driver_info.get("fullName") or driver_info.get("abbvName") or "Unknown"
            country = (driver_info.get("country") or {})
            iso2    = country.get("iso2") or country.get("iso3", "")[:2] or ""

            result.append({
                "position":    entry.get("position") or i,
                "driver":      name,
                "nationality": iso2.upper(),
                "points":      entry.get("totalPoints") or entry.get("points") or 0,
            })

        log.info("Parsed %d driver standings.", len(result))
        return result

    @staticmethod
    def _parse_manufacturers(data: dict) -> list[dict]:
        """
        Extract manufacturers' championship standings.
        WRC API returns: { manufacturerStandings: [ { position, points, manufacturer: {...} }, ... ] }
        """
        raw = []

        for key in ("manufacturerStandings", "manufacturersStandings", "manufacturers", "constructorStandings"):
            if key in data:
                raw = data[key]
                break

        if not raw:
            for champ in (data.get("championships") or []):
                t = (champ.get("type") or "").lower()
                if "manufactur" in t or "construct" in t:
                    raw = champ.get("standings") or champ.get("items") or []
                    break

        result = []
        for i, entry in enumerate(raw, start=1):
            manu_info = entry.get("manufacturer") or {}
            name = (manu_info.get("name") or manu_info.get("manufacturerName")
                    or entry.get("name") or "Unknown")
            result.append({
                "position":     entry.get("position") or i,
                "manufacturer": name,
                "points":       entry.get("totalPoints") or entry.get("points") or 0,
            })

        log.info("Parsed %d manufacturer standings.", len(result))
        return result
