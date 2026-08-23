// URLs Sportity par rallye.
//
// ⚠️ Contrairement au calendrier (connu à l'avance pour toute la saison),
// Sportity ne publie l'URL d'un évènement que quelques semaines avant son
// déroulement. Ce fichier doit donc être mis à jour manuellement au fur et
// à mesure que les liens deviennent disponibles.
//
// La clé DOIT correspondre EXACTEMENT au champ "rally" de
// src/config/wrcCalendar2026.json (emoji(s) inclus), pour que le watcher
// puisse faire le lien entre "on est dans ce week-end" et "voici son URL".
// Si un rallye démarre sans URL configurée ici, le watcher log un
// avertissement à chaque check et attend qu'elle soit ajoutée.

module.exports = {
  "🇵🇾 WRC ueno Rally del Paraguay":
    "https://webapp.sportity.com/event/WRCPAR26/d724b1d8-2f75-4348-a79f-048272b74601",
  "🇨🇱 WRC Rally Chile Bio Bío":
    "https://webapp.sportity.com/event/WRCCHI26/7eb025e3-7153-4624-90aa-e5119b0fe54c",
};
