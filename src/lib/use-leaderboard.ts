"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LeaderboardEntry } from "@/lib/types";

type Snapshot = {
  entries: LeaderboardEntry[];
  loading: boolean;
  error: string;
};

type SharedStore = {
  snapshot: Snapshot;
  listeners: Set<() => void>;
  inFlight: Promise<void> | null;
  lastUpdatedAt: number;
  timer: number | null;
};

const stores = new Map<string, SharedStore>();
const EMPTY: Snapshot = { entries: [], loading: false, error: "" };
const POLL_INTERVAL_MS = 45_000;
const CACHE_TTL_MS = 30_000;

function getStore(challengeId: string): SharedStore {
  let store = stores.get(challengeId);
  if (!store) {
    store = {
      snapshot: { entries: [], loading: true, error: "" },
      listeners: new Set(),
      inFlight: null,
      lastUpdatedAt: 0,
      timer: null,
    };
    stores.set(challengeId, store);
  }
  return store;
}

function publish(store: SharedStore, snapshot: Snapshot) {
  store.snapshot = snapshot;
  store.listeners.forEach((listener) => listener());
}

async function loadLeaderboard(challengeId: string, force = false): Promise<void> {
  const store = getStore(challengeId);
  if (store.inFlight) return store.inFlight;
  if (!force && Date.now() - store.lastUpdatedAt < CACHE_TTL_MS) return;

  publish(store, {
    ...store.snapshot,
    loading: store.lastUpdatedAt === 0,
    error: "",
  });

  store.inFlight = (async () => {
    try {
      const { data, error: queryError } = await getSupabaseBrowserClient().rpc(
        "get_challenge_leaderboard",
        { p_challenge_id: challengeId },
      );
      if (queryError) throw queryError;

      const rawEntries = (data || []) as Omit<LeaderboardEntry, "competition_rank">[];
      const entries: LeaderboardEntry[] = rawEntries.map((entry) => ({
        ...entry,
        // Competition ranking: equal scores share a rank; the next rank skips
        // the occupied places (1, 1, 3). The database order remains stable.
        competition_rank:
          rawEntries.findIndex((candidate) => candidate.points === entry.points) + 1,
      }));

      store.lastUpdatedAt = Date.now();
      publish(store, { entries, loading: false, error: "" });
    } catch (cause) {
      // Preserve the last successful snapshot. A transport/permission failure
      // must never be presented as an empty leaderboard.
      publish(store, {
        ...store.snapshot,
        loading: false,
        error: cause instanceof Error ? cause.message : "تعذّر تحديث لوحة المنافسة.",
      });
    } finally {
      store.inFlight = null;
    }
  })();

  return store.inFlight;
}

/** Explicitly refresh the shared leaderboard after a scoring operation. */
export function refreshLeaderboard(challengeId: string | null | undefined) {
  return challengeId ? loadLeaderboard(challengeId, true) : Promise.resolve();
}

/**
 * Shares one cached query and one polling timer across every component using
 * the same challenge. Polling pauses while the document is hidden.
 */
export function useLeaderboard(
  challengeId: string | null | undefined,
  userId?: string,
  notifyRankChanges = false,
) {
  const [snapshot, setSnapshot] = useState<Snapshot>(
    challengeId ? getStore(challengeId).snapshot : EMPTY,
  );
  const previousRank = useRef<number | null>(null);

  useEffect(() => {
    previousRank.current = null;

    if (!challengeId) {
      setSnapshot(EMPTY);
      return;
    }

    const store = getStore(challengeId);
    const update = () => setSnapshot(store.snapshot);
    store.listeners.add(update);
    update();

    if (Date.now() - store.lastUpdatedAt >= CACHE_TTL_MS) {
      void loadLeaderboard(challengeId);
    }

    if (store.timer === null) {
      store.timer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void loadLeaderboard(challengeId);
        }
      }, POLL_INTERVAL_MS);
    }

    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - store.lastUpdatedAt >= CACHE_TTL_MS
      ) {
        void loadLeaderboard(challengeId);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      store.listeners.delete(update);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (store.listeners.size === 0 && store.timer !== null) {
        window.clearInterval(store.timer);
        store.timer = null;
      }
    };
  }, [challengeId]);

  useEffect(() => {
    const currentIndex = userId
      ? snapshot.entries.findIndex((entry) => entry.user_id === userId)
      : -1;
    const currentRank =
      currentIndex >= 0 ? snapshot.entries[currentIndex].competition_rank : null;
    const oldRank = previousRank.current;

    try {
      if (
        notifyRankChanges &&
        oldRank !== null &&
        currentRank !== null &&
        currentRank !== oldRank &&
        typeof window !== "undefined" &&
        localStorage.getItem("challenge-rank-alert-enabled") === "1" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("تغيّر ترتيبك في التحدّي", {
          body: `انتقلت من المركز ${oldRank} إلى المركز ${currentRank}. افتح لوحة المنافسة للاطلاع على النتائج.`,
          icon: "/icon.svg",
        });
      }
    } catch {
      // Browser notification/storage permissions are optional enhancements.
    }

    previousRank.current = currentRank;
  }, [snapshot.entries, userId, notifyRankChanges]);

  return snapshot;
}
