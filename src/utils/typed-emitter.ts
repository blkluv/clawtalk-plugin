/**
 * Typed EventEmitter wrapper.
 *
 * Provides compile-time safety for event names and handler signatures.
 * Thin wrapper over Node's EventEmitter.
 */

import { EventEmitter } from 'node:events';

/** Map of event name → handler signature. Uses `any` at the boundary for compatibility. */
// biome-ignore lint/suspicious/noExplicitAny: required for generic event map constraint
export type EventMap = Record<string, (...args: any[]) => void>;

export class TypedEmitter<T extends EventMap> {
  private readonly emitter = new EventEmitter();

  on<K extends keyof T & string>(event: K, handler: T[K]): this {
    this.emitter.on(event, handler);
    return this;
  }

  off<K extends keyof T & string>(event: K, handler: T[K]): this {
    this.emitter.off(event, handler);
    return this;
  }

  once<K extends keyof T & string>(event: K, handler: T[K]): this {
    this.emitter.once(event, handler);
    return this;
  }

  emit<K extends keyof T & string>(event: K, ...args: Parameters<T[K]>): boolean {
    return this.emitter.emit(event, ...args);
  }

  removeAllListeners<K extends keyof T & string>(event?: K): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
}
