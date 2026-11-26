import type {
  AuthStatus,
  NoteResponse,
  ReadingDelta,
  ReadingStatsData,
  VaultTreeResponse,
} from "../types";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data.error) message = data.error;
      if (data.code) code = data.code;
    } catch {
      // Ignore non-JSON error bodies
    }
    throw new ApiError(message, res.status, code);
  }

  return (await res.json()) as T;
}

export function fetchAuthStatus(): Promise<AuthStatus> {
  return requestJson<AuthStatus>("/api/auth/me");
}

export function loginWithPassword(password: string): Promise<{ authenticated: boolean; siteTitle: string }> {
  return requestJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

export function logoutSession(): Promise<{ ok: boolean }> {
  return requestJson("/api/auth/logout", { method: "POST" });
}

export function fetchVaultTree(): Promise<VaultTreeResponse> {
  return requestJson<VaultTreeResponse>("/api/tree");
}

export function fetchNoteContent(key: string): Promise<NoteResponse> {
  return requestJson<NoteResponse>(`/api/note?key=${encodeURIComponent(key)}`);
}

export function buildAssetUrl(key: string): string {
  return `/api/asset?key=${encodeURIComponent(key)}`;
}

export function fetchReadingStats(): Promise<ReadingStatsData> {
  return requestJson<ReadingStatsData>("/api/reading-stats");
}

export function pushReadingDeltas(
  deltas: ReadingDelta[],
  options?: { keepalive?: boolean }
): Promise<ReadingStatsData> {
  return requestJson<ReadingStatsData>("/api/reading-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deltas }),
    keepalive: options?.keepalive,
  });
}

export function beaconReadingDeltas(deltas: ReadingDelta[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return false;
  }
  if (deltas.length === 0) return true;
  try {
    const blob = new Blob([JSON.stringify({ deltas })], {
      type: "application/json",
    });
    return navigator.sendBeacon("/api/reading-stats", blob);
  } catch {
    return false;
  }
}
