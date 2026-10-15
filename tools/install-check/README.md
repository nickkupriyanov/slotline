# Consumer templates

Each directory is a manifest for one consumer environment; the application sources
are shared, because §9 of the specification forbids duplicating them:

```
react/       the React application (Vite + TypeScript) and `scripts/ssr-check.mjs`
react-18/    its manifest, pinned to React 18
react-19/    its manifest, pinned to React 19
angular/     the Angular application: one `angular.json` with the zoneless, zone.js
             and SSR configurations, plus the server-side entries
angular-21/  its manifest, pinned to Angular 21.2.0 and TypeScript 5.9.3
angular-22/  its manifest, pinned to Angular 22.2.2 and TypeScript 6.0.3
```

`tools/verify-install.mjs` packs the libraries once, then builds one scratch copy
per leg in `.verify/`, each with its own npm cache, build output and `package.json`
(the template plus the `file:` references to the tarballs that were just packed):

```
.verify/react-18/             tsc --noEmit, vite build, SSR + hydration check
.verify/react-19/             the same
.verify/angular-21-zoneless/  ng build, ng build --configuration ssr
.verify/angular-21-zone/      ng build --configuration zone
.verify/angular-22-zoneless/  ng build, ng build --configuration ssr
.verify/angular-22-zone/      ng build --configuration zone
```

The versions are exact rather than ranged, and each copy resolves its own
`package-lock.json`: a consumer's environment is not the workspace's.
