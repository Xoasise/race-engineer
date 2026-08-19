const { createCanvas } = require("@napi-rs/canvas");

// pdfjs-dist n'est distribué qu'en ESM (.mjs) depuis la v4.
// On le charge dynamiquement une seule fois puis on le met en cache.
let pdfjsLibPromise = null;
function loadPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsLibPromise;
}

// Convertit un PDF (Buffer) en tableau de Buffers PNG, une image par page.
async function pdfToImages(pdfBuffer, { scale = 2, maxPages = 10 } = {}) {
  const pdfjsLib = await loadPdfjsLib();

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
module.exports.postDocument = postDocument;
