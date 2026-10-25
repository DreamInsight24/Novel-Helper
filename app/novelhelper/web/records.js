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

/* NovelHelper —— 元素树 / 记录编辑 / 导入导出 / 搬运 */
'use strict';

// ═══════════════════════════════════════════
// 元素树工具
// ═══════════════════════════════════════════
function getNode(nodes, path) {
  let current = nodes, item = null;
  for (const idx of path) {
    if (!Array.isArray(current) || idx >= current.length) return null;
    item = current[idx];
    current = item.children || [];
  }
  return item;
}

function walkElements(nodes, fn) {
  (nodes || []).forEach(item => {
    fn(item);
    if (item.children) walkElements(item.children, fn);
  });
}

function renderElementsMd(nodes, indent) {
  indent = indent || 0;
  const pad = '  '.repeat(indent);
  const lines = [];
  (nodes || []).forEach(item => {
    if (item.on === false) return;
    const key = item.key || '';
    if (item.children) {
      const sub = renderElementsMd(item.children, indent + 1);
      if (sub.length) { lines.push(pad + '- ' + key + '：'); lines.push(...sub); }
    } else {
      const value = String(item.value || '').trim();
      if (!value) return;
      if (value.includes('\n')) {
        lines.push(pad + '- ' + key + '：');
        value.split('\n').forEach(sub => lines.push(pad + '  ' + sub.trim()));
      } else {
        lines.push(pad + '- ' + key + '：' + value);
      }
    }
  });
  return lines;
}

/** 元素树 → 嵌套对象：{"外貌": {"整体": {"身高": "170cm"}}}（只算开启且有内容的）。 */
function elementToNested(nodes) {
  const out = {};
  (nodes || []).forEach(item => {
    if (item.on === false) return;
    const key = item.key || '';
    if (item.children) {
      const sub = elementToNested(item.children);
      if (Object.keys(sub).length) out[key] = sub;
    } else {
      const value = String(item.value || '').trim();
      if (value) out[key] = value;
    }
  });
  return out;
}

/** 估算一个值要占几行（避免渲染出来是个带滚动条的小框）。 */
function valueRows(value) {
  const lines = String(value || '').split('\n');
  const est = lines.reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 20)), 0);
  return Math.min(10, Math.max(1, est));
}

function countFilled(nodes) {
  let n = 0;
  walkElements(nodes, item => {
    if (item.on === false) return;
    if (!item.children && String(item.value || '').trim()) n += 1;
  });
  return n;
}

function countAll(nodes) {
  let n = 0;
  walkElements(nodes, () => { n += 1; });
  return n;
}

function applyPreset(nodes, preset) {
  let added = 0;
  (preset || []).forEach(want => {
    const key = (want.key || '').trim();
    if (!key) return;
    const existing = (nodes || []).find(n => (n.key || '').trim() === key);
    if (!existing) {
      const copy = JSON.parse(JSON.stringify(want));
      delete copy.on;
      nodes.push(copy);
      added += 1;
    } else if (want.children) {
      delete existing.value;
      existing.children = existing.children || [];
      added += applyPreset(existing.children, want.children);
    }
  });
  return added;
}

// ═══════════════════════════════════════════
// 元素树编辑器
// ═══════════════════════════════════════════
// 展开状态只存在内存里（WeakSet，跟节点对象绑定），不会写进 JSON。
// 默认是收起的：先看到结构，需要哪一个再展开。
const expandedNodes = new WeakSet();

