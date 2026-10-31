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

// Run with node scripts/test_settings_ui.cjs. No browser or user data required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ i18n: { t: key => key }, window: {addEventListener() {}} });
for (const name of ['core', 'records', 'config']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../app/novelhelper/web/' + name + '.js'), 'utf8'), context);
}
const run = code => vm.runInContext(code, context);
const plain = value => JSON.parse(JSON.stringify(value));
run(`state.db = {sections: {items: [{key: 'world', label: 'World settings', on: true}]}, section_world: {items: []}}`);
assert.deepEqual(plain(run('settingEntries().map(entry => entry.id)')), ['characters', 'inventory', 'section_world', 'world', 'factions', 'items', 'other']);
assert.equal(run(`settingEntries().find(entry => entry.id === 'inventory').parent`), 'characters');
assert.equal(run(`settingEntries().find(entry => entry.id === 'world').parent`), 'section_world');
assert.equal(run(`settingEntries().find(entry => entry.id === 'factions').parent`), 'section_world');
run(`state.db.sections.items.push({key: 'history', label: 'History'}, {key: 'custom', label: 'Custom', on: true});
     state.db.section_history = {items: []}`);
assert.equal(run(`settingEntries().some(entry => entry.id === 'section_history')`), true);
assert.equal(run(`settingEntries().some(entry => entry.id === 'section_custom')`), true);
run(`state.db.section_history.items.push({id: 'kept', name: 'Existing event'})`);
assert.equal(run(`settingEntries().some(entry => entry.id === 'section_history')`), true);
run(`state.db.sections.builtins = {items: {on: true, label: 'Props'}, characters: {on: false}};
     state.db.sections.order = ['items', 'world'];
     state.db.sections = JSON.parse(JSON.stringify(state.db.sections))`);
assert.equal(run('settingEntries()[0].label'), 'Props');
assert.equal(run(`settingEntries().some(entry => entry.id === 'characters')`), false);
assert.equal(run(`settingEntries(true).some(entry => entry.id === 'characters')`), true);

run(`state.db.section_world = {categories: ['Economy', 'History'], items: [
  {id: 'a', name: 'Currency', category: 'Economy', content: 'Keep this text', elements: [{key: 'value', value: '100'}]},
  {id: 'b', name: 'War', category: 'History'}, {id: 'c', name: 'Unsorted'}]}`);
assert.equal(run(`renameRecordCategory(state.db.section_world, 'Economy', 'History')`), false);
assert.equal(run(`state.db.section_world.items[0].category`), 'Economy');
assert.equal(run(`renameRecordCategory(state.db.section_world, 'Economy', 'Trade')`), true);
assert.equal(run(`state.db.section_world.items[0].category`), 'Trade');
assert.equal(run(`matchesRecordFilter(state.db.section_world.items[0], 'currency', 'Trade')`), true);
assert.equal(run(`matchesRecordFilter(state.db.section_world.items[0], 'currency', 'History')`), false);
assert.equal(run(`matchesRecordFilter(state.db.section_world.items[2], '', '')`), true);
run(`renameRecordCategory(state.db.section_world, 'Trade', '')`);
assert.equal(run(`state.db.section_world.items[0].id`), 'a');
assert.equal(run(`state.db.section_world.items[0].content`), 'Keep this text');
assert.equal(run(`state.db.section_world.items[0].elements[0].value`), '100');
assert.equal(run(`matchesRecordFilter(state.db.section_world.items[0], '', '')`), true);
assert.equal(run(`matchesRecordFilter({category: 'Weapon', tags: ['rare', 'rare']}, '', null, 'rare')`), true);
assert.equal(run(`matchesRecordFilter({category: 'Weapon', tags: ['common']}, '', null, 'rare')`), false);
assert.deepEqual(plain(run(`recordTags({tags: ['rare', ' rare ', '', 'common']})`)), ['rare', 'common']);
assert.deepEqual(plain(run(`recordCategoryNames(state.db.section_world)`)), ['History']);

