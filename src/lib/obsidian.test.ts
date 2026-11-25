import { describe, expect, it } from "vitest";
import { extractFrontmatter, renderObsidianNote } from "./obsidian";
import type { VaultFileEntry } from "../types";

const mockFiles: VaultFileEntry[] = [
  {
    key: "欢迎使用.md",
    name: "欢迎使用.md",
    basename: "欢迎使用",
    ext: "md",
    size: 512,
    etag: "1",
    uploaded: "2026-11-25T00:00:00Z",
    isNote: true,
  },
  {
    key: "技术/Cloudflare R2.md",
    name: "Cloudflare R2.md",
    basename: "Cloudflare R2",
    ext: "md",
    size: 1024,
    etag: "2",
    uploaded: "2026-11-25T00:00:00Z",
    isNote: true,
  },
  {
    key: "附件/architecture.svg",
    name: "architecture.svg",
    basename: "architecture",
    ext: "svg",
    size: 2048,
    etag: "3",
    uploaded: "2026-11-25T00:00:00Z",
    isNote: false,
  },
];

describe("Obsidian Markdown pipeline", () => {
  it("extracts YAML frontmatter metadata and strips it from body", () => {
    const md = `---
title: 我的测试笔记
tags:
  - obsidian
  - "#cloudflare"
aliases: [测试, Demo]
updated: 2026-11-25
---

正文内容`;

    const { frontmatter, body } = extractFrontmatter(md);
    expect(frontmatter.title).toBe("我的测试笔记");
    expect(frontmatter.tags).toEqual(["obsidian", "cloudflare"]);
    expect(frontmatter.aliases).toEqual(["测试", "Demo"]);
    expect(frontmatter.properties).toEqual([{ key: "updated", value: "2026-11-25" }]);
    expect(body.trim()).toBe("正文内容");
  });

  it("resolves Obsidian wikilinks with shortest path, aliases, headings, and unresolved states", () => {
    const md = [
      "查看 [[Cloudflare R2]] 与 [[Cloudflare R2#部署步骤|快速部署]]",
      "以及不存在的 [[尚待补充]]",
    ].join("\n\n");

    const parsed = renderObsidianNote(md, "欢迎使用.md", mockFiles);
    expect(parsed.html).toContain('data-note-key="技术/Cloudflare R2.md"');
    expect(parsed.html).toContain('data-note-heading="部署步骤"');
    expect(parsed.html).toContain(">快速部署</a>");
    expect(parsed.html).toContain('class="obs-wikilink is-unresolved"');
  });

  it("resolves Obsidian image embeds with width constraints and standard relative images", () => {
    const md = `![[architecture.svg|480]]\n\n![架构图](附件/architecture.svg)`;
    const parsed = renderObsidianNote(md, "欢迎使用.md", mockFiles);

    expect(parsed.html).toContain('/api/asset?key=%E9%99%84%E4%BB%B6%2Farchitecture.svg');
    expect(parsed.html).toContain("max-width:480px");
  });

  it("renders standard and foldable Obsidian callouts", () => {
    const md = `> [!tip]+ 实用技巧
> 同步到 R2 后无需重新构建

> [!warning]- 注意事项
> 记得设置 ACCESS_PASSWORD`;

    const parsed = renderObsidianNote(md, "欢迎使用.md", mockFiles);
    expect(parsed.html).toContain('class="callout callout-tip"');
    expect(parsed.html).toContain("<details");
    expect(parsed.html).toContain("open");
    expect(parsed.html).toContain("实用技巧");
    expect(parsed.html).toContain('class="callout callout-warning"');
    expect(parsed.html).toContain("注意事项");
  });

  it("does not corrupt wikilinks or highlights inside code blocks", () => {
    const md = "行内 `[[不该解析]]` 与 `==不高亮==`\n\n```md\n[[代码块内双链]]\n==代码块内高亮==\n```";
    const parsed = renderObsidianNote(md, "欢迎使用.md", mockFiles);

    expect(parsed.html).not.toContain("obs-wikilink");
    expect(parsed.html).not.toContain("obs-mark");
    expect(parsed.html).toContain("[[代码块内双链]]");
  });

  it("generates Chinese-friendly unique heading anchors for TOC", () => {
    const md = `# 概览\n## 安装步骤\n## 安装步骤\n### 细节说明`;
    const parsed = renderObsidianNote(md, "欢迎使用.md", mockFiles);

    expect(parsed.toc).toEqual([
      { id: "概览", text: "概览", depth: 1 },
      { id: "安装步骤", text: "安装步骤", depth: 2 },
      { id: "安装步骤-1", text: "安装步骤", depth: 2 },
      { id: "细节说明", text: "细节说明", depth: 3 },
    ]);
  });

  it("sanitizes malicious HTML/XSS payloads", () => {
    const md = `正常内容 <script>alert(1)</script> <img src=x onerror="alert(2)"> <iframe src="https://evil.example"></iframe>`;
    const parsed = renderObsidianNote(md, "欢迎使用.md", mockFiles);

    expect(parsed.html).not.toContain("<script");
    expect(parsed.html).not.toContain("onerror");
    expect(parsed.html).not.toContain("https://evil.example");
  });
});
