import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { version, repository } from "../package.json";

const platform = process.platform;
const arch = process.arch;

const binaryName =
  platform === "win32"
    ? `git-snapshot-win32-${arch}.exe`
    : `git-snapshot-${platform}-${arch}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RELEASE_BASE = repository.url.replace(/\.git$/, "");

function getCacheDir(): string {
  const base =
    platform === "win32"
      ? process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local")
      : process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return path.join(base, "git-snapshot", "bin");
}

const cachedBinaryName =
  platform === "win32"
    ? `git-snapshot-win32-${arch}-v${version}.exe`
    : `git-snapshot-${platform}-${arch}-v${version}`;

async function downloadBinary(destPath: string): Promise<void> {
  const ext = platform === "win32" ? ".exe" : "";
  const filename = `git-snapshot-${platform}-${arch}${ext}`;
  const url = `${RELEASE_BASE}/releases/download/v${version}/${filename}`;

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(
      `Failed to download binary (${res.status}): ${url}. If you are offline or this version has no release, install the binary from GitHub Releases.`
    );
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const dir = path.dirname(destPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(destPath, buffer, { mode: 0o755 });
  if (platform !== "win32") chmodSync(destPath, 0o755);
}

async function ensureBinary(): Promise<string> {
  const nextToShim = path.join(__dirname, binaryName);
  if (existsSync(nextToShim)) return nextToShim;

  const cacheDir = getCacheDir();
  const cached = path.join(cacheDir, cachedBinaryName);
  if (existsSync(cached)) return cached;

  process.stderr.write(
    `Downloading git-snapshot binary for ${platform}-${arch}...\n`
  );
  await downloadBinary(cached);
  return cached;
}

async function main(): Promise<void> {
  const binaryPath = await ensureBinary();
  const result = spawnSync(binaryPath, process.argv.slice(2), {
    stdio: "inherit",
  });
  process.exit(result.status ?? 0);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
