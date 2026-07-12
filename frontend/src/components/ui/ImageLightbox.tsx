import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Group, Text, ActionIcon, Center, Loader, Tooltip } from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconPhotoOff,
  IconX,
} from "@tabler/icons-react";

/**
 * Galerie fotek v modalu (lightbox) — sdílená pro fotky komentářů (vlákno
 * Komunikace) a fotky hodnocení. Šipky / klávesy ←→ procházejí fotky, Esc zavře.
 *
 * Nested-modal pozor: vlákno běží i uvnitř reply modalu Feedu. Mantine poslouchá
 * Escape na window s capture:true (běží DŘÍV než jakýkoli element handler), ale
 * respektuje `data-mantine-stop-propagation="true"` na event.target — proto ho
 * nese fokusovaný wrapper (data-autofocus) i všechna tlačítka galerie. Rodičovský
 * modal tak Esc ignoruje; galerii zavírá vlastní handler (`closeOnEscape` vypnuté).
 * Fokus se po každé navigaci vrací na wrapper — kdyby zůstal na šipce, která se
 * na kraji galerie unmountne, spadl by na document.body (bez atributu) a Esc by
 * zavřel rodičovský modal.
 *
 * Presigned URL mohou expirovat (podepisují se při načtení vlákna): při chybě
 * načtení obrázku se JEDNOU za otevření zavolá `onUrlsExpired` — volající
 * přepodepíše URL a fotky se přerenderují s čerstvými odkazy. Když obnova
 * nic nezmění (selhala / vrátila tutéž URL), zobrazí se chybový stav — nikdy
 * věčný spinner.
 */
export interface LightboxImage {
  id: string;
  /** Plná (mid) URL — hlavní zdroj galerie. */
  fullUrl: string | null;
  /** Náhledová URL — fallback, když plná chybí. */
  previewUrl: string | null;
  filename: string;
  /** Kontext fotky („Vy · 1. 7. 2026 13:35"). */
  caption?: string;
}

interface Props {
  images: LightboxImage[];
  /** Index otevřené fotky; null = zavřeno. */
  index: number | null;
  onClose: () => void;
  onUrlsExpired?: () => Promise<void>;
}