function elementTree(nodes, coll, opts) {
  opts = opts || {};
  if (!Array.isArray(nodes)) nodes = [];
  const box = h('div', { class: 'tree' });

  const addNode = (path, prefix) => {
    const input = prompt(i18n.t(prefix ? 'elements.new_group_prompt' : 'elements.new_prompt', {group: prefix}));
    if (input === null) return;
    const isGroup = /[\/／]\s*$/.test(input);
    const key = input.replace(/[\/／]\s*$/, '').trim();
    if (!key) return;
    const item = isGroup ? { key, children: [] } : { key, value: '' };
    if (path.length) {
      const target = getNode(nodes, path);
      if (!target) return;
      delete target.value;
      target.children = target.children || [];
      expandedNodes.add(target);
      target.children.push(item);
    } else {
      nodes.push(item);
    }
    if (isGroup) expandedNodes.add(item);
    touch(coll);
    draw();
    if (opts.onChange) opts.onChange();
  };

  const drawNodes = (list, path, depth) => {
    list.forEach((item, idx) => {
      const p = path.concat([idx]);
      const off = item.on === false;
      const isGroup = !!item.children;
      const open = isGroup && expandedNodes.has(item);
      const row = h('div', {
        class: 'tree-row' + (off ? ' off' : '') + (isGroup ? ' group' : ''),
        style: { marginLeft: (depth * 20) + 'px' }
      });
      if (isGroup) {
        row.appendChild(h('button', {
          class: 'ghost mini caret', text: open ? '▾' : '▸', title: i18n.t('elements.toggle_group'),
          onclick: () => {
            if (expandedNodes.has(item)) expandedNodes.delete(item);
            else expandedNodes.add(item);
            draw();
          }
        }));
      } else {
        row.appendChild(h('span', { class: 'caret-space' }));
      }
      row.appendChild(h('input', {
        type: 'checkbox', class: 'tree-toggle', checked: !off,
        title: i18n.t('elements.need_hint'),
        onchange: e => {
          if (e.target.checked) delete item.on; else item.on = false;
          touch(coll);
          draw();
          if (opts.onChange) opts.onChange();
        }
      }));
      row.appendChild(h('input', {
        type: 'text', class: 'key', value: item.key || '',
        oninput: e => { item.key = e.target.value; touch(coll); }
      }));
      if (isGroup && !open) {
        row.appendChild(h('span', { class: 'tag', text: subtreeStat(item) }));
      }
      if (!isGroup && !opts.hideValues) {
        // 值编辑器放在同一行：比另起一行省掉一半高度
        const area = h('textarea', {
          class: 'tree-value', rows: valueRows(item.value),
          placeholder: i18n.t('elements.value_placeholder'),
          oninput: e => { item.value = e.target.value; touch(coll); autoGrow(e.target); }
        });
        area.value = item.value || '';
        row.appendChild(area);
      }
      row.appendChild(h('span', { style: { flex: '1' } }));
      row.appendChild(h('button', {
        class: 'ghost mini', title: i18n.t('elements.add_child'), text: '＋',
        onclick: () => addNode(p, item.key)
      }));
      row.appendChild(h('button', {
        class: 'ghost mini', title: i18n.t('common.move_up'), text: '↑',
        onclick: () => swap(nodes, p, -1)
      }));
      row.appendChild(h('button', {
        class: 'ghost mini', title: i18n.t('common.move_down'), text: '↓',
        onclick: () => swap(nodes, p, 1)
      }));
      row.appendChild(h('button', {
        class: 'ghost mini', title: i18n.t('elements.delete_title'), text: '✕',
        onclick: () => {
          if (!confirm(i18n.t('elements.delete_confirm', { key: item.key || '' }))) return;
          const container = containerOf(nodes, p);
          if (container) container.splice(p[p.length - 1], 1);
          touch(coll);
          draw();
          if (opts.onChange) opts.onChange();
        }
      }));
      box.appendChild(row);

      if (isGroup) {
        if (!open) {
          // 收起：什么都不渲染，只留上面那一行的摘要
        } else if (!item.children.length) {
          box.appendChild(h('div', {
            class: 'muted small', style: { marginLeft: ((depth + 1) * 20) + 'px' }
          }, i18n.t('elements.empty_group')));
        }
        if (open) drawNodes(item.children, p, depth + 1);
      }
    });
  };

  const draw = () => {
    clear(box);
    const mode = state.ui.elemMode || 'doc';
    box.appendChild(h('div', { class: 'tree-toolbar' },
      h('span', { class: 'seg' },
        h('button', {
          class: 'mini' + (mode === 'doc' ? ' seg-on' : ''), text: i18n.t('elements.doc_mode'),
          title: i18n.t('elements.doc_mode_title'),
          onclick: () => { state.ui.elemMode = 'doc'; draw(); }
        }),
        h('button', {
          class: 'mini' + (mode === 'tree' ? ' seg-on' : ''), text: i18n.t('elements.tree_mode'),
          title: i18n.t('elements.tree_mode_title'),
          onclick: () => { state.ui.elemMode = 'tree'; draw(); }
        })),
      h('button', { class: 'mini', text: i18n.t('elements.add_top'), onclick: () => addNode([], '') }),
      mode === 'tree' ? h('button', { class: 'mini', text: i18n.t('elements.expand_all'), onclick: () => { setAll(nodes, true); draw(); } }) : null,
      mode === 'tree' ? h('button', { class: 'mini', text: i18n.t('elements.collapse_all'), onclick: () => { setAll(nodes, false); draw(); } }) : null,
      h('span', { class: 'small muted', style: { marginLeft: '4px' } },
        mode === 'tree' ? i18n.t('elements.tree_hint') : i18n.t('elements.doc_hint'))));
    if (!nodes.length) box.appendChild(h('div', { class: 'muted small', text: i18n.t('elements.empty') }));
    if (mode === 'doc') drawDoc(nodes, [], 0); else drawNodes(nodes, [], 0);
  };

  // 总览（文档）模式：不画树，按「预览输出」的样子一次铺开，只改要改的地方。
  const drawDoc = (list, path, depth) => {
    list.forEach((item, idx) => {
      const p = path.concat([idx]);
      const off = item.on === false;
      const isGroup = !!item.children;
      const line = h('div', {
        class: 'doc-line' + (off ? ' off' : '') + (isGroup ? ' doc-group' : ''),
        style: { marginLeft: (depth * 18) + 'px' }
      });
      line.appendChild(h('input', {
        type: 'checkbox', class: 'tree-toggle', checked: !off,
        title: i18n.t('elements.need_hint'),
        onchange: e => {
          if (e.target.checked) delete item.on; else item.on = false;
          touch(coll); draw(); if (opts.onChange) opts.onChange();
        }
      }));
      line.appendChild(h('span', { class: 'doc-mark', text: isGroup ? '▾' : '–' }));
      line.appendChild(h('span', { class: 'doc-key', text: (item.key || i18n.t('common.unnamed_paren')) + (isGroup ? '' : '：') }));
      if (isGroup) {
        if (!item.children.length) line.appendChild(h('span', { class: 'small muted', text: i18n.t('elements.empty_group') }));
      } else if (!opts.hideValues) {
        const area = h('textarea', {
          class: 'doc-value', rows: valueRows(item.value), placeholder: i18n.t('common.empty_paren'),
          oninput: e => { item.value = e.target.value; touch(coll); autoGrow(e.target); }
        });
        area.value = item.value || '';
        line.appendChild(area);
      }
      const tools = h('span', { class: 'doc-tools' });
      tools.appendChild(h('button', {
        class: 'ghost mini', title: i18n.t('elements.add_child'), text: '＋',
        onclick: () => addNode(p, item.key)
      }));
      tools.appendChild(h('button', {
        class: 'ghost mini', title: i18n.t('elements.delete_title'), text: '✕',
        onclick: () => {
          if (!confirm(i18n.t('elements.delete_confirm', { key: item.key || '' }))) return;
          const container = containerOf(nodes, p);
          if (container) container.splice(p[p.length - 1], 1);
          touch(coll); draw(); if (opts.onChange) opts.onChange();
        }
      }));
      line.appendChild(tools);
      box.appendChild(line);
      if (isGroup) drawDoc(item.children, p, depth + 1);
    });
  };

  const swap = (all, p, delta) => {
    const container = containerOf(all, p);
    const i = p[p.length - 1];
    const t = i + delta;
    if (!container || t < 0 || t >= container.length) return;
    const tmp = container[i];
    container[i] = container[t];
    container[t] = tmp;
    touch(coll);
    draw();
    if (opts.onChange) opts.onChange();
  };

  draw();
  return box;
}

