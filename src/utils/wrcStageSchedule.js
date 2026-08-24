const fs = require("fs");
const path = require("path");
const stageFiles = require("../config/wrcStageFiles");
const rallyCalendar = require("../config/wrcCalendar2026.json");

const STAGES_DIR = path.join(__dirname, "..", "config", "wrcStages");

// Le fuseau horaire local du rallye vient de wrcCalendar2026.json
// (champ utc_offset, ex: "+01:00"), pas du fichier de spéciales.
function getUtcOffset(rallyName) {
  const entry = rallyCalendar.find((r) => r.rally === rallyName);
  return entry ? entry.utc_offset : null;
}

// Charge le planning des spéciales d'un rallye et convertit chaque
// "date + heure locale" en Date (UTC en interne). Retourne null si aucun
// fichier n'est configuré pour ce rallye dans wrcStageFiles.js.
function loadStages(rallyName) {
  const filename = stageFiles[rallyName];
  if (!filename) return null;

  const utcOffset = getUtcOffset(rallyName);
  if (!utcOffset) {
    throw new Error(
      `Aucun utc_offset trouvé pour "${rallyName}" dans wrcCalendar2026.json`
    );
  }

  const filePath = path.join(STAGES_DIR, filename);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  return raw.map((s) => {
    const startDate = new Date(`${s.date}T${s.heure}:00${utcOffset}`);
    if (isNaN(startDate.getTime())) {
      throw new Error(
        `Date/heure invalide pour "${s.numero}" (${s.date} ${s.heure}) dans ${filename}`
      );
    }
    return {
      numero: s.numero,
      nom: s.nom,
      distanceKm: s.distance_km,
      startDate,
    };
  });
}

module.exports = { loadStages };
