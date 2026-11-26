export type AuthMode = "password" | "cloudflare-access" | "none";

export interface Env {
  NOTES_BUCKET: R2Bucket;
  ASSETS?: Fetcher;
  AUTH_MODE?: string;
  VAULT_PREFIX?: string;
  SITE_TITLE?: string;
  SESSION_TTL_HOURS?: string;
  ACCESS_PASSWORD?: string;
  SESSION_SECRET?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

export interface VaultFileEntry {
  key: string;
  name: string;
  basename: string;
  ext: string;
  size: number;
  etag: string;
  uploaded: string;
  isNote: boolean;
}

export interface TreeNode {
  type: "folder" | "file";
  name: string;
  path: string;
  children?: TreeNode[];
  size?: number;
  uploaded?: string;
}

export interface VaultTreeResponse {
  siteTitle: string;
  noteCount: number;
  assetCount: number;
  tree: TreeNode[];
  files: VaultFileEntry[];
  generatedAt: string;
}

export interface DailyReadingRecord {
  seconds: number;
  notes?: Record<string, number>;
}

export interface ReadingStatsData {
  version: 1;
  updatedAt: string;
  days: Record<string, DailyReadingRecord>;
}

export interface ReadingDelta {
  date: string;
  seconds: number;
  noteKey?: string;
}

export interface UserPreferencesData {
  version: 1;
  updatedAt: string | null;
  accent: string;
}


