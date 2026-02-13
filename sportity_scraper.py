"""
sportity_scraper.py
Scrapes the Sportity event page and returns a list of PDF documents.

Each document dict:
    {
        "name":     str,   # document title
        "date":     str,   # publication date string
        "url":      str,   # direct CDN link to the PDF
        "category": str,   # section heading (e.g. "Bulletins")
    }
"""

import re
import asyncio
import logging
import aiohttp
from bs4 import BeautifulSoup

log = logging.getLogger("SportityScraper")

# Regex to pull the event slug from the URL  (e.g. "WRCSWE26")
_KEY_RE = re.compile(r"/event/([^/]+)/")


class SportityScraper:
    def __init__(self, url: str, timeout: int = 20):
        self.url = url.rstrip("#").rstrip("/")
        self.timeout = timeout

    # ── Public API ─────────────────────────────────────────────────────────────
    async def fetch_documents(self) -> list[dict]:
        html = await self._get_html()
        return self._parse(html)

    @staticmethod
    def extract_key(url: str) -> str | None:
        m = _KEY_RE.search(url)
        return m.group(1) if m else None

    # ── Internal ───────────────────────────────────────────────────────────────
    async def _get_html(self) -> str:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0 Safari/537.36"
            )
        }
        timeout = aiohttp.ClientTimeout(total=self.timeout)
        async with aiohttp.ClientSession(headers=headers, timeout=timeout) as session:
            async with session.get(self.url) as resp:
                resp.raise_for_status()
                return await resp.text()

    def _parse(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        documents: list[dict] = []
        current_category = "Documents"

        for tag in soup.find_all(["h3", "a"]):
            # Section headings carry the data-id of a parent anchor
            if tag.name == "h3":
                # Headings inside an <a> that points to a #parent-… anchor
                # are category headers; those with a PDF url are doc titles.
                parent_a = tag.find_parent("a")
                if parent_a:
                    href = parent_a.get("href", "")
                    if href.startswith("#parent-"):
                        # This h3 is a category title
                        current_category = tag.get_text(strip=True)
                    elif "app-cdn.sportity.com" in href and href.endswith(".pdf"):
                        # This h3 is a document title inside its link
                        name = tag.get_text(strip=True)
                        # Date is typically the next sibling text node or a <p>/<span>
                        date_text = self._extract_date(parent_a)
                        documents.append(
                            {
                                "name": name,
                                "date": date_text,
                                "url": href,
                                "category": current_category,
                            }
                        )
            elif tag.name == "a":
                href = tag.get("href", "")
                if "app-cdn.sportity.com" in href and href.endswith(".pdf"):
                    # Avoid double-counting docs already caught via h3
                    if any(d["url"] == href for d in documents):
                        continue
                    name_tag = tag.find("h3")
                    name = name_tag.get_text(strip=True) if name_tag else tag.get_text(strip=True)
                    date_text = self._extract_date(tag)
                    documents.append(
                        {
                            "name": name,
                            "date": date_text,
                            "url": href,
                            "category": current_category,
                        }
                    )

        log.info("Parsed %d document(s) from Sportity.", len(documents))
        return documents

    @staticmethod
    def _extract_date(anchor_tag) -> str:
        """Try to extract the publication date text from the anchor's subtree."""
        # Sportity renders dates as plain text after the <h3>
        texts = [t.strip() for t in anchor_tag.stripped_strings]
        # First text is the doc title, second (if any) is the date
        if len(texts) >= 2:
            return texts[-1]
        return "Date inconnue"
