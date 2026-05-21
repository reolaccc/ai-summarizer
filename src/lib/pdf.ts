type PdfExtractionResult = {
  fileName: string;
  text: string;
  pageCount: number;
};

function joinTextContent(items: any[]) {
  return items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractPdfText(file: File): Promise<PdfExtractionResult> {
  const bytes = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const documentTask = pdfjs.getDocument({ data: bytes });
  const pdf = await documentTask.promise;
  const pageTexts: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = joinTextContent(content.items);

      if (pageText) {
        pageTexts.push(pageText);
      }
    }
  } finally {
    await pdf.destroy();
  }

  return {
    fileName: file.name,
    text: pageTexts.join("\n\n").trim(),
    pageCount: pdf.numPages,
  };
}
