/// <reference lib="webworker" />
// Web Worker: z JEDNOHO dekódu obrázku vyrobí dvě varianty:
//   * mid     — zmenšený originál (~midDim) pro plné zobrazení; null pokud není
//               co zmenšovat (originál je menší)
//   * preview — drobný náhled (~previewDim, pár KB) pro rychlé thumbnaily
// Dekódování (drahé, ~100 MB v paměti) proběhne jen jednou; oba výřezy jsou levné.
// Volá se sekvenčně → paměť ohraničená. EXIF orientace přes imageOrientation.

interface Req {
  id: number;
  file: Blob;
  midDim: number;
  midQuality: number;
  midType: string;
  previewDim: number;
  previewQuality: number;
}

async function encodeScaled(
  bitmap: ImageBitmap,
  dim: number,
  type: string,
  quality: number,
): Promise<Blob> {
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > dim ? dim / longest : 1;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d ctx");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.convertToBlob({ type, quality });
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, file, midDim, midQuality, midType, previewDim, previewQuality } = e.data;
  const post = (msg: Record<string, unknown>) =>
    (self as unknown as Worker).postMessage({ id, ...msg });

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longest = Math.max(bitmap.width, bitmap.height);

    const preview = await encodeScaled(bitmap, previewDim, "image/webp", previewQuality);
    // mid jen když je originál větší než midDim (jinak null → použij originál)
    const mid = longest > midDim ? await encodeScaled(bitmap, midDim, midType, midQuality) : null;

    bitmap.close();
    post({ ok: true, preview, mid });
  } catch {
    post({ ok: false });
  }
};

export {};
