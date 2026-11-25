import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { TocItem } from "../types";

interface TocPanelProps {
  items: TocItem[];
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function TocPanel({ items, mobileOpen, onCloseMobile }: TocPanelProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id || "");

  useEffect(() => {
    setActiveId(items[0]?.id || "");
    if (items.length === 0) return;

    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-68px 0px -70% 0px",
        threshold: [0, 1],
      }
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  const jumpTo = (id: string) => {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
      if (window.history.replaceState) {
        const url = new URL(window.location.href);
        url.hash = encodeURIComponent(id);
        window.history.replaceState(null, "", url.toString());
      }
    }
    onCloseMobile();
  };

  const listMarkup = (
    <ul className="toc-list">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={`toc-link toc-depth-${item.depth} ${activeId === item.id ? "is-active" : ""}`}
            onClick={() => jumpTo(item.id)}
          >
            {item.text}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <aside className="toc-panel" aria-label="文章大纲">
        <div className="toc-heading">文章大纲</div>
        {listMarkup}
      </aside>

      {mobileOpen && (
        <div className="mobile-toc-sheet" role="dialog" aria-label="文章大纲">
          <div className="sheet-header">
            <span>文章大纲</span>
            <button
              type="button"
              className="icon-btn"
              onClick={onCloseMobile}
              aria-label="关闭大纲"
            >
              <X size={18} />
            </button>
          </div>
          <div className="sheet-body">{listMarkup}</div>
        </div>
      )}
    </>
  );
}
