// Stub — real mixin lands in a later commit of AIC-TSK-0005.

/**
 * @template {new (...args: any[]) => object} TBase
 * @param {TBase} Base
 * @returns {TBase}
 */
export function VoiceMixin(Base) {
  return class extends Base {};
}
