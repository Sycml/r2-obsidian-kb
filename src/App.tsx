import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  fetchAuthStatus,
  fetchNoteContent,
  fetchUserPreferences,
  fetchVaultTree,
  logoutSession,
  saveUserPreferences,
} from "./api/client";
import { HeaderBar } from "./components/HeaderBar";
import { LoginScreen } from "./components/LoginScreen";
import { NoteView } from "./components/NoteView";
import { ReadingHeatmapModal } from "./components/ReadingHeatmapModal";
import { Sidebar } from "./components/Sidebar";
import { TocPanel } from "./components/TocPanel";
import { useReadingTracker } from "./hooks/useReadingTracker";
import { renderObsidianNote } from "./lib/obsidian";
import { getNoteReadingSeconds } from "./lib/readingStats";
import {
  applyThemePreference,
  DEFAULT_ACCENT_ID,
  getSavedAccentPreference,
  getSavedThemePreference,
  hasPendingAccentSync,
  setPendingAccentSync,
  type AccentPreference,
  type ThemePreference,
} from "./lib/theme";
import type {
  AuthStatus,
  NoteResponse,
  ReadingSyncStatus,
  TreeNode,
  VaultTreeResponse,
} from "./types";

function flattenTreeNotes(nodes: TreeNode[]): Array<{ key: string; name: string }> {
  const result: Array<{ key: string; name: string }> = [];
  for (const node of nodes) {
    if (node.type === "file") {
      result.push({ key: node.path, name: node.name });
    } else if (node.children) {
      result.push(...flattenTreeNotes(node.children));
    }
  }
  return result;
}

