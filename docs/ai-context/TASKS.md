# Tasks

All engineering is done. The post-review backlog status is in `docs/PRODUCTION_PLAN.md` section 7.

## Owner only (needs npm or GitHub access)

Steps are in `docs/DEVELOPMENT.md`, "First release of 3.0" and "Repository settings only the owner can change".

- [x] Push `refactor/v3` (as `next`) and tag `v2.0.1`
- [ ] Make npm publishing work: trusted publishing on npmjs.com, or a valid `NPM_TOKEN` secret
- [ ] Publish `3.0.0-next.x` from `next` and confirm the workflows pass
- [ ] Configure npm trusted publishing, then remove `NPM_TOKEN` from `release.yml` (CI-06)
- [ ] Enable private vulnerability reporting, GitHub Pages, branch protection, npm two-factor
- [ ] GitHub About: description, topics, website; upload `docs/assets/social-preview.png` as the social preview
- [ ] Check on a real iPhone and Android phone
- [ ] Merge to `master` to publish `3.0.0`
- [ ] `npm deprecate` old ranges
