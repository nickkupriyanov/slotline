/**
 * Post-build step for the Angular binding.
 *
 * The stylesheet is owned by the core and copied into every binding, so
 * `@nickkupriyanov/slotline-angular/styles.css` serves the same bytes as the React
 * entry point. ng-packagr writes its own manifest for `dist`, so the stylesheet
 * entry is added to it here rather than assumed to survive.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

const css = await readFile(resolve(root, '../core/dist/slotline.css'), 'utf8');
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'slotline.css'), css, 'utf8');

const manifestPath = resolve(dist, 'package.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.exports = { ...(manifest.exports ?? {}), './styles.css': './slotline.css' };
manifest.sideEffects = ['**/*.css'];
// `dist` *is* the published root, so a `files` list inherited from the source
// manifest would exclude every built artifact from the tarball.
delete manifest.files;

// `dist` is not a workspace member, so the packed manifest must not carry the
// workspace protocol: the core version is written in as a semver range here.
const coreManifest = JSON.parse(await readFile(resolve(root, '../core/package.json'), 'utf8'));
const coreName = coreManifest.name;
if (manifest.dependencies?.[coreName]) {
  manifest.dependencies[coreName] = `^${coreManifest.version}`;
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log('[slotline-angular] css → dist/slotline.css, exported as ./styles.css');
