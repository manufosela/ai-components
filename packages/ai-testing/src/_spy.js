/**
 * Minimal framework-agnostic spy: a function that records all invocations
 * in `.calls` (an array of argument arrays) and delegates to the provided
 * implementation.
 * @template {(...args: any[]) => any} TImpl
 * @param {TImpl} [impl] Underlying implementation. Defaults to a no-op.
 * @returns {TImpl & { calls: any[][], reset: () => void }}
 */
export function spy(impl) {
  const implementation = impl ?? (() => {});
  /**
   * @param  {...any} args
   * @returns {any}
   */
  const fn = (...args) => {
    fn.calls.push(args);
    return implementation(...args);
  };
  fn.calls = /** @type {any[][]} */ ([]);
  fn.reset = () => {
    fn.calls.length = 0;
  };
  return /** @type {any} */ (fn);
}
