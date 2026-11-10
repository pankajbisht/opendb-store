# Tasks

All engineering is done. The post-review backlog status is in `docs/PRODUCTION_PLAN.md` section 7.

## Owner only (needs npm or GitHub access)

Steps are in `docs/DEVELOPMENT.md`, "First release of 3.0" and "Repository settings only the owner can change".

- [ ] Push `refactor/v3` and tag `v2.0.1`
- [ ] Configure npm trusted publishing, then remove `NPM_TOKEN` from `release.yml` (CI-06)
- [ ] Enable private vulnerability reporting, GitHub Pages, branch protection, npm two-factor
- [ ] Publish `3.0.0-next.x` from `next` and confirm the workflows pass
- [ ] Check on a real iPhone and Android phone
- [ ] Merge to `master` to publish `3.0.0`
- [ ] `npm deprecate` old ranges
