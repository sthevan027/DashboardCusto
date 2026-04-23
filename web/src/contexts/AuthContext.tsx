import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { T } from "../lib/db/catalog";
import { isStandalone } from "../lib/presentationMode";
import {
  clearStandaloneStorage,
  createStandaloneSession,
  matchesDemoLogin,
  readStandaloneStorage,
  writeStandaloneStorage,
} from "../lib/standaloneAuth";

type ProfileRow = {
  role: string;
  display_name: string | null;
};

type AuthContextValue = {
  session: Session | null;
  isAdmin: boolean;
  /** Nome em app_profiles.display_name (histórico / UI) ou em modo offline, localStorage. */
  displayName: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setDisplayName: (name: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(
  userId: string | undefined,
): Promise<{ isAdmin: boolean; displayName: string | null }> {
  if (!userId) return { isAdmin: false, displayName: null };
  const { data, error } = await supabase
    .from(T.app_profiles)
    .select("role, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return { isAdmin: false, displayName: null };
  const row = data as ProfileRow;
  return {
    isAdmin: row.role === "admin",
    displayName: row.display_name?.trim() || null,
  };
}

function initialStandaloneState(): {
  session: Session | null;
  isAdmin: boolean;
  displayName: string | null;
} {
  if (!isStandalone()) {
    return { session: null, isAdmin: false, displayName: null };
  }
  const s = readStandaloneStorage();
  if (!s) {
    return { session: null, isAdmin: false, displayName: null };
  }
  return {
    session: createStandaloneSession(s.email),
    isAdmin: true,
    displayName: s.display_name,
  };
}

const initS = initialStandaloneState();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(initS.session);
  const [isAdmin, setIsAdmin] = useState(initS.isAdmin);
  const [displayName, setDisplayNameState] = useState<string | null>(
    initS.displayName,
  );
  const [loading, setLoading] = useState(!isStandalone());

  const refreshProfile = useCallback(async () => {
    if (isStandalone()) {
      const s = readStandaloneStorage();
      setDisplayNameState(s?.display_name ?? null);
      return;
    }
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    const p = await loadProfile(uid);
    setIsAdmin(p.isAdmin);
    setDisplayNameState(p.displayName);
  }, []);

  const applyUserId = useCallback(async (userId: string | undefined) => {
    const p = await loadProfile(userId);
    setIsAdmin(p.isAdmin);
    setDisplayNameState(p.displayName);
  }, []);

  useEffect(() => {
    if (isStandalone()) {
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return;
      setSession(s);
      void applyUserId(s?.user.id).then(() => {
        if (!cancelled) setLoading(false);
      });
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void applyUserId(s?.user.id);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applyUserId]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (isStandalone()) {
      if (!matchesDemoLogin(email, password)) {
        return { error: "E-mail ou senha incorretos (conta de demonstração)." };
      }
      const trimmed = email.trim();
      const prev = readStandaloneStorage();
      const next = {
        email: trimmed,
        display_name: prev?.email === trimmed ? prev.display_name : null,
      };
      writeStandaloneStorage(next);
      setSession(createStandaloneSession(trimmed));
      setIsAdmin(true);
      setDisplayNameState(next.display_name);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    if (isStandalone()) {
      clearStandaloneStorage();
      setSession(null);
      setIsAdmin(false);
      setDisplayNameState(null);
      return;
    }
    await supabase.auth.signOut();
  }, []);

  const setDisplayName = useCallback(async (name: string) => {
    if (isStandalone()) {
      const s = readStandaloneStorage();
      if (!s) return { error: "Sessão inválida." };
      const trimmed = name.trim();
      writeStandaloneStorage({
        email: s.email,
        display_name: trimmed || null,
      });
      setDisplayNameState(trimmed || null);
      return { error: null };
    }
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!uid) return { error: "Sessão inválida." };
    const trimmed = name.trim();
    const { error } = await supabase
      .from(T.app_profiles)
      .update({ display_name: trimmed || null })
      .eq("id", uid);
    if (!error) setDisplayNameState(trimmed || null);
    return { error: error?.message ?? null };
  }, []);

  const value = useMemo(
    () => ({
      session,
      isAdmin,
      displayName,
      loading,
      signIn,
      signOut,
      setDisplayName,
      refreshProfile,
    }),
    [
      session,
      isAdmin,
      displayName,
      loading,
      signIn,
      signOut,
      setDisplayName,
      refreshProfile,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

/** Hook do mesmo módulo que o Provider — padrão habitual de Context API. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve estar dentro de AuthProvider");
  }
  return ctx;
}
