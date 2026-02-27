import { mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import os from "node:os";
import path from "node:path";
import { customAlphabet } from "nanoid";
import { cac } from "cac";

// ============================================================================
// Constants
// ============================================================================

const SNAPSHOTS_DIR = path.join(
  Bun.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
  "git-snapshots"
);
const SNAPSHOT_EXT = ".snapshot";

/**
 * Current snapshot metadata schema version.
 *
 * Used in snapshot metadata to determine the version of the schema.
 */
const SNAPSHOT_METADATA_VERSION = 2;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Custom nanoid generator.
 */
const nanoid = (size: number = 8) => {
  const numerics = "0123456789";
  const alphabets = "abcdefghijklmnopqrstuvwxyz";
  const alphabetsUpper = alphabets.toUpperCase();
  const alphabet = [...alphabets, ...alphabetsUpper, ...numerics].join("");
  return customAlphabet(alphabet, size)();
};

/**
 * Generates a unique 8-character ID for a snapshot.
 * Used in snapshot filenames (e.g. `my-feature.V1StGXR8.snapshot`) and when restoring by ID.
 */
function generateId(): string {
  return nanoid(8);
}

async function getRepoRemote(): Promise<string> {
  const proc = Bun.$`git config --get remote.origin.url`.quiet();
  const text = await proc.text().catch(() => "");
  return text.trim();
}

async function getRepoPath(): Promise<string> {
  const proc = Bun.$`git rev-parse --show-toplevel`.quiet();
  const text = await proc.text().catch(() => "");
  return text.trim();
}

async function getCurrentBranch(): Promise<string> {
  const proc = Bun.$`git rev-parse --abbrev-ref HEAD`.quiet();
  const text = await proc.text().catch(() => "");
  return text.trim();
}

async function getCurrentCommit(): Promise<string> {
  const proc = Bun.$`git rev-parse HEAD`.quiet();
  const text = await proc.text().catch(() => "");
  return text.trim();
}

async function ensureGitRepo(): Promise<void> {
  const proc = Bun.$`git rev-parse --git-dir`.quiet();
  const ok = await proc.then(() => true).catch(() => false);
  if (!ok) {
    console.error("Error: Not in a git repository");
    process.exit(1);
  }
}

function ensureSnapshotsDir(): void {
  if (!existsSync(SNAPSHOTS_DIR)) {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

/**
 * Common fields across all metadata versions.
 */
interface SnapshotMetadataBase {
  name: string;
  repo_remote: string;
  repo_path: string;
  branch: string;
  commit: string;
  created_at: string;
  staged_files: string[];
  unstaged_files: string[];
  untracked_files: string[];
}

/**
 * Legacy snapshot metadata (bash).
 *
 * No `__v` or `__v: 1`, uses `hash`.
 */
interface SnapshotMetadataV1 extends SnapshotMetadataBase {
  __v?: 1;
  /**
   * @deprecated Newer snapshots use `id` instead.
   * Use {@link getSnapshotId} to correctly get the snapshot identifier.
   */
  hash: string;
}

interface SnapshotMetadataV2 extends SnapshotMetadataBase {
  __v: 2;
  id: string;
}

/**
 * Version-discriminated union. Use when parsing raw metadata.
 */
type SnapshotMetadata = SnapshotMetadataV1 | SnapshotMetadataV2;

/**
 * Snapshot identifier
 *
 * In metadata `__v: 1`, it's the `hash` field.
 *
 * In metadata `__v: 2` and above, it's the `id` field.
 */
function getSnapshotId(meta: SnapshotMetadata): string {
  return "id" in meta ? meta.id : meta.hash;
}

async function getSnapshotMetadata(
  snapshotPath: string
): Promise<SnapshotMetadata | null> {
  try {
    const bytes = await Bun.file(snapshotPath).bytes();
    const archive = new Bun.Archive(bytes);
    const files = await archive.files();

    let raw: string | undefined;
    for (const [p, file] of files) {
      if (p === "metadata.json" || p === "./metadata.json") {
        raw = await file.text();
        break;
      }
    }

    if (!raw) return null;

    return JSON.parse(raw) as SnapshotMetadata;
  } catch {
    return null;
  }
}

function snapshotMatchesRepo(
  metadata: SnapshotMetadata,
  currentRemote: string,
  currentPath: string
): boolean {
  const snapRemote = metadata.repo_remote ?? "";
  const snapPath = metadata.repo_path ?? "";
  if (currentRemote && snapRemote) {
    return currentRemote === snapRemote;
  }
  return currentPath === snapPath;
}

function basenameWithoutExt(filePath: string): string {
  const base = path.basename(filePath);
  return base.endsWith(SNAPSHOT_EXT)
    ? base.slice(0, -SNAPSHOT_EXT.length)
    : base;
}

function queryMatchesBasename(query: string, basename: string): boolean {
  if (basename === query) return true;
  if (basename.endsWith("." + query) || basename === query) return true;
  if (basename.startsWith(query + ".")) return true;
  return false;
}

async function findSnapshots(
  query: string,
  repoFilter: boolean
): Promise<string[]> {
  if (!existsSync(SNAPSHOTS_DIR)) return [];
  const currentRemote = repoFilter ? await getRepoRemote() : "";
  const currentPath = repoFilter ? await getRepoPath() : "";
  const entries = readdirSync(SNAPSHOTS_DIR, { withFileTypes: true });
  const result: string[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(SNAPSHOT_EXT)) continue;
    const fullPath = path.join(SNAPSHOTS_DIR, e.name);
    const base = basenameWithoutExt(e.name);
    if (!queryMatchesBasename(query, base)) continue;
    if (repoFilter) {
      const meta = await getSnapshotMetadata(fullPath);
      if (!meta || !snapshotMatchesRepo(meta, currentRemote, currentPath))
        continue;
    }
    result.push(fullPath);
  }
  return result;
}

async function listRepoSnapshots(): Promise<string[]> {
  if (!existsSync(SNAPSHOTS_DIR)) return [];
  const currentRemote = await getRepoRemote();
  const currentPath = await getRepoPath();
  const entries = readdirSync(SNAPSHOTS_DIR, { withFileTypes: true });
  const result: string[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(SNAPSHOT_EXT)) continue;
    const fullPath = path.join(SNAPSHOTS_DIR, e.name);
    const meta = await getSnapshotMetadata(fullPath);
    if (!meta || !snapshotMatchesRepo(meta, currentRemote, currentPath))
      continue;
    result.push(fullPath);
  }
  return result;
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ============================================================================
// Commands
// ============================================================================

async function createSnapshot(name: string | undefined): Promise<void> {
  await ensureGitRepo();
  ensureSnapshotsDir();

  const id = generateId();
  const repoRemote = await getRepoRemote();
  const repoPath = await getRepoPath();
  const branch = await getCurrentBranch();
  const commit = await getCurrentCommit();
  const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const stagedOut = await Bun.$`git diff --cached --name-only`
    .quiet()
    .text()
    .catch(() => "");
  const unstagedOut = await Bun.$`git diff --name-only`
    .quiet()
    .text()
    .catch(() => "");
  const untrackedOut = await Bun.$`git ls-files --others --exclude-standard`
    .quiet()
    .text()
    .catch(() => "");

  const stagedFiles = stagedOut.trim()
    ? stagedOut.trim().split("\n").filter(Boolean)
    : [];
  const unstagedFiles = unstagedOut.trim()
    ? unstagedOut.trim().split("\n").filter(Boolean)
    : [];
  const untrackedFiles = untrackedOut.trim()
    ? untrackedOut.trim().split("\n").filter(Boolean)
    : [];

  if (
    stagedFiles.length === 0 &&
    unstagedFiles.length === 0 &&
    untrackedFiles.length === 0
  ) {
    console.log("No changes to save");
    process.exit(0);
  }

  const archiveEntries: Record<string, string | Uint8Array> = {};

  for (const file of stagedFiles) {
    const ref = ":" + file;
    const proc = Bun.$`git show ${ref}`.quiet();
    const output = await proc.catch(() => null);
    const content = output ? output.bytes() : new Uint8Array(0);
    archiveEntries["staged/" + file] = content;
  }
  for (const file of unstagedFiles) {
    const f = Bun.file(path.join(repoPath, file));
    const content = await f.bytes().catch(() => new Uint8Array(0));
    archiveEntries["unstaged/" + file] = content;
  }
  for (const file of untrackedFiles) {
    const f = Bun.file(path.join(repoPath, file));
    const content = await f.bytes().catch(() => new Uint8Array(0));
    archiveEntries["untracked/" + file] = content;
  }

  const metadata: SnapshotMetadataV2 = {
    __v: SNAPSHOT_METADATA_VERSION,
    name: name ?? "",
    id,
    repo_remote: repoRemote,
    repo_path: repoPath,
    branch,
    commit,
    created_at: createdAt,
    staged_files: stagedFiles,
    unstaged_files: unstagedFiles,
    untracked_files: untrackedFiles,
  };
  archiveEntries["metadata.json"] = JSON.stringify(metadata, null, 2);

  const filename = name
    ? `${name}.${id}${SNAPSHOT_EXT}`
    : `${id}${SNAPSHOT_EXT}`;
  const snapshotPath = path.join(SNAPSHOTS_DIR, filename);
  const archive = new Bun.Archive(archiveEntries, { compress: "gzip" });
  await Bun.write(snapshotPath, archive);

  console.log("Snapshot created:", filename);
  console.log("");
  console.log("  Staged files:   ", stagedFiles.length);
  console.log("  Unstaged files: ", unstagedFiles.length);
  console.log("  Untracked files:", untrackedFiles.length);
  console.log("");
  console.log("Restore with:");
  if (name) {
    console.log("  git-snapshot restore", name);
  } else {
    console.log("  git-snapshot restore", id);
  }
}

async function listSnapshots(showAll: boolean): Promise<void> {
  await ensureGitRepo();

  if (!existsSync(SNAPSHOTS_DIR)) {
    console.log("No snapshots found");
    process.exit(0);
  }

  const currentPath = await getRepoPath();
  const entries = readdirSync(SNAPSHOTS_DIR, { withFileTypes: true });
  let found = false;

  if (showAll) {
    console.log("All snapshots:");
  } else {
    console.log("Snapshots for", path.basename(currentPath) + ":");
  }
  console.log("");

  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(SNAPSHOT_EXT)) continue;
    const fullPath = path.join(SNAPSHOTS_DIR, e.name);
    const meta = await getSnapshotMetadata(fullPath);
    if (!meta) continue;
    const currentRemote = await getRepoRemote();
    if (!showAll && !snapshotMatchesRepo(meta, currentRemote, currentPath))
      continue;

    found = true;
    const snapName = meta.name ?? "";
    const snapId = getSnapshotId(meta);
    const snapBranch = meta.branch ?? "";
    const snapCreated = (meta.created_at ?? "")
      .replace("T", " ")
      .replace("Z", "");
    const snapRepoPath = meta.repo_path ?? "";

    const displayName = snapName ? `${snapName} (${snapId})` : snapId;

    if (showAll) {
      console.log(" ", displayName);
      console.log("    repo:", path.basename(snapRepoPath));
      console.log("    branch:", snapBranch, "| created:", snapCreated);
    } else {
      console.log("  ", displayName);
      console.log("    branch:", snapBranch, "| created:", snapCreated);
    }
    console.log("");
  }

  if (!found) {
    console.log("  No snapshots found");
  }
}

