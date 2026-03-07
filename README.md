# git-snapshot

A checkpoint tool for your Git working directory. Save your current state, keep working, restore if things go wrong.

## git-snapshot vs git stash

These are **complementary tools**, not replacements for each other. Both have their place in a Git workflow.

| | git stash | git-snapshot |
|---|---|---|
| **Purpose** | Shelve changes temporarily | Create a restore point |
| **Working directory** | Cleared (changes removed) | Unchanged (keep working) |
| **Preserves staging** | No - everything becomes unstaged | Yes - staged stays staged |
| **Naming** | `stash@{0}`, `stash@{1}` | `my-feature.Ab12Cd34` |
| **Storage** | Inside repo (`.git/`) | External (`~/.local/share/`) |
| **Best for** | Pulling remote changes | Everything else |

### When to use git stash

```bash
# You have local changes but need to pull remote updates
git stash
git pull
git stash pop
# Your changes are merged with the pulled changes
```

**Use stash when you need to:**
- Pull remote changes while preserving local work
- Merge your changes *on top of* updated code

Stash applies your changes as a patch - this is specifically useful when you need to incorporate others' changes alongside yours.

### When to use git-snapshot

```bash
# Switching branches for a quick fix
git-snapshot wip
git checkout other-branch
# ... fix something ...
git checkout -
git-snapshot restore wip

# Or: checkpoint before risky refactor
git-snapshot before-refactor
# ... experiment freely ...
git-snapshot restore before-refactor  # if things go wrong
```

**Use git-snapshot when you want to:**
- Switch branches while preserving exact staging state (staged hunks stay staged)
- Create a safety checkpoint before risky changes
- Keep working while having a restore point
- Maintain named checkpoints across sessions

### The key difference

**Stash says:** "Hold this while I pull, then merge it back"  
**Snapshot says:** "Remember this exact state in case I need to come back"

### Important: How they handle concurrent changes

This is a critical difference to understand:

**Stash stores diffs (patches)**
```bash
# You edit file-a lines 1-10, stage them
git stash
# Colleague's changes to lines 30-40 come in via pull
git pull
git stash pop
# Result: BOTH changes are kept (yours merged on top)
```

**Snapshot stores full file contents**
```bash
# You edit file-a lines 1-10, stage them
git-snapshot checkpoint
# Discard, pull colleague's changes to lines 30-40
git checkout -- . && git pull
git-snapshot restore checkpoint
# Result: File restored to YOUR exact state - colleague's changes are gone
```

This is by design:
- **Stash** applies your changes *relative to current state* - good for temporary shelving while collaborating
- **Snapshot** restores files to an *exact checkpoint* - good for "undo everything since this point"

**Bottom line:** Need to pull remote changes? Use stash. For everything else (branch switching, checkpoints, preserving staged hunks), use snapshot.

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

Installation and a standalone executable will be provided in a future release.

## Usage

### Create a snapshot

```bash
git-snapshot                    # snapshot with ID only
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
Snapshot: my-checkpoint.Ab12Cd34
Name: my-checkpoint
ID: Ab12Cd34
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
git-snapshot restore Ab12Cd34           # restore by ID

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
# my-feature.Ab12Cd34.snapshot -> new-name.Ab12Cd34.snapshot
```

## What gets saved

- **Staged files** - full contents of files/hunks you've `git add`ed
- **Unstaged files** - full contents of modifications to tracked files not yet staged  
- **Untracked files** - new files not yet added to git (respects `.gitignore`)

Each is stored separately and restored to its original state.

## Storage

Snapshots are stored in `~/.local/share/git-snapshots/` (XDG-compliant).

**File format:** `name.id.snapshot` (e.g., `my-feature.Ab12Cd34.snapshot`)

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
