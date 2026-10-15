import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

/** Zoneless, like every new Angular application. */
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners()],
};
