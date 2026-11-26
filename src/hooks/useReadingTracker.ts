import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  beaconReadingDeltas,
  fetchReadingStats,
  pushReadingDeltas,
} from "../api/client";
import {
  compactReadingDeltas,
  formatLocalDateKey,
  loadCachedReadingStats,
  loadPendingDeltas,
  mergeReadingDeltas,
  saveCachedReadingStats,
  savePendingDeltas,
} from "../lib/readingStats";
import type { ReadingDelta, ReadingStatsData, ReadingSyncStatus } from "../types";

const IDLE_TIMEOUT_MS = 60_000;
const SYNC_INTERVAL_MS = 45_000;
const LOCAL_PERSIST_INTERVAL_SEC = 10;

interface UseReadingTrackerOptions {
  authenticated: boolean;
  activeNoteKey: string | null;
  noteReady: boolean;
}

export interface UseReadingTrackerResult {
  stats: ReadingStatsData;
  syncStatus: ReadingSyncStatus;
  isActivelyReading: boolean;
  refreshStats: () => Promise<void>;
}

export function useReadingTracker({
  authenticated,
  activeNoteKey,
  noteReady,
}: UseReadingTrackerOptions): UseReadingTrackerResult {
  const [serverStats, setServerStats] = useState<ReadingStatsData>(() => loadCachedReadingStats());
  const [pendingSnapshot, setPendingSnapshot] = useState<ReadingDelta[]>(() => loadPendingDeltas());
  const [inFlightSnapshot, setInFlightSnapshot] = useState<ReadingDelta[]>([]);
  const [syncStatus, setSyncStatus] = useState<ReadingSyncStatus>("local");
  const [isActivelyReading, setIsActivelyReading] = useState(false);

  const pendingRef = useRef<ReadingDelta[]>(pendingSnapshot);
  const inFlightRef = useRef<ReadingDelta[]>([]);
  const lastActivityAtRef = useRef<number>(Date.now());
  const activeNoteKeyRef = useRef<string | null>(activeNoteKey);
  const authenticatedRef = useRef<boolean>(authenticated);
  const noteReadyRef = useRef<boolean>(noteReady);
  const ticksSinceLocalSaveRef = useRef<number>(0);

  activeNoteKeyRef.current = activeNoteKey;
  authenticatedRef.current = authenticated;
  noteReadyRef.current = noteReady;

  const syncPendingState = useCallback(() => {
    const compacted = compactReadingDeltas(pendingRef.current);
    pendingRef.current = compacted;
    setPendingSnapshot(compacted);
  }, []);

  const flushToServer = useCallback(async (keepalive = false) => {
    if (!authenticatedRef.current) return;
    if (inFlightRef.current.length > 0) return;

    const batch = compactReadingDeltas(pendingRef.current);
    if (batch.length === 0) return;

    pendingRef.current = [];
    inFlightRef.current = batch;
    setPendingSnapshot([]);
    setInFlightSnapshot(batch);
    setSyncStatus("syncing");

    try {
      const updated = await pushReadingDeltas(batch, { keepalive });
      inFlightRef.current = [];
      setInFlightSnapshot([]);
      setServerStats(updated);
      saveCachedReadingStats(updated);
      savePendingDeltas(pendingRef.current);
      setSyncStatus("synced");
    } catch (err) {
      // Restore unconfirmed deltas so nothing is lost if offline or transient error
      pendingRef.current = compactReadingDeltas([...inFlightRef.current, ...pendingRef.current]);
      inFlightRef.current = [];
      setInFlightSnapshot([]);
      setPendingSnapshot(pendingRef.current);
      savePendingDeltas(pendingRef.current);
      if (err instanceof ApiError && err.status === 401) {
        setSyncStatus("local");
      } else {
        setSyncStatus("local");
      }
    }
  }, []);

  const refreshStats = useCallback(async () => {
    if (!authenticatedRef.current) return;
    try {
      const remote = await fetchReadingStats();
      setServerStats(remote);
      saveCachedReadingStats(remote);
      setSyncStatus("synced");
      if (pendingRef.current.length > 0) {
        void flushToServer(false);
      }
    } catch {
      setSyncStatus("local");
    }
  }, [flushToServer]);

  // Initial fetch once authenticated
  useEffect(() => {
    if (!authenticated) return;
    void refreshStats();
  }, [authenticated, refreshStats]);

  // Flush accumulated deltas when switching notes (if >= 5s pending)
  const prevNoteKeyRef = useRef<string | null>(activeNoteKey);
  useEffect(() => {
    if (prevNoteKeyRef.current !== activeNoteKey) {
      prevNoteKeyRef.current = activeNoteKey;
      lastActivityAtRef.current = Date.now();
      const totalPending = pendingRef.current.reduce((sum, item) => sum + item.seconds, 0);
      if (totalPending >= 5) {
        void flushToServer(false);
      }
    }
  }, [activeNoteKey, flushToServer]);

  // Activity listeners + 1s reading tick + periodic sync + visibility/pagehide flush
  useEffect(() => {
    if (!authenticated) {
      setIsActivelyReading(false);
      return;
    }

    let lastPointerMoveAt = 0;
    const markActive = () => {
      lastActivityAtRef.current = Date.now();
    };
    const onPointerMove = () => {
      const now = Date.now();
      if (now - lastPointerMoveAt > 2000) {
        lastPointerMoveAt = now;
        lastActivityAtRef.current = now;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        lastActivityAtRef.current = Date.now();
      } else {
        setIsActivelyReading(false);
        savePendingDeltas(pendingRef.current);
        void flushToServer(true);
      }
    };

    const onPageHide = () => {
      const batch = compactReadingDeltas(pendingRef.current);
      if (batch.length === 0) return;
      const sent = beaconReadingDeltas(batch);
      if (sent) {
        const optimistic = mergeReadingDeltas(loadCachedReadingStats(), batch);
        saveCachedReadingStats(optimistic);
        pendingRef.current = [];
        savePendingDeltas([]);
      } else {
        savePendingDeltas(batch);
      }
    };

    window.addEventListener("pointerdown", markActive, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("keydown", markActive, { passive: true });
    window.addEventListener("scroll", markActive, { passive: true });
    window.addEventListener("wheel", markActive, { passive: true });
    window.addEventListener("touchstart", markActive, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    const tickTimer = window.setInterval(() => {
      const noteKey = activeNoteKeyRef.current;
      const isVisible = document.visibilityState === "visible";
      const isIdle = Date.now() - lastActivityAtRef.current >= IDLE_TIMEOUT_MS;
      const shouldCount = Boolean(authenticatedRef.current && noteKey && noteReadyRef.current && isVisible && !isIdle);

      setIsActivelyReading(shouldCount);
      if (!shouldCount || !noteKey) return;

      const todayKey = formatLocalDateKey(new Date());
      pendingRef.current = compactReadingDeltas([
        ...pendingRef.current,
        { date: todayKey, seconds: 1, noteKey },
      ]);
      syncPendingState();

      ticksSinceLocalSaveRef.current += 1;
      if (ticksSinceLocalSaveRef.current >= LOCAL_PERSIST_INTERVAL_SEC) {
        ticksSinceLocalSaveRef.current = 0;
        savePendingDeltas(pendingRef.current);
      }
    }, 1000);

    const syncTimer = window.setInterval(() => {
      void flushToServer(false);
    }, SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(tickTimer);
      window.clearInterval(syncTimer);
      window.removeEventListener("pointerdown", markActive);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", markActive);
      window.removeEventListener("scroll", markActive);
      window.removeEventListener("wheel", markActive);
      window.removeEventListener("touchstart", markActive);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [authenticated, flushToServer, syncPendingState]);

  const stats = useMemo(
    () => mergeReadingDeltas(serverStats, [...inFlightSnapshot, ...pendingSnapshot]),
    [serverStats, inFlightSnapshot, pendingSnapshot]
  );

  return {
    stats,
    syncStatus,
    isActivelyReading,
    refreshStats,
  };
}
