# Conventions

## Locked decisions (owner approved; reasons in `docs/PRODUCTION_PLAN.md` §3)

1. Next release is 3.0.0.
2. Stored format is unchanged: namespace `app`, separator `.`, payload `{value, expire}`.
3. No in-memory value cache. Storage is the source of truth.
4. `createStore(options)` is the main entry; `db.local` and `db.session` are defaults.
5. Import has no side effects; storage resolves lazily and falls back to memory.
6. TypeScript source; generated declarations.
7. Query helpers live in `opendb-store/query`, debug tools in `opendb-store/debug`.
8. Cookies use the same API as `db.cookie`, through `adapters/cookie.ts`.
9. Zero runtime dependencies.
10. Rollup and Vitest. No Webpack, Babel, or Jest.
11. Core budget is 3.5 kB gzipped.

## Code rules

- Operations are `function name(ctx, ...args)`. No `this`, no global state.
- Key layout only in `codec/key.ts`; payload layout only in `codec/entry.ts`.
- Every iteration is scoped to the namespace (`free` and origin percentages are the exception).
- Operations never throw; they return a falsy result and call `ctx.report`.
- Only invalid `createStore` options throw.
- No syntax or APIs newer than ES2020 in `src/`; output is not transpiled further.
- No `console.log`.
- Every bug fix ships with a regression test.

## Commands

```sh
npm test                    # lint + typecheck + unit + coverage gate
npm run test:browser        # Chromium, Firefox, WebKit
npm run check:package       # build + publint + attw + size + smoke
npx vitest run -t "name"    # one test
```

## Git

- Conventional Commits. `fix:` patch, `feat:` minor, `BREAKING CHANGE:` footer major.
- `master` publishes `latest`; `next` publishes a pre-release. Never push unfinished work to either.

## Gotchas

- `src/version.ts` is generated, and changes when the build runs.
- `dist/` is not tracked.
- `tests/compat.test.ts` protects user data. Never loosen it to make a change pass.
- The UMD global relies on named exports, so `db.local` must stay a named export.
- `vi.spyOn` on both the getter and setter of `document.cookie` leaves a mock behind; use `Object.defineProperty`.
- New stores write a probe cookie first, so check `lastCall` when spying on `document.cookie`.
- The window check in `adapters/web.ts` is deliberate: recent Node versions define their own `localStorage`.