function containerOf(nodes, path) {
  return path.length === 1 ? nodes : ((getNode(nodes, path.slice(0, -1)) || {}).children || null);
}

function setAll(nodes, open) {
  (nodes || []).forEach(item => {
    if (!item.children) return;
    if (open) expandedNodes.add(item);
    else expandedNodes.delete(item);
    setAll(item.children, open);
  });
}

function subtreeStat(item) {
  let total = 0, filled = 0;
  const walk = list => (list || []).forEach(node => {
    if (node.on === false) return;
    if (node.children) walk(node.children);
    else {
      total += 1;
      if (String(node.value || '').trim()) filled += 1;
    }
  });
  walk(item.children || []);
  return i18n.t(filled ? 'elements.stat_line' : 'elements.stat_empty', {total, filled});
}

// ═══════════════════════════════════════════
// 记录列表 + 编辑器
// ═══════════════════════════════════════════
function newRecord(def) {
  const stamp = nowStr();
  const rec = { id: newId(def.idPrefix), name: i18n.t('defaults.record.unnamed'), elements: [], tags: [], created: stamp, updated: stamp };
  if (def.tagLabel) rec.tag = '';
  if (def.notesLabel) rec.notes = '';
  if (def.hasCategory) rec.category = ((state.db[def.coll].categories || [])[0]) || i18n.t('defaults.category.other');
  if (def.hasSlot) rec.slot = ((state.db.equipment.slots || [])[0]) || i18n.t('defaults.category.other');
  if (def.hasContent) rec.content = '';
  if (def.hasInventory) { rec.inventory = []; rec.equipment = []; }
  if (def.hasMembers) rec.members = [];
  rec.elements = JSON.parse(JSON.stringify(presetsOf(def.coll) || []));
  return rec;
}

