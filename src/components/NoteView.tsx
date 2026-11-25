import { useEffect, useState, type MouseEvent } from "react";
import { BookOpen, Clock, FileWarning } from "lucide-react";
import type { NoteResponse, ParsedObsidianNote } from "../types";

interface NoteViewProps {
  note: NoteResponse | null;
  parsed: ParsedObsidianNote | null;
  loading: boolean;
  error: string | null;
  prevNote: { key: string; name: string } | null;
  nextNote: { key: string; name: string } | null;
  onNavigateNote: (key: string, headingId?: string) => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getFileDisplayName(key: string): string {
  const filename = key.split("/").pop() || key;
  return filename.replace(/\.md$/i, "");
}

export function NoteView({
  note,
  parsed,
  loading,
  error,
  prevNote,
  nextNote,
  onNavigateNote,
}: NoteViewProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxSrc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxSrc]);

  const handleContentClick = async (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // 1. Copy code button
    const copyBtn = target.closest<HTMLButtonElement>("[data-copy-code]");
    if (copyBtn) {
      const codeEl = copyBtn.closest(".code-block")?.querySelector("code");
      if (codeEl && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(codeEl.textContent || "");
          const old = copyBtn.textContent;
          copyBtn.textContent = "已复制";
          setTimeout(() => {
            copyBtn.textContent = old || "复制";
          }, 1500);
        } catch {
          // Clipboard permission denied
        }
      }
      return;
    }

    // 2. Internal Obsidian wikilink navigation
    const wikiLink = target.closest<HTMLAnchorElement>("a[data-note-key]");
    if (wikiLink) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const targetKey = wikiLink.dataset.noteKey;
      const targetHeading = wikiLink.dataset.noteHeading;
      if (targetKey) {
        onNavigateNote(targetKey, targetHeading);
      }
      return;
    }

    // 3. Image click-to-zoom lightbox
    const imgEl = target.closest<HTMLImageElement>("img[data-lightbox-src]");
    if (imgEl && imgEl.dataset.lightboxSrc) {
      setLightboxSrc(imgEl.dataset.lightboxSrc);
    }
  };

  if (loading && !note) {
    return (
      <div className="empty-state">
        <p>正在从 Cloudflare R2 读取笔记...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <FileWarning size={36} color="var(--danger)" />
        <h2>笔记加载失败</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!note || !parsed) {
    return (
      <div className="empty-state">
        <BookOpen size={40} color="var(--text-muted)" />
        <h2>欢迎使用你的 R2 知识库</h2>
        <p>从左侧目录树选择一篇笔记开始阅读。将新笔记同步到 R2 存储桶后，点击右上角刷新即可实时查阅。</p>
      </div>
    );
  }

  const pathParts = note.key.split("/");
  const folderParts = pathParts.slice(0, -1);
  const displayTitle = parsed.frontmatter.title || getFileDisplayName(note.key);
  const allTags = Array.from(new Set([...parsed.frontmatter.tags, ...parsed.inlineTags]));
  const hasFrontmatterCard =
    allTags.length > 0 ||
    parsed.frontmatter.aliases.length > 0 ||
    parsed.frontmatter.properties.length > 0;

  return (
    <article className="note-container">
      {folderParts.length > 0 && (
        <div className="breadcrumb" aria-label="笔记路径">
          {folderParts.map((folder, idx) => (
            <span key={`${folder}-${idx}`}>
              {idx > 0 && <span className="breadcrumb-sep"> / </span>}
              {folder}
            </span>
          ))}
        </div>
      )}

      <header className="note-header">
        <h1 className="note-title">{displayTitle}</h1>
        <div className="note-meta-row">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Clock size={13} />
            更新于 {formatDate(note.uploaded)}
          </span>
        </div>

        {hasFrontmatterCard && (
          <div className="frontmatter-card">
            {allTags.length > 0 && (
              <div className="frontmatter-tags">
                {allTags.map((tag) => (
                  <span key={tag} className="obs-tag">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {(parsed.frontmatter.aliases.length > 0 || parsed.frontmatter.properties.length > 0) && (
              <div className={`frontmatter-props ${allTags.length === 0 ? "no-top" : ""}`}>
                {parsed.frontmatter.aliases.length > 0 && (
                  <div className="prop-item">
                    <span className="prop-key">别名:</span>
                    <span className="prop-val">{parsed.frontmatter.aliases.join(", ")}</span>
                  </div>
                )}
                {parsed.frontmatter.properties.map((prop) => (
                  <div key={prop.key} className="prop-item">
                    <span className="prop-key">{prop.key}:</span>
                    <span className="prop-val" title={prop.value}>
                      {prop.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <div
        className="markdown-body"
        onClick={handleContentClick}
        dangerouslySetInnerHTML={{ __html: parsed.html }}
      />

      {(prevNote || nextNote) && (
        <nav className="note-pager" aria-label="上下篇导航">
          {prevNote ? (
            <button
              type="button"
              className="pager-btn"
              onClick={() => onNavigateNote(prevNote.key)}
            >
              <span className="pager-dir">← 上一篇</span>
              <span className="pager-name">{prevNote.name}</span>
            </button>
          ) : (
            <div />
          )}

          {nextNote ? (
            <button
              type="button"
              className="pager-btn is-next"
              onClick={() => onNavigateNote(nextNote.key)}
            >
              <span className="pager-dir">下一篇 →</span>
              <span className="pager-name">{nextNote.name}</span>
            </button>
          ) : (
            <div />
          )}
        </nav>
      )}

      {lightboxSrc && (
        <div
          className="lightbox"
          role="dialog"
          aria-label="图片预览"
          onClick={() => setLightboxSrc(null)}
        >
          <img src={lightboxSrc} alt="放大预览" />
        </div>
      )}
    </article>
  );
}
