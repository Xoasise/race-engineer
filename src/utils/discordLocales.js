// Correspondance locale Discord -> code langue cible Google Translate.
// Liste officielle des locales Discord :
// https://discord.com/developers/docs/reference#locales
const DISCORD_TO_GOOGLE_LANG = {
  id: "id", da: "da", de: "de",
  "en-GB": "en", "en-US": "en",
  "es-ES": "es", "es-419": "es",
  fr: "fr", hr: "hr", it: "it", lt: "lt", hu: "hu", nl: "nl", no: "no", pl: "pl",
  "pt-BR": "pt", ro: "ro", fi: "fi", "sv-SE": "sv", vi: "vi", tr: "tr",
  cs: "cs", el: "el", bg: "bg", ru: "ru", uk: "uk", hi: "hi", th: "th",
  "zh-CN": "zh-CN", "zh-TW": "zh-TW", ja: "ja", ko: "ko",
};

function localeToGoogleLang(discordLocale) {
  return DISCORD_TO_GOOGLE_LANG[discordLocale] || "en";
}

module.exports = { localeToGoogleLang };
