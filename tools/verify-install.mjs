#!/usr/bin/env node
/**
 * Packaging check for every published package, in six consumer environments.
 *
 *   1. build + `pnpm pack` core, React and Angular (in that order — the bindings
 *      copy the core stylesheet, and the Angular package is published from the `dist`
 *      ng-packagr owns)
 *   2. build one scratch copy per leg in `.verify/`, each from a template in
 *      `tools/install-check/`: the shared application sources plus the manifest of
 *      that environment, with `file:` references to the tarballs that were packed
 *   3. `npm install` each copy with **its own npm cache**, so no leg can see
 *      another's tree
 *   4. prove the consumer can use what it installed:
 *        - `react-18`, `react-19`: `tsc --noEmit`, a production `vite build`, and a
 *          server render plus client hydration of the widget in jsdom
 *        - `angular-21|22-zoneless`: an AOT production build, and a server render
 *          with prerendering whose HTML must contain the widget
 *        - `angular-21|22-zone`: the same AOT build on zone.js
 *
 * The layouts and the pinned versions come from §9 of `docs/specification.md`; the
 * tarball names are derived from the manifests, never hardcoded.
 *
 * Usage:
 *   node tools/verify-install.mjs                     # pack everything, run all legs
 *   node tools/verify-install.mjs --leg react-18      # one leg
 *   node tools/verify-install.mjs --tarballs .verify/tarballs
 *                                                     # use artifacts packed elsewhere
 *   node tools/verify-install.mjs --pack-only .verify/tarballs
 *                                                     # build, pack and stop
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templates = join(root, 'tools/install-check');
const verifyRoot = join(root, '.verify');

/** npm needs the executable; each leg gets its own cache inside its own copy. */
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/**
 * The legs of §9. `manifest` names the directory under `tools/install-check/` that
 * carries the pinned versions; `template` names the shared application sources.
 */
const LEGS = [
  { name: 'react-18', template: 'react', manifest: 'react-18', kind: 'react' },
  { name: 'react-19', template: 'react', manifest: 'react-19', kind: 'react' },
  {
    name: 'angular-21-zoneless',
    template: 'angular',
    manifest: 'angular-21',
    kind: 'angular',
    ssr: true,
  },
  {
    name: 'angular-21-zone',
    template: 'angular',
    manifest: 'angular-21',
    kind: 'angular',
    buildArgs: ['--configuration', 'zone'],
  },
  {
    name: 'angular-22-zoneless',
    template: 'angular',
    manifest: 'angular-22',
    kind: 'angular',
    ssr: true,
  },
  {
    name: 'angular-22-zone',
    template: 'angular',
    manifest: 'angular-22',
    kind: 'angular',
    buildArgs: ['--configuration', 'zone'],
  },
];

const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

const onlyLeg = option('--leg');
const tarballDir = option('--tarballs');
const packOnly = option('--pack-only');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

