const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const { createCanvas } = require("@napi-rs/canvas");

// Convertit un PDF (Buffer) en tableau de Buffers PNG, une image par page.
// scale contrôle la résolution : 2 = bonne lisibilité, taille de fichier raisonnable.
async function pdfToImages(pdfBuffer, { scale = 2, maxPages = 10 } = {}) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
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
