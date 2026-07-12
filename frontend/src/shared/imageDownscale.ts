// Klientský downscale obrázků PŘED uploadem (mimo hlavní vlákno, Web Worker).
// Vyrobí dvě varianty z jednoho dekódu:
//   * mid     — zmenšený originál (~MID_DIM) pro plné zobrazení (File k uploadu)
//   * preview — drobný náhled (~PREVIEW_DIM, pár KB) pro rychlé thumbnaily
// Cíl: doktor nahraje 10× 20 MB ze zrcadlovky → nahraje se ~10× pár set KB,
// náhledy jsou pár KB. Fallback: main-thread canvas; při chybě vrátí originál.

const MID_DIM = 1920;
const MID_QUALITY = 0.82;
const PREVIEW_DIM = 320;
const PREVIEW_QUALITY = 0.72;
const MIN_SIZE = 1_100_000; // pod ~1.1 MB nemá smysl řešit mid (ale preview ano)
const PROCESSABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ImageVariants {
  /** Soubor k uploadu jako "plná" fotka (mid resize, nebo originál). */
  mid: File;
  /** Drobný náhled (webp), nebo null když nejde vyrobit / není obrázek. */
  preview: Blob | null;
}

interface WorkerResult {
  ok: boolean;
  mid?: Blob | null;
  preview?: Blob;
}

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: WorkerResult) => void>();

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  try {
    worker = new Worker(new URL("./imageDownscale.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent) => {
      const { id, ...rest } = e.data as { id: number } & WorkerResult;
      waiting.get(id)?.(rest);
      waiting.delete(id);
    };
    worker.onerror = () => {
      for (const [, res] of waiting) res({ ok: false });
      waiting.clear();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

const WORKER_TIMEOUT_MS = 10_000;

function viaWorker(file: File, midType: string): Promise<WorkerResult | null> {
  const w = ensureWorker();
  if (!w) return Promise.resolve(null);
  const id = ++seq;
  return new Promise((resolve) => {
    // Bez timeoutu by mlčící worker zaseknul celý upload flow navždy.
    const timer = setTimeout(() => {
      if (waiting.delete(id)) resolve(null);
    }, WORKER_TIMEOUT_MS);
    waiting.set(id, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    w.postMessage({
      id,
      file,
      midDim: MID_DIM,
      midQuality: MID_QUALITY,
      midType,
      previewDim: PREVIEW_DIM,
      previewQuality: PREVIEW_QUALITY,
    });
  });
}

// Fallback bez workeru (starší prohlížeč / OffscreenCanvas chybí).
async function viaMainThread(file: File, midType: string): Promise<WorkerResult | null> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    URL.revokeObjectURL(url);
    const encode = (dim: number, type: string, quality: number): Promise<Blob | null> => {
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      const scale = longest > dim ? dim / longest : 1;
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return Promise.resolve(null);
      ctx.drawImage(img, 0, 0, w, h);
      return new Promise((res) => canvas.toBlob((b) => res(b), type, quality));
    };
    const preview = await encode(PREVIEW_DIM, "image/webp", PREVIEW_QUALITY);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const mid = longest > MID_DIM ? await encode(MID_DIM, midType, MID_QUALITY) : null;
    return { ok: !!preview, preview: preview ?? undefined, mid };
  } catch {
    return null;
  }
}

function renameExt(name: string, type: string): string {
  const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
  return `${name.replace(/\.[^.]+$/, "")}.${ext}`;
}

/**
 * Vyrobí mid + preview variantu. Pro neobrázky / při chybě vrací originál bez preview.
 */
export async function prepareImageVariants(file: File): Promise<ImageVariants> {
  if (!PROCESSABLE.has(file.type)) return { mid: file, preview: null };

  const midType = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
  let res = await viaWorker(file, midType);
  if (!res) res = await viaMainThread(file, midType);
  if (!res || !res.ok) return { mid: file, preview: null };

  // mid: použij zmenšenou jen když dává smysl (menší než originál); jinak originál
  let mid = file;
  if (res.mid && res.mid.size < file.size && file.size >= MIN_SIZE) {
    mid = new File([res.mid], renameExt(file.name, midType), { type: midType });
  }
  return { mid, preview: res.preview ?? null };
}
