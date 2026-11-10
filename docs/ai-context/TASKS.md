# Tasks

All engineering is done. The post-review backlog status is in `docs/PRODUCTION_PLAN.md` section 7.

## Owner only (needs npm or GitHub access)

Steps are in `docs/DEVELOPMENT.md`, "First release of 3.0" and "Repository settings only the owner can change".

- [x] Push `refactor/v3` (as `next`) and tag `v2.0.1`
- [x] Make npm publishing work: trusted publishing on npmjs.com (must allow `npm publish`, not only stage)
- [ ] Remove `NPM_TOKEN` from `release.yml` and the repository secrets (CI-06)
- [ ] Enable private vulnerability reporting, branch protection, npm two-factor (GitHub Pages is on)
- [ ] GitHub About: description, topics, website `https://pankajbisht.github.io/opendb-store/`; upload `docs/assets/social-preview.png` as the social preview
- [ ] Check on a real iPhone and Android phone
- [x] Publish `3.0.0` (2026-11-10)
- [ ] Reset `next` from `master` before the next pre-release
- [ ] `npm deprecate` old ranges
