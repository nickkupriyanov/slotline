/**
 * The teaching server is plain JavaScript, so the integration test declares the two
 * methods it uses rather than pulling a `.mjs` file into the TypeScript program.
 */
declare module '*/dev-server/server.mjs' {
  export const RETENTION_MS: number;

  export interface ExampleServerOptions {
    /** A controllable clock, so a test never depends on the day it runs. */
    now?: () => number;
    /** Decides per offer whether the answer is dropped after the record is committed. */
    dropResponses?: (slotId: string) => boolean;
  }

  export interface ExampleServer {
    server: import('node:http').Server;
    state: {
      byKey: Map<string, unknown>;
      takenSlots: Map<string, string>;
    };
    listen(port?: number, host?: string): Promise<import('node:net').AddressInfo>;
    close(): Promise<void>;
  }

  export function createExampleServer(options?: ExampleServerOptions): ExampleServer;
}
