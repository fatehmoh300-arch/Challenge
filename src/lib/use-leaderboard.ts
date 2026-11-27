"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LeaderboardEntry } from "@/lib/types";

/**
 * Polls an aggregate-only RPC. Peer habit records remain protected by RLS.
 * Rank notifications are opt-in and are emitted only while the app is open.
 */
export function useLeaderboard(
  challengeId: string | null | undefined,
  userId?: string,
  notifyRankChanges = false,
) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(Boolean(challengeId));
  const [error, setError] = useState("");
  const previousRank = useRef<number | null>(null);

  useEffect(() => {
    previousRank.current = null;
    if (!challengeId) {
      setEntries([]);
      setLoading(false);
      return;
    }

    let active = true;
    let inFlight = false;
    const load = async (initial = false) => {
      if (inFlight || !active) return;
      inFlight = true;
      if (initial) setLoading(true);
      try {
        const { data, error: queryError } = await getSupabaseBrowserClient().rpc(
          "get_challenge_leaderboard",
          { p_challenge_id: challengeId },
        );
        if (queryError) throw queryError;
        if (!active) return;
        const nextEntries = (data || []) as LeaderboardEntry[];
        const nextRankIndex = userId ? nextEntries.findIndex((row) => row.user_id === userId) : -1;
        const nextRank = nextRankIndex >= 0 ? nextRankIndex + 1 : null;
        const oldRank = previousRank.current;

        if (
          notifyRankChanges &&
          oldRank !== null &&
          nextRank !== null &&
          nextRank !== oldRank &&
          typeof window !== "undefined" &&
          localStorage.getItem("challenge-rank-alert-enabled") === "1" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("تغيّر ترتيبك في تحدّي ديسمبر", {
            body: `انتقلت من المركز ${oldRank} إلى المركز ${nextRank}. افتح لوحة المنافسة للاطلاع على النتائج.`,
            icon: "/icon.svg",
          });
        }
        previousRank.current = nextRank;
        setEntries(nextEntries);
        setError("");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "تعذّر تحديث لوحة المنافسة.");
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };

    void load(true);
    const timer = window.setInterval(() => void load(false), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [challengeId, userId, notifyRankChanges]);

  return { entries, loading, error };
}
