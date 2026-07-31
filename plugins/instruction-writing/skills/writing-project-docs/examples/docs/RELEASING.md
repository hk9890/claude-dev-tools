# Releasing

## Pre-release checklist

Before cutting a release, verify all of the following:

- [ ] All CI checks green on `main`
- [ ] The release checks pass — [TESTING.md § Checks required before a release](TESTING.md#checks-required-before-a-release)
- [ ] No open issues tagged `release-blocker` for the target version
- [ ] `CHANGELOG.md` updated with changes since last release

## Release notes

Generate a draft from commits since the last tag:

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

Review the output, group changes into **Added**, **Fixed**, **Changed**, and **Removed** sections, and confirm the notes with the team before proceeding.

## Trigger the release

With the checklist complete and the notes approved, tag and push:

```bash
git tag v1.2.3
git push origin v1.2.3
```

This triggers the `release.yml` GitHub Actions workflow, which:

1. Runs the full test suite
2. Builds binaries for all platforms
3. Builds and pushes the Docker image to `ghcr.io/acme/widget-service:v1.2.3`
4. Creates a GitHub Release with the binaries attached

Monitor the run at: `https://github.com/acme/widget-service/actions/workflows/release.yml`

## Deploy

Once the GitHub Release is published, update the image tag in the ops repo:

```
deploy/widget-service/values.yaml  →  image.tag: v1.2.3
```

Open a PR in the ops repo; merge triggers the ArgoCD rollout.
