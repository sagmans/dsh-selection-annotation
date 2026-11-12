import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createContext, Script } from 'node:vm';

// Bounds keep local gates deterministic without installing project dependencies.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 30_000;
const MAX_FILES = 300;
const MAX_BYTES = 10_000_000;
const SOURCE_EXT = /\.(?:js|mjs|json|yml|svg|md)$/u;
const LOCAL_SHELL = /^(?:scripts\/setup-hooks|\.githooks\/[^/]+\.d\/[^/]+)$/u;
const LOCAL_HOOK_DIRS = ['pre-commit.d', 'pre-merge-commit.d', 'pre-push.d'];
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.githooks']);
const MODES = new Set(['full', 'staged', 'smoke']);
const PRIVACY_PATTERNS = [
  /\/(?:Users|home)\/[A-Za-z0-9_.-]+\//u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u,
];
const UNSAFE_SOURCE = /\b(?:eval\s*\(|new\s+Function\s*\(|document\.write\s*\()/u;
const REQUIRED_FILES = ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'README.md'];
const mode = process.argv[2] ?? 'full';

/** A single boundary error keeps command output useful without printing source secrets. */
class CheckError extends Error {}

/** Native subprocesses are bounded and never invoke a shell. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BYTES,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new CheckError(
      `${command} failed (${result.error?.code ?? result.status}): ${(result.stderr || result.stdout || '').trim()}`,
    );
  }
  return result.stdout;
}

/** Symlinks are rejected so package checks cannot escape this checkout. */
function filesUnder(directory = ROOT) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new CheckError(`symlink is not distributable: ${relative(ROOT, path)}`);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else if (entry.isFile()) files.push(relative(ROOT, path));
    if (files.length > MAX_FILES) throw new CheckError('source file count exceeds validation bound');
  }
  return files;
}

/** Index reads match partial commits rather than unrelated working-tree edits. */
function read(path, staged = false) {
  const text = staged
    ? run('git', ['show', `:${path}`], {
      env: { ...process.env, GIT_INDEX_FILE: process.env.PROJECT_HOOK_INDEX_FILE ?? process.env.GIT_INDEX_FILE },
    })
    : readFileSync(resolve(ROOT, path), 'utf8');
  if (Buffer.byteLength(text) > MAX_BYTES) throw new CheckError(`file exceeds validation bound: ${path}`);
  return text;
}

/** The staged format contract is intentionally small; it never rewrites user changes. */
function checkSource(path, staged) {
  const text = read(path, staged);
  if (!path.startsWith('vendor/')) {
    if (!text.endsWith('\n') || /\r|[\t ]+$/mu.test(text)) {
      throw new CheckError(`format: require LF, final newline, no trailing whitespace: ${path}`);
    }
    if (/^(?:<{7}|={7}|>{7})(?: |$)/mu.test(text)) throw new CheckError(`unresolved conflict: ${path}`);
    if (PRIVACY_PATTERNS.some((pattern) => pattern.test(text))) {
      throw new CheckError(`privacy: sensitive content or personal path in ${path}`);
    }
  }
  if (LOCAL_SHELL.test(path)) {
    run('sh', ['-n'], { input: text });
    run('shfmt', ['-d'], { input: text });
  }
  if (path.endsWith('.json')) JSON.parse(text);
  if (/\.(?:js|mjs)$/u.test(path)) {
    run(process.execPath, ['--input-type=module', '--check'], { input: text });
    if (!path.startsWith('vendor/')) {
      run('deno', [
        'fmt',
        '--check',
        '--no-config',
        '--no-editorconfig',
        '--single-quote',
        '--indent-width',
        '2',
        '--line-width',
        '120',
        '--ext',
        'js',
        '-',
      ], { input: text });
      run('deno', ['lint', '--no-config', '--ext', 'js', '-'], { input: text });
    }
    if (!path.startsWith('vendor/') && !path.startsWith('scripts/') && UNSAFE_SOURCE.test(text)) {
      throw new CheckError(`static lint: dynamic code execution in ${path}`);
    }
  }
}

/** Distribution is an explicit allowlist, not whatever happens to be in a checkout. */
function checkManifestShape(manifest) {
  if (manifest.type !== 'module' || typeof manifest.name !== 'string' || !/^@[^/]+\/[^/]+$/u.test(manifest.name)) {
    throw new CheckError('manifest: require scoped ESM package');
  }
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(manifest.version)) {
    throw new CheckError('manifest: require a valid release version');
  }
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (Object.keys(manifest[key] ?? {}).length) {
      throw new CheckError(`dependency review required: ${key} must remain empty`);
    }
  }
  if (!Array.isArray(manifest.files) || !manifest.files.length) {
    throw new CheckError('manifest: missing distribution allowlist');
  }
}

