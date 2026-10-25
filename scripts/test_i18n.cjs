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

/* Dependency-free runtime contract tests. Browser integration is checked separately. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/novelhelper/web/i18n/i18n.js'), 'utf8'), context);
const i18n = context.i18n;
i18n.register({'common.save': 'Save', hello: 'Hello {name}', literal: '{"items": [...]}'});
assert.equal(i18n.t('hello', {name: '$& <b>Sam</b>'}), 'Hello $& <b>Sam</b>');
assert.equal(i18n.t('hello'), 'Hello {name}');
assert.equal(i18n.t('missing'), 'missing');
assert.equal(i18n.t('literal'), '{"items": [...]}');
i18n.register({'common.cancel': 'Cancel'});
assert.equal(i18n.t('common.save'), 'Save');
i18n.register({'common.save': '保存'});
assert.equal(i18n.t('common.save'), '保存');
function node(attributes, children = []) {
  return {attributes, textContent: '', getAttribute(k) {return this.attributes[k] || null;},
    setAttribute(k,v) {this.attributes[k] = v;}, matches() {return !!this.attributes['data-i18n'];},
    querySelectorAll() {return children.filter(n => n.matches());}};
}
const staticNode = node({'data-i18n': 'common.save'});
i18n.apply(node({}, [staticNode]));
assert.equal(staticNode.textContent, '保存');
const dynamicNode = node({'data-i18n': 'hello', 'data-i18n-params': '{"name":"Sam"}'});
i18n.apply(dynamicNode);
assert.equal(dynamicNode.textContent, 'Hello Sam');
const input = node({'data-i18n': 'common.cancel', 'data-i18n-attr': 'placeholder'});
i18n.apply(input);
assert.equal(input.attributes.placeholder, 'Cancel');
assert.equal(input.textContent, '');
i18n.defaults.version = 'vTest';
i18n.register({title: 'Studio {version}'});
assert.equal(i18n.t('title'), 'Studio vTest');
console.log('[PASS] registration, merging, interpolation, literal braces, fallback, static/dynamic DOM, attributes, defaults');