function viewRecords(main, key) {
  const def = defFor(key);
  if (!def) { main.appendChild(h('div', { class: 'card muted', text: i18n.t('errors.unknown_collection', { name: key }) })); return; }
  if (!state.db[def.coll]) state.db[def.coll] = { items: [], categories: [] };
  const bucket = state.db[def.coll];
  bucket.items = bucket.items || [];
  state.ui[key] = state.ui[key] || { sel: null, q: '' };
  const ui = state.ui[key];
  if (!bucket.items.some(r => r.id === ui.sel)) ui.sel = bucket.items.length ? bucket.items[0].id : null;
  state.sel[key] = state.sel[key] || new Set();

  main.appendChild(pageHead(def.label, def.desc,
    h('div', { class: 'inline' },
      exportButtons(def.coll),
      h('button', {
        class: 'primary', text: i18n.t('records.new', { singular: def.singular }),
        onclick: () => { const rec = newRecord(def); bucket.items.unshift(rec); ui.sel = rec.id; touch(def.coll); renderMain(); }
      }))));

  main.appendChild(importPanel(key === 'other' ? 'md' : 'json', key === 'other'
    ? { title: i18n.t('records.import_title_other'), kinds: ['md', 'json'], target: 'other' }
    : { title: i18n.t('records.import_title', { label: def.label }), kinds: ['json'], target: def.coll }));
  if (key === 'other') main.appendChild(moveBar(def.coll, key));

  const row = h('div', { class: 'row' });
  const listBox = h('div', { class: 'col', style: { flex: '0 0 320px' } });
  const editBox = h('div', { class: 'col' });
  row.appendChild(listBox); row.appendChild(editBox);
  main.appendChild(row);

  // 列表容器只建一次：重绘时复用同一个滚动容器，选中时只切高亮不重建，
  // 这样点条目不会再跳回顶部。
  const listScroll = h('div', { class: 'list scroll' });
  const rowEls = new Map();
  const countLine = h('div', { class: 'small muted', style: { marginBottom: '6px' } });

  const updateCount = () => {
    countLine.textContent = key === 'other' && state.sel[key] && state.sel[key].size
      ? i18n.t('records.count_selected', {total: bucket.items.length, selected: state.sel[key].size})
      : i18n.t('records.total', {count: bucket.items.length});
  };
  const setActive = id => rowEls.forEach((el, rid) => el.classList.toggle('active', rid === id));

  const drawList = () => {
    const keepTop = listScroll.scrollTop;
    clear(listBox);
    rowEls.clear();
    const search = h('input', { type: 'text', placeholder: i18n.t('common.search'), value: ui.q, oninput: e => { ui.q = e.target.value; drawList(); } });
    const q = ui.q.toLowerCase();
    const items = bucket.items.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
    clear(listScroll);
    items.forEach(rec => {
      const rowEl = h('div', {
        class: 'list-item' + (ui.sel === rec.id ? ' active' : ''),
        onclick: () => { ui.sel = rec.id; setActive(rec.id); drawEditor(); }
      });
      if (key === 'other') {
        rowEl.appendChild(h('input', {
          type: 'checkbox', checked: state.sel[key].has(rec.id),
          onclick: e => {
            e.stopPropagation();
            if (e.target.checked) state.sel[key].add(rec.id); else state.sel[key].delete(rec.id);
            updateCount();
          }
        }));
      }
      rowEl.appendChild(h('div', { class: 'name', text: recordName(rec) }));
      const filled = countFilled(rec.elements);
      const meta = [rec.category, filled ? i18n.t('records.filled_suffix', { count: filled }) : ''].filter(Boolean).join(' · ');
      rowEl.appendChild(h('div', { class: 'meta', text: meta }));
      rowEls.set(rec.id, rowEl);
      listScroll.appendChild(rowEl);
    });
    if (!items.length) {
      listScroll.appendChild(h('div', { class: 'muted small', style: { padding: '10px' } }, i18n.t('records.no_match')));
    }
    updateCount();
    listBox.appendChild(h('div', { class: 'card' },
      h('div', { class: 'field' }, search),
      countLine,
      listScroll));
    listScroll.scrollTop = keepTop;
  };

  const drawEditor = () => {
    clear(editBox);
    const rec = bucket.items.find(r => r.id === ui.sel);
    if (!rec) { editBox.appendChild(h('div', { class: 'card muted', text: i18n.t('records.pick_hint') })); return; }
    editBox.appendChild(recordEditor(def, rec, drawList, drawEditor));
  };

  drawList(); drawEditor();
}

