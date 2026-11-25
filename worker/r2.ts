import type { TreeNode, VaultFileEntry } from "./types";

const IGNORED_NAMES = new Set([".obsidian", ".trash", ".git", ".DS_Store", "Thumbs.db"]);

const EXTENSION_MIME: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  json: "application/json; charset=utf-8",
};

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

export function normalizeVaultPrefix(prefix?: string): string {
  const trimmed = (prefix || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "";
}

export function isIgnoredRelativePath(relativeKey: string): boolean {
  if (!relativeKey || relativeKey.endsWith("/")) return true;
  const segments = relativeKey.split("/");
  for (const seg of segments) {
    if (!seg || seg.startsWith(".") || IGNORED_NAMES.has(seg)) {
      return true;
    }
  }
  return false;
}

/**
 * Validates a user-supplied relative key and prevents path traversal or hidden file access.
 */
export function normalizeSafeRelativeKey(rawKey: string | undefined): string | null {
  if (!rawKey) return null;
  if (rawKey.includes("\0") || rawKey.includes("\\")) return null;
  if (rawKey.startsWith("/")) return null;

  const segments = rawKey.split("/");
  for (const seg of segments) {
    if (!seg || seg === "." || seg === "..") {
      return null;
    }
  }

  const normalized = segments.join("/");
  if (isIgnoredRelativePath(normalized)) {
    return null;
  }

  return normalized;
}

export function resolveR2Key(relativeKey: string, vaultPrefix?: string): string {
  return `${normalizeVaultPrefix(vaultPrefix)}${relativeKey}`;
}

export function parseFileMeta(relativeKey: string, obj: Pick<R2Object, "size" | "etag" | "uploaded">): VaultFileEntry {
  const lastSlash = relativeKey.lastIndexOf("/");
  const name = lastSlash >= 0 ? relativeKey.slice(lastSlash + 1) : relativeKey;
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot > 0 ? name.slice(lastDot + 1).toLowerCase() : "";
  const basename = lastDot > 0 ? name.slice(0, lastDot) : name;

  return {
    key: relativeKey,
    name,
    basename,
    ext,
    size: obj.size,
    etag: obj.etag,
    uploaded: obj.uploaded instanceof Date ? obj.uploaded.toISOString() : String(obj.uploaded),
    isNote: ext === "md",
  };
}

function sortTreeNodes(nodes: TreeNode[]): TreeNode[] {
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return collator.compare(a.name, b.name);
  });
  for (const node of nodes) {
    if (node.children) {
      sortTreeNodes(node.children);
    }
  }
  return nodes;
}

export function buildTreeFromEntries(entries: VaultFileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  const ensureFolder = (folderPath: string): TreeNode => {
    const existing = folderMap.get(folderPath);
    if (existing) return existing;

    const lastSlash = folderPath.lastIndexOf("/");
    const name = lastSlash >= 0 ? folderPath.slice(lastSlash + 1) : folderPath;
    const node: TreeNode = {
      type: "folder",
      name,
      path: folderPath,
      children: [],
    };
    folderMap.set(folderPath, node);

    if (lastSlash >= 0) {
      const parent = ensureFolder(folderPath.slice(0, lastSlash));
      parent.children!.push(node);
    } else {
      root.push(node);
    }

    return node;
  };

  for (const entry of entries) {
    if (!entry.isNote) continue;
    const lastSlash = entry.key.lastIndexOf("/");
    const fileNode: TreeNode = {
      type: "file",
      name: entry.basename,
      path: entry.key,
      size: entry.size,
      uploaded: entry.uploaded,
    };

    if (lastSlash >= 0) {
      const parent = ensureFolder(entry.key.slice(0, lastSlash));
      parent.children!.push(fileNode);
    } else {
      root.push(fileNode);
    }
  }

  return sortTreeNodes(root);
}

export async function listVaultFromR2(
  bucket: R2Bucket,
  vaultPrefix?: string
): Promise<{ tree: TreeNode[]; files: VaultFileEntry[]; noteCount: number; assetCount: number }> {
  const prefix = normalizeVaultPrefix(vaultPrefix);
  const files: VaultFileEntry[] = [];
  let cursor: string | undefined;

  do {
    const listed = await bucket.list({
      prefix: prefix || undefined,
      cursor,
      limit: 1000,
    });

    for (const obj of listed.objects) {
      const relativeKey = prefix ? obj.key.slice(prefix.length) : obj.key;
      if (isIgnoredRelativePath(relativeKey)) continue;
      files.push(parseFileMeta(relativeKey, obj));
    }

    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  files.sort((a, b) => collator.compare(a.key, b.key));
  const tree = buildTreeFromEntries(files);
  const noteCount = files.filter((f) => f.isNote).length;
  const assetCount = files.length - noteCount;

  return { tree, files, noteCount, assetCount };
}

export function inferContentType(relativeKey: string, r2ContentType?: string): string {
  if (r2ContentType && r2ContentType !== "application/octet-stream") {
    return r2ContentType;
  }
  const lastDot = relativeKey.lastIndexOf(".");
  const ext = lastDot > 0 ? relativeKey.slice(lastDot + 1).toLowerCase() : "";
  return EXTENSION_MIME[ext] || "application/octet-stream";
}
