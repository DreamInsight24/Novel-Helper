/*
 * Copyright (C) 2026 DreamInsight24 and NovelHelper contributors
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
