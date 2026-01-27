# git-snapshot

A checkpoint tool for your Git working directory. Save your current state, keep working, restore if things go wrong.

## git-snapshot vs git stash

These are **complementary tools**, not replacements for each other. Both have their place in a Git workflow.

| | git stash | git-snapshot |
|---|---|---|
| **Purpose** | Shelve changes temporarily | Create a restore point |
| **Working directory** | Cleared (changes removed) | Unchanged (keep working) |
| **Preserves staging** | No - everything becomes unstaged | Yes - staged stays staged |
| **Naming** | `stash@{0}`, `stash@{1}` | `my-feature.a1b2c3d4` |
| **Storage** | Inside repo (`.git/`) | External (`~/.local/share/`) |
| **Best for** | Context switching | Safety nets |

### When to use git stash

```bash
# You're mid-work but need to switch branches
git stash
git checkout other-branch
# ... do stuff ...
git checkout -
git stash pop
```

**Use stash when you need to:**
- Quickly switch branches without committing
- Pull changes when you have local modifications  
- Temporarily clear your working directory
- Park changes you'll come back to shortly

### When to use git-snapshot

```bash
# You're about to try something risky
git-snapshot before-refactor
# ... experiment freely ...
# If it goes wrong:
git-snapshot restore before-refactor
```

**Use git-snapshot when you want to:**
- Create a safety checkpoint before risky changes
- Keep working while having a restore point
- Preserve exact staging state (specific hunks staged for a future commit)
- Maintain named checkpoints across sessions

### The key difference

**Stash says:** "Hold this for me while I do something else"  
**Snapshot says:** "Remember this state in case I need to come back"

## The workflow git-snapshot enables

```bash
# You're working on a feature, things are looking good
git-snapshot working-nicely

# Keep experimenting...
# Try a risky refactor...
# Oh no, it's broken

# Get back to your checkpoint
git-snapshot restore working-nicely

# Your code is back exactly as it was - staged files still staged
```

**"Why not just commit?"**

You could, but:
- Sometimes you're not at a commit-worthy point - code works but isn't clean/complete
- Commits are permanent history; snapshots are disposable checkpoints
- You might have carefully staged specific hunks for a future commit - committing now loses that curation
- You want to try something without polluting your branch with "WIP" or "temp" commits

## Installation

```bash
# One-line install
curl -fsSL https://raw.githubusercontent.com/mhm13dev/git-snapshot/main/install.sh | bash

# Or with custom directory
curl -fsSL https://raw.githubusercontent.com/mhm13dev/git-snapshot/main/install.sh | bash -s -- ~/.local/bin

# Or clone and install locally
git clone https://github.com/mhm13dev/git-snapshot.git
cd git-snapshot
./install.sh
```

## Usage

### Create a snapshot

```bash
git-snapshot                    # snapshot with hash only
git-snapshot my-checkpoint      # snapshot with custom name
git-snapshot create my-name     # explicit create (if name matches a subcommand)
```

### List snapshots

```bash
git-snapshot list               # snapshots for current repo
git-snapshot list --all         # all snapshots (all repos)
```

### Show snapshot details

```bash
git-snapshot show my-checkpoint
```

Output:
```
Snapshot: my-checkpoint.a1b2c3d4
Hash: a1b2c3d4
Name: my-checkpoint
Repo: my-project
Branch: main
Commit: e5f6g7h8
Created: 2026-01-26 14:30:52

Staged files:
  src/app.js

Unstaged files:
  src/utils.js

Untracked files:
  src/new-helper.js
```

### Restore a snapshot

```bash
git-snapshot restore my-checkpoint      # restore by name
git-snapshot restore a1b2c3d4           # restore by hash

# Selective restore
git-snapshot restore <name> --staged-only      # only staged changes
git-snapshot restore <name> --unstaged-only    # only unstaged changes
git-snapshot restore <name> --untracked-only   # only untracked files
```

### Delete snapshots

```bash
git-snapshot delete <name>              # delete one
git-snapshot delete <name1> <name2>     # delete multiple
git-snapshot prune                      # delete all snapshots for current repo
```

### Rename a snapshot

```bash
git-snapshot rename old-name new-name
# my-feature.a1b2c3d4.snapshot -> new-name.a1b2c3d4.snapshot
```

## What gets saved

- **Staged files** - full contents of files/hunks you've `git add`ed
- **Unstaged files** - full contents of modifications to tracked files not yet staged  
- **Untracked files** - new files not yet added to git (respects `.gitignore`)

Each is stored separately and restored to its original state.

## Storage

Snapshots are stored in `~/.local/share/git-snapshots/` (XDG-compliant).

**File format:** `name.hash.snapshot` (e.g., `my-feature.a1b2c3d4.snapshot`)

Each `.snapshot` file is a tarball containing:
```
metadata.json       # snapshot info (repo, branch, commit, timestamp, file lists)
staged/             # full contents of staged files
unstaged/           # full contents of unstaged files
untracked/          # full contents of untracked files
```

## Key features

- **Always works** - stores full file contents, not patches. Restores work even after commits.
- **Repo-aware** - snapshots are tied to their repository. Cannot accidentally restore to wrong repo.
- **Non-destructive** - creating a snapshot doesn't touch your working directory.
- **Preserves staging** - staged files restore as staged, unstaged as unstaged.

## License

MIT