function recordEditor(def, rec, onListChange, onEditorChange) {
  const coll = def.coll;
  if (!Array.isArray(rec.elements)) rec.elements = [];
  if (def.hasInventory) { rec.inventory = rec.inventory || []; rec.equipment = rec.equipment || []; }
  if (def.hasMembers) rec.members = rec.members || [];
  const card = h('div', { class: 'card' });
  const title = h('h2', null, recordName(rec), h('span', { class: 'hint', text: i18n.t('records.autosave_hint') }));
  card.appendChild(title);

  card.appendChild(h('div', { class: 'field' },
    h('label', { text: i18n.t('common.name') }),
    h('input', { type: 'text', value: rec.name || '', oninput: e => { rec.name = e.target.value; touch(coll); } })));

  if (def.tagLabel) {
    card.appendChild(h('div', { class: 'field' },
      h('label', { text: def.tagLabel }),
      h('input', { type: 'text', value: rec.tag || '', oninput: e => { rec.tag = e.target.value; touch(coll); } })));
  }

  if (def.hasSlot) {
    card.appendChild(h('div', { class: 'field' },
      h('label', { text: i18n.t('records.slot_label') }),
      h('select', { onchange: e => { rec.slot = e.target.value; touch(coll); } },
        (state.db.equipment.slots || []).map(s => h('option', { value: s, selected: s === rec.slot, text: s })))));
  }

  if (def.hasCategory) {
    const store = state.db[coll];
    store.categories = store.categories || [];
    card.appendChild(h('div', { class: 'field' }, h('label', { text: i18n.t('common.category') }),
      h('div', { class: 'inline' },
        h('select', { onchange: e => { rec.category = e.target.value; touch(coll); } },
          store.categories.map(c => h('option', { value: c, selected: c === rec.category, text: c }))),
        h('button', {
          class: 'mini', text: i18n.t('records.add_category'),
          onclick: () => {
            const v = prompt(i18n.t('records.new_category_prompt'));
            if (!v) return;
            store.categories.push(v); rec.category = v; touch(coll); onEditorChange();
          }
        }))));
  }

  card.appendChild(h('div', { class: 'sep' }));
  const stat = h('span', { class: 'hint' });
  const refreshStat = () => { stat.textContent = i18n.t('records.elem_stat', { total: countAll(rec.elements), filled: countFilled(rec.elements) }); };
  refreshStat();
  card.appendChild(h('div', { class: 'inline' },
    h('label', { text: i18n.t('records.elements_label'), style: { flex: '1' } }),
    stat,
    h('button', {
      class: 'mini', text: i18n.t('records.apply_template'),
      title: i18n.t('records.apply_template_title'),
      onclick: () => {
        const added = applyPreset(rec.elements, presetsOf(coll));
        touch(coll); refreshStat(); onEditorChange();
        toast(added ? i18n.t('records.template_added', { count: added }) : i18n.t('records.template_exists'), 'ok');
      }
    }),
    h('button', {
      class: 'mini', text: i18n.t('records.preview'),
      onclick: () => {
        const lines = ['### ' + recordName(rec)].concat(renderElementsMd(rec.elements, 0));
        if (rec.content) lines.push('', rec.content);
        if (rec.notes) lines.push('', rec.notes);
        modal(i18n.t('records.preview_title', { name: recordName(rec) }),
          h('div', { class: 'md', html: md(lines.join('\n') || i18n.t('common.empty_paren')) }), [h('button', { text: i18n.t('common.close') })]);
      }
    })));
  card.appendChild(elementTree(rec.elements, coll, {
    onChange: () => { refreshStat(); if (onEditorChange) onEditorChange(); }
  }));

  if (def.hasContent) {
    card.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } },
      h('label', { text: i18n.t('records.content_label') }),
      h('textarea', {
        rows: (rec.content || '').length > 400 ? 14 : 6, value: rec.content || '',
        oninput: e => { rec.content = e.target.value; touch(coll); autoGrow(e.target); }
      })));
  }

  if (rec.notes !== undefined) {
    card.appendChild(h('div', { class: 'field' },
      h('label', { text: def.notesLabel || i18n.t('collections.notes') }),
      h('textarea', { rows: 3, value: rec.notes || '', oninput: e => { rec.notes = e.target.value; touch(coll); autoGrow(e.target); } })));
  }

  if (def.hasMembers) {
    card.appendChild(h('div', { class: 'sep' }));
    card.appendChild(h('div', { class: 'field' }, h('label', { text: i18n.t('records.members_label') })));
    card.appendChild(pointerList(rec, 'members', coll, 'characters', 'id', onListChange));
  }

  if (def.hasInventory) {
    card.appendChild(h('div', { class: 'sep' }));
    card.appendChild(h('div', { class: 'small muted', text:
      i18n.t('records.inventory_hint') }));
  }

  card.appendChild(h('div', { class: 'sep' }));
  card.appendChild(h('div', { class: 'inline' },
    rec.source ? h('span', { class: 'tag', text: i18n.t('common.source_prefix', { source: rec.source }) }) : null,
    h('span', { style: { flex: '1' } }),
    h('button', { text: i18n.t('records.move'), onclick: () => moveDialog(coll, [rec.id], () => { onListChange(); onEditorChange(); }) }),
    h('button', {
      class: 'danger', text: i18n.t('common.delete'),
      onclick: () => {
        if (!confirm(i18n.t('common.delete_confirm', { name: recordName(rec) }))) return;
        const list = state.db[coll].items;
        const idx = list.indexOf(rec);
        if (idx >= 0) list.splice(idx, 1);
        touch(coll); onListChange(); onEditorChange();
      }
    })));
  return card;
}

