/**
 * Test environment for the Angular binding.
 *
 * `@angular/compiler` has to be loaded for the runtime (JIT) compilation of the
 * widget's template, and `TestBed` needs its platform initialised once per test
 * file. Destroying the fixture after each test keeps a leaked controller from
 * bleeding into the next one.
 */
import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach } from 'vitest';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
  teardown: { destroyAfterEach: true },
});

// Angular's own test setups reset the module between tests; a plain Vitest run
// has to ask for it.
afterEach(() => {
  getTestBed().resetTestingModule();
});
