import type { Lang } from "./index";

/**
 * Vlaječky jako inline SVG — emoji vlajky Windows nevykresluje (ukáže jen
 * "CZ"/"DE" text), takže kreslíme vlastní. Zjednodušené, poměr 4:3.
 */
export default function FlagIcon({ lang, size = 18 }: { lang: Lang; size?: number }) {
  const w = size;
  const h = Math.round((size * 3) / 4);
  const common = {
    width: w,
    height: h,
    viewBox: "0 0 20 15",
    style: { display: "block", borderRadius: 2, boxShadow: "0 0 0 1px rgba(0,0,0,.15)" },
    "aria-hidden": true as const,
  };
  switch (lang) {
    case "cs":
      return (
        <svg {...common}>
          <rect width="20" height="7.5" fill="#fff" />
          <rect y="7.5" width="20" height="7.5" fill="#d7141a" />
          <path d="M0 0 L10 7.5 L0 15 Z" fill="#11457e" />
        </svg>
      );
    case "sk":
      return (
        <svg {...common}>
          <rect width="20" height="5" fill="#fff" />
          <rect y="5" width="20" height="5" fill="#0b4ea2" />
          <rect y="10" width="20" height="5" fill="#ee1c25" />
          <path d="M4 3.5 h5 v4.2 a2.5 3 0 0 1 -2.5 3 a2.5 3 0 0 1 -2.5 -3 Z" fill="#ee1c25" stroke="#fff" strokeWidth="0.7" />
          <path d="M6.5 4.6 v4.6 M4.9 6.4 h3.2" stroke="#fff" strokeWidth="0.8" />
        </svg>
      );
    case "en":
      return (
        <svg {...common}>
          <rect width="20" height="15" fill="#012169" />
          <path d="M0 0 L20 15 M20 0 L0 15" stroke="#fff" strokeWidth="3" />
          <path d="M0 0 L20 15 M20 0 L0 15" stroke="#C8102E" strokeWidth="1.2" />
          <path d="M10 0 V15 M0 7.5 H20" stroke="#fff" strokeWidth="5" />
          <path d="M10 0 V15 M0 7.5 H20" stroke="#C8102E" strokeWidth="3" />
        </svg>
      );
    case "de":
      return (
        <svg {...common}>
          <rect width="20" height="5" fill="#000" />
          <rect y="5" width="20" height="5" fill="#dd0000" />
          <rect y="10" width="20" height="5" fill="#ffce00" />
        </svg>
      );
  }
}
