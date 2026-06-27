// KTC Online Portal release version — shown in the login + portal footers.
//
// Release ritual (so we always know what deployment we're on):
//   1. bump APP_VERSION here (semver-ish: minor for features, patch for fixes),
//   2. add a matching "## vX.Y.Z — date" header in CHANGELOG.md,
//   3. commit, `git tag vX.Y.Z`, push with --tags.
// The commit + build date are stamped automatically at build time
// (vite.config.ts), so even an unbumped deploy is traceable.
export const APP_VERSION = 'v1.6.71'

/** Shown in the footers — just the version, kept clean. */
export const VERSION_LABEL = APP_VERSION

/** Exact build provenance, e.g. "v1.1.0 (3d81eca · 2026-06-13)" — surfaced as a
 *  hover tooltip on the footer version so deploys stay traceable without clutter. */
export const VERSION_FULL = `${APP_VERSION} (${__APP_COMMIT__} · ${__APP_BUILT__})`
