# AI context pack

Compact briefing for AI assistants, so a session does not have to re-read the repository.

## Load order

| Step | File | Load when |
| --- | --- | --- |
| 1 | [STATE.md](STATE.md) | Always |
| 2 | [TASKS.md](TASKS.md) | Picking up or finishing work |
| 3 | [CODEMAP.md](CODEMAP.md) | Finding code; read this instead of listing or opening files |
| 4 | [BUGS.md](BUGS.md) | Fixing a defect |
| 5 | [CONVENTIONS.md](CONVENTIONS.md) | Before writing code |

Read a human document in `docs/` only when these do not answer the question.

## Rules that save tokens

- Open only the files the task needs, using `CODEMAP.md` to find them.
- Never read: `package-lock.json`, `dist/`, `node_modules/`.
- Do not re-derive anything in `CONVENTIONS.md` under "Locked decisions".
- Filter command output: `npm test 2>&1 | tail -20`.

## Keep this pack current

At the end of any session that changes the code:

1. Tick items in `TASKS.md`, and update "Next task" in `STATE.md`.
2. Remove fixed bugs from `BUGS.md`.
3. Update the affected lines in `CODEMAP.md`.

Keep each file under about 80 lines. These files are summaries; they should link to detail, not repeat it.
