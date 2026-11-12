import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Installation never writes Git configuration or replaces a custom hook.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 10_000;
const MAX_BUFFER = 1_000_000;
const HOOKS = ['pre-commit', 'pre-merge-commit', 'prepare-commit-msg', 'commit-msg', 'pre-push'];
const LINKS = [...HOOKS, 'lib', ...HOOKS.map((hook) => `${hook}.d`)];

/** Installation errors stay at the command boundary, before any replacement. */
class HookInstallError extends Error {}

/** Read-only Git commands respect the effective configuration, including global settings. */
function git(args, allowMissing = false) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER });
  if (allowMissing && result.status === 1 && !result.error) return '';
  if (result.error || result.status !== 0) {
    throw new HookInstallError(`git ${args[0]} failed: ${result.error?.code ?? result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

try {
  if (process.argv.length !== 2) throw new HookInstallError('usage: scripts/setup-hooks');
  const top = realpathSync(git(['rev-parse', '--show-toplevel']));
  if (top !== realpathSync(ROOT)) {
    throw new HookInstallError('run setup only inside this repository, not a parent checkout');
  }
  const common = resolve(ROOT, git(['rev-parse', '--git-common-dir']));
  const destination = join(common, 'hooks');
  const effective = git(['config', '--path', '--get', 'core.hooksPath'], true);
  if (effective && resolve(ROOT, effective) !== destination) {
    throw new HookInstallError('effective core.hooksPath points elsewhere; resolve it manually without this installer');
  }
  if (existsSync(destination) && (lstatSync(destination).isSymbolicLink() || !lstatSync(destination).isDirectory())) {
    throw new HookInstallError('default hooks directory is not a regular directory');
  }
  const plans = [];
  for (const name of LINKS) {
    const source = join(ROOT, '.githooks', name);
    if (!existsSync(source)) continue;
    const target = join(destination, name);
    let existing;
    try {
      existing = lstatSync(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (existing) {
      if (existing.isSymbolicLink() && existsSync(target) && realpathSync(target) === realpathSync(source)) continue;
      // Identical generic files are harmless, but retaining them avoids any replacement.
      if (existing.isFile() && lstatSync(source).isFile() && readFileSync(target).equals(readFileSync(source))) {
        continue;
      }
      throw new HookInstallError(`custom hook or link exists: ${name}; inspect it before installation`);
    }
    plans.push([source, target]);
  }
  // All conflicts are checked before the first filesystem mutation.
  mkdirSync(destination, { recursive: true });
  for (const [source, target] of plans) symlinkSync(source, target);
  console.log(`Installed ${plans.length} default-hook links; Git configuration unchanged.`);
} catch (error) {
  console.error(`FAIL setup-hooks: ${error.message}`);
  process.exitCode = 1;
}
