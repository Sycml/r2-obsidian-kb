import { Hono } from "hono";
import type { Env, VaultTreeResponse } from "./types";
import {
  authMiddleware,
  clearSessionCookie,
  createSessionToken,
  getSessionTtlHours,
  isAuthenticated,
  resolveAuthMode,
  setSessionCookie,
  verifyPassword,
} from "./auth";
import {
  inferContentType,
  listVaultFromR2,
  normalizeSafeRelativeKey,
  resolveR2Key,
} from "./r2";
import {
  applyReadingDeltas,
  loadReadingStatsFromR2,
  sanitizeReadingDeltas,
  saveReadingStatsToR2,
} from "./readingStats";

const app = new Hono<{ Bindings: Env }>();

// Public health check (does not expose any vault data)
app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    authMode: resolveAuthMode(c.env),
    siteTitle: c.env.SITE_TITLE || "我的知识库",
  });
});

// Auth status check
app.get("/api/auth/me", async (c) => {
  const mode = resolveAuthMode(c.env);
  const status = await isAuthenticated(c);
  return c.json({
    authenticated: status.authenticated,
    authMode: mode,
    siteTitle: c.env.SITE_TITLE || "我的知识库",
    misconfigured: Boolean(status.misconfigured),
    message: status.misconfigured ? status.reason : undefined,
  });
});

// Password login
app.post("/api/auth/login", async (c) => {
  const mode = resolveAuthMode(c.env);
  if (mode !== "password") {
    return c.json({ error: "当前未启用口令登录模式。" }, 400);
  }

  const expectedPassword = c.env.ACCESS_PASSWORD?.trim();
  if (!expectedPassword) {
    return c.json(
      {
        error: "服务端尚未配置 ACCESS_PASSWORD，请先设置 Worker Secret。",
        code: "MISCONFIGURED",
      },
      503
    );
  }

  let body: { password?: string };
  try {
    body = await c.req.json<{ password?: string }>();
  } catch {
    return c.json({ error: "无效的请求体。" }, 400);
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    return c.json({ error: "请输入访问口令。" }, 400);
  }

  const ok = await verifyPassword(password, expectedPassword);
  if (!ok) {
    return c.json({ error: "访问口令不正确，请重试。" }, 401);
  }

  const ttlHours = getSessionTtlHours(c.env);
  const token = await createSessionToken(c.env, ttlHours);
  setSessionCookie(c, token, ttlHours);

  return c.json({
    authenticated: true,
    siteTitle: c.env.SITE_TITLE || "我的知识库",
  });
});

// Logout
app.post("/api/auth/logout", (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// Protect all vault API endpoints
app.use("/api/tree", authMiddleware);
app.use("/api/note", authMiddleware);
app.use("/api/asset", authMiddleware);
app.use("/api/reading-stats", authMiddleware);

// Vault directory tree & flat index
app.get("/api/tree", async (c) => {
  const { tree, files, noteCount, assetCount } = await listVaultFromR2(
    c.env.NOTES_BUCKET,
    c.env.VAULT_PREFIX
  );

  const payload: VaultTreeResponse = {
    siteTitle: c.env.SITE_TITLE || "我的知识库",
    noteCount,
    assetCount,
    tree,
    files,
    generatedAt: new Date().toISOString(),
  };

  return c.json(payload, 200, {
    "Cache-Control": "private, no-store",
  });
});

// Read a Markdown note
app.get("/api/note", async (c) => {
  const rawKey = c.req.query("key");
  const safeKey = normalizeSafeRelativeKey(rawKey);
  if (!safeKey || !safeKey.toLowerCase().endsWith(".md")) {
    return c.json({ error: "无效的笔记路径。" }, 400);
  }

  const fullKey = resolveR2Key(safeKey, c.env.VAULT_PREFIX);
  const rawIfNoneMatch = c.req.header("If-None-Match");
  const normalizedIfNoneMatch = rawIfNoneMatch
    ?.trim()
    .replace(/^W\//i, "")
    .replace(/^"|"$/g, "");

  const obj: R2Object | R2ObjectBody | null = normalizedIfNoneMatch
    ? await c.env.NOTES_BUCKET.get(fullKey, {
        onlyIf: { etagDoesNotMatch: normalizedIfNoneMatch },
      })
    : await c.env.NOTES_BUCKET.get(fullKey);

  if (!obj) {
    return c.json({ error: "未找到该笔记。", key: safeKey }, 404);
  }

  const isBody = (item: R2Object | R2ObjectBody): item is R2ObjectBody =>
    "body" in item && typeof (item as R2ObjectBody).text === "function";

  if (!isBody(obj)) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: obj.httpEtag,
        "Cache-Control": "private, no-cache",
      },
    });
  }

  const content = await obj.text();
  return c.json(
    {
      key: safeKey,
      content,
      size: obj.size,
      etag: obj.etag,
      uploaded: obj.uploaded.toISOString(),
    },
    200,
    {
      ETag: obj.httpEtag,
      "Cache-Control": "private, no-cache",
    }
  );
});