async function showSnapshot(query: string): Promise<void> {
  await ensureGitRepo();

  const matches = await findSnapshots(query, false);

  if (matches.length === 0) {
    console.error("Error: Snapshot '" + query + "' not found");
    process.exit(1);
  }

  if (matches.length > 1) {
    console.error("Multiple snapshots match '" + query + "':");
    console.error("");
    for (let i = 0; i < matches.length; i++) {
      const meta = await getSnapshotMetadata(matches[i]!);
      if (!meta) continue;
      const snapCreated = (meta.created_at ?? "")
        .replace("T", " ")
        .replace("Z", "");
      console.error(
        "  [" + (i + 1) + "]",
        getSnapshotId(meta),
        " ",
        meta.branch,
        " ",
        snapCreated
      );
    }
    console.error("");
    console.error("Specify the ID to show a specific snapshot");
    process.exit(1);
  }

  const snapshotFile = matches[0]!;
  const meta = await getSnapshotMetadata(snapshotFile);
  if (!meta) {
    console.error("Error: Snapshot '" + query + "' not found");
    process.exit(1);
  }

  const snapCreated = (meta.created_at ?? "")
    .replace("T", " ")
    .replace("Z", "");
  const snapRepoPath = meta.repo_path ?? "";

  if (meta.name) {
    console.log("Snapshot:", path.basename(snapshotFile, SNAPSHOT_EXT));
    console.log("Name:", meta.name);
  }
  console.log("ID:", getSnapshotId(meta));
  console.log("Repo:", path.basename(snapRepoPath));
  console.log("Branch:", meta.branch);
  console.log("Commit:", (meta.commit ?? "").slice(0, 8));
  console.log("Created:", snapCreated);
  console.log("");

  const bytes = await Bun.file(snapshotFile).bytes();
  const archive = new Bun.Archive(bytes);
  const files = await archive.files();

  const stagedPaths: string[] = [];
  const unstagedPaths: string[] = [];
  const untrackedPaths: string[] = [];
  for (const [p] of files) {
    const norm = p.startsWith("./") ? p.slice(2) : p;
    if (norm.startsWith("staged/") && norm.length > 7) {
      stagedPaths.push(norm.slice(7));
    } else if (norm.startsWith("unstaged/") && norm.length > 9) {
      unstagedPaths.push(norm.slice(9));
    } else if (norm.startsWith("untracked/") && norm.length > 10) {
      untrackedPaths.push(norm.slice(10));
    }
  }

  console.log("Staged files:");
  if (stagedPaths.length > 0) {
    for (const p of stagedPaths) console.log("  ", p);
  } else {
    console.log("  (none)");
  }
  console.log("");
  console.log("Unstaged files:");
  if (unstagedPaths.length > 0) {
    for (const p of unstagedPaths) console.log("  ", p);
  } else {
    console.log("  (none)");
  }
  console.log("");
  console.log("Untracked files:");
  if (untrackedPaths.length > 0) {
    for (const p of untrackedPaths) console.log("  ", p);
  } else {
    console.log("  (none)");
  }
}

