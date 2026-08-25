const { TRANSLATE_BUTTON_ID } = require("../utils/newsButtons");
const { translateText } = require("../utils/translate");
const { localeToGoogleLang } = require("../utils/discordLocales");

// Discord impose une réponse (ou un defer) dans les 3s après le clic. La
// traduction peut prendre plus longtemps -> on defer en éphémère tout de
// suite, puis on édite la réponse une fois le résultat prêt.
async function handleTranslateButton(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const embed = interaction.message.embeds?.[0];
  if (!embed) {
    await interaction.editReply({ content: "Impossible de trouver le texte à traduire sur ce message." });
    return;
  }

  const targetLang = localeToGoogleLang(interaction.locale);

  try {
    const [translatedTitle, translatedDescription] = await Promise.all([
      embed.title ? translateText(embed.title, targetLang) : Promise.resolve(null),
      embed.description ? translateText(embed.description, targetLang) : Promise.resolve(null),
    ]);

    const parts = [];
    if (translatedTitle) parts.push(`**${translatedTitle}**`);
    if (translatedDescription) parts.push(translatedDescription);

    if (parts.length === 0) {
      await interaction.editReply({ content: "Rien à traduire sur cet article." });
      return;
    }

    await interaction.editReply({ content: parts.join("\n\n") });
  } catch (err) {
    console.error("[Translate] Erreur lors de la traduction :", err.message);
    await interaction.editReply({ content: "❌ La traduction a échoué, réessaie plus tard." });
  }
}

async function handleInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== TRANSLATE_BUTTON_ID) return;

  await handleTranslateButton(interaction).catch((err) => {
    console.error("[Translate] Erreur non gérée :", err.message);
  });
}

module.exports = { handleInteraction };