// ═══════════════════════════════════════════
// 指针列表（背包 / 穿戴 / 成员）
// ═══════════════════════════════════════════
function pointerList(rec, listKey, coll, targetColl, idKey, onChange, opts) {
  opts = opts || {};
  const box = h('div');
  const draw = () => {
    clear(box);
    const entries = rec[listKey] = rec[listKey] || [];
    if (!entries.length) box.appendChild(h('div', { class: 'muted small', text: i18n.t('common.empty_paren') }));
    entries.forEach((entry, idx) => {
      const target = findById(targetColl, entry[idKey]);
      const row = h('div', { class: 'inline', style: { marginBottom: '6px' } });
      row.appendChild(h('span', { class: 'tag', text: target ? recordName(target) : i18n.t('records.broken_pointer') }));
      if (opts.qty) {
        row.appendChild(h('input', {
          type: 'number', value: entry.qty == null ? 1 : entry.qty, style: { width: '72px' }, title: i18n.t('records.qty'),
          oninput: e => { entry.qty = e.target.value === '' ? 1 : Number(e.target.value); touch(coll); }
        }));
      }
      row.appendChild(h('input', {
        type: 'text', value: entry.note || '', placeholder: i18n.t('common.note'), style: { flex: '1' },
        oninput: e => { entry.note = e.target.value; touch(coll); }
      }));
      row.appendChild(h('button', {
        class: 'ghost mini', text: '✕',
        onclick: () => { entries.splice(idx, 1); touch(coll); draw(); if (onChange) onChange(); }
      }));
      box.appendChild(row);
    });
    box.appendChild(h('button', {
      class: 'mini', text: i18n.t('records.add_from', { list: opts.pickLabel || i18n.t('common.list') }),
      onclick: () => {
        const options = collItems(targetColl).map(t => ({ value: t.id, label: recordName(t), meta: t.category || '' }));
        if (!options.length) { toast(i18n.t('records.target_empty'), 'err'); return; }
        pickDialog(i18n.t('records.pick_title'), options, id => {
          const entry = { note: '' };
          entry[idKey] = id;
          if (opts.qty) entry.qty = 1;
          entries.push(entry);
          touch(coll); draw(); if (onChange) onChange();
        });
      }
    }));
  };
  draw();
  return box;
}