/** `@scope/name` at `version` → the file name `pnpm pack` produces. */
const tarballName = (name, version) => `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;

const step = (message) => console.log(`\n\u001b[1m▸ ${message}\u001b[0m`);

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

/* -------------------------------------------------------------------------- */
/*  Pack                                                                       */
/* -------------------------------------------------------------------------- */

/** Builds and packs the libraries; the Angular one comes out of the `dist` it owns. */
async function packLibraries() {
  const packed = [];

  for (const relativeDir of ['packages/core', 'packages/react']) {
    const packageDir = join(root, relativeDir);
    const manifest = await readJson(join(packageDir, 'package.json'));

    step(`build ${manifest.name}`);
    await run('pnpm', ['build'], packageDir);

    step(`pnpm pack ${manifest.name}`);
    for (const file of await readdir(packageDir)) {
      if (file.endsWith('.tgz')) await rm(join(packageDir, file));
    }
    await run('pnpm', ['pack'], packageDir);

    const produced = (await readdir(packageDir)).find((file) => file.endsWith('.tgz'));
    const expected = tarballName(manifest.name, manifest.version);
    if (produced !== expected) {
      throw new Error(`pnpm pack produced ${produced}, but this script expected ${expected}`);
    }
    packed.push({
      label: manifest.name,
      version: manifest.version,
      file: join(packageDir, produced),
    });
    console.log(`  → ${produced}`);
  }

  step('build @nickkupriyanov/slotline-angular');
  await run('pnpm', ['build'], join(root, 'packages/angular'));

  // `publishConfig.directory` points the publish at the `dist` ng-packagr owns, so
  // packing happens in the package itself and pnpm takes the artifact from there.
  const packageDir = join(root, 'packages/angular');
  const dist = join(packageDir, 'dist');
  const manifest = await readJson(join(dist, 'package.json'));

  step(`pnpm pack ${manifest.name}`);
  for (const dir of [packageDir, dist]) {
    for (const file of await readdir(dir)) {
      if (file.endsWith('.tgz')) await rm(join(dir, file));
    }
  }
  await run('pnpm', ['pack'], packageDir);

  // pnpm drops the tarball next to whichever directory it packed, depending on how
  // `publishConfig.directory` is honoured, so both places are searched.
  const produced = [...(await readdir(packageDir)), ...(await readdir(dist))].find((file) =>
    file.endsWith('.tgz'),
  );
  const producedPath = produced
    ? (await readdir(packageDir)).includes(produced)
      ? join(packageDir, produced)
      : join(dist, produced)
    : undefined;
  const expected = tarballName(manifest.name, manifest.version);
  if (!producedPath || produced !== expected) {
    throw new Error(`packing the Angular package produced ${produced}, expected ${expected}`);
  }
  packed.push({ label: manifest.name, version: manifest.version, file: producedPath });
  console.log(`  → ${produced}`);

  return packed;
}

/** Uses the tarballs an earlier job packed, instead of building them again. */
async function collectLibraries(dir) {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.tgz'));
  const packed = [];

  for (const relativeDir of ['packages/core', 'packages/react', 'packages/angular']) {
    const manifest = await readJson(join(root, relativeDir, 'package.json'));
    const expected = tarballName(manifest.name, manifest.version);
    if (!files.includes(expected)) throw new Error(`${expected} is missing from ${dir}`);
    packed.push({ label: manifest.name, version: manifest.version, file: join(dir, expected) });
  }

  return packed;
}

/** A packed manifest must resolve its sibling packages without the workspace protocol. */
async function assertPinned(label, tarball, dependency, version) {
  step(`assert the packed ${label} manifest resolves ${dependency}`);
  const manifest = JSON.parse(
    await capture('tar', ['-xzOf', basename(tarball), 'package/package.json'], dirname(tarball)),
  );
  const pinned = manifest.dependencies?.[dependency];
  if (!pinned) throw new Error(`the packed ${label} manifest has no ${dependency} dependency`);
  if (pinned.includes('workspace:')) {
    throw new Error(`the tarball ships "${pinned}" — a clean app could not install it`);
  }
  const allowed = [version, `^${version}`, `~${version}`];
  if (!allowed.includes(pinned)) {
    throw new Error(
      `the packed ${label} manifest pins ${dependency} to "${pinned}", expected one of ${allowed
        .map((value) => `"${value}"`)
        .join(', ')}`,
    );
  }
  console.log(`  → ${dependency} pinned to ${pinned}`);
}

/* -------------------------------------------------------------------------- */
/*  Legs                                                                       */
/* -------------------------------------------------------------------------- */

const widgetMarker = 'sl-root';

/** The packed React tarball, for the assertions that read its manifest. */
const packedReactTarball = (packed) =>
  packed.find((entry) => entry.label.endsWith('slotline-react')).file;

/** Copies a template, points it at the tarballs and installs it with its own cache. */
async function prepareLeg(leg, packed) {
  const scratch = join(verifyRoot, leg.name);
  step(`prepare the ${leg.name} scratch app`);
  await rm(scratch, { recursive: true, force: true });
  await mkdir(scratch, { recursive: true });
  await cp(join(templates, leg.template), scratch, { recursive: true });
  await cp(join(templates, leg.manifest, 'package.json'), join(scratch, 'package.json'));

  // The template does not pin the library versions, so the tarballs that were just
  // packed take their place — derived from the manifests, never hardcoded.
  const manifestPath = join(scratch, 'package.json');
  const manifest = await readJson(manifestPath);
  const wanted =
    leg.kind === 'react'
      ? ['slotline-core', 'slotline-react']
      : ['slotline-core', 'slotline-angular'];
  for (const entry of packed) {
    if (!wanted.some((fragment) => entry.label.includes(fragment))) continue;
    manifest.dependencies[entry.label] = `file:${relative(scratch, entry.file)}`;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  step(`npm install (${leg.name}, own cache)`);
  await run(
    npm,
    ['install', '--no-audit', '--no-fund', '--cache', join(scratch, 'npm-cache')],
    scratch,
  );

  return scratch;
}

async function runReactLeg(leg, scratch) {
  // Motion is an optional peer: the base entry point has to build without it.
  if (existsSync(join(scratch, 'node_modules/motion'))) {
    throw new Error(`the ${leg.name} scratch app installed motion, which is optional`);
  }

  // Motion is optional, so it is declared as such and exposed as its own entry
  // point; the app above never installs it.
  const manifest = JSON.parse(
    await capture(
      'tar',
      ['-xzOf', basename(packedReactTarball(packed)), 'package/package.json'],
      dirname(packedReactTarball(packed)),
    ),
  );
  if (manifest.exports?.['./motion'] === undefined) {
    throw new Error('the packed React manifest does not export ./motion');
  }
  if (manifest.peerDependenciesMeta?.motion?.optional !== true) {
    throw new Error('the packed React manifest does not mark motion as an optional peer');
  }

  step(`tsc --noEmit (${leg.name} consumer types)`);
  await run('npx', ['tsc', '--noEmit'], scratch);

  step(`vite build (${leg.name} production bundle)`);
  await run('npx', ['vite', 'build'], scratch);

  const assets = await readdir(join(scratch, 'dist/assets'));
  const script = assets.find((file) => file.endsWith('.js'));
  if (!script) throw new Error(`the ${leg.name} build produced no bundle`);
  const contents = await readFile(join(scratch, 'dist/assets', script), 'utf8');
  if (!contents.includes(widgetMarker)) {
    throw new Error(`the ${leg.name} bundle does not contain the widget`);
  }

  step(`server render + hydration in Node (${leg.name})`);
  await run(npm, ['run', 'ssr'], scratch);

  // The page is rebuilt with the server's markup inside `#root`, so the browser
  // hydrates what the server rendered instead of rendering from scratch.
  step(`prerender the page (${leg.name})`);
  await run(npm, ['run', 'prerender'], scratch);

  step(`hydration in a real browser (${leg.name})`);
  await run(
    'node',
    [
      join(root, 'tools/check-hydration.mjs'),
      '--dir',
      join(scratch, 'dist'),
      '--scope',
      '#root',
      '--label',
      leg.name,
    ],
    root,
  );
}

async function runAngularLeg(leg, scratch) {
  step(`ng build (${leg.name})`);
  await run('npx', ['ng', 'build', ...(leg.buildArgs ?? [])], scratch);

  const bundle = await readFile(join(scratch, 'dist/browser/main.js'), 'utf8');
  if (!bundle.includes(widgetMarker)) {
    throw new Error(`the ${leg.name} build does not contain the widget`);
  }

  if (!leg.ssr) return;

  step(`ng build --configuration ssr (${leg.name}: server render + prerender)`);
  await run('npx', ['ng', 'build', '--configuration', 'ssr'], scratch);

  // The prerendered HTML is the server's own rendering of the widget: if the
  // binding reached for a browser global while rendering, this file would not exist.
  const prerendered = await readFile(join(scratch, 'dist-ssr/browser/index.html'), 'utf8');
  if (!prerendered.includes(widgetMarker)) {
    throw new Error(`the ${leg.name} prerendered HTML does not contain the widget`);
  }
  if (!/data-sl-step="date"/.test(prerendered)) {
    throw new Error(`the ${leg.name} prerendered widget did not reach its first step`);
  }

  step(`hydration in a real browser (${leg.name})`);
  await run(
    'node',
    [
      join(root, 'tools/check-hydration.mjs'),
      '--dir',
      join(scratch, 'dist-ssr/browser'),
      '--scope',
      'sl-slotline',
      '--label',
      leg.name,
    ],
    root,
  );
}

/* -------------------------------------------------------------------------- */

const legs = onlyLeg ? LEGS.filter((leg) => leg.name === onlyLeg) : LEGS;
if (legs.length === 0) {
  throw new Error(
    `unknown leg "${onlyLeg}"; known legs: ${LEGS.map((leg) => leg.name).join(', ')}`,
  );
}

const packed = tarballDir ? await collectLibraries(tarballDir) : await packLibraries();

if (packOnly) {
  const target = resolve(root, packOnly);
  await mkdir(target, { recursive: true });
  for (const entry of packed) {
    await cp(entry.file, join(target, basename(entry.file)));
  }
  step(`packed ${packed.length} packages into ${packOnly}`);
  process.exit(0);
}

const core = packed.find((entry) => entry.label.endsWith('slotline-core'));
const react = packed.find((entry) => entry.label.endsWith('slotline-react'));
const angular = packed.find((entry) => entry.label.endsWith('slotline-angular'));

await assertPinned(react.label, react.file, core.label, core.version);
await assertPinned(angular.label, angular.file, core.label, core.version);

for (const leg of legs) {
  const scratch = await prepareLeg(leg, packed);
  if (leg.kind === 'react') await runReactLeg(leg, scratch);
  else await runAngularLeg(leg, scratch);
  console.log(`\u001b[32m✓ ${leg.name}\u001b[0m`);
}

console.log(
  `\n\u001b[32m✓ packed packages install and build in ${legs.length} clean consumer ${
    legs.length === 1 ? 'app' : 'apps'
  }\u001b[0m`,
);
for (const leg of legs) console.log(`  .verify/${leg.name}`);
console.log('');
