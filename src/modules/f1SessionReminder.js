const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const config = require("../config/f1SessionReminders");
const { fetchSeasonRounds, fetchGpSessions } = require("../utils/f1CalendarScraper");

const STATE_FILE = path.join(__dirname, "..", "data", "f1SessionReminders.json");

// État en mémoire, partagé entre le check réseau (15 min, via runAllChecks)
// et la boucle de vérification légère (30 s, aucune requête réseau) qui
// déclenche les rappels au bon moment. Rechargé depuis le disque au
// démarrage pour survivre à un redémarrage du bot.
let state = loadState();

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    if (raw.currentRound?.sessions) {
      raw.currentRound.sessions = raw.currentRound.sessions.map((s) => ({
        ...s,
        startDate: new Date(s.startDate),
      }));
    }
    return raw;
  } catch {
    return { currentRound: null };
  }
}

function saveState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// Étape "réseau" : à appeler périodiquement (cron 15 min existant, via
// runAllChecks). Détermine le round en cours/à venir et récupère ses
// horaires de session une seule fois par round (pas de re-fetch tant que
// le round n'a pas changé, pour ne jamais écraser les flags "notified").
async function checkF1SessionReminders(client) {
  let rounds;
  try {
    rounds = await fetchSeasonRounds(config.calendarUrl, config.seasonYear);
  } catch (err) {
    console.error("[F1 Sessions] Erreur lors du fetch du calendrier :", err.message);
    return;
  }

  const now = new Date();
  // Premier round dont le week-end (+1 jour de marge) n'est pas encore
  // terminé : c'est soit le round en cours, soit le prochain.
  const upcoming = rounds.find((r) => now < addDays(r.weekendEnd, 1));

  if (!upcoming) {
    console.log("[F1 Sessions] Aucun round à venir trouvé (saison terminée ou calendrier à mettre à jour ?)");
    return;
  }

  if (state.currentRound?.slug === upcoming.slug) {
    // Déjà en cache pour ce round, rien à refaire.
    return;
  }

  console.log(`[F1 Sessions] Nouveau round détecté : ${upcoming.raceName} (${upcoming.slug})`);

  let sessions;
  try {
    sessions = await fetchGpSessions(upcoming.url);
  } catch (err) {
    console.error(`[F1 Sessions] Erreur lors du fetch des sessions pour ${upcoming.slug} :`, err.message);
    return;
  }

  if (sessions.length === 0) {
    console.warn(`[F1 Sessions] Aucune session trouvée sur la page de ${upcoming.slug}, nouvelle tentative au prochain check`);
    return;
  }

  state.currentRound = {
    slug: upcoming.slug,
    raceName: upcoming.raceName,
    sessions: sessions.map((s) => ({
      name: s.name,
      startDate: s.startDate,
      notified: false,
    })),
  };
  saveState();
  console.log(`[F1 Sessions] ${sessions.length} session(s) programmée(s) pour ${upcoming.raceName}`);
}

async function sendReminder(client, session) {
  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!channel) {
    console.warn(`[F1 Sessions] Salon introuvable (ID: ${config.channelId})`);
    return;
  }

  const unixSeconds = Math.floor(session.startDate.getTime() / 1000);
  const raceName = state.currentRound?.raceName || "Grand Prix";

  const embed = new EmbedBuilder()
  .setAuthor({ name: `🏎️ ${raceName}` })
  .addFields(
    { 
      name: `🇬🇧 ${session.name} starts in ${config.notifyLeadMinutes} minutes`, 
      value: `Start <t:${unixSeconds}:t> (<t:${unixSeconds}:R>)` 
    },
    { 
      name: `🇫🇷 ${session.name} commence dans ${config.notifyLeadMinutes} minutes`, 
      value: `Départ <t:${unixSeconds}:t> (<t:${unixSeconds}:R>)` 
    }
  )
  .setColor(0xe10600);

  try {
    await channel.send({ embeds: [embed] });
    console.log(`[F1 Sessions] Rappel envoyé : ${session.name}`);
  } catch (err) {
    console.error(`[F1 Sessions] Erreur lors de l'envoi du rappel "${session.name}" :`, err.message);
  }
}

// Étape "mémoire" : aucune requête réseau, juste une comparaison
// d'horodatage. C'est cette boucle (courte et peu coûteuse) qui permet
// d'être précis à la minute près sans avoir à repoller formula1.com souvent.
function checkPendingReminders(client) {
  const sessions = state.currentRound?.sessions;
  if (!sessions || sessions.length === 0) return;

  const now = Date.now();
  let hasChanges = false;

  for (const session of sessions) {
    if (session.notified) continue;

    const minutesUntil = (new Date(session.startDate).getTime() - now) / 60000;

    if (minutesUntil <= config.notifyLeadMinutes && minutesUntil > -2) {
      sendReminder(client, session);
      session.notified = true;
      hasChanges = true;
    } else if (minutesUntil <= -2) {
      // Fenêtre ratée (ex: bot resté hors ligne pendant la session) : on
      // marque comme notifié sans envoyer, pour ne pas poster un rappel
      // obsolète en retard.
      console.warn(`[F1 Sessions] Fenêtre de rappel ratée pour "${session.name}", pas d'envoi`);
      session.notified = true;
      hasChanges = true;
    }
  }

  if (hasChanges) saveState();
}

// À appeler une fois le client Discord prêt : démarre la boucle de
// vérification légère en mémoire.
function startReminderLoop(client) {
  setInterval(() => checkPendingReminders(client), config.checkIntervalSeconds * 1000);
  console.log(`[F1 Sessions] Boucle de rappel démarrée (vérification interne toutes les ${config.checkIntervalSeconds}s)`);
}

module.exports = { checkF1SessionReminders, startReminderLoop };