// Stream an attachment (images, PDF, audio, video, etc.)
app.get("/api/asset", async (c) => {
  const rawKey = c.req.query("key");
  const safeKey = normalizeSafeRelativeKey(rawKey);
  if (!safeKey) {
    return c.json({ error: "无效的附件路径。" }, 400);
  }

  const fullKey = resolveR2Key(safeKey, c.env.VAULT_PREFIX);
  const rangeHeader = c.req.header("Range");
  const obj = await c.env.NOTES_BUCKET.get(fullKey, {
    range: rangeHeader ? c.req.raw.headers : undefined,
  });

  if (!obj) {
    return c.json({ error: "未找到该附件。" }, 404);
  }

  const contentType = inferContentType(safeKey, obj.httpMetadata?.contentType);
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("ETag", obj.httpEtag);
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Accept-Ranges", "bytes");

  // Sandbox active document formats like SVG/HTML to prevent XSS when opened directly
  if (
    contentType.includes("svg") ||
    contentType.includes("html") ||
    contentType.includes("xml")
  ) {
    headers.set("Content-Security-Policy", "sandbox");
  }

  if (rangeHeader && obj.range && "offset" in obj.range && typeof obj.range.offset === "number") {
    const start = obj.range.offset;
    const length = obj.range.length ?? obj.size - start;
    const end = start + length - 1;
    headers.set("Content-Range", `bytes ${start}-${end}/${obj.size}`);
    headers.set("Content-Length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { status: 200, headers });
});

// Read persisted reading duration statistics from R2
app.get("/api/reading-stats", async (c) => {
  const stats = await loadReadingStatsFromR2(c.env.NOTES_BUCKET, c.env.VAULT_PREFIX);
  return c.json(stats, 200, {
    "Cache-Control": "private, no-store",
  });
});

// Merge incremental reading duration deltas into R2 (supports fetch JSON and sendBeacon)
app.post("/api/reading-stats", async (c) => {
  let payload: { deltas?: unknown };
  try {
    const rawText = await c.req.text();
    payload = JSON.parse(rawText) as { deltas?: unknown };
  } catch {
    return c.json({ error: "无效的阅读记录请求体。" }, 400);
  }

  const deltas = sanitizeReadingDeltas(payload?.deltas);
  const current = await loadReadingStatsFromR2(c.env.NOTES_BUCKET, c.env.VAULT_PREFIX);

  if (deltas.length === 0) {
    return c.json(current, 200, {
      "Cache-Control": "private, no-store",
    });
  }

  const updated = applyReadingDeltas(current, deltas);
  await saveReadingStatsToR2(c.env.NOTES_BUCKET, updated, c.env.VAULT_PREFIX);

  return c.json(updated, 200, {
    "Cache-Control": "private, no-store",
  });
});

// Fallback for non-API requests if routed to Worker
app.all("*", async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.json({ error: "Not Found" }, 404);
});

export default app;