function getNoteFromLocation(): { key: string | null; heading: string | null } {
  const params = new URLSearchParams(window.location.search);
  const key = params.get("note");
  const rawHash = window.location.hash.replace(/^#/, "");
  let heading: string | null = null;
  if (rawHash) {
    try {
      heading = decodeURIComponent(rawHash);
    } catch {
      heading = rawHash;
    }
  }
  return { key, heading };
}

export function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [vault, setVault] = useState<VaultTreeResponse | null>(null);
  const [activeNoteKey, setActiveNoteKey] = useState<string | null>(() => getNoteFromLocation().key);
  const [pendingHeading, setPendingHeading] = useState<string | null>(
    () => getNoteFromLocation().heading
  );

  const [note, setNote] = useState<NoteResponse | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [heatmapOpen, setHeatmapOpen] = useState(false);

  const [themePref, setThemePref] = useState<ThemePreference>(() => getSavedThemePreference());
  const [accentPref, setAccentPref] = useState<AccentPreference>(() => getSavedAccentPreference());
  const [accentSyncStatus, setAccentSyncStatus] = useState<ReadingSyncStatus>("local");

  const accentPrefRef = useRef<AccentPreference>(accentPref);
  const accentSaveTimerRef = useRef<number | null>(null);
  const accentSaveSeqRef = useRef<number>(0);
  const authenticatedRef = useRef<boolean>(false);

  accentPrefRef.current = accentPref;
  authenticatedRef.current = Boolean(authStatus?.authenticated);

  // Sync theme preference, accent color & system theme listener
  useEffect(() => {
    applyThemePreference(themePref, accentPref);
    if (themePref !== "system" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyThemePreference("system", accentPref);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, [themePref, accentPref]);

  // Cleanup pending debounced accent sync timer on unmount
  useEffect(() => {
    return () => {
      if (accentSaveTimerRef.current !== null) {
        window.clearTimeout(accentSaveTimerRef.current);
      }
    };
  }, []);

  const persistAccentToR2 = useCallback(async (nextAccent: AccentPreference) => {
    if (!authenticatedRef.current) return;
    const seq = ++accentSaveSeqRef.current;
    setAccentSyncStatus("syncing");
    try {
      await saveUserPreferences(nextAccent);
      if (seq === accentSaveSeqRef.current) {
        setPendingAccentSync(false);
        setAccentSyncStatus("synced");
      }
    } catch {
      if (seq === accentSaveSeqRef.current) {
        setPendingAccentSync(true);
        setAccentSyncStatus("local");
      }
    }
  }, []);

  const syncPreferencesFromR2 = useCallback(async () => {
    if (!authenticatedRef.current) return;
    try {
      const remote = await fetchUserPreferences();
      const localAccent = accentPrefRef.current;
      const shouldPushLocal =
        hasPendingAccentSync() || (remote.updatedAt === null && localAccent !== DEFAULT_ACCENT_ID);

      if (shouldPushLocal) {
        await persistAccentToR2(localAccent);
        return;
      }

      if (remote.updatedAt !== null && remote.accent) {
        setAccentPref(remote.accent);
        setPendingAccentSync(false);
      }
      setAccentSyncStatus("synced");
    } catch {
      setAccentSyncStatus("local");
    }
  }, [persistAccentToR2]);

  const handleChangeAccent = useCallback(
    (nextAccent: AccentPreference) => {
      setAccentPref(nextAccent);
      setPendingAccentSync(true);

      if (accentSaveTimerRef.current !== null) {
        window.clearTimeout(accentSaveTimerRef.current);
      }

      if (!authenticatedRef.current) {
        setAccentSyncStatus("local");
        return;
      }

      setAccentSyncStatus("syncing");
      accentSaveTimerRef.current = window.setTimeout(() => {
        accentSaveTimerRef.current = null;
        void persistAccentToR2(nextAccent);
      }, 350);
    },
    [persistAccentToR2]
  );

  // Check authentication status
  const checkAuth = useCallback(async () => {
    setAuthLoading(true);
    try {
      const status = await fetchAuthStatus();
      setAuthStatus(status);
      document.title = status.siteTitle || "我的知识库";
    } catch {
      setAuthStatus({
        authenticated: false,
        authMode: "password",
        siteTitle: "我的知识库",
      });
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const orderedNotes = useMemo(() => (vault ? flattenTreeNotes(vault.tree) : []), [vault]);

  // Load vault directory tree once authenticated
  const loadVault = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchVaultTree();
      setVault(data);
      document.title = data.siteTitle || "我的知识库";

      const notes = flattenTreeNotes(data.tree);
      setActiveNoteKey((prev) => (prev && notes.some((n) => n.key === prev) ? prev : null));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
      } else {
        setNoteError(err instanceof Error ? err.message : "加载知识库目录失败");
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus?.authenticated) {
      loadVault();
      void syncPreferencesFromR2();
    }
  }, [authStatus?.authenticated, loadVault, syncPreferencesFromR2]);

  // Load active note content from R2
  const loadNote = useCallback(async (key: string) => {
    setNoteLoading(true);
    setNoteError(null);
    try {
      const data = await fetchNoteContent(key);
      setNote(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
      } else {
        setNoteError(err instanceof Error ? err.message : "无法读取该笔记");
      }
    } finally {
      setNoteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authStatus?.authenticated) return;
    if (!activeNoteKey) {
      setNote(null);
      setNoteError(null);
      setNoteLoading(false);
      document.title = vault?.siteTitle || authStatus.siteTitle || "我的知识库";
      return;
    }
    loadNote(activeNoteKey);
  }, [authStatus?.authenticated, authStatus?.siteTitle, activeNoteKey, loadNote, vault?.siteTitle]);

  // Sync browser Back/Forward buttons
  useEffect(() => {
    const onPopState = () => {
      const { key, heading } = getNoteFromLocation();
      setActiveNoteKey(key);
      setPendingHeading(heading);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const parsedNote = useMemo(() => {
    if (!note || !vault) return null;
    return renderObsidianNote(note.content, note.key, vault.files);
  }, [note, vault]);

  // Real-time active reading duration tracker (persisted to R2 + localStorage cache)
  const {
    stats: readingStats,
    syncStatus: readingSyncStatus,
    isActivelyReading,
    refreshStats,
  } = useReadingTracker({
    authenticated: Boolean(authStatus?.authenticated),
    activeNoteKey,
    noteReady: Boolean(note && parsedNote && !noteError),
  });

  // Scroll to heading or top after note renders
  useEffect(() => {
    if (!parsedNote || !note || note.key !== activeNoteKey) return;
    const title = parsedNote.frontmatter.title || note.key.split("/").pop()?.replace(/\.md$/i, "");
    document.title = title ? `${title} · ${vault?.siteTitle || "知识库"}` : vault?.siteTitle || "知识库";

    if (pendingHeading) {
      const targetId = pendingHeading;
      setPendingHeading(null);
      requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [parsedNote, note, activeNoteKey, pendingHeading, vault?.siteTitle]);

  const navigateToNote = useCallback(
    (key: string, headingId?: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set("note", key);
      url.hash = headingId ? encodeURIComponent(headingId) : "";
      window.history.pushState(null, "", url.toString());

      if (key === activeNoteKey) {
        if (headingId) {
          document.getElementById(headingId)?.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }
      setPendingHeading(headingId || null);
      setActiveNoteKey(key);
    },
    [activeNoteKey]
  );

  const handleToggleSidebar = () => {
    if (window.innerWidth <= 820) {
      setMobileSidebarOpen((v) => !v);
      setMobileTocOpen(false);
    } else {
      setDesktopCollapsed((v) => !v);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      loadVault(),
      activeNoteKey ? loadNote(activeNoteKey) : Promise.resolve(),
      refreshStats(),
      syncPreferencesFromR2(),
    ]);
  };

  const handleLogout = async () => {
    if (authStatus?.authMode !== "password") return;
    await logoutSession();
    setVault(null);
    setNote(null);
    setAuthStatus((prev) => (prev ? { ...prev, authenticated: false } : prev));
  };

  if (authLoading || !authStatus) {
    return (
      <div className="center-screen">
        <p style={{ color: "var(--text-secondary)" }}>正在连接知识库...</p>
      </div>
    );
  }

  if (!authStatus.authenticated) {
    return <LoginScreen authStatus={authStatus} onSuccess={() => checkAuth()} />;
  }

  const currentIndex = activeNoteKey
    ? orderedNotes.findIndex((item) => item.key === activeNoteKey)
    : -1;
  const prevNote = currentIndex > 0 ? orderedNotes[currentIndex - 1] : null;
  const nextNote =
    currentIndex >= 0 && currentIndex < orderedNotes.length - 1
      ? orderedNotes[currentIndex + 1]
      : null;

  const currentNoteTitle =
    parsedNote?.frontmatter.title ||
    (activeNoteKey ? activeNoteKey.split("/").pop()?.replace(/\.md$/i, "") || "" : "");

  const currentNoteReading = getNoteReadingSeconds(readingStats, activeNoteKey);

  return (
    <div className="app-shell">
      <HeaderBar
        siteTitle={vault?.siteTitle || authStatus.siteTitle}
        currentNoteTitle={currentNoteTitle}
        hasToc={(parsedNote?.toc.length || 0) > 0}
        refreshing={refreshing}
        authMode={authStatus.authMode}
        themePref={themePref}
        accentPref={accentPref}
        accentSyncStatus={accentSyncStatus}
        sidebarOpen={mobileSidebarOpen || !desktopCollapsed}
        onToggleSidebar={handleToggleSidebar}
        onOpenTocSheet={() => {
          setMobileTocOpen(true);
          setMobileSidebarOpen(false);
        }}
        onRefresh={handleRefresh}
        onChangeTheme={setThemePref}
        onChangeAccent={handleChangeAccent}
        onLogout={authStatus.authMode === "password" ? handleLogout : undefined}
        onGoHome={() => {
          const url = new URL(window.location.href);
          if (url.searchParams.has("note") || url.hash) {
            url.searchParams.delete("note");
            url.hash = "";
            window.history.pushState(null, "", url.toString());
          }
          setPendingHeading(null);
          setActiveNoteKey(null);
        }}
      />

      <div className="workspace">
        {(mobileSidebarOpen || mobileTocOpen) && (
          <div
            className="drawer-backdrop"
            onClick={() => {
              setMobileSidebarOpen(false);
              setMobileTocOpen(false);
            }}
          />
        )}

        <Sidebar
          tree={vault?.tree || []}
          noteCount={vault?.noteCount || 0}
          activeNoteKey={activeNoteKey}
          desktopCollapsed={desktopCollapsed}
          mobileOpen={mobileSidebarOpen}
          readingStats={readingStats}
          isActivelyReading={isActivelyReading}
          onSelectNote={(key) => navigateToNote(key)}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onOpenHeatmap={() => {
            setHeatmapOpen(true);
            setMobileSidebarOpen(false);
          }}
        />

        <main className="main-content">
          <NoteView
            note={note}
            parsed={parsedNote}
            loading={noteLoading}
            error={noteError}
            noteReadingSeconds={currentNoteReading.totalSeconds}
            prevNote={prevNote}
            nextNote={nextNote}
            onNavigateNote={navigateToNote}
            onOpenHeatmap={() => setHeatmapOpen(true)}
            onOpenSidebar={() => {
              if (window.innerWidth <= 820) {
                setMobileSidebarOpen(true);
                setMobileTocOpen(false);
              } else {
                setDesktopCollapsed(false);
              }
            }}
          />
        </main>

        <TocPanel
          items={parsedNote?.toc || []}
          mobileOpen={mobileTocOpen}
          onCloseMobile={() => setMobileTocOpen(false)}
        />
      </div>

      <ReadingHeatmapModal
        open={heatmapOpen}
        stats={readingStats}
        syncStatus={readingSyncStatus}
        onClose={() => setHeatmapOpen(false)}
        onNavigateNote={(key) => navigateToNote(key)}
      />
    </div>
  );
}