// Port mode stays model-free: auto removes the fixed value; fixed keeps a valid 1-65535 port.
assert.equal(run(`validPortNumber('65535')`), 65535);
assert.equal(run(`validPortNumber('0')`), null);
assert.equal(run(`validPortNumber('1.5')`), null);
assert.equal(run(`validPortNumber('abc')`), null);
run(`providerById = () => ({base_url: '', models: [], default_model: '', default_effort: 'medium'});
     globalThis.autoCfg = {api: {}, server: {host: '127.0.0.1', port: 8765}, writing: {}, paths: {}};
     ensureApiProfiles(globalThis.autoCfg);`);
assert.deepEqual(plain(run(`globalThis.autoCfg.server`)), {host: '127.0.0.1', port_mode: 'auto'});
run(`globalThis.fixedCfg = {api: {}, server: {host: '127.0.0.1', port_mode: 'fixed', port: '9000'}, writing: {}, paths: {}};
     ensureApiProfiles(globalThis.fixedCfg);`);
assert.deepEqual(plain(run(`globalThis.fixedCfg.server`)), {host: '127.0.0.1', port_mode: 'fixed', port: 9000});

// Moving to the front, end, or either side preserves unrelated cards and hidden entries.
const order = ['characters', 'section_world', 'world', 'factions', 'items'];
context.testOrder = order;
assert.deepEqual(plain(run("reorderSettingIds(testOrder, 'characters', 'factions', true)")),
  ['section_world', 'world', 'factions', 'characters', 'items']);
assert.deepEqual(plain(run("reorderSettingIds(testOrder, 'items', 'characters', false)")),
  ['items', 'characters', 'section_world', 'world', 'factions']);
assert.deepEqual(plain(run("reorderSettingIds(testOrder, 'characters', 'items', true)")),
  ['section_world', 'world', 'factions', 'items', 'characters']);
assert.deepEqual(plain(run("reorderSettingIds(testOrder, 'world', 'world', true)")), order);
assert.deepEqual(plain(run("reorderSettingIds(testOrder, 'outside', 'world', false)")), order);
assert.deepEqual(order, ['characters', 'section_world', 'world', 'factions', 'items']);

// Clicking the retained classification button must never invoke the backend.
run(`h = (tag, props, ...children) => ({tag, props: props || {}, children: children.flat().filter(Boolean),
  appendChild(node) { this.children.push(node); }});
  api = () => { throw new Error('Unexpected backend call'); };
  toast = value => { globalThis.lastToast = value; };
  globalThis.main = h('main'); viewSections(main);
  globalThis.find = node => node.props.text === 'sections.auto_sort' ? node :
    node.children.filter(child => typeof child === 'object').map(find).find(Boolean);
  find(main).props.onclick();`);
assert.equal(run('globalThis.lastToast'), 'sections.auto_sort_pending');
const allNodes = node => [node, ...node.children.filter(child => typeof child === 'object').flatMap(allNodes)];
const nodes = allNodes(context.main);
const cards = nodes.filter(node => node.props.class?.split(' ').includes('setting-card'));
assert.equal(cards.length, run('settingEntries(true).length'));
assert.ok(cards.every(card => card.props.draggable === 'true' && typeof card.props.onclick === 'function'));
assert.ok(cards.every(card => typeof card.props.ondrop === 'function' && typeof card.props.onkeydown === 'function'));
assert.ok(!nodes.some(node => node.tag === 'input' && node.props.type === 'text'));
assert.ok(!nodes.some(node => ['sections.open', 'sections.builtin', 'sections.record_section', '↑', '↓'].includes(node.props.text)));
let stopped = false;
nodes.find(node => node.props.class === 'setting-card-controls').props.onclick({stopPropagation() {stopped = true;}});
assert.equal(stopped, true);
console.log('PASS: default navigation, full settings visibility, preferences, categories, filtering, card controls, reordering, and classification placeholder');

const expectedManagementIds = plain(run('settingEntries(true).map(entry => "setting-card-" + entry.id)'));
assert.deepEqual(cards.map(card => card.props.id), expectedManagementIds, 'Management keeps the canonical hierarchy and hidden entries in place');
console.log('PASS: management lists every built-in section in canonical hierarchy order');
