import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const sampleVaultDir = path.join(projectRoot, "sample-vault");

function readWranglerConfig() {
  const raw = fs.readFileSync(path.join(projectRoot, "wrangler.jsonc"), "utf-8");
  // Strip single-line // comments cleanly while preserving URLs like https://
  const cleaned = raw.replace(/(^|\s)\/\/.*$/gm, "");
  return JSON.parse(cleaned);
}

function walkFiles(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, base));
    } else if (entry.isFile()) {
      results.push({
        fullPath: full,
        relKey: path.relative(base, full).split(path.sep).join("/"),
      });
    }
  }
  return results;
}

const config = readWranglerConfig();
const bucketName = config.r2_buckets?.[0]?.bucket_name || "my-obsidian-notes";
const vaultPrefixRaw = (config.vars?.VAULT_PREFIX || "").trim().replace(/^\/+|\/+$/g, "");
const vaultPrefix = vaultPrefixRaw ? `${vaultPrefixRaw}/` : "";

const files = walkFiles(sampleVaultDir);
console.log(`Seeding ${files.length} files into local R2 bucket "${bucketName}"...`);

for (const file of files) {
  const objectKey = `${vaultPrefix}${file.relKey}`;
  console.log(`  -> ${objectKey}`);
  execFileSync(
    "npx",
    ["wrangler", "r2", "object", "put", `${bucketName}/${objectKey}`, "--file", file.fullPath, "--local"],
    { cwd: projectRoot, stdio: "inherit" }
  );
}

console.log("Local R2 seeding complete!");
