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

### 方式一：Git 自动部署（推荐，桶名与路径不进仓库，可放心开源）

无需修改仓库里的 `wrangler.jsonc`（保留占位名即可），所有敏感资源名通过 Cloudflare 控制台环境变量动态注入：

1. 在 Cloudflare Dashboard 进入 **Workers & Pages → Create → Import a repository**，选择你的 GitHub 仓库。
2. 填写构建与部署命令：
   - **Build command**：`npm run build`
   - **Deploy command**：`npm run deploy:ci`
3. 在 **Build variables（构建环境变量，建议勾选加密为 Secret）** 中添加：
   - `R2_BUCKET_NAME`：**必填**，你的真实 Cloudflare R2 存储桶名称
   - `VAULT_PREFIX`：可选，若笔记存放在桶内子目录（例如 `obsidian/`），在此填写；根目录可不填
   - `SITE_TITLE`：可选，自定义知识库标题（默认 `我的知识库`）
4. 点击 **Save and Deploy** 完成首次发布。
5. 发布完成后进入该 Worker → **Settings → Variables and Secrets → Add**，添加类型为 **Secret** 的运行时密钥：
   - `ACCESS_PASSWORD`：**必填**，你的私密登录口令
   - `SESSION_SECRET`：可选（建议 32 位以上随机字符串，用于 Cookie 签名）

> 说明：`npm run deploy:ci` 会在 Cloudflare 临时构建容器内生成临时的 `.wrangler.deploy.json` 完成部署并立刻删除，真实的 R2 桶名与子目录永远不会写入 Git 仓库或提交历史。

### 方式二：本地 CLI 一键部署

如果你希望从本机终端直接部署，同样可以不修改 `wrangler.jsonc`，直接通过环境变量传入：

```bash
npm install
npx wrangler login

# 1. 设置私密登录口令（安全保存在 Cloudflare Secrets）
npx wrangler secret put ACCESS_PASSWORD
npx wrangler secret put SESSION_SECRET

# 2. 构建并动态注入 R2 桶名与子目录（根目录可省略 VAULT_PREFIX）
npm run build
R2_BUCKET_NAME=你的R2存储桶名称 VAULT_PREFIX=notes/ npm run deploy:ci
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
