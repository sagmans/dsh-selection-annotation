# Repository guide

## Runtime boundary

The package has separate host (`index.js`) and browser (`client.js`) entries.
The browser entry uses the existing module loader. Do not add runtime packages
without dependency review. Keep exports, the bundle patch, and locale keys
aligned.

## Local gates

After cloning, run `scripts/setup-hooks`. It links the generic hooks, helper
library, and repository check directories into the default Git hooks directory.
It never writes Git configuration. A custom hook or an effective hooks path
elsewhere blocks setup; inspect the conflict instead of replacing it. Run setup
again after moving the checkout, because links point to this checkout.

Run `node scripts/check.mjs` for native syntax, static lint, source-format
hygiene, JSON shape, locale-key parity, privacy, distribution, and
module-registration smoke. Run `node scripts/check.mjs staged` for the exact
staged source. Run `node scripts/check.mjs smoke` for the same full gate with
smoke output. These checks use local Node.js, Deno (`fmt --check` and `lint`),
and shfmt. They do not install packages or modify source. Source formatting uses
single quotes, two-space indentation, and 120 columns. Semantic JavaScript type
checking needs the application runtime declarations; the native gate does not
claim it. Live browser validation remains required.

The unchanged generic hooks require Gitleaks and markdownlint-cli2 at commit.
Push checks also use Semgrep, Lizard, and OSV Scanner when the changed files or
lockfiles need them. Missing scanners and scanner errors block the relevant
gate. Generic checks run before repository checks. Do not bypass hooks with
`--no-verify`.

## Proof and distribution

Before delivery, run the full gate and exercise the plugin in a local Web UI.
Module smoke validates loader registration and the host export, not rendering,
selection, storage, asset HTTP behavior, or disposal. Record those live results.
There are no new unit tests. Keep the distribution allowlist explicit. Do not
ship local paths, credentials, logs, screenshots, hook internals, or development
files. Vendored code remains subject to the generic scanners; do not add blanket
waivers.

## Shared hook maintenance

Generic hook entrypoints and `lib/` are unchanged shared templates. Update them
from the shared template, not in place. Repository-specific checks belong only
in hook `.d/` directories. Pre-commit reads the selected index; pre-push
validates references and runs the full native gate once per distinct non-deleted
pushed tip. Signed commits, DCO, valid commit messages, and all security gates
must pass.
