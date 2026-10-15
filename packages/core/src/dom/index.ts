/**
 * @nickkupriyanov/slotline-core/dom — the DOM half of the core.
 *
 * Framework-free browser utilities a binding wires to its own lifecycle: element
 * size, media queries, focus, animated height and page visibility. The main entry
 * point does not import this module, and importing it does not touch `window` or
 * `document` until a function is called, so a server can load it safely.
 */

export * from './focus';
export * from './height';
export * from './media';
export * from './size';
export * from './visibility';