export default function ImageLightbox({ images, index, onClose, onUrlsExpired }: Props) {
  const opened = index !== null && images.length > 0;
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Přepodepsání URL max. 1× za otevření galerie (ochrana proti smyčce).
  const resignedRef = useRef(false);
  // URL, která selhala a čeká na výsledek obnovy; tick spouští vyhodnocení.
  const erroredSrcRef = useRef<string | null>(null);
  const [resignTick, setResignTick] = useState(0);

  // Otevření: nastav výchozí index a resetuj resign guard i load stav
  // (src se mezi otevřeními nemusí změnit → efekt na [src] by nezafungoval).
  useEffect(() => {
    if (index !== null) {
      setIdx(index);
      setLoaded(false);
      setFailed(false);
      resignedRef.current = false;
      erroredSrcRef.current = null;
    }
  }, [index]);

  // Index bezpečně v mezích jako derivát (žádné clampování ve více efektech).
  const safeIdx = Math.min(Math.max(idx, 0), Math.max(images.length - 1, 0));
  const current = opened ? images[safeIdx] : null;
  const src = current ? current.fullUrl ?? current.previewUrl : null;

  // Nový zdroj (navigace, přepodepsané URL) = načíst od začátku.
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  const go = useCallback(
    (delta: number) => {
      setIdx((i) => {
        const next = i + delta;
        return next < 0 || next >= images.length ? i : next;
      });
      // Fokus zpět na wrapper — šipka na kraji galerie se unmountne a fokus
      // by spadl na body (viz doc-komentář o Esc chování).
      wrapperRef.current?.focus();
    },
    [images.length],
  );

  // Přednačtení sousedů — deps na konkrétních URL, ne na identitě pole
  // (volající `images` typicky staví za renderu → nové pole každý render).
  const prevUrl = images[safeIdx - 1]?.fullUrl ?? images[safeIdx - 1]?.previewUrl ?? null;
  const nextUrl = images[safeIdx + 1]?.fullUrl ?? images[safeIdx + 1]?.previewUrl ?? null;
  useEffect(() => {
    if (!opened) return;
    for (const u of [prevUrl, nextUrl]) if (u) new window.Image().src = u;
  }, [opened, prevUrl, nextUrl]);

  const handleImgError = useCallback(() => {
    if (onUrlsExpired && !resignedRef.current) {
      resignedRef.current = true;
      erroredSrcRef.current = src;
      setLoaded(false);
      void onUrlsExpired()
        .catch(() => {})
        .finally(() => setResignTick((n) => n + 1));
      return;
    }
    setFailed(true);
  }, [onUrlsExpired, src]);

  // Vyhodnocení obnovy: když po resignu zůstala TATÁŽ URL (obnova selhala nebo
  // nic nezměnila), žádný další load/error event nepřijde → ukázat chybový
  // stav místo věčného spinneru. Nová URL = běžný retry přes efekt na [src].
  useEffect(() => {
    if (resignTick === 0) return;
    if (erroredSrcRef.current !== null && erroredSrcRef.current === src) setFailed(true);
    erroredSrcRef.current = null;
  }, [resignTick, src]);

  // Klávesy: capture + stopPropagation → Esc nezavře rodičovský modal (Feed chat).
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.stopPropagation();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.stopPropagation();
        go(1);
      }
    },
    [go, onClose],
  );

  if (!opened || !current) return null;

  const hasPrev = safeIdx > 0;
  const hasNext = safeIdx < images.length - 1;

  return (
    <Modal
      opened
      onClose={onClose}
      withCloseButton={false}
      closeOnEscape={false}
      centered
      size="auto"
      padding={0}
      radius={12}
      yOffset={12}
      zIndex={400}
      overlayProps={{ backgroundOpacity: 0.75, blur: 2 }}
      // Podklad: neutrální tmavá šedá (bez modrého/teal nádechu) — fotky si
      // zaslouží nebarevné okolí; app gray škála (light-dark(#111827, #ececec)…) je modře tónovaná.
      // Vědomá odchylka od theme tokenů (schváleno v review UI).
      styles={{ content: { background: "#262626", overflow: "hidden" } }}
    >
      <div
        ref={wrapperRef}
        onKeyDownCapture={handleKeyDown}
        tabIndex={-1}
        data-autofocus
        data-mantine-stop-propagation="true"
        style={{ outline: "none" }}
      >
        {/* Horní lišta: název + počítadlo + akce */}
        <Group justify="space-between" wrap="nowrap" gap="sm" px="md" py={8}>
          <Text size="sm" c="dimmed" truncate style={{ minWidth: 0 }}>
            {current.filename}
          </Text>
          <Group gap={6} wrap="nowrap">
            <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
              {safeIdx + 1} / {images.length}
            </Text>
            <Tooltip label="Otevřít v novém okně" withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => src && window.open(src, "_blank", "noopener")}
                aria-label="Otevřít v novém okně"
                data-mantine-stop-propagation="true"
              >
                <IconExternalLink size={18} />
              </ActionIcon>
            </Tooltip>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={onClose}
              aria-label="Zavřít galerii"
              data-mantine-stop-propagation="true"
            >
              <IconX size={18} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Modal fotku OBEPÍNÁ (kopíruje její rozměr) + po stranách úzké žlábky
            se šipkami MIMO fotku (pár px vzduchu kolem kolečka). Fotka smí
            vyrůst až téměř do výšky obrazovky. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px" }}>
          <div style={{ width: 40, flex: "none", display: "flex", justifyContent: "center" }}>
            {hasPrev && (
              <ActionIcon
                variant="filled"
                color="#3f3f3f"
                radius="xl"
                size="lg"
                onClick={() => go(-1)}
                aria-label="Předchozí fotka"
                data-mantine-stop-propagation="true"
              >
                <IconChevronLeft size={20} />
              </ActionIcon>
            )}
          </div>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 280,
              minHeight: 200,
            }}
          >
            {failed || !src ? (
              <Group gap="xs">
                <IconPhotoOff size={22} style={{ color: "light-dark(#6b7280, #9b9b9b)" }} />
                <Text size="sm" c="dimmed">
                  Fotku se nepodařilo načíst.
                </Text>
              </Group>
            ) : (
              <>
                {!loaded && (
                  <Center style={{ position: "absolute", inset: 0 }}>
                    <Loader size="sm" color="gray" />
                  </Center>
                )}
                <img
                  src={src}
                  alt={current.filename}
                  onLoad={() => setLoaded(true)}
                  onError={handleImgError}
                  style={{
                    display: "block",
                    // výška: celý viewport minus reálný chrome (yOffset 2×12
                    // + lišta ~40 + popisek ~28 + padding scény + malá rezerva)
                    maxHeight: "calc(100dvh - 116px)",
                    // šířka: viewport minus oba žlábky se šipkami
                    maxWidth: "calc(94vw - 104px)",
                    opacity: loaded ? 1 : 0,
                    transition: "opacity .12s ease",
                  }}
                />
              </>
            )}
          </div>
          <div style={{ width: 40, flex: "none", display: "flex", justifyContent: "center" }}>
            {hasNext && (
              <ActionIcon
                variant="filled"
                color="#3f3f3f"
                radius="xl"
                size="lg"
                onClick={() => go(1)}
                aria-label="Další fotka"
                data-mantine-stop-propagation="true"
              >
                <IconChevronRight size={20} />
              </ActionIcon>
            )}
          </div>
        </div>

        {/* Popisek (autor · datum) */}
        {current.caption && (
          <Text size="xs" c="dimmed" ta="center" px="md" py={6}>
            {current.caption}
          </Text>
        )}
      </div>
    </Modal>
  );
}
