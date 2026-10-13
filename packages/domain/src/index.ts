/**
 * @embeenexus/domain — the vendor-neutral domain core.
 *
 * This package is pure TypeScript. It imports nothing from NestJS, no
 * database driver, no ORM and no vendor SDK; the only non-relative import is
 * `node:crypto` for token and id generation.
 */

export * from './value-objects/index.js';
export * from './order/index.js';
export * from './dispatch/index.js';
export * from './ports/index.js';
