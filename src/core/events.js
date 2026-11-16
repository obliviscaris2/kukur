/**
 * Tiny publish/subscribe bus so systems can talk without importing each other.
 *   events.on('bark', (pos) => ...);   events.emit('bark', pup.position);
 * Event names used in the game are listed in docs/ARCHITECTURE.md.
 */
export class EventBus {
  #handlers = new Map();
  on(name, fn) {
    if (!this.#handlers.has(name)) this.#handlers.set(name, new Set());
    this.#handlers.get(name).add(fn);
    return () => this.#handlers.get(name)?.delete(fn);
  }
  emit(name, ...args) {
    for (const fn of this.#handlers.get(name) ?? []) fn(...args);
  }
}
export const events = new EventBus();
