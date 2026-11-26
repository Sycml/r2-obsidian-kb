export type AuthMode = "password" | "cloudflare-access" | "none";

export interface AuthStatus {
  authenticated: boolean;
  authMode: AuthMode;
  siteTitle: string;
  misconfigured?: boolean;
  message?: string;
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

export interface NoteResponse {
  key: string;
  content: string;
  size: number;
  etag: string;
  uploaded: string;
}

export interface TocItem {
  id: string;
  text: string;
  depth: number;
}

export interface FrontmatterData {
  title?: string;
  tags: string[];
  aliases: string[];
  properties: Array<{ key: string; value: string }>;
}

export interface ParsedObsidianNote {
  frontmatter: FrontmatterData;
  html: string;
  toc: TocItem[];
  inlineTags: string[];
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

export type ReadingSyncStatus = "synced" | "syncing" | "local";

export interface UserPreferencesData {
  version: 1;
  updatedAt: string | null;
  accent: string;
}


