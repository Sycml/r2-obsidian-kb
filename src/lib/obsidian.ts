import { Marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import yaml from "js-yaml";
import type {
  FrontmatterData,
  ParsedObsidianNote,
  TocItem,
  VaultFileEntry,
} from "../types";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm"]);

const CALLOUT_ALIASES: Record<string, { kind: string; label: string }> = {
  note: { kind: "note", label: "Note" },
  abstract: { kind: "abstract", label: "Abstract" },
  summary: { kind: "abstract", label: "Summary" },
  tldr: { kind: "abstract", label: "TL;DR" },
  info: { kind: "info", label: "Info" },
  todo: { kind: "todo", label: "Todo" },
  tip: { kind: "tip", label: "Tip" },
  hint: { kind: "tip", label: "Hint" },
  important: { kind: "tip", label: "Important" },
  success: { kind: "success", label: "Success" },
  check: { kind: "success", label: "Check" },
  done: { kind: "success", label: "Done" },
  question: { kind: "question", label: "Question" },
  help: { kind: "question", label: "Help" },
  faq: { kind: "question", label: "FAQ" },
  warning: { kind: "warning", label: "Warning" },
  caution: { kind: "warning", label: "Caution" },
  attention: { kind: "warning", label: "Attention" },
  failure: { kind: "danger", label: "Failure" },
  fail: { kind: "danger", label: "Fail" },
  missing: { kind: "danger", label: "Missing" },
  danger: { kind: "danger", label: "Danger" },
  error: { kind: "danger", label: "Error" },
  bug: { kind: "danger", label: "Bug" },
  example: { kind: "example", label: "Example" },
  quote: { kind: "quote", label: "Quote" },
  cite: { kind: "quote", label: "Cite" },
};

let purifyHookInstalled = false;

function ensurePurifyHooks() {
  if (purifyHookInstalled) return;
  purifyHookInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (node.tagName === "IFRAME" && data.attrName === "src") {
      if (!data.attrValue.startsWith("/api/asset?")) {
        data.keepAttr = false;
      }
    }
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text);
}

export function slugifyHeading(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "section";
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function formatPropertyValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (Array.isArray(value)) {
    return value.map((v) => formatPropertyValue(v)).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value ?? "");
}

export function extractFrontmatter(markdown: string): {
  frontmatter: FrontmatterData;
  body: string;
} {
  const empty: FrontmatterData = { tags: [], aliases: [], properties: [] };
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return { frontmatter: empty, body: markdown };
  }

  const rawYaml = match[1];
  const body = markdown.slice(match[0].length);

  try {
    const parsed = yaml.load(rawYaml);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { frontmatter: empty, body };
    }

    const record = parsed as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : undefined;
    const rawTags = [
      ...normalizeStringArray(record.tags),
      ...normalizeStringArray(record.tag),
    ].map((t) => t.replace(/^#/, ""));
    const tags = Array.from(new Set(rawTags));
    const aliases = Array.from(
      new Set([
        ...normalizeStringArray(record.aliases),
        ...normalizeStringArray(record.alias),
      ])
    );

    const properties: Array<{ key: string; value: string }> = [];
    for (const [k, v] of Object.entries(record)) {
      if (v === undefined || v === null || v === "") continue;
      const lower = k.toLowerCase();
      if (lower === "title" || lower === "tags" || lower === "tag" || lower === "aliases" || lower === "alias") {
        continue;
      }
      properties.push({ key: k, value: formatPropertyValue(v) });
    }

    return {
      frontmatter: { title, tags, aliases, properties },
      body,
    };
  } catch {
    // Gracefully fall back if frontmatter YAML has syntax issues
    return { frontmatter: empty, body };
  }
}

export interface VaultIndex {
  byExactKey: Map<string, VaultFileEntry>;
  byKeyWithoutExt: Map<string, VaultFileEntry>;
  byName: Map<string, VaultFileEntry[]>;
  byBasename: Map<string, VaultFileEntry[]>;
}

