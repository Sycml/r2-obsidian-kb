import { describe, expect, it } from "vitest";
import {
  buildTreeFromEntries,
  inferContentType,
  normalizeSafeRelativeKey,
  normalizeVaultPrefix,
  parseFileMeta,
} from "./r2";

describe("worker/r2 utilities", () => {
  it("normalizes vault prefixes cleanly", () => {
    expect(normalizeVaultPrefix("")).toBe("");
    expect(normalizeVaultPrefix("  ")).toBe("");
    expect(normalizeVaultPrefix("obsidian")).toBe("obsidian/");
    expect(normalizeVaultPrefix("/notes/vault/")).toBe("notes/vault/");
  });

  it("blocks path traversal and hidden Obsidian metadata paths", () => {
    expect(normalizeSafeRelativeKey("../secret.md")).toBeNull();
    expect(normalizeSafeRelativeKey("a/../../secret.md")).toBeNull();
    expect(normalizeSafeRelativeKey("/etc/passwd")).toBeNull();
    expect(normalizeSafeRelativeKey("a\\b.md")).toBeNull();
    expect(normalizeSafeRelativeKey(".obsidian/workspace.json")).toBeNull();
    expect(normalizeSafeRelativeKey(".r2-kb-data/reading-stats.json")).toBeNull();
    expect(normalizeSafeRelativeKey("notes/.trash/old.md")).toBeNull();
    expect(normalizeSafeRelativeKey("notes/hello\0.md")).toBeNull();
    expect(normalizeSafeRelativeKey("技术笔记/Cloudflare R2.md")).toBe("技术笔记/Cloudflare R2.md");
  });

  it("builds a sorted directory tree containing only Markdown notes while keeping folders first", () => {
    const now = new Date("2026-11-25T00:00:00Z");
    const entries = [
      parseFileMeta("欢迎.md", { size: 100, etag: "1", uploaded: now }),
      parseFileMeta("附件/diagram.png", { size: 2048, etag: "2", uploaded: now }),
      parseFileMeta("指南/02-同步.md", { size: 200, etag: "3", uploaded: now }),
      parseFileMeta("指南/01-入门.md", { size: 150, etag: "4", uploaded: now }),
    ];

    const tree = buildTreeFromEntries(entries);
    expect(tree).toHaveLength(2);
    expect(tree[0].type).toBe("folder");
    expect(tree[0].name).toBe("指南");
    expect(tree[0].children?.map((c) => c.name)).toEqual(["01-入门", "02-同步"]);
    expect(tree[1].type).toBe("file");
    expect(tree[1].name).toBe("欢迎");
  });

  it("infers accurate MIME types for common attachments", () => {
    expect(inferContentType("images/pic.png")).toBe("image/png");
    expect(inferContentType("docs/guide.pdf")).toBe("application/pdf");
    expect(inferContentType("vector/arch.svg")).toBe("image/svg+xml");
    expect(inferContentType("custom.png", "image/webp")).toBe("image/webp");
    expect(inferContentType("custom.png", "application/octet-stream")).toBe("image/png");
  });
});
