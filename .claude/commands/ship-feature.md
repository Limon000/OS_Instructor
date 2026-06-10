---
description: Stages, commits, pushes, and opens a PR for the current feature branch. No arguments needed — everything is derived from git context.
allowed-tools: Bash(git status), Bash(git diff), Bash(git diff --staged), Bash(git branch --show-current), Bash(git add), Bash(git commit), Bash(git push), Bash(gh pr create)
---

Ship the current feature branch by staging all changes,
creating a commit, pushing to the remote, and opening a
pull request against main.

No arguments are required. All context is derived from
the current git branch and diff.

---

## Pre-flight Check

1. Run `git branch --show-current` to get the active
   branch name. If it returns `main`, stop immediately
   and say:
   "You are on the main branch. Switch to a feature
   branch before shipping."

2. Run `git status --porcelain`. If output is empty,
   stop and say:
   "Nothing to commit. Either the feature has already
   been shipped or no changes have been made."

3. Run `git diff` and `git diff --staged` and present
   a brief summary (file names only) of what will be
   committed so the user can see what is being shipped.

---

## Step 1: Stage Changes

Run:
  git add .

Then run `git status` and show the list of staged
files to the user.

---

## Step 2: Commit

Derive the feature name from the current branch:
- Strip the `feature/` prefix if present
  (e.g. `feature/hooks` → `hooks`)
- Use the branch name as-is if there is no prefix

Use the staged diff to write a concise one-line
summary of what this commit does. Write the commit
message in conventional commit format:

  feat(<feature-name>): <one-line summary from diff>

Run:
  git commit -m "<message>"

The message must reflect the actual changes — do NOT
use generic or placeholder text.

---

## Step 3: Push

Run:
  git push -u origin <current-branch>

If the push fails for any reason, report the full
error and stop. Do NOT proceed to Step 4.

---

## Step 4: Create Pull Request

Use the branch name and the diff to build a
descriptive PR. Run:

  gh pr create \
    --title "feat(<feature-name>): <summary>" \
    --body "<structured body>" \
    --base main

Structure the PR body as:

  ## Summary
  <2–4 bullet points describing what was changed,
   derived from the diff>

  ## What changed
  <bullet list of key files/components modified>

  ## How to test manually
  <brief steps a reviewer can follow to verify the
   feature works end-to-end>

  🤖 Shipped with /ship-feature

---

## Step 5: Final Report

After the PR is created, output:

### ✅ Feature Shipped — <feature-name>

- **Branch:** <current branch>
- **Commit:** <short commit hash>
- **PR:** <PR URL returned by gh pr create>

**Next steps:**
- Address any review feedback on the PR
- Merge once approved

---

## Rules
- Do NOT commit if the current branch is `main`
- Do NOT skip the pre-flight check
- Do NOT create the PR if the push in Step 3 fails
- Commit message and PR body must reflect actual
  changes from the diff — never use placeholder text
- Commit message MUST follow conventional commit
  format: feat(<feature-name>): <summary>
- If either `git commit` or `git push` fails, stop
  and report the full error output
