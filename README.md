# R2 Obsidian 私人知识库（Cloudflare Workers + R2）

将存放在 **Cloudflare R2 私有存储桶** 中的 Obsidian 笔记库，以现代化 Web 知识库的形式实时展现，支持手机、平板、电脑多端自适应查阅（含 PWA 添加到主屏幕）。

## 核心特性

- **实时动态读取 R2**：笔记同步到 R2 后无需重新构建，刷新即可看到最新内容。
- **私有桶零公网暴露**：无需开启 R2 公开域名，由 Cloudflare Worker 鉴权后通过内部绑定代理读取，零 R2 公网出口流量费。
- **Obsidian 语法深度支持**：
  - YAML Frontmatter 属性卡片（`title`、`tags`、`aliases`、自定义属性）
  - `[[双链]]`（最短路径匹配、别名 `[[笔记|显示名]]`、章节锚点 `[[笔记#标题]]`）
  - `![[附件嵌入]]`（图片及宽度语法 `![[pic.png|480]]`、PDF 在线预览、音视频、嵌入笔记卡片）
  - Callout 提示框（含 `+` / `-` 可折叠语法）
  - `==高亮==`、任务列表、代码高亮 + 一键复制、图片灯箱放大
- **多端自适应体验**：
  - 电脑端：左侧目录树（支持快速文件名筛选）+ 中间正文阅读 + 右侧粘性 TOC 大纲
  - 平板/手机端：顶部精简导航栏 + 侧滑目录抽屉 + 悬浮文章大纲 + 浅色/深色/跟随系统主题
- **两种私密访问模式**：
  - `password`（默认）：应用内安全口令登录（Web Crypto HMAC-SHA256 签名 `HttpOnly` Cookie）
  - `cloudflare-access`：配合 Cloudflare Zero Trust Access 邮箱验证码零信任保护

---

## 快速部署到你的 Cloudflare 账号

### 1. 修改存储桶名称

打开 `wrangler.jsonc`，将 `bucket_name` 改为你现有的 Cloudflare R2 存储桶名称：

```jsonc
  "r2_buckets": [
    {
      "binding": "NOTES_BUCKET",
      "bucket_name": "你的R2存储桶名称"
    }
  ],
  "vars": {
    "AUTH_MODE": "password",
    // 如果你的 Obsidian 笔记在桶内子目录下（例如 notes/），填写 "notes/"；根目录留空即可
    "VAULT_PREFIX": "",
    "SITE_TITLE": "我的知识库"
  }
```

### 2. 登录 Cloudflare 并设置私密口令

```bash
npm install
npx wrangler login

# 设置登录口令（安全保存在 Cloudflare Secrets，不会出现在代码仓库中）
npx wrangler secret put ACCESS_PASSWORD

# 可选：设置独立的 Cookie 签名密钥（建议 32 位以上随机字符串）
npx wrangler secret put SESSION_SECRET
```

### 3. 一键构建并发布

```bash
npm run deploy
```

部署完成后，终端会输出你的访问网址（如 `https://r2-obsidian-kb.<你的子域>.workers.dev`）。你也可以在 Cloudflare Dashboard → **Workers & Pages** → 对应 Worker → **Settings → Domains & Routes** 中绑定自定义域名（例如 `notes.yourdomain.com`）。

---

## 可选：切换为 Cloudflare Access（Zero Trust 邮箱验证码）

如果你更喜欢通过邮箱一次性验证码登录（免记应用口令）：

1. 在 Cloudflare Zero Trust 控制台为你的自定义域名创建一个 **Self-hosted Access Application**，策略设置为仅允许你的个人邮箱。
2. 在 `wrangler.jsonc` 中修改：
   ```jsonc
   "vars": {
     "AUTH_MODE": "cloudflare-access",
     "CF_ACCESS_TEAM_DOMAIN": "your-team.cloudflareaccess.com",
     "CF_ACCESS_AUD": "你的-Application-Audience-Tag"
   }
   ```
3. 重新运行 `npm run deploy`。

---

## 本地开发与预览

项目自带一份 `sample-vault/` 示例笔记库，可在不连接真实 Cloudflare 账号的情况下完整本地预览：

```bash
# 1. 复制本地开发口令配置（默认口令: demo-notes-password）
cp .dev.vars.example .dev.vars

# 2. 将示例笔记写入 Wrangler 本地模拟 R2 存储桶
npm run seed:local

# 3. 构建前端并启动本地 Cloudflare Workers 模拟环境
npm run preview
```

浏览器打开 `http://localhost:8787`，输入 `.dev.vars` 中的口令即可体验完整功能。

---

## 推荐同步方式（Obsidian → Cloudflare R2）

若你尚未配置自动同步，推荐在 Obsidian 社区插件市场安装 **Remotely Save**：
- Remote Service 选择 **S3**
- Endpoint 填写 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- Region 填写 `auto`
- Bucket Name 填写你的 R2 存储桶名
- 填入在 Cloudflare R2 控制台创建的 API Token（Access Key ID & Secret Access Key）

配置完成后，Obsidian 每次同步到 R2，本网页知识库都会实时呈现最新笔记。
