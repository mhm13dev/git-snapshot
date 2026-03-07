import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platform = process.platform;
const arch = process.arch;

const binaryName =
  platform === "win32"
    ? `git-snapshot-win32-${arch}.exe`
    : `git-snapshot-${platform}-${arch}`;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const binaryPath = path.join(__dirname, binaryName);

const result = spawnSync(binaryPath, process.argv.slice(2), {
  stdio: "inherit",
});

process.exit(result.status ?? 0);
