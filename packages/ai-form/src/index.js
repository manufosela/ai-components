// @manufosela/ai-form
// Registers the <ai-form> custom element as a side effect of the import and
// re-exports the class for subclassing / inspection.

import { AIForm } from './ai-form.js';

if (!customElements.get('ai-form')) {
  customElements.define('ai-form', AIForm);
}

export { AIForm };
