const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

// Traduit un texte via l'API Google Cloud Translate (Basic, v2 - clé API
// simple, pas de compte de service). format: "text" pour éviter que Google
// interprète le texte comme du HTML.
async function translateText(text, targetLang) {
  if (!process.env.GOOGLE_TRANSLATE_API_KEY) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY non défini");
  }
  if (!text) return "";

  const res = await fetch(`${ENDPOINT}?key=${process.env.GOOGLE_TRANSLATE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, target: targetLang, format: "text" }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Google Translate HTTP ${res.status} : ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  return data?.data?.translations?.[0]?.translatedText || text;
}

module.exports = { translateText };
