"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Challenge, ChallengeHabit, ChallengeMembership, Profile } from "@/lib/types";

type AppState = {
  configured: boolean;
  loading: boolean;
  error: string;
  user: User | null;
  profile: Profile | null;
  challenge: Challenge | null;
  challenges: Challenge[];
  membership: ChallengeMembership | null;
  memberships: ChallengeMembership[];
  habits: ChallengeHabit[];
  refresh: (preferredChallengeId?: string) => Promise<void>;
  selectChallenge: (challengeId: string) => Promise<void>;
};

const AppContext = createContext<AppState | null>(null);
const ACTIVE_CHALLENGE_KEY = "challenge-active-id";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [membership, setMembership] = useState<ChallengeMembership | null>(null);
  const [memberships, setMemberships] = useState<ChallengeMembership[]>([]);
  const [habits, setHabits] = useState<ChallengeHabit[]>([]);

  const refresh = useCallback(async (preferredChallengeId?: string) => {
    if (!configured) { setLoading(false); return; }
    setLoading(true);
    setError("");
    const supabase = getSupabaseBrowserClient();

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      if (!userData.user) {
        setUser(null); setProfile(null); setChallenge(null); setChallenges([]);
        setMembership(null); setMemberships([]); setHabits([]);
        if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_CHALLENGE_KEY);
        return;
      }

      const currentUser = userData.user;
      setUser(currentUser);
      const [profileResult, memberResult] = await Promise.all([
        supabase.from("profiles")
          .select("id,display_name,avatar_url")
          .eq("id", currentUser.id)
          .maybeSingle(),
        supabase.from("challenge_members")
          .select("challenge_id,user_id,role,permissions,created_at")
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: true }),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (memberResult.error) throw memberResult.error;

      const nextMemberships = (memberResult.data || []) as ChallengeMembership[];
      setProfile(profileResult.data as Profile | null);
      setMemberships(nextMemberships);

      const ids = [...new Set(nextMemberships.map(row => row.challenge_id))];
      if (!ids.length) {
        setChallenge(null); setChallenges([]); setMembership(null); setHabits([]);
        if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_CHALLENGE_KEY);
        return;
      }

      const challengeResult = await supabase.from("challenges").select("*").in("id", ids);
      if (challengeResult.error) throw challengeResult.error;
      const nextChallenges = (challengeResult.data || []) as Challenge[];
      setChallenges(nextChallenges);
      const savedId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_CHALLENGE_KEY) : null;
      const wantedId = preferredChallengeId || savedId;
      const selected = nextChallenges.find(row => row.id === wantedId) || nextChallenges[0] || null;
      setChallenge(selected);
      setMembership(selected ? nextMemberships.find(row => row.challenge_id === selected.id) || null : null);

      if (!selected) {
        setHabits([]);
        return;
      }

      if (typeof window !== "undefined") localStorage.setItem(ACTIVE_CHALLENGE_KEY, selected.id);
      const habitResult = await supabase.from("habits")
        .select("id,challenge_id,habit_key,name,description,sort_order,is_fasting,points,is_required,is_active,active_from,active_until")
        .eq("challenge_id", selected.id)
        .order("sort_order", { ascending: true });
      if (habitResult.error) throw habitResult.error;
      setHabits((habitResult.data || []) as ChallengeHabit[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر تحميل بيانات الحساب والتحدّي.");
    } finally {
      setLoading(false);
    }
  }, [configured]);

  const selectChallenge = useCallback(async (challengeId: string) => {
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_CHALLENGE_KEY, challengeId);
    await refresh(challengeId);
  }, [refresh]);

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    const supabase = getSupabaseBrowserClient();
    void refresh();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, _session: Session | null) => {
      window.setTimeout(() => void refresh(), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [configured, refresh]);

  const value = useMemo(() => ({
    configured, loading, error, user, profile, challenge, challenges, membership,
    memberships, habits, refresh, selectChallenge,
  }), [configured, loading, error, user, profile, challenge, challenges, membership, memberships, habits, refresh, selectChallenge]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