async function restoreSnapshot(
  query: string,
  opts: { stagedOnly: boolean; unstagedOnly: boolean; untrackedOnly: boolean }
): Promise<void> {
  await ensureGitRepo();

  let restoreStaged = true;
  let restoreUnstaged = true;
  let restoreUntracked = true;
  if (opts.stagedOnly) {
    restoreStaged = true;
    restoreUnstaged = false;
    restoreUntracked = false;
  } else if (opts.unstagedOnly) {
    restoreStaged = false;
    restoreUnstaged = true;
    restoreUntracked = false;
  } else if (opts.untrackedOnly) {
    restoreStaged = false;
    restoreUnstaged = false;
    restoreUntracked = true;
  }

  const matches = await findSnapshots(query, true);

  if (matches.length === 0) {
    const allMatches = await findSnapshots(query, false);
    if (allMatches.length > 0) {
      console.error(
        "Error: Snapshot '" + query + "' belongs to a different repository"
      );
    } else {
      console.error("Error: Snapshot '" + query + "' not found");
    }
    process.exit(1);
  }

  let snapshotFile: string;
  if (matches.length > 1) {
    console.error("Multiple snapshots match '" + query + "':");
    console.error("");
    for (let i = 0; i < matches.length; i++) {
      const meta = await getSnapshotMetadata(matches[i]!);
      if (!meta) continue;
      const snapCreated = (meta.created_at ?? "")
        .replace("T", " ")
        .replace("Z", "");
      console.error(
        "  [" + (i + 1) + "]",
        getSnapshotId(meta),
        " ",
        meta.branch,
        " ",
        snapCreated
      );
    }
    console.error("");
    const choice = await prompt("Enter number to restore (or 'q' to quit): ");
    if (choice === "q") {
      console.log("Aborted.");
      process.exit(0);
    }
    const num = parseInt(choice, 10);
    if (Number.isNaN(num) || num < 1 || num > matches.length) {
      console.error("Invalid choice");
      process.exit(1);
    }
    snapshotFile = matches[num - 1]!;
  } else {
    snapshotFile = matches[0]!;
  }

  const repoPath = await getRepoPath();

  if (restoreStaged || restoreUnstaged) {
    const diffQuiet = await Bun.$`git diff --quiet`
      .quiet()
      .then(() => true)
      .catch(() => false);
    const cachedQuiet = await Bun.$`git diff --cached --quiet`
      .quiet()
      .then(() => true)
      .catch(() => false);
    if (!diffQuiet || !cachedQuiet) {
      console.error(
        "Warning: You have uncommitted changes that will be overwritten!"
      );
      console.error("");
      const ans = await prompt("Are you sure you want to continue? [y/N] ");
      if (ans !== "y" && ans !== "Y") {
        console.log("Aborted.");
        process.exit(1);
      }
    }
  }

  console.log("Restoring snapshot:", path.basename(snapshotFile, SNAPSHOT_EXT));
  if (opts.stagedOnly || opts.unstagedOnly || opts.untrackedOnly) {
    console.log("(selective restore)");
  }
  console.log("");

  const tempDir = path.join(os.tmpdir(), "git-snapshot-" + generateId());
  mkdirSync(tempDir, { recursive: true });
  try {
    const bytes = await Bun.file(snapshotFile).bytes();
    const archive = new Bun.Archive(bytes);
    await archive.extract(tempDir);

    if (restoreStaged || restoreUnstaged) {
      console.log("Discarding current changes...");
      await Bun.$`git checkout -- .`.quiet().catch(() => {});
      await Bun.$`git reset HEAD`.quiet().catch(() => {});
    }

    const stagedDir = path.join(tempDir, "staged");
    const unstagedDir = path.join(tempDir, "unstaged");
    const untrackedDir = path.join(tempDir, "untracked");

    function* walkFiles(
      dir: string,
      prefix: string
    ): Generator<{ relPath: string; fullPath: string }> {
      if (!existsSync(dir)) return;
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const rel = prefix ? prefix + "/" + e.name : e.name;
        if (e.isFile()) {
          yield { relPath: rel, fullPath: full };
        } else if (e.isDirectory()) {
          yield* walkFiles(full, rel);
        }
      }
    }

    if (restoreStaged && existsSync(stagedDir)) {
      const files = [...walkFiles(stagedDir, "")];
      if (files.length > 0) {
        console.log("Restoring", files.length, "staged file(s)...");
        for (const { relPath, fullPath } of files) {
          const dest = path.join(repoPath, relPath);
          mkdirSync(path.dirname(dest), { recursive: true });
          await Bun.write(dest, Bun.file(fullPath));
          await Bun.$`git add ${path.join(repoPath, relPath)}`.quiet();
        }
      }
    }

    if (restoreUnstaged && existsSync(unstagedDir)) {
      const files = [...walkFiles(unstagedDir, "")];
      if (files.length > 0) {
        console.log("Restoring", files.length, "unstaged file(s)...");
        for (const { relPath, fullPath } of files) {
          const dest = path.join(repoPath, relPath);
          mkdirSync(path.dirname(dest), { recursive: true });
          await Bun.write(dest, Bun.file(fullPath));
        }
      }
    }

    if (restoreUntracked && existsSync(untrackedDir)) {
      const files = [...walkFiles(untrackedDir, "")];
      if (files.length > 0) {
        console.log("Restoring", files.length, "untracked file(s)...");
        for (const { relPath, fullPath } of files) {
          const dest = path.join(repoPath, relPath);
          mkdirSync(path.dirname(dest), { recursive: true });
          await Bun.write(dest, Bun.file(fullPath));
        }
      }
    }

    console.log("");
    console.log("Snapshot restored successfully!");
  } finally {
    const { rmSync } = await import("node:fs");
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function deleteSnapshots(names: string[]): Promise<void> {
  await ensureGitRepo();

  const toDelete: string[] = [];
  const notFound: string[] = [];

  for (const query of names) {
    const matches = await findSnapshots(query, true);
    if (matches.length === 0) {
      notFound.push(query);
    } else {
      for (const file of matches) {
        if (!toDelete.includes(file)) toDelete.push(file);
      }
    }
  }

  if (notFound.length > 0) {
    console.error("Error: The following snapshots were not found:");
    for (const n of notFound) console.error("  ", n);
    process.exit(1);
  }

  console.log("This will delete", toDelete.length, "snapshot(s):");
  for (const file of toDelete) {
    console.log("  ", path.basename(file));
  }
  console.log("");

  const ans = await prompt("Are you sure? [y/N] ");
  if (ans !== "y" && ans !== "Y") {
    console.log("Aborted.");
    process.exit(0);
  }

  for (const file of toDelete) {
    unlinkSync(file);
    console.log("Deleted:", path.basename(file));
  }
  console.log("");
  console.log(toDelete.length, "snapshot(s) deleted.");
}

async function pruneSnapshots(): Promise<void> {
  await ensureGitRepo();

  const snapshots = await listRepoSnapshots();

  if (snapshots.length === 0) {
    console.log("No snapshots to prune for this repository.");
    process.exit(0);
  }

  console.log(
    "This will delete ALL",
    snapshots.length,
    "snapshot(s) for this repository:"
  );
  console.log("");
  for (const file of snapshots) {
    console.log("  ", basenameWithoutExt(path.basename(file)));
  }
  console.log("");

  const ans = await prompt(
    "Are you sure you want to delete ALL snapshots? [y/N] "
  );
  if (ans !== "y" && ans !== "Y") {
    console.log("Aborted.");
    process.exit(0);
  }

  for (const file of snapshots) {
    unlinkSync(file);
    console.log("Deleted:", path.basename(file));
  }
  console.log("");
  console.log("All snapshots pruned.");
}

async function renameSnapshot(query: string, newName: string): Promise<void> {
  await ensureGitRepo();

  const matches = await findSnapshots(query, true);

  if (matches.length === 0) {
    console.error("Error: Snapshot '" + query + "' not found");
    process.exit(1);
  }

  if (matches.length > 1) {
    console.error(
      "Error: Multiple snapshots match '" + query + "'. Specify the ID."
    );
    process.exit(1);
  }

  const snapshotFile = matches[0]!;
  const meta = await getSnapshotMetadata(snapshotFile);
  if (!meta) {
    console.error("Error: Snapshot '" + query + "' not found");
    process.exit(1);
  }

  const newFilename = newName + "." + getSnapshotId(meta) + SNAPSHOT_EXT;
  const newPath = path.join(SNAPSHOTS_DIR, newFilename);

  if (existsSync(newPath)) {
    console.error("Error: Snapshot '" + newFilename + "' already exists");
    process.exit(1);
  }

  const tempDir = path.join(os.tmpdir(), "git-snapshot-rename-" + generateId());
  mkdirSync(tempDir, { recursive: true });
  try {
    const bytes = await Bun.file(snapshotFile).bytes();
    const archive = new Bun.Archive(bytes);
    await archive.extract(tempDir);

    const metaPath = path.join(tempDir, "metadata.json");
    const metaContent = (await Bun.file(metaPath).json()) as SnapshotMetadata;
    metaContent.name = newName;
    await Bun.write(metaPath, JSON.stringify(metaContent, null, 2));

    const entries: Record<string, string | Uint8Array> = {};
    function collectFiles(dir: string, prefix: string): void {
      const entriesList = readdirSync(dir, { withFileTypes: true });
      for (const e of entriesList) {
        const full = path.join(dir, e.name);
        const rel = prefix ? prefix + "/" + e.name : e.name;
        if (e.isFile()) {
          entries[rel] = ""; // placeholder, fill below
        } else if (e.isDirectory()) {
          collectFiles(full, rel);
        }
      }
    }
    collectFiles(tempDir, "");
    for (const rel of Object.keys(entries)) {
      const full = path.join(tempDir, rel.replace(/\//g, path.sep));
      entries[rel] = await Bun.file(full).bytes();
    }
    const newArchive = new Bun.Archive(entries, { compress: "gzip" });
    await Bun.write(newPath, newArchive);

    unlinkSync(snapshotFile);
    console.log("Renamed:", path.basename(snapshotFile), "->", newFilename);
  } finally {
    const { rmSync } = await import("node:fs");
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// ============================================================================
// Main
// ============================================================================

const cli = cac("git-snapshot");

const createAction = async (name: string | undefined) => {
  const trimmedName = typeof name === "string" ? name.trim() : undefined;
  await createSnapshot(trimmedName);
};

cli.command("[name]", "Create a snapshot (optional name)").action(createAction);
cli.command("create [name]", "Explicit create").action(createAction);

cli
  .command("list", "List snapshots (default: current repo)")
  .option("--all, -a", "List all snapshots")
  .alias("ls")
  .usage("list | ls [--all]")
  .action(async (options: { all?: boolean; a?: boolean }) => {
    const { all = false } = options;
    await listSnapshots(all);
  });

const showCommand = cli.command("show <name>", "Show snapshot contents");
showCommand.action(async (name: string) => {
  const trimmedName = name.trim();

  if (!trimmedName) {
    showCommand.outputHelp();
    process.exit(1);
  }

  await showSnapshot(trimmedName);
});

const restoreCommand = cli
  .command("restore <name>", "Restore a snapshot")
  .option("--staged-only", "Restore only staged changes")
  .option("--unstaged-only", "Restore only unstaged changes")
  .option("--untracked-only", "Restore only untracked files");
restoreCommand.action(
  async (
    name: string,
    options: {
      stagedOnly?: boolean;
      unstagedOnly?: boolean;
      untrackedOnly?: boolean;
    }
  ) => {
    const trimmedName = name.trim();
    const {
      stagedOnly = false,
      unstagedOnly = false,
      untrackedOnly = false,
    } = options;

    if (!trimmedName) {
      restoreCommand.outputHelp();
      process.exit(1);
    }

    await restoreSnapshot(trimmedName, {
      stagedOnly,
      unstagedOnly,
      untrackedOnly,
    });
  }
);

const deleteCommand = cli
  .command("delete <names...>", "Delete snapshot(s)")
  .alias("rm")
  .usage("delete | rm <name> [name2] ...");
deleteCommand.action(async (names) => {
  const list = Array.isArray(names)
    ? names.filter((n): n is string => typeof n === "string")
    : typeof names === "string" && names.trim()
    ? [names.trim()]
    : [];

  if (list.length === 0) {
    deleteCommand.outputHelp();
    process.exit(1);
  }

  await deleteSnapshots(list);
});

cli
  .command("prune", "Delete all snapshots for current repo")
  .action(pruneSnapshots);

const renameCommand = cli.command(
  "rename <name> <new-name>",
  "Rename a snapshot"
);
renameCommand.action(async (name: string, newName: string) => {
  const trimmedName = name.trim();
  const trimmedNewName = newName.trim();

  if (!trimmedName || !trimmedNewName) {
    renameCommand.outputHelp();
    process.exit(1);
  }

  await renameSnapshot(trimmedName, trimmedNewName);
});

cli.help();
cli.version("1.0.0-beta.1");

cli.parse();
