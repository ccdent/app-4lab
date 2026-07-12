import { Box, Container, Group, Text, Anchor, Stack } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { CRM_FORM_MAX_WIDTH } from "../../ui/tableStyles";

interface FormPageShellProps {
  title: string;
  backTo: string;
  children: ReactNode;
  /** Optional right-side header content (action buttons, status badge, etc.) */
  actions?: ReactNode;
  /** Široká varianta (detail zakázky): 1500px místo 1150px — vejde se
   *  MDR tabulka i dvousloupcový layout, ale neroztéká se přes celý monitor. */
  fullWidth?: boolean;
}

/**
 * Shared layout shell for form / detail pages.
 *
 * Provides:
 * - Full-width white header bar with back arrow + title + optional actions
 * - Centered content container (CRM_FORM_MAX_WIDTH)
 * - Consistent background, spacing, and min-height
 *
 * Used by: /app/orders/new, /app/doctors/new, and future form/detail pages.
 */
export default function FormPageShell({
  title,
  backTo,
  children,
  actions,
  fullWidth = false,
}: FormPageShellProps) {
  return (
    <Box bg="light-dark(#f9fafb, #191919)" mih="100vh">
      {/* Header bar — na mobilu se akce zalomí pod titulek (plná šířka). */}
      <Box
        px={{ base: 12, sm: 32 }}
        py="md"
        style={{
          backgroundColor: "light-dark(#ffffff, #1f1f1f)",
          borderBottom: "1px solid light-dark(#e5e7eb, #333333)",
        }}
      >
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
            <Anchor
              component={Link}
              to={backTo}
              c="dimmed"
              style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
            >
              <IconArrowLeft size={16} />
            </Anchor>
            <Text
              component="h1"
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                color: "light-dark(#111827, #ececec)",
                margin: 0,
              }}
            >
              {title}
            </Text>
          </Group>
          {actions && (
            <Group gap="xs" align="center" wrap="wrap">
              {actions}
            </Group>
          )}
        </Group>
      </Box>

      {/* Content */}
      <Container
        size={fullWidth ? 1500 : CRM_FORM_MAX_WIDTH}
        px={{ base: 12, sm: 32, lg: 40 }}
        py="lg"
      >
        <Stack gap="lg">{children}</Stack>
      </Container>
    </Box>
  );
}
