import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Folder, FolderOpen, Search, X } from "lucide-react";
import type { ReadingStatsData, TreeNode } from "../types";
import { MiniReadingHeatmap } from "./MiniReadingHeatmap";

interface SidebarProps {
  tree: TreeNode[];
  noteCount: number;
  activeNoteKey: string | null;
  desktopCollapsed: boolean;
  mobileOpen: boolean;
  readingStats: ReadingStatsData;
  isActivelyReading: boolean;
  onSelectNote: (key: string) => void;
  onCloseMobile: () => void;
  onOpenHeatmap: () => void;
}

function collectFolderPaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      paths.push(node.path);
      if (node.children) {
        paths.push(...collectFolderPaths(node.children));
      }
    }
  }
  return paths;
}

function getAncestorFolders(noteKey: string): string[] {
  const parts = noteKey.split("/");
  const ancestors: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join("/"));
  }
  return ancestors;
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes;
  const q = query.toLowerCase();
  const result: TreeNode[] = [];

  for (const node of nodes) {
    if (node.type === "file") {
      if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
        result.push(node);
      }
    } else if (node.children) {
      const matchedChildren = filterTree(node.children, query);
      if (matchedChildren.length > 0 || node.name.toLowerCase().includes(q)) {
        result.push({
          ...node,
          children: matchedChildren.length > 0 ? matchedChildren : node.children,
        });
      }
    }
  }
  return result;
}

export function Sidebar({
  tree,
  noteCount,
  activeNoteKey,
  desktopCollapsed,
  mobileOpen,
  readingStats,
  isActivelyReading,
  onSelectNote,
  onCloseMobile,
  onOpenHeatmap,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Automatically expand top-level folders on initial load
  useEffect(() => {
    setExpanded((prev) => {
      if (prev.size > 0) return prev;
      const initial = new Set<string>();
      for (const node of tree) {
        if (node.type === "folder") initial.add(node.path);
      }
      return initial;
    });
  }, [tree]);

  // Auto-expand ancestor folders when active note changes
  useEffect(() => {
    if (!activeNoteKey) return;
    const ancestors = getAncestorFolders(activeNoteKey);
    if (ancestors.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const folder of ancestors) {
        if (!next.has(folder)) {
          next.add(folder);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeNoteKey]);

  const trimmedQuery = query.trim();
  const displayedTree = useMemo(() => filterTree(tree, trimmedQuery), [tree, trimmedQuery]);
  const allFolders = useMemo(() => collectFolderPaths(tree), [tree]);

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNodes = (nodes: TreeNode[], depth: number) => (
    <ul className="tree-list">
      {nodes.map((node) => {
        const paddingLeft = 8 + depth * 15;
        if (node.type === "folder") {
          const isOpen = Boolean(trimmedQuery) || expanded.has(node.path);
          return (
            <li key={node.path}>
              <button
                type="button"
                className="tree-row is-folder"
                style={{ paddingLeft }}
                onClick={() => toggleFolder(node.path)}
              >
                <ChevronRight
                  size={14}
                  className={`tree-chevron ${isOpen ? "is-open" : ""}`}
                />
                {isOpen ? (
                  <FolderOpen size={15} className="tree-icon" />
                ) : (
                  <Folder size={15} className="tree-icon" />
                )}
                <span className="tree-label">{node.name}</span>
              </button>
              {isOpen && node.children && node.children.length > 0 && renderNodes(node.children, depth + 1)}
            </li>
          );
        }

        const isActive = activeNoteKey === node.path;
        return (
          <li key={node.path}>
            <button
              type="button"
              className={`tree-row ${isActive ? "is-active" : ""}`}
              style={{ paddingLeft: paddingLeft + 18 }}
              onClick={() => {
                onSelectNote(node.path);
                onCloseMobile();
              }}
              title={node.path}
            >
              <FileText size={14} className="tree-icon" />
              <span className="tree-label">{node.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside
      className={`sidebar ${desktopCollapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}
      aria-label="笔记目录导航"
    >
      <div className="sidebar-top">
        <div className="search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="快速筛选笔记名称..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setQuery("")}
              aria-label="清除筛选"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="sidebar-meta">
          <span>共 {noteCount} 篇笔记</span>
          {allFolders.length > 0 && (
            <div className="sidebar-meta-actions">
              <button
                type="button"
                className="tiny-btn"
                onClick={() => setExpanded(new Set(allFolders))}
              >
                展开
              </button>
              <button
                type="button"
                className="tiny-btn"
                onClick={() => setExpanded(new Set())}
              >
                折叠
              </button>
            </div>
          )}
        </div>
      </div>

      <nav className="sidebar-tree">
        {displayedTree.length > 0 ? (
          renderNodes(displayedTree, 0)
        ) : (
          <div className="sidebar-empty">
            {trimmedQuery ? `未找到包含「${trimmedQuery}」的笔记` : "当前 R2 存储桶中暂无 Markdown 笔记"}
          </div>
        )}
      </nav>

      <MiniReadingHeatmap
        stats={readingStats}
        isActivelyReading={isActivelyReading}
        onOpenFullModal={onOpenHeatmap}
      />
    </aside>
  );
}
