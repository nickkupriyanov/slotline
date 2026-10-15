import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

/**
 * Zoneless, stated explicitly rather than inherited from the toolchain default —
 * the same widget has to work here and under `zone.js` (see `app.config.zone.ts`),
 * and hydration is what the prerendered HTML below is hydrated by.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideClientHydration(withEventReplay()),
  ],
};