// ═══════════════════════════════════════════
// 导入 / 导出
// ═══════════════════════════════════════════
function importPanel(defaultKind, opts) {
  opts = opts || {};
  const labels = {
    md: i18n.t('records.md_to_current'),
    json: i18n.t('records.json_to_current')
  };
  const kinds = (opts.kinds || [defaultKind || 'json']).map(id => ({ id, label: labels[id] || id }));
  const target = opts.target || 'other';
  const kindSel = h('select', { onchange: () => drawSources() },
    kinds.map(k => h('option', {
      value: k.id, selected: k.id === (defaultKind || kinds[0].id), text: k.label
    })));
  const sourceSel = h('select');

  const drawSources = () => {
    const kind = kindSel.value;
    const sources = (state.sources || []).filter(s => {
      const path = String(s.path || '').toLowerCase();
      if (kind === 'md') return path.endsWith('.md');
      if (kind === 'json') return path.endsWith('.json');
      return true;
    });
    clear(sourceSel);
    if (!sources.length) {
      sourceSel.appendChild(h('option', { value: '', text: i18n.t('records.no_import_files', { path: state.paths.import || 'workspace/import' }) }));
    } else {
      sources.forEach(s => sourceSel.appendChild(h('option', {
        value: s.path, text: s.path + '（' + Math.max(1, Math.round((s.size || 0) / 1024)) + ' KB）'
      })));
    }
  };
  drawSources();

  const btn = h('button', { class: 'primary', text: i18n.t('common.import') });
  btn.onclick = async () => {
    if (!sourceSel.value) { toast(i18n.t('records.choose_file_first'), 'err'); return; }
    btn.disabled = true;
    status(i18n.t('common.importing'), 'busy');
    try {
      const res = await api('/api/import', {
        method: 'POST',
        body: { kind: kindSel.value, source: sourceSel.value, target }
      });
      setDb(res.collections);
      toast(res.message, 'ok');
      status(i18n.t('records.import_done'), 'ok');
      renderNav(); renderMain();
    } catch (e) {
      toast(i18n.t('records.import_failed_reason', { reason: e.message }), 'err');
      status(i18n.t('records.import_failed'), 'err');
    } finally { btn.disabled = false; }
  };

  return h('details', { class: 'card' },
    h('summary', null, i18n.t('records.import_panel_title', { title: opts.title || i18n.t('common.import'), path: state.paths.import || 'workspace/import' })),
    h('div', { class: 'field', style: { marginTop: '10px' } },
      kindSel,
      sourceSel),
    h('div', { class: 'inline', style: { marginTop: '8px' } }, btn),
    h('div', { class: 'small muted', style: { marginTop: '8px' } },
      target === 'worldmap'
        ? i18n.t('records.map_json_hint')
        : i18n.t('records.json_format_hint')));
}

