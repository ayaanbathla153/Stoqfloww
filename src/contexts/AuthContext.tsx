import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type Role = "supplier" | "retailer" | "staff";

export interface Profile {
  id: string;
  name: string;
  phone: string;
  shop_name: string | null;
  linked_supplier_id: string | null;
  active_role: Role | null;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  roles: Role[];
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  switchRole: (role: Role) => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const [{ data: p }, { data: rs }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    const prof = (p as Profile) ?? null;
    const allRoles = (rs ?? []).map((r: any) => r.role as Role);
    setProfile(prof);
    setRoles(allRoles);
    // active role: stored on profile, fallback to first role
    const active = (prof?.active_role as Role | null) ?? allRoles[0] ?? null;
    setRole(active);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
        setRole(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refresh = async () => {
    if (user) await loadProfile(user.id);
  };

  const switchRole = async (newRole: Role) => {
    if (!user) return;
    if (!roles.includes(newRole)) return;
    await supabase.from("profiles").update({ active_role: newRole }).eq("id", user.id);
    setRole(newRole);
    setProfile((p) => (p ? { ...p, active_role: newRole } : p));
  };

  return (
    <Ctx.Provider value={{ user, session, profile, role, roles, loading, signOut, refresh, switchRole }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
