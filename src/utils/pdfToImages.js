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
// pdfjs-dist. Nécessaire pour rendre correctement le texte qui utilise une
// police standard NON embarquée dans le PDF (cas fréquent pour le corps de
// texte des documents FIA/WRC) : sans ça, pdfjs ne sait pas dessiner ces
// glyphes et le texte reste invisible sur le rendu, sans erreur.
const STANDARD_FONT_DATA_URL =
  path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts") + path.sep;

async function pdfToImages(pdfBuffer, { scale = 2, maxPages = 20 } = {}) {
  const pdfjsLib = await loadPdfjsLib();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    disableFontFace: true, // on rasterise via canvas, pas besoin de @font-face
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
