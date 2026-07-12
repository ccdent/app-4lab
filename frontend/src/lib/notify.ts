import { notifications } from "@mantine/notifications";
import { t } from "../i18n";

const coloredStyles = (bg: string, text: string) => ({
  root: { backgroundColor: bg, border: "none" },
  title: { color: text },
  description: { color: text },
  closeButton: { color: text, "&:hover": { backgroundColor: "rgba(255,255,255,0.15)" } },
});

export function notifySuccess(message: string) {
  notifications.show({
    title: t("Uloženo"),
    message,
    color: "teal",
    styles: coloredStyles("var(--mantine-color-teal-7)", "#fff"),
  });
}

export function notifyError(message: string) {
  notifications.show({
    title: t("Chyba"),
    message,
    color: "red",
    styles: coloredStyles("var(--mantine-color-red-7)", "#fff"),
  });
}

export function notifyInfo(message: string) {
  notifications.show({
    title: t("Informace"),
    message,
    color: "blue",
    styles: coloredStyles("var(--mantine-color-blue-7)", "#fff"),
  });
}

export function notifyWarning(message: string) {
  notifications.show({
    title: t("Upozornění"),
    message,
    color: "yellow",
    styles: coloredStyles("var(--mantine-color-yellow-5)", "#000"),
  });
}
