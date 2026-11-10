#!/usr/bin/env bash
# Keeps npm, the git tag, the GitHub Release, and the repository on one version.
# Called by .github/workflows/release.yml:
#
#   release.sh guard     before semantic-release: refuse to run for an old commit
#   release.sh verify    after success: check every place shows the new version
#   release.sh rollback  after failure: remove a tag and release commit npm never got
#
# Needs GITHUB_TOKEN, GITHUB_SHA, GITHUB_REF_NAME, and GITHUB_REPOSITORY.
set -euo pipefail

pkg=$(node -p "require('./package.json').name")
remote="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
branch="$GITHUB_REF_NAME"
export GH_TOKEN="$GITHUB_TOKEN"

# semantic-release publishes master to `latest` and a pre-release branch to its own name.
if [ "$branch" = master ]; then dist_tag=latest; else dist_tag="$branch"; fi

remote_sha() { git ls-remote "$remote" "$@" | tail -n1 | cut -f1; }
on_npm() { [ "$(npm view "$pkg@$1" version 2>/dev/null || true)" = "$1" ]; }

guard() {
  local tip
  tip=$(remote_sha "refs/heads/$branch")
  if [ "$tip" != "$GITHUB_SHA" ]; then
    # semantic-release would log "behind the remote" and exit 0 without publishing.
    echo "::error::$branch is now at ${tip:0:7}, but this run is for ${GITHUB_SHA:0:7}. Re-running an old release publishes nothing. Start a new run instead: Actions > Release > Run workflow > $branch."
    exit 1
  fi
}

verify() {
  local tag v i
  tag=$(git tag --points-at HEAD --list 'v*' | head -n1)
  if [ -z "$tag" ]; then
    echo "No releasable commits, so no new version."
    return
  fi
  v=${tag#v}

  # The registry can take a moment to show a new version.
  for i in $(seq 1 20); do
    if on_npm "$v" && [ "$(npm view "$pkg" "dist-tags.$dist_tag" 2>/dev/null || true)" = "$v" ]; then
      break
    fi
    if [ "$i" = 20 ]; then
      echo "::error::npm does not show $pkg@$v under the '$dist_tag' tag."
      exit 1
    fi
    sleep 15
  done

  gh release view "$tag" --repo "$GITHUB_REPOSITORY" --json tagName > /dev/null ||
    { echo "::error::No GitHub Release for $tag."; exit 1; }
  [ "$(remote_sha "refs/tags/$tag" "refs/tags/$tag^{}")" = "$(git rev-parse HEAD)" ] ||
    { echo "::error::Tag $tag on GitHub is not the release commit."; exit 1; }
  [ "$(git show HEAD:package.json | node -p 'JSON.parse(require("fs").readFileSync(0)).version')" = "$v" ] ||
    { echo "::error::package.json in the release commit is not $v."; exit 1; }
  git show HEAD:src/version.ts | grep -q "'$v'" ||
    { echo "::error::src/version.ts in the release commit is not $v."; exit 1; }
  git show HEAD:CHANGELOG.md | head -n1 | grep -qF "[$v]" ||
    { echo "::error::CHANGELOG.md does not start with $v."; exit 1; }

  echo "Released $v: npm ($dist_tag), tag, GitHub Release, package.json, src/version.ts, CHANGELOG.md."
  echo "version=$v" >> "$GITHUB_OUTPUT"
}

rollback() {
  local v tag sha tip
  # @semantic-release/npm has already written the new version here if it got that far.
  v=$(node -p "require('./package.json').version")
  tag="v$v"
  sha=$(remote_sha "refs/tags/$tag" "refs/tags/$tag^{}")

  if [ -z "$sha" ]; then
    echo "semantic-release failed before pushing a tag. Nothing to undo."
    return
  fi
  if on_npm "$v"; then
    echo "::warning::npm has $v, so the tag stays. A later step failed; see the log above."
    return
  fi
  # Only undo what this run made: a release commit on top of the commit it was started for.
  git fetch -q "$remote" "refs/tags/$tag"
  if [ "$(git rev-parse "$sha^")" != "$GITHUB_SHA" ] ||
    [[ "$(git log -1 --format=%s "$sha")" != "chore(release): $v"* ]]; then
    echo "::warning::Tag $tag was not made by this run, so it stays."
    return
  fi

  gh release delete "$tag" --repo "$GITHUB_REPOSITORY" --yes 2> /dev/null || true
  git push -q "$remote" ":refs/tags/$tag"

  tip=$(remote_sha "refs/heads/$branch")
  if [ "$tip" = "$sha" ]; then
    git reset -q --hard "$sha"
    git revert --no-commit "$sha"
    git -c user.name='github-actions[bot]' \
      -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
      commit -q -m "chore(release): undo $v, npm publish failed [skip ci]"
    git push -q "$remote" "HEAD:refs/heads/$branch"
  else
    echo "::warning::$branch has moved on, so revert release commit ${sha:0:7} by hand."
  fi

  echo "::error::npm did not get $v, so tag $tag and its release commit were removed. Fix the error above, then start a new run: Actions > Release > Run workflow > $branch."
}

case "${1:-}" in
  guard | verify | rollback) "$1" ;;
  *)
    echo "usage: release.sh guard|verify|rollback" >&2
    exit 2
    ;;
esac
