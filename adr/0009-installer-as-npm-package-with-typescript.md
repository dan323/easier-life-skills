# ADR 0009 — Installer distributed as an npm package, written in TypeScript

- **Status**: Accepted
- **Date**: 2026-04-24 (npm package introduced), 2026-05-17 (TypeScript migration)
- **Anchor commits**: `b58a499` (initial installer, npm-published), `c1f016e` (TypeScript migration, v1.5.0 → 1.6.0)
- **Scope**: `installer/`

## Context

The marketplace needs a delivery mechanism for `claude plugin install`
flows. Three patterns are common:

1. **Curl-pipe-to-shell installer**: `curl … | sh`. Simple to invoke,
   but well-known security concerns (the script can do anything),
   bad UX on Windows, and the script has to reimplement everything
   in shell.
2. **Per-plugin manual `claude plugin install` snippets in the
   README.** No installer at all — users copy-paste the right
   command. Zero infrastructure cost but no support for bundles,
   no support for synthetic shims (ADR-0001), no `--skill X` /
   `--bundle Y` UX.
3. **npm package, run via `npx`.** Distributed through npm's
   existing infrastructure (versioning, integrity hashes, install
   logs); cross-platform by virtue of being Node; can be a real
   program rather than a shell script.

The package was published as `@dan323/easier-life-skills` from the
very first marketplace commit (`b58a499`). The JS-first iteration
shipped in 2026-04 and grew over the following weeks. By 2026-05 the
installer was non-trivial — argument parsing, dry-run preview,
synthetic shim generation (ADR-0001), cross-marketplace bundle
resolution (ADR-0002) — and the lack of types was starting to bite.

## Decision

**Distribute the installer as an npm package, run via `npx`. Author
the source in TypeScript** under `installer/src/`, with strict
`NodeNext` config emitting to `installer/dist/`.

Concretely:

- The package name is `@dan323/easier-life-skills`. End users run
  `npx @dan323/easier-life-skills` to invoke it; the bin entry is
  `easier-life-skills` mapped to `dist/bin/install.js`.
- Sources live under `installer/src/`, types are strict, and shared
  types are centralised in `installer/src/lib/types.ts`.
- `prepublishOnly` runs the TypeScript build before each publish,
  so the published tarball always contains compiled JS; consumers
  don't need a TS toolchain.
- `installer/dist/` is gitignored — the build is recreated by
  `prepublishOnly` and by the typecheck script. Same principle as
  ADR-0004.
- The root `typecheck` script (`npm run typecheck`) recurses into
  the installer's own `tsconfig.json` so type errors surface in
  one command across the whole repo.
- A dedicated CI workflow (`.github/workflows/installer.yml`)
  runs the installer's typecheck + tests + build on installer-only
  changes, separately from the Pages deploy.

The installer fetches the marketplace index from the deployed Pages
URL by default — the `INDEX_URL` constant points to
`https://dan323.github.io/easier-life-skills/skills_index.json`.
This works because ADR-0004 gitignored the index file: the previously-
used `raw.githubusercontent.com` URL on `master` 404'd after the
file stopped being tracked.

## Consequences

- Cross-platform install works out of the box (Node is the only
  dependency). No platform-specific shell scripts.
- Version pinning is built in. Users can `npx
  @dan323/easier-life-skills@1.6.0` to lock to a known version when
  reproducibility matters.
- Bundle and skill resolution logic is in real code with tests
  (`installer/tests/`), not a shell heredoc. The synthetic shim
  generation (ADR-0001) and the disambiguated skill ref handling
  (ADR-0002) both depend on this.
- Type errors at build time catch contract drift between the
  installer and the marketplace index format before the package
  ships.
- npm publishing is a manual `npm publish` step run by the
  maintainer; not yet automated. The `prepublishOnly` build hook
  prevents publishing an outdated build, but doesn't prevent
  publishing a typo'd version.
- The installer's default `INDEX_URL` is the GitHub Pages URL of
  this repo. Forks need to either set `INDEX_URL` via env var or
  patch the constant before publishing under their own scope.

## Notes

The TypeScript migration in `c1f016e` shipped alongside two related
wins: fixing the broken default `INDEX_URL` (which had pointed at
`raw.githubusercontent.com` since ADR-0004 removed the tracked
index), and adding `marketplacesForSkills` to surface "will register
marketplace(s)" in the CLI preview before install. Each of those
was small but the diff was easier to land alongside the language
migration.

Installer versions 1.5.1 and 1.5.2 were published transitionally
during the migration to verify the npm pipeline before the proper
1.6.0 cut. The `db09bec chore(installer): remove leftover JS
entry-point` follow-up cleaned up the post-migration artefact.

`@dan323/easier-life-skills` is currently at 1.8.0 (the
`73b3b70`/`f368347` chain bumped it as part of the TypeScript work's
follow-ups). The package name does not change across version bumps;
all version-pinning behaviour goes through npm's normal mechanisms.
