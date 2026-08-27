const { createCanvas } = require("@napi-rs/canvas");

let pdfjsLibPromise = null;
function loadPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }
  return pdfjsLibPromise;
}

async function pdfToImages(pdfBuffer, { scale = 2, maxPages = 20 } = {}) {
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
