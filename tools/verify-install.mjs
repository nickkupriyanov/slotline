#!/usr/bin/env node
/**
 * End-to-end packaging check:
 *
 *   1. build + `pnpm pack` both library packages (core first — the React
 *      postbuild copies the core stylesheet)
 *   2. copy `tools/install-check` into a scratch app outside the workspace
 *      globs and point its dependencies at the freshly packed tarballs
 *   3. `npm install` the tarballs (with a scratch-local cache)
 *   4. `tsc --noEmit` — proves the shipped `.d.ts` files and `exports` map resolve
 *   5. `vite build` — proves the CSS entry point and both JS entries bundle
 *
 * `pnpm pack` (unlike `npm pack`) rewrites the React package's `workspace:^`
 * dependency on the core to a semver range, so the tarballs install in a clean
 * app. The rewrite is asserted below, not assumed.
 *
 * The packages version independently, so tarball names are derived from each
 * package's own name and version, and the scratch manifest is pointed at them
 * at run time instead of hardcoding file names.
 *
 * Run with `pnpm verify:install`. The scratch app lands in `.verify/app`.
 */
import { spawn } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = join(root, '.verify/app');

/** npm needs the executable plus a writable cache inside the workspace. */
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const cacheDir = join(root, '.verify/npm-cache');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

/** `@scope/name` at `version` → the file name `pnpm pack` produces. */
const tarballName = (name, version) => `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;

/** Build order matters: the React postbuild resolves the core stylesheet. */
const PACKAGES = [];
for (const dir of ['packages/core', 'packages/react']) {
  const manifest = await readJson(join(root, dir, 'package.json'));
  PACKAGES.push({
    label: manifest.name,
    dir: join(root, dir),
    version: manifest.version,
    tarball: tarballName(manifest.name, manifest.version),
  });
}
const core = PACKAGES[0];
const react = PACKAGES[PACKAGES.length - 1];

function run(command, args, cwd) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: process.env });
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} exited with ${code}`)),
    );
  });
}

function capture(command, args, cwd) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done(stdout) : fail(new Error(`${command} ${args.join(' ')}: ${stderr}`)),
    );
  });
}

const step = (message) => console.log(`\n\u001b[1m▸ ${message}\u001b[0m`);

for (const { label, dir, tarball: expected } of PACKAGES) {
  step(`build ${label}`);
  await run('pnpm', ['build'], dir);

  step(`pnpm pack ${label}`);
  for (const file of await readdir(dir)) {
    if (file.endsWith('.tgz')) await rm(join(dir, file));
  }
  await run('pnpm', ['pack'], dir);

  const tarball = (await readdir(dir)).find((file) => file.endsWith('.tgz'));
  if (!tarball) throw new Error(`pnpm pack produced no tarball for ${label}`);
  if (tarball !== expected) {
    throw new Error(`pnpm pack produced ${tarball}, but this script expected ${expected}`);
  }
  console.log(`  → ${tarball}`);
}

step(`assert the packed ${react.label} manifest does not ship "workspace:^"`);
const reactTarball = join(react.dir, react.tarball);
const manifest = JSON.parse(
  await capture(
    'tar',
    ['-xzOf', basename(reactTarball), 'package/package.json'],
    dirname(reactTarball),
  ),
);
const pinned = manifest.dependencies?.[core.label];
if (!pinned) {
  throw new Error(`the packed React manifest has no ${core.label} dependency`);
}
if (pinned.includes('workspace:')) {
  throw new Error(`pnpm pack left "${pinned}" in the tarball — a clean app could not install it`);
}
const allowed = [core.version, `^${core.version}`, `~${core.version}`];
if (!allowed.includes(pinned)) {
  throw new Error(
    `the packed React manifest pins core "${pinned}", expected one of ${allowed
      .map((value) => `"${value}"`)
      .join(', ')}`,
  );
}
console.log(`  → ${core.label} pinned to ${pinned}`);

step('prepare scratch app');
await rm(scratch, { recursive: true, force: true });
await mkdir(scratch, { recursive: true });
await cp(join(root, 'tools/install-check'), scratch, { recursive: true });

// The template deliberately does not pin the library versions: point it at the
// tarballs that were just packed, so this check survives every version bump.
const scratchManifestPath = join(scratch, 'package.json');
const scratchManifest = await readJson(scratchManifestPath);
scratchManifest.dependencies ??= {};
for (const { label, dir, tarball } of PACKAGES) {
  scratchManifest.dependencies[label] = `file:${relative(scratch, join(dir, tarball))}`;
}
await writeFile(scratchManifestPath, `${JSON.stringify(scratchManifest, null, 2)}\n`, 'utf8');
console.log(`  → ${PACKAGES.map((entry) => entry.tarball).join(', ')}`);

step('npm install (tarballs + react + vite)');
await run(npm, ['install', '--no-audit', '--no-fund', '--cache', cacheDir], scratch);

step('tsc --noEmit (consumer types)');
await run('npx', ['tsc', '--noEmit'], scratch);

step('vite build (consumer bundle)');
await run('npx', ['vite', 'build'], scratch);

console.log('\n\u001b[32m✓ packed packages install, typecheck and build in a clean app\u001b[0m');
console.log(`  scratch app: ${scratch.replace(`${root}/`, '')}`);
console.log('  inspect it with: pnpm --dir .verify/app exec vite preview --port 4180\n');
