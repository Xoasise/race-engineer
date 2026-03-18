import discord
from discord.ext import commands, tasks
from discord import app_commands
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta

# ── Logging — doit être configuré en premier ───────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("WRCBot")

from config import Config
from wrc_calendar import WRCCalendar
from sportity_scraper import SportityScraper
from document_store import DocumentStore

# ← TEMPORAIREMENT DÉSACTIVÉ à cause du blocage Cloudflare sur rallyjournal.com
STANDINGS_AVAILABLE = False
log.warning("WRC standings temporairement désactivés (Cloudflare block).")

try:
    from wrc_results import WRCResultsScraper
    RESULTS_AVAILABLE = True
except ImportError:
    RESULTS_AVAILABLE = False
    log.warning("wrc_results.py introuvable — commandes results désactivées.")

# ── Bot setup ──────────────────────────────────────────────────────────────────
intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)
config = Config()
calendar = WRCCalendar()
store = DocumentStore()

# Guild ID optionnel : si défini, les commandes sont sync instantanément.
_GUILD_ID = os.environ.get("DISCORD_GUILD_ID")
_TEST_GUILD = discord.Object(id=int(_GUILD_ID)) if _GUILD_ID else None

# Channel pour le post automatique des résultats
RESULTS_CHANNEL_ID = int(os.environ.get("WRC_RESULTS_CHANNEL_ID", "1468547808725438525"))


# ── Category colours & emojis ──────────────────────────────────────────────────
CATEGORY_STYLE = {
    "bulletins":              ("📋", 0x1E90FF),
    "stewards documents":     ("⚖️",  0xFF4500),
    "coc documents":          ("📡", 0xFFA500),
    "entry and start lists":  ("🏁", 0x2ECC71),
    "results":                ("🏆", 0xFFD700),
}
DEFAULT_STYLE = ("📄", 0x95A5A6)


def get_style(category: str):
    key = category.lower()
    for k, v in CATEGORY_STYLE.items():
        if k in key:
            return v
    return DEFAULT_STYLE


