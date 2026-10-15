import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Profile } from "@issue-desk/shared";
import { supabase } from "./supabase";

interface AuthValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileError: unknown;
  retryProfile: () => void;
  isAdmin: boolean;
  canWrite: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const profileQuery = useQuery({
    queryKey: ["me", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId!).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  const profile = profileQuery.data ?? null;
  const value: AuthValue = {
    session,
    profile,
    loading: !ready || (Boolean(userId) && profileQuery.isLoading),
    profileError: profileQuery.error,
    retryProfile: () => void profileQuery.refetch(),
    isAdmin: Boolean(profile?.is_active && profile.role === "admin"),
    canWrite: Boolean(profile?.is_active && (profile.role === "admin" || profile.role === "engineer")),
    signOut: async () => {
      await supabase.auth.signOut();
      qc.clear();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("AuthProvider 밖에서 useAuth를 사용했습니다.");
  return v;
}
