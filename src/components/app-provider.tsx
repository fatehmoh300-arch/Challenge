"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Challenge, ChallengeHabit, Profile } from "@/lib/types";

 type AppState = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  challenge: Challenge | null;
  habits: ChallengeHabit[];
  refresh: () => Promise<void>;
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [habits, setHabits] = useState<ChallengeHabit[]>([]);

  const refresh = useCallback(async () => {
    if (!configured) { setLoading(false); return; }
    const supabase = getSupabaseBrowserClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setUser(null); setProfile(null); setChallenge(null); setHabits([]); setLoading(false); return;
    }
    const currentUser = userData.user;
    setUser(currentUser);
    const [{ data: profileData }, { data: memberData }] = await Promise.all([
      supabase.from("profiles").select("id,display_name,avatar_url").eq("id", currentUser.id).maybeSingle(),
      supabase.from("challenge_members").select("challenge_id").eq("user_id", currentUser.id).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    ]);
    setProfile(profileData as Profile | null);
    if (!memberData?.challenge_id) {
      setChallenge(null); setHabits([]); setLoading(false); return;
    }
    const [{ data: challengeData }, { data: habitData }] = await Promise.all([
      supabase.from("challenges").select("id,title,start_date,end_date,timezone,reading_book,weekly_reading_goal,owner_user_id").eq("id", memberData.challenge_id).maybeSingle(),
      supabase.from("habits").select("id,challenge_id,habit_key,name,description,sort_order,is_fasting").eq("challenge_id", memberData.challenge_id).order("sort_order"),
    ]);
    setChallenge(challengeData as Challenge | null);
    setHabits((habitData || []) as ChallengeHabit[]);
    setLoading(false);
  }, [configured]);

  useEffect(() => {
    if (!configured) { setLoading(false); return; }
    const supabase = getSupabaseBrowserClient();
    void refresh();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, _session: Session | null) => {
      window.setTimeout(() => void refresh(), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, [configured, refresh]);

  const value = useMemo(() => ({ configured, loading, user, profile, challenge, habits, refresh }), [configured, loading, user, profile, challenge, habits, refresh]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
