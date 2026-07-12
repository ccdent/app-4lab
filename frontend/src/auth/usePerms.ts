import { useAuth } from "./authContext";
import type { Perms } from "./authContext";

/** Oprávnění aktuálního uživatele; vedoucí má vždy vše (řeší už server v /me). */
export function usePerms(): Perms & { isLead: boolean } {
  const { me } = useAuth();
  return { ...me.perms, isLead: me.role === "lead" };
}
