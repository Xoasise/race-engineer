// Page FIA listant les documents de décision de la saison F1 en cours.
// Seul le dernier/prochain évènement est chargé en HTML direct (les autres
// sont derrière un appel JS qu'on ne peut pas suivre en simple scraping).
module.exports = {
  url: "https://www.fia.com/documents/championships/fia-formula-one-world-championship-14/season/season-2026-2072",
  channelId: process.env.FIA_DOCS_CHANNEL_ID,
};
