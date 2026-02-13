import discord
from discord.ext import commands, tasks
from discord import app_commands
import asyncio
import logging
import os
from datetime import datetime, timezone

from config import Config
from wrc_calendar import WRCCalendar
from sportity_scraper import SportityScraper
from document_store import DocumentStore

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("WRCBot")

# ── Bot setup ──────────────────────────────────────────────────────────────────
intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)
config = Config()
calendar = WRCCalendar()
store = DocumentStore()


# ── Category colours & emojis ──────────────────────────────────────────────────
CATEGORY_STYLE = {
    "bulletins":           ("📋", 0x1E90FF),   # dodger blue
    "stewards documents":  ("⚖️",  0xFF4500),   # red-orange
    "coc documents":       ("📡", 0xFFA500),   # orange
    "entry and start lists": ("🏁", 0x2ECC71), # green
    "results":             ("🏆", 0xFFD700),   # gold
}
DEFAULT_STYLE = ("📄", 0x95A5A6)


def get_style(category: str):
    key = category.lower()
    for k, v in CATEGORY_STYLE.items():
        if k in key:
            return v
    return DEFAULT_STYLE


# ── Embed builder ──────────────────────────────────────────────────────────────
def build_embed(rally_name: str, category: str, doc_name: str,
                doc_date: str, pdf_url: str, is_new: bool) -> discord.Embed:
    emoji, colour = get_style(category)
    label = "🆕 Nouveau document" if is_new else "📥 Document publié"

    embed = discord.Embed(
        title=f"{emoji} {doc_name}",
        url=pdf_url,
        description=f"**{label}** — {rally_name}",
        colour=colour,
        timestamp=datetime.now(timezone.utc),
    )
    embed.add_field(name="Catégorie", value=category, inline=True)
    embed.add_field(name="Publié le", value=doc_date, inline=True)
    embed.add_field(name="📎 Lien PDF", value=f"[Ouvrir le PDF]({pdf_url})", inline=False)
    embed.set_footer(text="WRC Bot • Sportity")
    return embed


# ── Core posting logic ─────────────────────────────────────────────────────────
async def post_documents(channel: discord.TextChannel, sportity_url: str,
                         rally_name: str, only_new: bool = True):
    """Scrape Sportity and post unseen documents to *channel*."""
    scraper = SportityScraper(sportity_url)
    try:
        documents = await scraper.fetch_documents()
    except Exception as exc:
        log.error("Scraping failed: %s", exc)
        await channel.send(f"⚠️ Impossible de récupérer les documents Sportity : `{exc}`")
        return 0

    posted = 0
    for doc in documents:
        doc_id = doc["url"]  # URL is a stable unique key
        if store.is_known(doc_id):
            continue  # already posted

        store.mark_known(doc_id)
        embed = build_embed(
            rally_name=rally_name,
            category=doc["category"],
            doc_name=doc["name"],
            doc_date=doc["date"],
            pdf_url=doc["url"],
            is_new=only_new,
        )
        await channel.send(embed=embed)
        posted += 1
        await asyncio.sleep(0.5)  # gentle rate-limit

    return posted


# ── Background task ────────────────────────────────────────────────────────────
@tasks.loop(hours=24)
async def polling_task():
    """Every 24 h, check for new documents — only during active rally weekends."""
    rally = calendar.active_rally()
    if rally is None:
        log.info("No active rally — skipping poll.")
        return

    log.info("Active rally: %s — polling Sportity…", rally["name"])

    sportity_url = config.get_rally_url(rally["key"])
    if not sportity_url:
        log.warning("No Sportity URL configured for %s", rally["key"])
        return

    channel = bot.get_channel(config.WRC_CHANNEL_ID)
    if channel is None:
        log.error("Channel %s not found.", config.WRC_CHANNEL_ID)
        return

    posted = await post_documents(channel, sportity_url, rally["name"], only_new=True)
    log.info("Poll done — %d new document(s) posted.", posted)


@polling_task.before_loop
async def before_polling():
    await bot.wait_until_ready()