export function createVaultIndex(files: VaultFileEntry[]): VaultIndex {
  const byExactKey = new Map<string, VaultFileEntry>();
  const byKeyWithoutExt = new Map<string, VaultFileEntry>();
  const byName = new Map<string, VaultFileEntry[]>();
  const byBasename = new Map<string, VaultFileEntry[]>();

  for (const file of files) {
    const lowerKey = file.key.toLowerCase();
    byExactKey.set(lowerKey, file);

    if (file.isNote) {
      const noExt = lowerKey.replace(/\.md$/i, "");
      byKeyWithoutExt.set(noExt, file);
    }

    const lowerName = file.name.toLowerCase();
    const nameList = byName.get(lowerName) || [];
    nameList.push(file);
    byName.set(lowerName, nameList);

    const lowerBase = file.basename.toLowerCase();
    const baseList = byBasename.get(lowerBase) || [];
    baseList.push(file);
    byBasename.set(lowerBase, baseList);
  }

  return { byExactKey, byKeyWithoutExt, byName, byBasename };
}

function getDirname(key: string): string {
  const idx = key.lastIndexOf("/");
  return idx >= 0 ? key.slice(0, idx) : "";
}

function resolveRelativePath(baseDir: string, relativePath: string): string {
  const parts = baseDir ? baseDir.split("/") : [];
  for (const segment of relativePath.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

function pickClosestEntry(candidates: VaultFileEntry[], currentNoteKey: string): VaultFileEntry {
  if (candidates.length === 1) return candidates[0];
  const currentSegments = getDirname(currentNoteKey).split("/").filter(Boolean);

  let best = candidates[0];
  let bestScore = -1;

  for (const candidate of candidates) {
    const candSegments = getDirname(candidate.key).split("/").filter(Boolean);
    let shared = 0;
    while (
      shared < currentSegments.length &&
      shared < candSegments.length &&
      currentSegments[shared].toLowerCase() === candSegments[shared].toLowerCase()
    ) {
      shared++;
    }
    const score = shared * 100 - candSegments.length;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveVaultTarget(
  rawTarget: string,
  currentNoteKey: string,
  index: VaultIndex,
  preferNote: boolean
): VaultFileEntry | null {
  let target = safeDecodeURIComponent(rawTarget.trim());
  if (!target) return null;

  target = target.replace(/\\/g, "/");
  const isRootAnchored = target.startsWith("/");
  target = target.replace(/^\/+/, "");
  if (!target) return null;

  const currentDir = getDirname(currentNoteKey);

  // 1. Relative path resolution (./ or ../) or relative to current note's directory
  if (!isRootAnchored && (target.startsWith("./") || target.startsWith("../") || currentDir)) {
    const rel = resolveRelativePath(currentDir, target).toLowerCase();
    const exactRel = index.byExactKey.get(rel) || index.byKeyWithoutExt.get(rel);
    if (exactRel) return exactRel;
  }

  const lower = target.toLowerCase();

  // 2. Exact full path match
  const exact = index.byExactKey.get(lower);
  if (exact) return exact;

  // 3. Path without .md extension
  const exactNoExt = index.byKeyWithoutExt.get(lower.replace(/\.md$/i, ""));
  if (exactNoExt) return exactNoExt;

  // 4. Shortest-path match by filename (with extension)
  const byNameMatches = index.byName.get(lower);
  if (byNameMatches && byNameMatches.length > 0) {
    return pickClosestEntry(byNameMatches, currentNoteKey);
  }

  // 5. Shortest-path match by basename (without extension)
  const byBaseMatches = index.byBasename.get(lower.replace(/\.md$/i, ""));
  if (byBaseMatches && byBaseMatches.length > 0) {
    const filtered = preferNote
      ? byBaseMatches.filter((f) => f.isNote)
      : byBaseMatches;
    const pool = filtered.length > 0 ? filtered : byBaseMatches;
    return pickClosestEntry(pool, currentNoteKey);
  }

  return null;
}

function parseEmbedWidth(aliasPart?: string): { alt?: string; width?: number } {
  if (!aliasPart) return {};
  const trimmed = aliasPart.trim();
  const sizeMatch = trimmed.match(/^(\d+)(?:x\d+)?$/);
  if (sizeMatch) {
    return { width: Number.parseInt(sizeMatch[1], 10) };
  }
  return { alt: trimmed };
}

function transformTextSegment(
  segment: string,
  currentNoteKey: string,
  index: VaultIndex,
  inlineTags: Set<string>
): string {
  // 1. Obsidian embeds: ![[target|aliasOrWidth]]
  let out = segment.replace(/!\[\[([^\]]+)\]\]/g, (_full, inner: string) => {
    const [targetWithHeading, aliasPart] = inner.split("|");
    const [rawTarget, rawHeading] = targetWithHeading.split("#");
    const resolved = resolveVaultTarget(rawTarget, currentNoteKey, index, false);

    if (!resolved) {
      return `<span class="obs-embed-missing">未找到附件：${escapeHtml(rawTarget.trim())}</span>`;
    }

    const assetUrl = `/api/asset?key=${encodeURIComponent(resolved.key)}`;

    if (IMAGE_EXTENSIONS.has(resolved.ext)) {
      const { alt, width } = parseEmbedWidth(aliasPart);
      const safeAlt = escapeAttr(alt || resolved.basename);
      const widthAttr = width ? ` style="max-width:${Math.min(width, 1600)}px"` : "";
      return `<figure class="obs-embed obs-embed-image"><img src="${escapeAttr(assetUrl)}" alt="${safeAlt}" loading="lazy" class="obs-img" data-lightbox-src="${escapeAttr(assetUrl)}"${widthAttr} /></figure>`;
    }

    if (resolved.ext === "pdf") {
      return `<div class="obs-embed obs-embed-pdf"><div class="obs-embed-pdf-bar"><span>PDF：${escapeHtml(resolved.name)}</span><a href="${escapeAttr(assetUrl)}" target="_blank" rel="noopener noreferrer">新标签页打开</a></div><iframe src="${escapeAttr(assetUrl)}" title="${escapeAttr(resolved.name)}" loading="lazy"></iframe></div>`;
    }

    if (AUDIO_EXTENSIONS.has(resolved.ext)) {
      return `<div class="obs-embed obs-embed-media"><audio controls src="${escapeAttr(assetUrl)}"></audio></div>`;
    }

    if (VIDEO_EXTENSIONS.has(resolved.ext)) {
      return `<div class="obs-embed obs-embed-media"><video controls src="${escapeAttr(assetUrl)}"></video></div>`;
    }

    if (resolved.isNote) {
      const display = aliasPart?.trim() || resolved.basename;
      const headingSlug = rawHeading ? slugifyHeading(rawHeading) : "";
      const href = `?note=${encodeURIComponent(resolved.key)}${headingSlug ? `#${encodeURIComponent(headingSlug)}` : ""}`;
      return `<div class="obs-embed obs-embed-note"><span class="obs-embed-badge">嵌入笔记</span><a href="${escapeAttr(href)}" class="obs-wikilink" data-note-key="${escapeAttr(resolved.key)}"${headingSlug ? ` data-note-heading="${escapeAttr(headingSlug)}"` : ""}>${escapeHtml(display)}</a></div>`;
    }

    return `<a href="${escapeAttr(assetUrl)}" target="_blank" rel="noopener noreferrer" class="obs-wikilink">${escapeHtml(aliasPart?.trim() || resolved.name)}</a>`;
  });

  // 2. Obsidian wikilinks: [[target#heading|alias]]
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_full, inner: string) => {
    const [targetWithHeading, aliasPart] = inner.split("|");
    const hashIdx = targetWithHeading.indexOf("#");
    const rawTarget = (hashIdx >= 0 ? targetWithHeading.slice(0, hashIdx) : targetWithHeading).trim();
    const rawHeading = hashIdx >= 0 ? targetWithHeading.slice(hashIdx + 1).trim() : "";

    // Same-note heading link: [[#Section]]
    if (!rawTarget && rawHeading) {
      const slug = slugifyHeading(rawHeading);
      const display = aliasPart?.trim() || rawHeading;
      return `<a href="#${escapeAttr(slug)}" class="obs-wikilink" data-note-key="${escapeAttr(currentNoteKey)}" data-note-heading="${escapeAttr(slug)}">${escapeHtml(display)}</a>`;
    }

    const resolved = resolveVaultTarget(rawTarget, currentNoteKey, index, true);
    const display =
      aliasPart?.trim() ||
      (rawHeading ? `${rawTarget} › ${rawHeading}` : rawTarget.split("/").pop() || rawTarget);

    if (!resolved) {
      return `<span class="obs-wikilink is-unresolved" title="未找到笔记：${escapeAttr(rawTarget)}">${escapeHtml(display)}</span>`;
    }

    if (resolved.isNote) {
      const headingSlug = rawHeading ? slugifyHeading(rawHeading) : "";
      const href = `?note=${encodeURIComponent(resolved.key)}${headingSlug ? `#${encodeURIComponent(headingSlug)}` : ""}`;
      return `<a href="${escapeAttr(href)}" class="obs-wikilink" data-note-key="${escapeAttr(resolved.key)}"${headingSlug ? ` data-note-heading="${escapeAttr(headingSlug)}"` : ""}>${escapeHtml(display)}</a>`;
    }

    const assetUrl = `/api/asset?key=${encodeURIComponent(resolved.key)}`;
    return `<a href="${escapeAttr(assetUrl)}" target="_blank" rel="noopener noreferrer" class="obs-wikilink">${escapeHtml(display)}</a>`;
  });

  // 3. Obsidian highlights: ==highlighted text==
  out = out.replace(/==([^=\n]+)==/g, (_full, text: string) => `<mark class="obs-mark">${text}</mark>`);

  // 4. Inline Obsidian tags: #tag or #parent/child (not headings, not hex colors, not URL fragments)
  out = out.replace(
    /(<[^>]+>|\]\([^)\n]*\))|(^|[\s(（【\[])#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu,
    (full, ignored: string | undefined, prefix: string | undefined, tag: string | undefined) => {
      if (ignored || !tag) {
        return full;
      }
      // Skip pure numeric or hex color-like tokens (#123, #fff, #1a2b3c)
      if (/^[0-9]+$/.test(tag) || /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(tag)) {
        return full;
      }
      inlineTags.add(tag);
      return `${prefix || ""}<span class="obs-tag">#${escapeHtml(tag)}</span>`;
    }
  );

  return out;
}

/**
 * Applies Obsidian transformations while strictly skipping fenced code blocks and inline code spans.
 */
function preprocessObsidianMarkdown(
  markdown: string,
  currentNoteKey: string,
  index: VaultIndex,
  inlineTags: Set<string>
): string {
  // Split out fenced code blocks first (``` or ~~~)
  const fenceRegex = /(^[ \t]*(?:```|~~~)[^\n]*\n[\s\S]*?^[ \t]*(?:```|~~~)[ \t]*$)/gm;
  const parts = markdown.split(fenceRegex);

  return parts
    .map((part, idx) => {
      // Odd indices are matched fenced code blocks
      if (idx % 2 === 1) return part;

      // Split out inline code spans (`...`)
      const inlineCodeRegex = /(`+[^`\n]+`+)/g;
      const subParts = part.split(inlineCodeRegex);
      return subParts
        .map((sub, subIdx) => {
          if (subIdx % 2 === 1) return sub;
          return transformTextSegment(sub, currentNoteKey, index, inlineTags);
        })
        .join("");
    })
    .join("");
}

export function renderObsidianNote(
  rawMarkdown: string,
  currentNoteKey: string,
  files: VaultFileEntry[]
): ParsedObsidianNote {
  ensurePurifyHooks();

  const { frontmatter, body } = extractFrontmatter(rawMarkdown);
  const index = createVaultIndex(files);
  const inlineTags = new Set<string>();
  const toc: TocItem[] = [];
  const usedHeadingIds = new Map<string, number>();

  const preprocessed = preprocessObsidianMarkdown(body, currentNoteKey, index, inlineTags);

  const marked = new Marked({
    gfm: true,
    breaks: true,
  });

  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const innerHtml = this.parser.parseInline(tokens);
        const plainText = innerHtml.replace(/<[^>]+>/g, "").trim();
        const baseSlug = slugifyHeading(plainText);
        const count = usedHeadingIds.get(baseSlug) || 0;
        usedHeadingIds.set(baseSlug, count + 1);
        const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;

        if (depth >= 1 && depth <= 4 && plainText) {
          toc.push({ id, text: plainText, depth });
        }

        return `<h${depth} id="${escapeAttr(id)}" class="note-heading">${innerHtml}<a class="heading-anchor" href="#${escapeAttr(id)}" aria-label="锚点链接">#</a></h${depth}>\n`;
      },

      code({ text, lang }) {
        const normalizedLang = (lang || "").trim().split(/\s+/)[0].toLowerCase();
        let highlighted = "";
        let displayLang = normalizedLang || "text";

        if (normalizedLang && hljs.getLanguage(normalizedLang)) {
          highlighted = hljs.highlight(text, { language: normalizedLang }).value;
        } else {
          highlighted = escapeHtml(text);
        }

        return `<div class="code-block"><div class="code-block-header"><span class="code-lang">${escapeHtml(displayLang)}</span><button type="button" class="code-copy-btn" data-copy-code="true">复制</button></div><pre><code class="hljs language-${escapeAttr(displayLang)}">${highlighted}</code></pre></div>\n`;
      },

      image({ href, title, text }) {
        let finalSrc = href || "";
        const isExternal =
          /^https?:\/\//i.test(finalSrc) ||
          finalSrc.startsWith("data:") ||
          finalSrc.startsWith("/api/asset?");

        if (!isExternal && finalSrc) {
          const resolved = resolveVaultTarget(finalSrc, currentNoteKey, index, false);
          if (resolved) {
            finalSrc = `/api/asset?key=${encodeURIComponent(resolved.key)}`;
          }
        }

        const safeSrc = escapeAttr(finalSrc);
        const safeAlt = escapeAttr(text || "");
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
        return `<img src="${safeSrc}" alt="${safeAlt}"${titleAttr} loading="lazy" class="obs-img" data-lightbox-src="${safeSrc}" />`;
      },

      link({ href, title, tokens }) {
        const innerHtml = this.parser.parseInline(tokens);
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
        const trimmedHref = (href || "").trim();

        if (!trimmedHref) {
          return `<a${titleAttr}>${innerHtml}</a>`;
        }

        // External URLs / explicit URI schemes / protocol-relative URLs
        if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmedHref) || trimmedHref.startsWith("//")) {
          const isWebExternal = /^https?:\/\//i.test(trimmedHref) || trimmedHref.startsWith("//");
          const extraAttrs = isWebExternal ? ' target="_blank" rel="noopener noreferrer"' : "";
          return `<a href="${escapeAttr(trimmedHref)}"${titleAttr}${extraAttrs}>${innerHtml}</a>`;
        }

        // Already-resolved internal app links
        if (trimmedHref.startsWith("/api/") || trimmedHref.startsWith("?")) {
          return `<a href="${escapeAttr(trimmedHref)}"${titleAttr}>${innerHtml}</a>`;
        }

        const hashIdx = trimmedHref.indexOf("#");
        const rawTarget = (hashIdx >= 0 ? trimmedHref.slice(0, hashIdx) : trimmedHref).trim();
        const rawHeading = hashIdx >= 0 ? trimmedHref.slice(hashIdx + 1).trim() : "";
        const decodedHeading = rawHeading ? safeDecodeURIComponent(rawHeading) : "";
        const headingSlug = decodedHeading ? slugifyHeading(decodedHeading) : "";

        // Same-note heading link: [text](#heading)
        if (!rawTarget && headingSlug) {
          return `<a href="#${escapeAttr(headingSlug)}" class="obs-wikilink" data-note-key="${escapeAttr(currentNoteKey)}" data-note-heading="${escapeAttr(headingSlug)}"${titleAttr}>${innerHtml}</a>`;
        }

        if (!rawTarget) {
          return `<a href="#"${titleAttr}>${innerHtml}</a>`;
        }

        const resolved = resolveVaultTarget(rawTarget, currentNoteKey, index, true);
        if (!resolved) {
          const decodedTarget = safeDecodeURIComponent(rawTarget);
          const fallbackTitle = title || `未找到笔记：${decodedTarget}`;
          return `<span class="obs-wikilink is-unresolved" title="${escapeAttr(fallbackTitle)}">${innerHtml}</span>`;
        }

        if (resolved.isNote) {
          const noteHref = `?note=${encodeURIComponent(resolved.key)}${headingSlug ? `#${encodeURIComponent(headingSlug)}` : ""}`;
          return `<a href="${escapeAttr(noteHref)}" class="obs-wikilink" data-note-key="${escapeAttr(resolved.key)}"${headingSlug ? ` data-note-heading="${escapeAttr(headingSlug)}"` : ""}${titleAttr}>${innerHtml}</a>`;
        }

        const assetUrl = `/api/asset?key=${encodeURIComponent(resolved.key)}`;
        return `<a href="${escapeAttr(assetUrl)}" target="_blank" rel="noopener noreferrer" class="obs-wikilink"${titleAttr}>${innerHtml}</a>`;
      },

      blockquote({ tokens }) {
        const innerHtml = this.parser.parse(tokens).trim();
        const calloutMatch = innerHtml.match(
          /^<p>\[!([a-zA-Z0-9_-]+)\]([+-])?(?:[ \t]*([^\n<]*))?(?:(?:<br\s*\/?>|\r?\n)([\s\S]*?))?<\/p>([\s\S]*)$/
        );

        if (!calloutMatch) {
          return `<blockquote>${innerHtml}</blockquote>\n`;
        }

        const rawType = calloutMatch[1].toLowerCase();
        const fold = calloutMatch[2] || "";
        const customTitle = (calloutMatch[3] || "").trim();
        const firstParaRest = (calloutMatch[4] || "").trim();
        const restHtml = (calloutMatch[5] || "").trim();

        const meta = CALLOUT_ALIASES[rawType] || {
          kind: "note",
          label: rawType.charAt(0).toUpperCase() + rawType.slice(1),
        };
        const titleText = customTitle || meta.label;
        const bodyHtml = `${firstParaRest ? `<p>${firstParaRest}</p>` : ""}${restHtml}`;

        if (fold === "+" || fold === "-") {
          const openAttr = fold === "+" ? " open" : "";
          return `<details class="callout callout-${meta.kind}" data-callout="${meta.kind}"${openAttr}><summary class="callout-title"><span class="callout-title-text">${escapeHtml(titleText)}</span></summary>${bodyHtml ? `<div class="callout-content">${bodyHtml}</div>` : ""}</details>\n`;
        }

        return `<div class="callout callout-${meta.kind}" data-callout="${meta.kind}"><div class="callout-title"><span class="callout-title-text">${escapeHtml(titleText)}</span></div>${bodyHtml ? `<div class="callout-content">${bodyHtml}</div>` : ""}</div>\n`;
      },
    },
  });

  const rawHtml = marked.parse(preprocessed) as string;

  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ADD_TAGS: ["details", "summary", "mark", "iframe", "figure", "figcaption", "audio", "video", "source"],
    ADD_ATTR: [
      "open",
      "data-callout",
      "data-note-key",
      "data-note-heading",
      "data-copy-code",
      "data-lightbox-src",
      "loading",
      "controls",
      "target",
      "rel",
      "aria-label",
      "style",
    ],
  });

  return {
    frontmatter,
    html: cleanHtml,
    toc,
    inlineTags: Array.from(inlineTags),
  };
}
