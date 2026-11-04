/**
 * Text rows from a PDF: items grouped by page and baseline, left to right. Good enough for IDFG's tables.
 * pdfjs-dist is only used by the sync job (never bundled into the web app).
 */
export async function pdfLines(data: Uint8Array): Promise<string[][]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    type It = { s: string; x: number; y: number };
    const items: It[] = (tc.items as { str?: string; transform?: number[] }[])
      .filter((i) => typeof i.str === 'string' && i.str.trim() && i.transform)
      .map((i) => ({ s: i.str!.trim(), x: i.transform![4], y: i.transform![5] }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: It[][] = [];
    for (const it of items) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row[0].y - it.y) <= 2.5) row.push(it);
      else rows.push([it]);
    }
    pages.push(rows.map((r) => r.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ')));
    page.cleanup?.();
  }
  await doc.destroy?.();
  return pages;
}

/** Every text item with its position, per page; y measured from the top of the page (CPW's table parser). */
export async function pdfItems(data: Uint8Array): Promise<{ s: string; x: number; y: number }[][]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages: { s: string; x: number; y: number }[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const h = page.getViewport({ scale: 1 }).height;
    const tc = await page.getTextContent();
    pages.push(
      (tc.items as { str?: string; transform?: number[] }[])
        .filter((i) => typeof i.str === 'string' && i.str.trim() && i.transform)
        .map((i) => ({ s: i.str!, x: i.transform![4], y: h - i.transform![5] })),
    );
    page.cleanup?.();
  }
  await doc.destroy?.();
  return pages;
}