# ── Slash commands ─────────────────────────────────────────────────────────────
@bot.tree.command(name="wrc_scan",
                  description="[Admin] Scanne Sportity et publie tous les documents du rallye.")
@app_commands.describe(
    sportity_url="URL complète de la page Sportity (ex: https://webapp.sportity.com/event/...)",
    rally_name="Nom du rallye affiché dans les embeds",
)
async def wrc_scan(interaction: discord.Interaction,
                   sportity_url: str,
                   rally_name: str):
    # Admin check
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message(
            "🚫 Cette commande est réservée aux administrateurs.", ephemeral=True
        )
        return

    await interaction.response.defer(ephemeral=True)

    # Extract rally key from URL and persist it
    rally_key = SportityScraper.extract_key(sportity_url)
    if rally_key:
        config.set_rally_url(rally_key, sportity_url)
        config.save()
        log.info("Saved Sportity URL for rally key: %s", rally_key)

    channel = bot.get_channel(config.WRC_CHANNEL_ID)
    if channel is None:
        await interaction.followup.send(
            f"⚠️ Channel WRC introuvable (ID `{config.WRC_CHANNEL_ID}`). "
            "Vérifie la variable `WRC_CHANNEL_ID`.", ephemeral=True
        )
        return

    posted = await post_documents(channel, sportity_url, rally_name, only_new=False)

    await interaction.followup.send(
        f"✅ Scan terminé — **{posted}** document(s) publié(s) dans <#{config.WRC_CHANNEL_ID}>.",
        ephemeral=True,
    )


@bot.tree.command(name="wrc_status",
                  description="Affiche le prochain rallye et si la surveillance est active.")
async def wrc_status(interaction: discord.Interaction):
    active = calendar.active_rally()
    upcoming = calendar.next_rally()

    lines = []
    if active:
        end = active["end"].strftime("%d %B %Y")
        lines.append(f"🟢 **Rallye en cours :** {active['name']} (jusqu'au {end})")
        url = config.get_rally_url(active["key"])
        lines.append(f"🔗 Sportity configuré : {'✅' if url else '❌ `/wrc_scan` non lancé'}")
    else:
        lines.append("⚪ Aucun rallye en cours.")

    if upcoming:
        start = upcoming["start"].strftime("%d %B %Y")
        lines.append(f"📅 **Prochain rallye :** {upcoming['name']} — le {start}")

    lines.append(f"\n⏱️ Prochaine vérification automatique : toutes les 24 h")

    embed = discord.Embed(
        title="📡 WRC Bot — Statut",
        description="\n".join(lines),
        colour=0x1E90FF,
        timestamp=datetime.now(timezone.utc),
    )
    await interaction.response.send_message(embed=embed)


@bot.tree.command(name="wrc_calendar",
                  description="Affiche le calendrier WRC 2026.")
async def wrc_calendar(interaction: discord.Interaction):
    rallies = calendar.all_rallies()
    today = datetime.now(timezone.utc).date()

    lines = []
    for r in rallies:
        start_str = r["start"].strftime("%d %b")
        end_str = r["end"].strftime("%d %b %Y")
        if r["end"].date() < today:
            icon = "✅"
        elif r["start"].date() <= today <= r["end"].date():
            icon = "🟢"
        else:
            icon = "📅"
        lines.append(f"{icon} **{r['name']}** — {start_str} → {end_str}")

    embed = discord.Embed(
        title="🗓️ Calendrier WRC 2026",
        description="\n".join(lines),
        colour=0xFFD700,
    )
    await interaction.response.send_message(embed=embed)


# ── Bot events ─────────────────────────────────────────────────────────────────
@bot.event
async def on_ready():
    log.info("Logged in as %s (ID: %s)", bot.user, bot.user.id)
    try:
        synced = await bot.tree.sync()
        log.info("Synced %d slash command(s).", len(synced))
    except Exception as exc:
        log.error("Failed to sync commands: %s", exc)

    polling_task.start()
    log.info("Polling task started.")


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    token = os.environ.get("DISCORD_TOKEN")
    if not token:
        raise RuntimeError("DISCORD_TOKEN environment variable is not set.")
    bot.run(token)