/** One path policy is shared by every distribution entry. */
function distributionMatches(pattern, files) {
  if (
    typeof pattern !== 'string' || pattern.startsWith('/') || pattern.includes('..') || !/^[\w./*-]+$/u.test(pattern)
  ) throw new CheckError('manifest: unsafe distribution path');
  const matcher = new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '[^/]*')}(?:/.*)?$`,
    'u',
  );
  const matches = files.filter((file) => matcher.test(file));
  if (!matches.length) throw new CheckError(`manifest: empty distribution entry ${pattern}`);
  return matches;
}

/** Files must be explicitly distributable before exports can expose them. */
function checkDistribution(manifest, files) {
  const listed = new Set();
  for (const pattern of manifest.files) {
    const matches = distributionMatches(pattern, files);
    for (const path of matches) {
      if (/^(?:scripts|\.githooks|\.git|node_modules)(?:\/|$)/u.test(path) || /(?:\.env|\.log$|\.tgz$)/u.test(path)) {
        throw new CheckError(`manifest: private tooling in distribution: ${path}`);
      }
      listed.add(path);
    }
  }
  for (const path of REQUIRED_FILES) {
    if (!listed.has(path)) throw new CheckError(`manifest: required artifact not distributed: ${path}`);
  }
  return listed;
}

/** An export must exist in the publishable file set, not only the working tree. */
function checkExports(manifest, files, listed) {
  const targets = Object.values(manifest.exports ?? {});
  if (!targets.length || manifest.exports['.'] !== './index.js' || manifest.exports['./client'] !== './client.js') {
    throw new CheckError('manifest: missing host/client exports');
  }
  for (const target of targets) {
    if (typeof target !== 'string' || !target.startsWith('./')) {
      throw new CheckError('manifest: exports must be local file targets');
    }
    const pattern = target.slice(2);
    const matcher = new RegExp(`^${pattern.replaceAll('.', '\\.').replaceAll('*', '[^/]*')}$`, 'u');
    const matches = files.filter((path) => matcher.test(path));
    if (!matches.length || matches.some((path) => !listed.has(path))) {
      throw new CheckError(`manifest: export missing from distribution: ${target}`);
    }
  }
}

/** Loader and locale shape checks catch incompatible package metadata without runtime packages. */
function checkLoaderMetadata(manifest, files, listed) {
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml' || manifest.dsh?.client?.platform !== 'web') {
    throw new CheckError('manifest: missing bundle/client contract');
  }
  const patch = read('cordis.patch.yml');
  if (!patch.includes(manifest.name)) throw new CheckError('patch package name does not match manifest');
  const locales = files.filter((path) => /^locale\/[^/]+\.json$/u.test(path));
  const localeKeys = locales.map((path) => Object.keys(JSON.parse(read(path))).sort().join('\n'));
  if (locales.length < 2 || new Set(localeKeys).size !== 1) {
    throw new CheckError('locale dictionaries must have matching keys');
  }
  for (const path of files.filter((file) => file.startsWith('vendor/'))) {
    if (!listed.has(path)) throw new CheckError(`vendor asset missing from distribution: ${path}`);
  }
}

/** Keep each failure category independent so scanner complexity remains bounded. */
function checkManifest(files) {
  const manifest = JSON.parse(read('package.json'));
  checkManifestShape(manifest);
  const listed = checkDistribution(manifest, files);
  checkExports(manifest, files, listed);
  checkLoaderMetadata(manifest, files, listed);
  return manifest;
}

/** Smoke the real module registration, not private functions or mocked application state. */
function smoke(manifest) {
  let registrations = 0;
  const loader = {
    load(definition) {
      registrations += 1;
      if (definition.id !== manifest.name || typeof definition.factory !== 'function') {
        throw new CheckError(
          'client loader contract mismatch',
        );
      }
    },
  };
  const context = createContext({ __ModuleLoader__: loader, window: { __ModuleLoader__: loader } });
  new Script(read('client.js'), { filename: 'client.js' }).runInContext(context, { timeout: TIMEOUT_MS });
  if (registrations !== 1) throw new CheckError('client must register exactly once');
  const result = run(process.execPath, [
    '--input-type=module',
    '-e',
    "const m = await import('./index.js'); if (typeof m.apply !== 'function') process.exit(1); console.log('host export OK');",
  ]);
  process.stdout.write(result);
  console.log('client registration OK (browser effects require live UI verification)');
}

try {
  if (!MODES.has(mode) || process.argv.length > 3) {
    throw new CheckError('usage: node scripts/check.mjs [full|staged|smoke]');
  }
  if (mode === 'staged') {
    const output = run('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
      env: { ...process.env, GIT_INDEX_FILE: process.env.PROJECT_HOOK_INDEX_FILE ?? process.env.GIT_INDEX_FILE },
    });
    const paths = output.split('\0').filter((path) =>
      path && (LOCAL_SHELL.test(path) || (SOURCE_EXT.test(path) && !path.startsWith('.githooks/')))
    );
    for (const path of paths) checkSource(path, true);
    console.log(`PASS staged format/lint/syntax/privacy (${paths.length} files)`);
  } else {
    const files = filesUnder();
    const hookFiles = LOCAL_HOOK_DIRS.flatMap((directory) =>
      readdirSync(resolve(ROOT, '.githooks', directory)).map((name) => `.githooks/${directory}/${name}`)
    );
    for (const path of [...files, ...hookFiles].filter((file) => SOURCE_EXT.test(file) || LOCAL_SHELL.test(file))) {
      checkSource(path, false);
    }
    const manifest = checkManifest(files);
    smoke(manifest);
    console.log(`PASS ${mode}: syntax/static lint, JSON shape/locale keys, privacy, distribution, module smoke`);
  }
} catch (error) {
  console.error(`FAIL check (${mode}): ${error.message}`);
  process.exitCode = 1;
}
