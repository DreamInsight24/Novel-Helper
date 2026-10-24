/* Shared flat catalogs; text-only DOM binding never interprets translations as HTML. */
'use strict';
globalThis.i18n = (() => {
  let messages = Object.create(null);
  const defaults = Object.create(null);
  function register(catalog) { Object.assign(messages, catalog); }
  function t(key, params = {}) {
    const message = Object.hasOwn(messages, key) ? messages[key] : key;
    return String(message).replace(/\{([a-z][a-z0-9_]*)\}/g, (match, name) =>
      Object.hasOwn(params, name) ? String(params[name]) : (Object.hasOwn(defaults, name) ? String(defaults[name]) : match));
  }
  function apply(root) {
    const nodes = [...root.querySelectorAll('[data-i18n]')];
    if (root.matches && root.matches('[data-i18n]')) nodes.unshift(root);
    for (const node of nodes) {
      const params = JSON.parse(node.getAttribute('data-i18n-params') || '{}');
      const value = t(node.getAttribute('data-i18n'), params);
      const attribute = node.getAttribute('data-i18n-attr');
      if (['placeholder', 'title', 'aria-label'].includes(attribute)) node.setAttribute(attribute, value);
      else node.textContent = value;
    }
  }
  async function load(language) {
    const response = await fetch('/api/i18n/' + encodeURIComponent(language));
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    messages = Object.create(null);
    register(data.messages);
    document.documentElement.lang = data.lang;
    return data.lang;
  }
  return { register, t, apply, load, defaults };
})();
function t(key, params) { return i18n.t(key, params); }
