# Development guide

## Setup

```sh
nvm use      # Node version comes from .nvmrc
npm ci
npx playwright install chromium firefox webkit   # only for browser tests
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Lint, typecheck (including type tests), unit tests with the coverage gate |
| `npm run test:browser` | Tests in real Chromium, Firefox, and WebKit |
| `npm run test:coverage:all` | Coverage across jsdom and real Chromium together |
| `npm run test:examples` | Every example in three browsers and on emulated phones; needs a build |
| `npm run test:csp` | Every bundle under a strict Content Security Policy; needs a build |
| `npm run test:mutation` | Mutation testing; slow, so CI runs it weekly |
| `npm run check:package` | Build, `publint`, type resolution, size budgets, API report, smoke tests |
| `npm run api:update` | Accept a change to the public types into `api/` |
| `npm run bench` | Benchmarks in three browsers; see `bench/README.md` |
| `npm run docs:api` | Generate API docs from the source into `site/api` |
| `npm run demo` | Build, then serve the examples |
| `npm run lint`, `npm run lint:fix` | ESLint |
| `npm run format` | Prettier |

Things to know:

- Tests import `src/`, so no build is needed to run them.
- `dist/` is generated and not tracked.
- `src/version.ts` is generated from `package.json` during the build.
- The pre-commit hook runs lint-staged. The pre-push hook runs `npm test`.
- A change to exported types fails `check:package` until you run `npm run api:update` and commit `api/`. That
  makes every public API change visible in review.

## Tests

| File | Covers |
| --- | --- |
| `tests/contract.test.ts` | Behaviour every backend must share: local, session, cookies, memory |
| `tests/expiry.test.ts` | Expiry boundaries, using fake timers |
| `tests/compat.test.ts` | Reading exact 2.0.1 payloads. Do not weaken this |
| `tests/failures.test.ts` | Quota, corrupt data, blocked storage, option validation |
| `tests/ssr.test.ts` | Running without a `window`, including that nothing is retained |
| `tests/query.test.ts` | Query helpers |
| `tests/cookie.test.ts` | Cookie encoding, attributes, and limits |
| `tests/events.test.ts` | Subscriptions and purging |
| `tests/migrate.test.ts` | Schema migrations |
| `tests/debug.test.ts` | The debug tools |
| `tests/properties.test.ts` | Property-based tests with fast-check, including a store-against-a-map model |
| `tests/types.test.ts` | Compile-time checks of the public types |
| `tests/cache.test.ts`, `tests/react.test.tsx` | The cache and the React hook |
| `tests/additions.test.ts` | Validation, batches, layout upgrades, persistence, and watching adapters |
| `tests/peek.test.ts` | Reading expiry without decoding, including every case that must fall back |
| `tests/compress.test.ts` | Compression round trips, damaged input, size limits, and compressed stores |
| `tests/indexeddb.test.ts` | IndexedDB behaviour; uses `fake-indexeddb` in jsdom and the real thing in browsers |
| `tests/indexeddb-failures.test.ts` | Blocked storage, quota, closed connections, and never rejecting |
| `tests/indexeddb-ssr.test.ts` | IndexedDB without a `window` |
| `tests/security.test.ts` | Injection, tampered data, failure containment, and efficiency guards |
| `tests/browser/` | Real quota, real cookies, and real cross-document events |

## Limits enforced by tooling

- Coverage: at least 95% of lines, statements, and functions, and 90% of branches.
- Size: 4.2 kB gzipped for `dist/opendb-esm.min.js`, 4.6 kB for `dist/indexeddb-umd.min.js`, and 1.5 kB for
  `dist/compress-umd.min.js`.
- `dependencies` in `package.json` must be empty; `scripts/smoke.mjs` checks this.

## Workflows

| Workflow | When | What |
| --- | --- | --- |
| `ci.yml` | Pull requests, and before every release | Tests on Node 22 and 24, real browsers, examples, CSP, coverage, package checks |
| `release.yml` | Push to `master` or `next`, or Run workflow | CI, then semantic-release with provenance, then checks every place shows the new version. Undoes the tag and release commit if npm did not get it |
| `codeql.yml` | Pushes, pull requests, weekly | GitHub code scanning |
| `scorecard.yml` | Push to `master`, weekly | OpenSSF Scorecard supply-chain checks |
| `pages.yml` | After a `master` release, or Run workflow | Publishes the examples and API docs, built from the release tag |
| `quality.yml` | Weekly, or by hand | Mutation testing and benchmarks, as reports |

## Repository settings only the owner can change

- Enable GitHub Pages with the source set to GitHub Actions.
- Protect `master` and `next`: require pull requests and the CI checks to pass.
- Turn on two-factor authentication for the npm account, and set up trusted publishing (see below).
- Enable private vulnerability reporting.

## Commits and releases

Releases are automated by semantic-release, using Conventional Commits:

| Prefix | Release |
| --- | --- |
| `fix:` | Patch |
| `feat:` | Minor |
| `BREAKING CHANGE:` footer | Major |
| `chore:`, `docs:`, `test:`, `ci:` | None |

Pushing to `master` publishes to the `latest` tag once CI passes. Pushing to `next` publishes a pre-release to
the `next` tag. Do unfinished work on another branch.

A release updates every version together, or none of them: npm, the git tag, the GitHub Release, `package.json`,
`src/version.ts`, `CHANGELOG.md`, and for `master` the docs site. `scripts/release.sh` enforces this:

- If npm does not get the version, it deletes the tag and reverts the release commit.
- After a release it checks every place above, and fails the run if one is wrong.

**If a release fails,** fix the cause, then open Actions, Release, Run workflow, and pick the branch. Never use
"Re-run": it runs the old commit, and the workflow now stops it, because semantic-release would publish nothing
and still pass.

## First release of 3.0

These steps need your npm and GitHub access.

1. **Push the tag first.** Without it, semantic-release starts from `v1.5.0`, computes 2.0.0, and fails because
   that version already exists on npm.

   ```sh
   git push origin v2.0.1
   ```

2. **Set up trusted publishing.** On npmjs.com, open the package settings and add a trusted publisher: owner
   `pankajbisht`, repository `opendb-store`, workflow `release.yml`. Then delete the `NPM_TOKEN` line from
   `release.yml` and the repository secret. Until then, the workflow falls back to that secret.

3. **Enable private vulnerability reporting** in the repository's Security settings.

4. **Publish a pre-release** and confirm that the workflows pass. This creates `3.0.0-next.1`.

   ```sh
   git push origin refactor/v3:next
   ```

5. **Try it** with `npm install opendb-store@next` in a real project.

6. **Release.** Open a pull request from `next` to `master` and merge it to publish `3.0.0`.

7. **Point older users to the upgrade.**

   ```sh
   npm deprecate "opendb-store@<3" "Upgrade to 3.x: https://github.com/pankajbisht/opendb-store/blob/master/docs/MIGRATION.md"
   ```

## Adding a method

1. Add a function `name(ctx, …)` in `src/operations/`.
2. Use the helpers in `operations/internal.ts`. Do not build keys or parse values by hand.
3. Report failures with `ctx.report`, and do not throw.
4. Declare it in `Store` in `src/types.ts` and expose it in `src/store.ts`.
5. Add it to `tests/contract.test.ts`, including the failure path, and to [API.md](API.md).
