const ENTITY_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

/**
  * Taken from Mustache: https://github.com/janl/mustache.js/blob/master/mustache.js#L60C1-L75C2
  * @param {string} unsafe
  * @returns {string}
  */
export function escapeHtml(unsafe) {
  return unsafe.replace(/[&<>"'`=\/]/g, s => ENTITY_MAP[s]);
}
