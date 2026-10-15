import { RenderMode, type ServerRoute } from '@angular/ssr';

/**
 * One page, rendered at build time and hydrated on the client — which is exactly
 * the path a consumer's server rendering takes through the widget.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