function exportButtons(coll) {
  return h('div', { class: 'inline' },
    h('button', {
      text: i18n.t('records.export_json'),
      title: i18n.t('records.export_json_title'),
      onclick: async () => {
        try {
          const res = await api('/api/export', { method: 'POST', body: { collection: coll, format: 'json' } });
          toast(i18n.t('common.exported_to', { path: res.rel }), 'ok');
        } catch (e) { toast(i18n.t('common.export_failed_reason', { reason: e.message }), 'err'); }
      }
    }),
    h('button', {
      text: i18n.t('records.export_txt'),
      onclick: async () => {
        try {
          const res = await api('/api/export', { method: 'POST', body: { collection: coll, format: 'txt' } });
          toast(i18n.t('common.exported_to', { path: res.rel }), 'ok');
        } catch (e) { toast(i18n.t('common.export_failed_reason', { reason: e.message }), 'err'); }
      }
    }));
}

function moveBar(coll, key) {
  return h('div', { class: 'card' },
    h('h2', null, i18n.t('records.tidy_title'),
      h('span', { class: 'hint', text: i18n.t('records.tidy_hint') })),
    h('div', { class: 'inline' },
      h('button', {
        class: 'primary', text: i18n.t('records.move_selected'),
        onclick: () => {
          const ids = Array.from(state.sel[key] || []);
          if (!ids.length) { toast(i18n.t('records.select_first'), 'err'); return; }
          moveDialog(coll, ids, () => { state.sel[key].clear(); renderMain(); });
        }
      }),
      h('button', {
        text: i18n.t('records.select_all'),
        onclick: () => { collItems('other').forEach(r => state.sel[key].add(r.id)); renderMain(); }
      }),
      h('button', { text: i18n.t('records.clear_selection'), onclick: () => { state.sel[key].clear(); renderMain(); } })));
}

function moveDialog(fromColl, ids, done) {
  const builtins = [
    ['characters', i18n.t('nav.characters')], ['factions', i18n.t('nav.factions')], ['items', i18n.t('nav.items')],
    ['equipment', i18n.t('nav.equipment')], ['memories', i18n.t('nav.memories')], ['other', i18n.t('nav.other')]
  ].filter(t => t[0] !== fromColl);
  const custom = sectionDefs().map(sec => ['section_' + sec.key, i18n.t('records.custom_prefix', { label: sec.label || sec.key })]);
  const targets = builtins.concat(custom);
  const keepBox = h('input', { type: 'checkbox' });
  const body = h('div', null,
    h('div', { class: 'small muted', text: i18n.t('records.move_desc', { count: ids.length }) }),
    h('label', { class: 'check', style: { marginTop: '8px' } }, keepBox, i18n.t('records.keep_original')));
  const foot = targets.map(t => h('button', {
    text: t[1], dataset: { noclose: '1' },
    onclick: async () => {
      try {
        const res = await api('/api/move', { method: 'POST', body: { from: fromColl, to: t[0], ids, keep: keepBox.checked } });
        setDb(res.collections);
        toast(res.message, 'ok');
        m.close();
        renderNav();
        if (done) done(); else renderMain();
      } catch (e) { toast(i18n.t('records.move_failed_reason', { reason: e.message }), 'err'); }
    }
  }));
  foot.unshift(h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() }));
  const m = modal(i18n.t('records.move'), body, foot);
}
