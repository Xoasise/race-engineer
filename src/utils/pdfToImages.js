const { createCanvas } = require("@napi-rs/canvas");
const path = require("path");

let pdfjsLibPromise = null;
function loadPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsLibPromise;
}

// Dossier des polices "standard" (Helvetica, Times, Courier...) fourni par
// pdfjs-dist. Nécessaire pour rendre le texte qui utilise une police
// standard NON embarquée dans le PDF (très fréquent pour le corps de texte
// des documents FIA/WRC, seuls les titres en gras étaient en police
// embarquée) : sans ça, pdfjs ignore silencieusement chaque glyphe
// ("ignoring character... Ensure that the standardFontDataUrl API
// parameter is provided") et le texte reste invisible sur le rendu final.
const STANDARD_FONT_DATA_URL =
  path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts") + path.sep;

// pdfjs a besoin, en interne, de créer des canvas "scratch" pour certaines
// images du PDF (masques, images inline, redimensionnement — typiquement le
// logo en en-tête ou une signature scannée). Par défaut il essaie de créer
// ces canvas via le package npm "canvas" (node-canvas), qu'on n'a pas
// installé ici (on utilise @napi-rs/canvas). Sans cette factory, le rendu
// plante avec "Cannot read properties of undefined (reading 'createCanvas')"
// dès qu'un PDF contient ce type d'image — ce qui explique pourquoi certains
// documents ne se sont même pas affichés du tout.
class NapiCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

async function pdfToImages(pdfBuffer, { scale = 2, maxPages = 20 } = {}) {
  const pdfjsLib = await loadPdfjsLib();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    disableFontFace: true, // rendu 100% canvas, pas besoin de @font-face (pas de DOM ici)
    CanvasFactory: NapiCanvasFactory,
  });
  const doc = await loadingTask.promise;

  const totalPages = doc.numPages;
  const pagesToRender = Math.min(totalPages, maxPages);
  const images = [];

  for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    await page.render({ canvasContext: context, viewport }).promise;
    images.push(canvas.toBuffer("image/png"));

    page.cleanup();
  }

  await doc.destroy();
  return { images, totalPages };
}

module.exports = { pdfToImages };
