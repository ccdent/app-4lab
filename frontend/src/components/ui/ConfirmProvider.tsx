import { useEffect, useState } from "react";
import { Modal, Group, Button, Text, Stack } from "@mantine/core";
import {
  type ConfirmOptions,
  registerConfirmProvider,
  resolveConfirm,
} from "../../lib/confirm";
import { t } from "../../i18n";

interface State {
  open: boolean;
  opts?: ConfirmOptions;
}

export default function ConfirmProvider() {
  const [state, setState] = useState<State>({ open: false });

  useEffect(() => {
    registerConfirmProvider(setState);
    return () => registerConfirmProvider(null);
  }, []);

  const opts = state.opts;
  const isDanger = opts?.variant === "danger";

  return (
    <Modal
      opened={state.open}
      onClose={() => resolveConfirm(false)}
      title={opts?.title ?? t("Potvrdit")}
      centered
      size="sm"
      withCloseButton
    >
      <Stack gap="lg">
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
          {opts?.message}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={() => resolveConfirm(false)}>
            {opts?.cancelLabel ?? t("Zrušit")}
          </Button>
          <Button
            color={isDanger ? "red" : undefined}
            onClick={() => resolveConfirm(true)}
            autoFocus
          >
            {opts?.confirmLabel ?? t("Potvrdit")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
