"""
wrc_calendar.py
Hard-coded 2026 WRC calendar.
Provides helpers to check if a rally is currently active or upcoming.
"""

from datetime import date, datetime, timezone
from typing import Optional


# Each entry: key (short slug), human name, start date, end date
_CALENDAR_2026 = [
    ("MC",   "Rallye Monte-Carlo",         date(2026,  1, 22), date(2026,  1, 25)),
    ("SWE",  "Rally Sweden",               date(2026,  2, 12), date(2026,  2, 15)),
    ("KEN",  "Safari Rally Kenya",         date(2026,  3, 12), date(2026,  3, 15)),
    ("CRO",  "Croatia Rally",              date(2026,  4,  9), date(2026,  4, 12)),
    ("CAN",  "Rally Islas Canarias",       date(2026,  4, 23), date(2026,  4, 26)),
    ("POR",  "Vodafone Rally de Portugal", date(2026,  5,  7), date(2026,  5, 10)),
    ("JPN",  "FORUM8 Rally Japan",         date(2026,  5, 28), date(2026,  5, 31)),
    ("GRC",  "EKO Acropolis Rally Greece", date(2026,  6, 25), date(2026,  6, 28)),
    ("EST",  "Delfi Rally Estonia",        date(2026,  7, 16), date(2026,  7, 19)),
    ("FIN",  "Secto Rally Finland",        date(2026,  7, 30), date(2026,  8,  2)),
    ("PRY",  "ueno Rally del Paraguay",    date(2026,  8, 27), date(2026,  8, 30)),
    ("CHL",  "Rally Chile Bio Bío",        date(2026,  9, 10), date(2026,  9, 13)),
    ("SAR",  "Rally Italia Sardegna",      date(2026, 10,  1), date(2026, 10,  4)),
    ("SAU",  "Rally Saudi Arabia",         date(2026, 11, 11), date(2026, 11, 14)),
]


def _to_dict(key, name, start, end) -> dict:
    # Convert bare date → datetime (UTC midnight) for consistent comparisons
    return {
        "key":   key,
        "name":  name,
        "start": datetime(start.year, start.month, start.day, tzinfo=timezone.utc),
        "end":   datetime(end.year,   end.month,   end.day, 23, 59, 59, tzinfo=timezone.utc),
    }


class WRCCalendar:
    def __init__(self):
        self._rallies = [_to_dict(*r) for r in _CALENDAR_2026]

    def all_rallies(self) -> list[dict]:
        return list(self._rallies)

    def active_rally(self) -> Optional[dict]:
        """Return the rally currently taking place, or None."""
        now = datetime.now(timezone.utc)
        for r in self._rallies:
            if r["start"] <= now <= r["end"]:
                return r
        return None

    def next_rally(self) -> Optional[dict]:
        """Return the next upcoming rally after today, or None."""
        now = datetime.now(timezone.utc)
        for r in self._rallies:
            if r["start"] > now:
                return r
        return None

    def rally_by_key(self, key: str) -> Optional[dict]:
        key = key.upper()
        for r in self._rallies:
            if r["key"] == key:
                return r
        return None
