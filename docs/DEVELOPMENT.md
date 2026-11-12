# Development

## Setup

Run `scripts/setup-hooks` after cloning or moving the checkout.
The [installer](../scripts/setup-hooks.mjs) links the shared hooks and local
check directories into the default Git hooks directory. It does not write Git
configuration. A custom hook or effective hooks path elsewhere blocks setup.
Inspect the conflict instead of replacing it.

The project has no runtime package dependencies or unit-test suite.
The [manifest](../package.json) owns package commands and loader declarations.
The [native gate](../scripts/check.mjs) owns formatter arguments and validation
bounds. Install its local tools and the scanners required by the shared hooks.
Tool names and minimum versions belong to the
[shared checks](../.githooks/lib/checks/push.sh), not this document.

## Validation

Run these commands from the repository root:

```sh
node scripts/check.mjs
node scripts/check.mjs staged
node scripts/check.mjs smoke
markdownlint-cli2 --config .githooks/lib/markdownlint.jsonc AGENTS.md README.md 'docs/*.md'
git diff --check
```

The full gate checks syntax, static lint, source format, JSON shape, locale-key
parity, privacy patterns, distribution, and module registration. Smoke mode runs
the same gate with its mode label. Staged mode reads the selected index, not
unstaged edits. Use the full gate to assess the working tree.

The gate requires Node.js, Deno, and shfmt. It neither installs packages nor
rewrites source. Semantic JavaScript type checks require application runtime
declarations and are outside this gate.

## Hooks

The [pre-commit wrapper](../.githooks/pre-commit.d/20-source) checks the exact
index so partial staging cannot hide invalid source. The
[pre-merge wrapper](../.githooks/pre-merge-commit.d/20-source) applies the same
source gate. The [pre-push wrapper](../.githooks/pre-push.d/20-project) validates
each distinct non-deleted tip, not every intermediate commit.

Shared checks run before repository checks. They enforce secret scans, Markdown
lint, commit structure, signatures, DCO, and applicable security and quality
scans. Missing tools and scanner errors block the relevant gate. The
[commit convention](../.githooks/GIT_CONVENTION.md) owns message rules.
Keep generic entrypoints and `lib/` as shared copies. Put local checks in `.d/`.
Without authorized upstream access, report required shared changes to the
maintainer rather than editing these copies.

## Proof limits

Module smoke proves loader registration and the Host export. It does not prove
rendering, selection, browser storage, asset delivery, or disposal.

For behavior changes, exercise the installed plugin in a local Web UI. Include
selection exclusions, semantic draft nodes, cancellation, command claims,
rejected sends, reload persistence, and cards added during a submission.
Record the observed result and failures. Use local data, not production data.

For documentation/comment-only changes, reread the final text and run lint.
Prove that executable code is unchanged. A live UI run is not a substitute for
that equivalence proof.
