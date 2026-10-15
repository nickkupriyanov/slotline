import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app';
import { appConfig } from './app.config';

/**
 * Records what the console reports where a browser check can read it back: Angular
 * logs hydration problems while the application boots, which is before any probe
 * could install a listener.
 */
const problems: string[] = [];
for (const level of ['error', 'warn'] as const) {
  const original = console[level];
  console[level] = (...values: unknown[]) => {
    problems.push(`${level}: ${values.map((value) => String(value)).join(' ')}`);
    original(...values);
  };
}
(window as unknown as { __problems: string[] }).__problems = problems;

bootstrapApplication(App, appConfig).catch((error: unknown) => console.error(error));
