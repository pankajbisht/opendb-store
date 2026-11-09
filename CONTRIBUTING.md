# Contributing

Thanks for helping improve opendb-store.

## Get started

```sh
nvm use
npm ci
npx playwright install chromium firefox webkit
npm test
```

The [development guide](docs/DEVELOPMENT.md) covers every script and how the tests are organised.

## Before opening a pull request

- Add a test for any bug you fix or feature you add, including how it fails.
- Run `npm test`, `npm run test:browser`, and `npm run check:package`.
- If you change the public API, update `README.md` and `docs/API.md`.

## Rules the project holds to

- **No runtime dependencies.** CI fails if any are added.
- **Stored data must keep working.** `tests/compat.test.ts` must keep passing unchanged.
- **Operations do not throw.** They return a falsy result and report through `onError`.
- **Size matters.** The core has a budget in `package.json`; optional features belong in a separate entry
  point.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org), which decide the next
version:

| Prefix | Release |
| --- | --- |
| `fix:` | Patch |
| `feat:` | Minor |
| `BREAKING CHANGE:` in the footer | Major |
| `docs:`, `test:`, `chore:`, `ci:` | None |

## Security issues

Please report these privately. See [docs/SECURITY.md](docs/SECURITY.md#reporting-a-vulnerability).
