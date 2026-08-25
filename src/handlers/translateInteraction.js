const { TRANSLATE_BUTTON_ID } = require("../utils/newsButtons");
const { translateText } = require("../utils/translate");
const { localeToGoogleLang } = require("../utils/discordLocales");
const { MessageFlags } = require("discord.js");

const COOLDOWN_MS = 30_000; // 30 secondes entre deux traductions pour un même membre

// Map en mémoire : userId -> timestamp du dernier clic accepté. Pas besoin
// de persistance disque, un redémarrage du bot remet juste tout le monde
// à zéro, ce qui est sans conséquence pour un simple anti-spam.
const lastUsedAt = new Map();

function getRemainingCooldownSeconds(userId) {
  const last = lastUsedAt.get(userId);
  if (!last) return 0;

  const elapsed = Date.now() - last;
  const remaining = COOLDOWN_MS - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

// Discord impose une réponse (ou un defer) dans les 3s après le clic. La
// traduction peut prendre plus longtemps -> on defer en éphémère tout de
// suite, puis on édite la réponse une fois le résultat prêt.
async function handleTranslateButton(interaction) {
  const remaining = getRemainingCooldownSeconds(interaction.user.id);
  if (remaining > 0) {
    await interaction.reply({
  content: `⏳ Attends encore ${remaining}s avant de retraduire un article.`,
  flags: MessageFlags.Ephemeral,
});
    return;
  }

  lastUsedAt.set(interaction.user.id, Date.now());

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
