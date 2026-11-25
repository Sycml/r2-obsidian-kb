---
title: Cloudflare R2 架构说明
tags:
  - cloudflare
  - workers
  - 架构
updated: 2026-11-25
---

返回首页：[[欢迎使用]]

## 为什么选择 Workers + R2 私有绑定？

相比静态站点生成（SSG），使用 Cloudflare Workers 原生绑定 R2 具备以下优势：

1. **零构建延迟**：笔记写入 R2 即刻生效，不需要等待 CI/CD 构建。
2. **零公网出口费**：Workers 与 R2 之间走 Cloudflare 内网绑定，免 R2 公网带宽费。
3. **完全私密**：桶本身不对外公开，配合口令会话或 Cloudflare Access 零信任认证保护数据安全。

## 核心配置片段

```jsonc
{
  "assets": {
    "directory": "./dist/client",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "r2_buckets": [
    {
      "binding": "NOTES_BUCKET",
      "bucket_name": "my-obsidian-notes"
    }
  ]
}
```

## 常用运维命令

| 场景 | 命令 | 说明 |
| --- | --- | --- |
| 设置访问口令 | `npx wrangler secret put ACCESS_PASSWORD` | 加密保存在 Cloudflare 边缘 |
| 一键部署 | `npm run deploy` | 自动构建前端并发布 Worker |
| 查看实时日志 | `npx wrangler tail` | 排查接口与 R2 读取问题 |

> [!warning] 安全提醒
> 请勿将 `ACCESS_PASSWORD` 写死在 `wrangler.jsonc` 或提交到 Git 仓库，务必使用 `wrangler secret put` 注入。
