const fs = require("fs");
const path = require("path");
const { EmbedBuilder } = require("discord.js");
const config = require("../config/wrcStageReminders");
const { getCurrentRally } = require("../utils/wrcCalendarLocal");
const { loadStages } = require("../utils/wrcStageSchedule");

const STATE_FILE = path.join(__dirname, "..", "data", "wrcStageReminders.json");

// État en mémoire, partagé entre le check local (via runAllChecks) et la
// boucle de vérification légère (30 s, aucune requête réseau) qui
// déclenche les rappels au bon moment. Rechargé depuis le disque au
// démarrage pour survivre à un redémarrage du bot. Même principe que
// src/modules/f1SessionReminder.js.
let state = loadState();

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    if (raw.currentRally?.stages) {
      raw.currentRally.stages = raw.currentRally.stages.map((s) => ({
        ...s,
        startDate: new Date(s.startDate),
      }));
    }
    return raw;
  } catch {
    return { currentRally: null };
  }
}

function saveState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Étape "locale" : à appeler périodiquement (cron existant, via
// runAllChecks). Aucune requête réseau : on relit juste le calendrier et
// le fichier de spéciales du rallye en cours. Le planning n'est chargé
// qu'une seule fois par rallye (pas de rechargement tant que le rallye
// n'a pas changé), pour ne jamais écraser les flags "notified".
async function checkWrcStageReminders(client) {
  const rally = getCurrentRally();

  if (!rally) {
    if (state.currentRally) {
      state.currentRally = null;
      saveState();
    }
    return;
  }

  if (state.currentRally?.rallyName === rally.rally) {
    return;
  }

  let stages;
  try {
    stages = loadStages(rally.rally);
  } catch (err) {
    console.error("[WRC Stages] Erreur lors du chargement du planning :", err.message);
    return;
  }

  if (!stages) {
    console.warn(
      `[WRC Stages] Rallye en cours "${rally.rally}" mais aucun fichier de spéciales configuré dans src/config/wrcStageFiles.js`
    );
    return;
  }

  console.log(`[WRC Stages] Nouveau rallye détecté : ${rally.rally}`);

  state.currentRally = {
    rallyName: rally.rally,
    stages: stages.map((s) => ({
      numero: s.numero,
      nom: s.nom,
      distanceKm: s.distanceKm,
      startDate: s.startDate,
      notified: false,
    })),
  };
  saveState();
  console.log(`[WRC Stages] ${stages.length} spéciale(s) programmée(s) pour ${rally.rally}`);
}

async function sendReminder(client, stage) {
  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!channel) {
    console.warn(`[WRC Stages] Salon introuvable (ID: ${config.channelId})`);
    return;
  }

  const unixSeconds = Math.floor(stage.startDate.getTime() / 1000);
  const rallyName = state.currentRally?.rallyName || "Rallye";

  const embed = new EmbedBuilder()
    .setAuthor({ name: `🏁 ${rallyName}` })
    .addFields(
      {
        name: `🇬🇧 ${stage.numero} — ${stage.nom} starts in ${config.notifyLeadMinutes} minutes`,
        value: `${stage.distanceKm} km • Start <t:${unixSeconds}:t> (<t:${unixSeconds}:R>)`,
      },
      {
        name: `🇫🇷 ${stage.numero} — ${stage.nom} commence dans ${config.notifyLeadMinutes} minutes`,
        value: `${stage.distanceKm} km • Départ <t:${unixSeconds}:t> (<t:${unixSeconds}:R>)`,
      }
    )
    .setColor(0x1e2a45);

  try {
    await channel.send({ content: `<@&${config.roleId}>`, embeds: [embed] });
    console.log(`[WRC Stages] Rappel envoyé : ${stage.numero}`);
  } catch (err) {
    console.error(`[WRC Stages] Erreur lors de l'envoi du rappel "${stage.numero}" :`, err.message);
  }
}

// Étape "mémoire" : aucune requête réseau, juste une comparaison
// d'horodatage. Même logique que checkPendingReminders() dans
// f1SessionReminder.js.
function checkPendingStageReminders(client) {
  const stages = state.currentRally?.stages;
  if (!stages || stages.length === 0) return;

  const now = Date.now();
  let hasChanges = false;

  for (const stage of stages) {
    if (stage.notified) continue;

    const minutesUntil = (new Date(stage.startDate).getTime() - now) / 60000;

    if (minutesUntil <= config.notifyLeadMinutes && minutesUntil > -2) {
      sendReminder(client, stage);
      stage.notified = true;
      hasChanges = true;
    } else if (minutesUntil <= -2) {
      // Fenêtre ratée (ex: bot resté hors ligne pendant la spéciale) : on
      // marque comme notifié sans envoyer, pour ne pas poster un rappel
      // obsolète en retard.
      console.warn(`[WRC Stages] Fenêtre de rappel ratée pour "${stage.numero}", pas d'envoi`);
      stage.notified = true;
      hasChanges = true;
    }
  }

  if (hasChanges) saveState();
}

// À appeler une fois le client Discord prêt : démarre la boucle de
// vérification légère en mémoire.
function startStageReminderLoop(client) {
  setInterval(() => checkPendingStageReminders(client), config.checkIntervalSeconds * 1000);
  console.log(
    `[WRC Stages] Boucle de rappel démarrée (vérification interne toutes les ${config.checkIntervalSeconds}s)`
  );
}

module.exports = { checkWrcStageReminders, startStageReminderLoop };
