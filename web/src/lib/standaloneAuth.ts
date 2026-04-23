import type { Session } from "@supabase/supabase-js";

const STORAGE_KEY = "dashboard-custo-standalone-v1";

/** ID fixo (UUID) para comparações com o histórico em modo offline. */
export const STANDALONE_USER_ID = "00000000-0000-4000-8000-000000000001";

export type StandaloneStored = {
  email: string;
  display_name: string | null;
};

export function getDemoCredentials(): { email: string; password: string } {
  const email =
    (import.meta.env.VITE_DEMO_EMAIL as string | undefined)?.trim() ||
    "demo@dashboardcusto.local";
  const password =
    (import.meta.env.VITE_DEMO_PASSWORD as string | undefined) ?? "demonstracao";
  return { email, password };
}

export function matchesDemoLogin(
  email: string,
  password: string,
): boolean {
  const { email: e, password: p } = getDemoCredentials();
  return email.trim().toLowerCase() === e.toLowerCase() && password === p;
}

export function readStandaloneStorage(): StandaloneStored | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return null;
  }
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<StandaloneStored>;
    if (typeof o.email !== "string" || !o.email.trim()) return null;
    return {
      email: o.email.trim(),
      display_name:
        typeof o.display_name === "string" ? o.display_name.trim() || null : null,
    };
  } catch {
    return null;
  }
}

export function writeStandaloneStorage(data: StandaloneStored): void {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return;
  }
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearStandaloneStorage(): void {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return;
  }
  globalThis.localStorage.removeItem(STORAGE_KEY);
}

/** Sessão mínima compatível com o que a UI usa (e-mail, id). */
export function createStandaloneSession(email: string): Session {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "standalone",
    token_type: "bearer",
    expires_in: 1e9,
    expires_at: now + 1e9,
    refresh_token: "standalone",
    user: {
      id: STANDALONE_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: email.trim(),
      email_confirmed_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  } as Session;
}
