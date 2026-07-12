// =============================================================================
// OrderAttachmentsCard — přílohy zakázky (R2 přes Worker, bez draft modelu).
// Obrázky se před uploadem zmenší client-side (prepareImageVariants: mid +
// webp preview) — vzor crm-mvp imageDownscale.
// =============================================================================

import { useRef, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  Image,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconFile, IconPaperclip, IconTrash, IconUpload } from "@tabler/icons-react";
import { IS_DEMO } from "../../lib/demo";
import dayjs from "dayjs";
import type { AttachmentRow } from "../../api/types";
import { prepareImageVariants } from "../../shared/imageDownscale";
import ImageLightbox, { type LightboxImage } from "../ui/ImageLightbox";
import { confirm } from "../../lib/confirm";
import { notifyError } from "../../lib/notify";
import { t } from "../../i18n";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  orderId: string;
  attachments: AttachmentRow[];
  /** Po uploadu/smazání — parent refetchne detail. */
  onChanged: () => void;
}

export default function OrderAttachmentsCard({ orderId, attachments, onChanged }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  /** Index otevřené fotky v galerii; null = zavřeno. */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const uploadFiles = async (files: File[]) => {
    setUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        if (file.type.startsWith("image/")) {
          const variants = await prepareImageVariants(file);
          form.append("file", variants.mid, file.name);
          if (variants.preview) form.append("preview", new File([variants.preview], "preview.webp"));
        } else {
          form.append("file", file);
        }
        const res = await fetch(`/api/orders/${orderId}/attachments`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(data?.error?.message ?? t("Upload {soubor} selhal", { soubor: file.name }));
        }
      }
      onChanged();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Upload se nepodařil"));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (a: AttachmentRow) => {
    const ok = await confirm({
      title: t("Smazat přílohu"),
      message: t('Opravdu smazat „{nazev}"?', { nazev: a.fileName }),
      confirmLabel: t("Smazat"),
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/attachments/${a.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("Smazání selhalo"));
      onChanged();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : t("Smazání se nepodařilo"));
    }
  };

  const images = attachments.filter((a) => a.previewR2Key);
  const files = attachments.filter((a) => !a.previewR2Key);

  // URL jsou trvalé (auth řeší Access cookie) — expirace se tu neřeší.
  const lightboxImages: LightboxImage[] = images.map((a) => ({
    id: a.id,
    fullUrl: `/api/attachments/${a.id}/download`,
    previewUrl: `/api/attachments/${a.id}/download?preview=1`,
    filename: a.fileName,
    caption: dayjs(a.createdAt).format("D. M. YYYY H:mm"),
  }));

  return (
    <Card withBorder>
      <Group justify="space-between" mb="sm">
        <Group gap={8}>
          <IconPaperclip size={20} style={{ color: "light-dark(#6b7280, #9b9b9b)" }} />
          <Title order={4}>{t("Přílohy")}</Title>
        </Group>
        {IS_DEMO ? (
          <Text size="xs" c="dimmed">{t("V demoverzi nelze přílohy přidávat ani mazat.")}</Text>
        ) : (
        <Button
          size="xs"
          variant="light"
          leftSection={<IconUpload size={14} />}
          loading={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {t("Nahrát")}
        </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            // FileList je ŽIVÝ objekt — reset value ho vyprázdní, proto
            // nejdřív zkopírovat do pole a teprve pak input vyčistit.
            const files = Array.from(e.currentTarget.files ?? []);
            e.currentTarget.value = "";
            if (files.length) void uploadFiles(files);
          }}
        />
      </Group>

      {attachments.length === 0 && (
        <Text size="sm" c="dimmed">{t("Zatím žádné přílohy.")}</Text>
      )}

      {images.length > 0 && (
        <Group gap="sm" mb={files.length ? "md" : 0}>
          {images.map((a, idx) => (
            <Box key={a.id} style={{ position: "relative" }}>
              <Image
                src={`/api/attachments/${a.id}/download?preview=1`}
                alt={a.fileName}
                w={96}
                h={96}
                fit="cover"
                radius="md"
                style={{ border: "1px solid light-dark(#e5e7eb, #333333)", cursor: "pointer" }}
                onClick={() => setLightboxIndex(idx)}
              />
              <ActionIcon
                size="xs"
                color="red"
                variant="filled"
                style={{ position: "absolute", top: 4, right: 4, display: IS_DEMO ? "none" : undefined }}
                onClick={() => void handleDelete(a)}
              >
                <IconTrash size={12} />
              </ActionIcon>
            </Box>
          ))}
        </Group>
      )}

      <ImageLightbox
        images={lightboxImages}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />

      {files.map((a) => (
        <Group key={a.id} justify="space-between" wrap="nowrap" py={6}>
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <IconFile size={18} style={{ color: "light-dark(#6b7280, #9b9b9b)", flexShrink: 0 }} />
            <Box style={{ minWidth: 0 }}>
              <Text
                size="sm"
                fw={500}
                component="a"
                href={`/api/attachments/${a.id}/download`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "light-dark(#161616, #f2f2f2)", textDecoration: "none", wordBreak: "break-all" }}
              >
                {a.fileName}
              </Text>
              <Text size="xs" c="dimmed">
                {formatSize(a.size)} · {dayjs(a.createdAt).format("D. M. YYYY H:mm")}
              </Text>
            </Box>
          </Group>
          {!IS_DEMO && (
          <Tooltip label={t("Smazat")}>
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => void handleDelete(a)}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
          )}
        </Group>
      ))}
    </Card>
  );
}
