# Tasks

All engineering in Phases 0-6 is done. `docs/PRODUCTION_PLAN.md` has the detail.

## Owner only (needs npm or GitHub access)

Steps are in `docs/DEVELOPMENT.md`, "First release of 3.0".

- [ ] Push `refactor/v3` and tag `v2.0.1`
- [ ] Configure npm trusted publishing, then remove `NPM_TOKEN` from `release.yml` (CI-06)
- [ ] Enable GitHub private vulnerability reporting (DOC-03)
- [ ] Publish `3.0.0-next.x` from the `next` branch and confirm the workflows pass
- [ ] Merge to `master` to publish `3.0.0`
- [ ] `npm deprecate` old ranges