# ── Embed builders ─────────────────────────────────────────────────────────────
def build_doc_embed(rally_name: str, category: str, doc_name: str,
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


def _flag(iso2: str) -> str:
    """Converts ISO2 country code to Discord flag emoji."""
    if not iso2 or len(iso2) != 2:
        return ""
    return chr(ord(iso2[0].upper()) + 127397) + chr(ord(iso2[1].upper()) + 127397)


def build_results_embed(results: list[dict], rally_name: str) -> discord.Embed:
    """Construit un embed avec le top 10 des résultats d'un rallye."""
    medals = {1: "🥇", 2: "🥈", 3: "🥉"}
    lines = []
    for entry in results:
        pos = entry.get("position", "?")
        icon = medals.get(pos, f"`{pos:>2}.`")
        driver = entry.get("driver", "Unknown")
        car    = entry.get("car", "")
        gap    = entry.get("gap", "")
        # Format: "🥇 Elfyn Evans (Toyota GR Yaris Rally1) — +14.3"
        car_short = car.split()[0] if car else ""  # ex: "Toyota"
        lines.append(f"{icon} **{driver}** ({car_short}) — {gap}")

    title = f"🏁 Résultats — {rally_name}"
    embed = discord.Embed(
        title=title,
        description="\n".join(lines) if lines else "Aucun résultat disponible.",
        colour=0x2ECC71,
        timestamp=datetime.now(timezone.utc),
    )
    embed.set_footer(text="WRC Bot • racetrackmasters.com")
    return embed


# ── Core posting logic ─────────────────────────────────────────────────────────
async def post_documents(channel: discord.TextChannel, sportity_url: str,
                         rally_name: str, only_new: bool = True) -> int:
    scraper = SportityScraper(sportity_url)
    try:
        documents = await scraper.fetch_documents()
    except Exception as exc:
        log.error("Scraping failed: %s", exc)
        await channel.send(f"⚠️ Impossible de récupérer les documents Sportity : `{exc}`")
        return 0

    posted = 0
    for doc in documents:
        doc_id = doc["url"]
        if store.is_known(doc_id):
            continue
        store.mark_known(doc_id)
        embed = build_doc_embed(
            rally_name=rally_name, category=doc["category"],
            doc_name=doc["name"], doc_date=doc["date"],
            pdf_url=doc["url"], is_new=only_new,
        )
        await channel.send(embed=embed)
        posted += 1
        await asyncio.sleep(0.5)

    return posted


async def fetch_and_post_standings(drivers_ch: discord.TextChannel,
                                   manu_ch: discord.TextChannel,
                                   rally_name: str = None):
    if not STANDINGS_AVAILABLE:
        log.warning("Standings module not available — skipping auto-post.")
        return
    scraper = WRCStandingsScraper()
    try:
        drivers, manufacturers = await scraper.fetch_all()
    except Exception as exc:
        log.error("Standings fetch failed: %s", exc)
        err = f"⚠️ Impossible de récupérer les classements : `{exc}`"
        await drivers_ch.send(err)
        return

    await drivers_ch.send(embed=build_drivers_embed(drivers, rally_name))
    await manu_ch.send(embed=build_manu_embed(manufacturers, rally_name))
    log.info("Standings posted — %d drivers, %d manufacturers.", len(drivers), len(manufacturers))


# ── Background tasks ───────────────────────────────────────────────────────────
@tasks.loop(hours=12)
async def polling_task():
    """Toutes les 12 h, vérifie les nouveaux documents Sportity pendant les rallyes."""
    rally = calendar.active_rally()
    if rally is None:
        log.info("No active rally — skipping document poll.")
        return

    log.info("Active rally: %s — polling Sportity…", rally["name"])
    sportity_url = config.get_rally_url(rally["key"])
    if not sportity_url:
        log.warning("No Sportity URL configured for %s", rally["key"])
        return

    channel = bot.get_channel(config.WRC_CHANNEL_ID)
    if channel is None:
        log.error("WRC channel %s not found.", config.WRC_CHANNEL_ID)
        return

    posted = await post_documents(channel, sportity_url, rally["name"], only_new=True)
    log.info("Poll done — %d new document(s) posted.", posted)


@tasks.loop(hours=1)
async def post_results_task():
    """
    Vérifie toutes les heures si un rallye s'est terminé il y a 24-25h.
    Si oui, publie automatiquement le top 10 du rallye.
    """
    now = datetime.now(timezone.utc)
    for rally in calendar.all_rallies():
        window_start = rally["end"] + timedelta(hours=24)
        window_end   = rally["end"] + timedelta(hours=25)
        if window_start <= now < window_end:
            log.info("Auto-posting results after %s…", rally["name"])
            
            # Post résultats dans le channel dédié
            if RESULTS_AVAILABLE:
                results_ch = bot.get_channel(RESULTS_CHANNEL_ID)
                if results_ch:
                    await fetch_and_post_results(results_ch, rally["key"], rally["name"])
                else:
                    log.error("Results channel not found (ID: %s).", RESULTS_CHANNEL_ID)
            
            break


@polling_task.before_loop
async def before_polling():
    await bot.wait_until_ready()


@post_results_task.before_loop
async def before_results():
    await bot.wait_until_ready()


# ── Slash commands ─────────────────────────────────────────────────────────────
@bot.tree.command(name="wrc_scan",
                  description="[Admin] Scanne Sportity et publie tous les documents du rallye.")
@app_commands.describe(
    sportity_url="URL complète de la page Sportity",
    rally_name="Nom du rallye affiché dans les embeds",
)
async def wrc_scan(interaction: discord.Interaction, sportity_url: str, rally_name: str):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message(
            "🚫 Cette commande est réservée aux administrateurs.", ephemeral=True)
        return

    await interaction.response.defer(ephemeral=True)

    sportity_slug = SportityScraper.extract_key(sportity_url)
    if sportity_slug:
        rally_key = calendar.sportity_key_to_rally_key(sportity_slug) or sportity_slug
        config.set_rally_url(rally_key, sportity_url)
        config.save()
        log.info("Saved Sportity URL for %s (slug: %s)", rally_key, sportity_slug)

    channel = bot.get_channel(config.WRC_CHANNEL_ID)
    if channel is None:
        await interaction.followup.send(
            f"⚠️ Channel WRC introuvable (ID `{config.WRC_CHANNEL_ID}`).", ephemeral=True)
        return

    posted = await post_documents(channel, sportity_url, rally_name, only_new=False)
    await interaction.followup.send(
        f"✅ Scan terminé — **{posted}** document(s) publié(s) dans <#{config.WRC_CHANNEL_ID}>.",
        ephemeral=True)


@bot.tree.command(name="wrc_status",
                  description="[Admin] Affiche le statut du bot et du rallye en cours.")
async def wrc_status(interaction: discord.Interaction):
    if not interaction.user.guild_permissions.administrator:
        await interaction.response.send_message(
            "🚫 Cette commande est réservée aux administrateurs.", ephemeral=True)
        return

    active   = calendar.active_rally()
    upcoming = calendar.next_rally()
    lines    = []

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

    lines.append(f"\n⏱️ Documents : toutes les **12 h** (pendant les rallyes)")
    lines.append(f"📊 Résultats auto : **24 h** après chaque fin de rallye")

    embed = discord.Embed(
        title="📡 WRC Bot — Statut",
        description="\n".join(lines),
        colour=0x1E90FF,
        timestamp=datetime.now(timezone.utc),
    )
    await interaction.response.send_message(embed=embed, ephemeral=True)


@bot.tree.command(name="wrc_calendar",
                  description="Affiche le calendrier WRC 2026.")
async def wrc_calendar_cmd(interaction: discord.Interaction):
    rallies = calendar.all_rallies()
    today   = datetime.now(timezone.utc).date()
    lines   = []
    for r in rallies:
        start_str = r["start"].strftime("%d %b")
        end_str   = r["end"].strftime("%d %b %Y")
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


@bot.tree.command(name="wrc_results",
                  description="Affiche le top 10 du dernier rallye WRC terminé.")
async def wrc_results_cmd(interaction: discord.Interaction):
    await interaction.response.defer()
    if not RESULTS_AVAILABLE:
        await interaction.followup.send("⚠️ Module results non disponible.", ephemeral=True)
        return
    
    # Trouve le dernier rallye terminé
    now = datetime.now(timezone.utc)
    last_rally = None
    for rally in calendar.all_rallies():
        if rally["end"] < now:
            last_rally = rally
        else:
            break
    
    if not last_rally:
        await interaction.followup.send("⚠️ Aucun rallye terminé pour le moment.")
        return
    
    try:
        scraper = WRCResultsScraper()
        results = await scraper.fetch_rally_results(last_rally["key"], top_n=10)
        embed = build_results_embed(results, last_rally["name"])
        await interaction.followup.send(embed=embed)
    except Exception as exc:
        log.error("wrc_results failed: %s", exc)
        await interaction.followup.send(f"⚠️ Impossible de récupérer les résultats : `{exc}`")


# ── Bot events ─────────────────────────────────────────────────────────────────
@bot.event
async def on_ready():
    log.info("Logged in as %s (ID: %s)", bot.user, bot.user.id)
    try:
        if _TEST_GUILD:
            # 1. Copier les commandes du tree vers le guild (AVANT tout clear)
            bot.tree.copy_global_to(guild=_TEST_GUILD)
            synced = await bot.tree.sync(guild=_TEST_GUILD)
            log.info("Synced %d slash command(s) to guild %s.", len(synced), _GUILD_ID)
            # 2. Vider les commandes globales résiduelles (cause des doublons visibles)
            #    On ne touche PAS au tree en mémoire, uniquement à Discord côté API
            await bot.tree.sync(guild=None)
            log.info("Cleared residual global commands.")
        else:
            synced = await bot.tree.sync()
            log.info("Synced %d slash command(s) globally.", len(synced))
    except Exception as exc:
        log.error("Failed to sync commands: %s", exc)

    if not polling_task.is_running():
        polling_task.start()
        log.info("Document polling started (every 12h).")

    if not post_results_task.is_running():
        post_results_task.start()
        log.info("Results auto-post started (hourly check, triggers 24h post-rally).")


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    token = os.environ.get("DISCORD_TOKEN")
    if not token:
        raise RuntimeError("DISCORD_TOKEN environment variable is not set.")
    bot.run(token)
