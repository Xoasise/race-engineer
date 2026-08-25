const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const TRANSLATE_BUTTON_ID = "translate_news";

// Un seul customId statique : pas besoin d'y encoder l'article, on relira
// le texte directement depuis l'embed du message au moment du clic.
function buildTranslateRow() {
  const button = new ButtonBuilder()
    .setCustomId(TRANSLATE_BUTTON_ID)
    .setLabel("🌐 Translate")
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(button);
}

module.exports = { buildTranslateRow, TRANSLATE_BUTTON_ID };
