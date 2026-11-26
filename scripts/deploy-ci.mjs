import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const baseConfigPath = path.join(projectRoot, "wrangler.jsonc");
const tempConfigPath = path.join(projectRoot, ".wrangler.deploy.json");

function readJsonc(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const stripped = raw.replace(/(^|\s)\/\/.*$/gm, "");
  return JSON.parse(stripped);
}

const config = readJsonc(baseConfigPath);
const isCi = Boolean(process.env.CI || process.env.WORKERS_CI);
const bucketName = (process.env.R2_BUCKET_NAME || "").trim();

if (!bucketName) {
  if (isCi) {
    console.error(
      "[deploy:ci] 缺少环境变量 R2_BUCKET_NAME。请在 Cloudflare Workers Builds 的 Build variables 中配置你的真实 R2 存储桶名称。"
    );
    process.exit(1);
  }
  console.warn(
    "[deploy:ci] 未设置 R2_BUCKET_NAME，将回退使用 wrangler.jsonc 中的默认占位桶名。"
  );
} else {
  if (!Array.isArray(config.r2_buckets) || config.r2_buckets.length === 0) {
    config.r2_buckets = [{ binding: "NOTES_BUCKET", bucket_name: bucketName }];
  } else {
    config.r2_buckets[0].bucket_name = bucketName;
  }
  console.log("[deploy:ci] 已从构建环境变量动态注入 R2 存储桶绑定 (NOTES_BUCKET)。");
}

if (process.env.WORKER_NAME?.trim()) {
  config.name = process.env.WORKER_NAME.trim();
}

config.keep_vars = true;
config.vars = { ...(config.vars || {}) };

// 若构建环境变量提供了 VAULT_PREFIX，则动态注入；未提供时从部署配置中移除，避免覆盖控制台里手动配置的运行时变量
const optionalEnvVars = [
  "VAULT_PREFIX",
  "SITE_TITLE",
  "AUTH_MODE",
  "SESSION_TTL_HOURS",
  "CF_ACCESS_TEAM_DOMAIN",
  "CF_ACCESS_AUD",
];

for (const key of optionalEnvVars) {
  if (process.env[key] !== undefined) {
    config.vars[key] = process.env[key].trim();
    console.log(`[deploy:ci] 已从构建环境变量注入 ${key}。`);
  } else if (key === "VAULT_PREFIX") {
    delete config.vars.VAULT_PREFIX;
  }
}

const rawArgs = process.argv.slice(2);
const isPreview = rawArgs.includes("--preview");
const extraArgs = rawArgs.filter((arg) => arg !== "--preview");
const wranglerCommand = isPreview ? ["versions", "upload"] : ["deploy"];

if (isPreview) {
  console.log("[deploy:ci] Preview 模式：将使用 wrangler versions upload 上传预览版本。");
}

fs.writeFileSync(tempConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

let exitCode = 1;
try {
  const result = spawnSync(
    "npx",
    ["wrangler", ...wranglerCommand, "--config", tempConfigPath, ...extraArgs],
    {
      cwd: projectRoot,
      stdio: "inherit",
    }
  );
  exitCode = result.status ?? 1;
} finally {
  if (fs.existsSync(tempConfigPath)) {
    fs.unlinkSync(tempConfigPath);
  }
}

process.exit(exitCode);
