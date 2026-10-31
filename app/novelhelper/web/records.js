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
    const message=i18n.t(prefix ? 'elements.new_group_prompt' : 'elements.new_prompt', {group:prefix});
    askDialog(message,message,'',input=>{
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
    });
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
          confirmDialog(i18n.t('common.delete'),i18n.t('elements.delete_confirm',{key:item.key || ''}),()=>{
          const container = containerOf(nodes, p);
          if (container) container.splice(p[p.length - 1], 1);
          touch(coll);
          draw();
          if (opts.onChange) opts.onChange();
          });
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
      opts.compact ? null : h('span', { class: 'small muted', style: { marginLeft: '4px' } },
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
          confirmDialog(i18n.t('common.delete'),i18n.t('elements.delete_confirm',{key:item.key || ''}),()=>{
          const container = containerOf(nodes, p);
          if (container) container.splice(p[p.length - 1], 1);
          touch(coll); draw(); if (opts.onChange) opts.onChange();
          });
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
function recordCategoryNames(bucket) {
  return [...new Set([...(bucket.categories || []), ...(bucket.items || []).map(rec => rec.category)]
    .filter(value => typeof value === 'string' && value.trim()))];
}

/** Rename/delete a category without changing record IDs or any content. */
function renameRecordCategory(bucket, from, to) {
  to = to.trim();
  if (to !== from && to && recordCategoryNames(bucket).includes(to)) return false;
  bucket.categories = recordCategoryNames(bucket).map(name => name === from ? to : name).filter(Boolean);
  (bucket.items || []).forEach(rec => { if (rec.category === from) rec.category = to; });
  return true;
}

function matchesRecordFilter(rec, query, category) {
  return (category == null || (rec.category || '') === category)
    && (!query || JSON.stringify(rec).toLowerCase().includes(query.toLowerCase()));
}

function manageRecordCategories(coll, onChange) {
  const bucket = state.db[coll];
  const body = h('div');
  const draw = () => {
    clear(body);
    body.appendChild(h('p', { class: 'small muted', text: i18n.t('records.category_help') }));
    recordCategoryNames(bucket).forEach(name => {
      const input = h('input', { type: 'text', value: name, 'aria-label': i18n.t('common.category') });
      body.appendChild(h('div', { class: 'inline category-manage-row' }, input,
        h('button', { text: i18n.t('common.save'), onclick: () => {
          const value = input.value.trim();
          if (!value) { toast(i18n.t('records.category_name_required'), 'err'); return; }
          if (!renameRecordCategory(bucket, name, value)) { toast(i18n.t('records.category_exists'), 'err'); return; }
          touch(coll); onChange(); draw();
        }}),
        h('button', { class: 'danger', text: i18n.t('common.delete'), onclick: () => {
          confirmDialog(i18n.t('common.delete'), i18n.t('records.category_delete_confirm', { name }), () => {
            renameRecordCategory(bucket, name, ''); touch(coll); onChange();
            manageRecordCategories(coll, onChange);
          });
        }})));
    });
    const input = h('input', { type: 'text', placeholder: i18n.t('records.new_category_prompt'),
      'aria-label': i18n.t('records.new_category_prompt') });
    const add = () => {
      const name = input.value.trim();
      if (!name) { toast(i18n.t('records.category_name_required'), 'err'); return; }
      if (recordCategoryNames(bucket).includes(name)) { toast(i18n.t('records.category_exists'), 'err'); return; }
      bucket.categories = recordCategoryNames(bucket).concat(name);
      touch(coll); onChange(); draw();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    body.appendChild(h('div', { class: 'inline category-manage-row' }, input,
      h('button', { text: i18n.t('records.add_category'), onclick: add })));
  };
  draw();
  modal(i18n.t('records.manage_categories'), body, [h('button', { text: i18n.t('common.close') })]);
}

function newRecord(def) {
  const stamp = nowStr();
  const rec = { id: newId(def.idPrefix), name: i18n.t('defaults.record.unnamed'), elements: [], tags: [], created: stamp, updated: stamp };
  if (def.tagLabel) rec.tag = '';
  if (def.notesLabel) rec.notes = '';
  if (def.hasCategory) rec.category = '';
  if (def.hasSlot) rec.slot = ((state.db.equipment.slots || [])[0]) || i18n.t('defaults.category.other');
  if (def.hasContent) rec.content = '';
  if (def.hasInventory) { rec.inventory = []; rec.equipment = []; }
  if (def.hasMembers) rec.members = [];
  rec.content = '';
  rec.summary = '';
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
  ui.q = ui.q || '';
  if (!bucket.items.some(r => r.id === ui.sel)) ui.sel = bucket.items.length ? bucket.items[0].id : null;
  state.sel[key] = state.sel[key] || new Set();

  main.appendChild(pageHead(settingLabel(key, def.label), '',
    h('div', { class: 'inline' },
      guidanceButton(i18n.t('records.help_title'), i18n.t('records.edit_guidance')),
      exportButtons(def.coll),
      aiSettingGenButton(def),
      h('button', {class:'primary', text:i18n.t('records.new', {singular:def.singular}),
        onclick:() => showRecordCreate(def, rec => {
          if (def.hasCategory && ui.category != null) rec.category = ui.category;
          bucket.items.unshift(rec); ui.sel=rec.id; ui.q=''; touch(def.coll); renderNav(); renderMain();
        })}))));
  if (key === 'other') main.appendChild(moveBar(def.coll, key));

  const row = h('div', { class: 'row' });
  const listBox = h('div', { class: 'col record-list-column' });
  const editBox = h('div', { class: 'col record-editor-column' });
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
      : ui.q || ui.category != null
        ? i18n.t('records.count_filtered', {
          shown: bucket.items.filter(rec => matchesRecordFilter(rec, ui.q, ui.category)).length,
          total: bucket.items.length
        })
        : i18n.t('records.total', {count: bucket.items.length});
  };
  const setActive = id => rowEls.forEach((el, rid) => el.classList.toggle('active', rid === id));

  const drawList = () => {
    const keepTop = listScroll.scrollTop;
    rowEls.clear();
    const q = ui.q.toLowerCase();
    const items = bucket.items.filter(r => matchesRecordFilter(r, q, ui.category));
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
      // 空状态也要有 AI 生成入口（仅当栏目确实为空，搜索无结果时不出现）。
      if (!bucket.items.length) {
        listScroll.appendChild(h('div', { class: 'inline', style: { padding: '0 10px 10px' } },
          aiSettingGenButton(def)));
      }
    }
    updateCount();
    listScroll.scrollTop = keepTop;
  };

  const drawEditor = () => {
    clear(editBox);
    const rec = bucket.items.find(r => r.id === ui.sel);
    if (!rec) { editBox.appendChild(h('div', { class: 'card muted', text: i18n.t('records.pick_hint') })); return; }
    editBox.appendChild(recordEditor(def, rec, drawList, drawEditor));
  };

  const chooseVisible = () => {
    const visible = bucket.items.filter(rec => matchesRecordFilter(rec, ui.q, ui.category));
    if (!visible.some(rec => rec.id === ui.sel)) ui.sel = visible[0]?.id || null;
    drawList(); drawEditor();
  };
  const search = h('input', { type: 'text', placeholder: i18n.t('common.search'),
    'aria-label': i18n.t('common.search'), value: ui.q,
    oninput: e => { ui.q = e.target.value; chooseVisible(); } });
  const listCard = h('div', { class: 'card' }, h('div', { class: 'field' }, search));
  if (def.hasCategory) {
    const names = recordCategoryNames(bucket);
    if (ui.category && !names.includes(ui.category)) ui.category = null;
    listCard.appendChild(h('div', { class: 'field' },
      h('label', { text: i18n.t('common.category') }),
      h('select', { value: JSON.stringify(ui.category ?? null),
        onchange: e => { ui.category = JSON.parse(e.target.value); chooseVisible(); },
        'aria-label': i18n.t('records.filter_category')
      }, [[null, i18n.t('records.all_categories')], ['', i18n.t('records.uncategorized')],
        ...names.map(name => [name, name])].map(([value, label]) => h('option', {
          value: JSON.stringify(value), selected: value === (ui.category ?? null), text: label
        }))),
      h('button', { class: 'mini', text: i18n.t('records.manage_categories'),
        onclick: () => manageRecordCategories(def.coll, () => renderMain()) })));
  }
  listCard.append(countLine, listScroll);
  listBox.appendChild(listCard);
  chooseVisible();
}

function showRecordCreate(def, onCreate) {
  const name = h('input', {type:'text', id:'record-create-name', maxlength:160, 'aria-label':i18n.t('common.name')});
  const summary = h('input', {type:'text', id:'record-create-summary', 'aria-label':i18n.t('records.summary')});
  const content = h('textarea', {rows:7, id:'record-create-content', 'aria-label':i18n.t('records.prose'), placeholder:i18n.t('records.prose_placeholder')});
  const create = () => {
    if (!name.value.trim()) { name.focus(); toast(i18n.t('records.name_required'), 'err'); return; }
    const rec = newRecord(def); rec.name=name.value.trim(); rec.summary=summary.value.trim(); rec.content=content.value;
    dialog.close(); onCreate(rec);
  };
  const dialog = modal(i18n.t('records.new', {singular:def.singular}), h('div', {class:'record-create-form'},
    h('div', {class:'field'}, h('label', {for:'record-create-name', text:i18n.t('common.name')}), name),
    h('div', {class:'field'}, h('label', {for:'record-create-summary', text:i18n.t('records.summary')}), summary),
    h('div', {class:'field'}, h('label', {for:'record-create-content', text:i18n.t('records.prose')}), content)), [
      h('button', {text:i18n.t('common.cancel'), onclick:() => dialog.close()}),
      h('button', {class:'primary', text:i18n.t('records.create'), dataset:{noclose:'1'}, onclick:create})]);
  dialog.dlg.classList.add('record-create-dialog'); name.focus();
}

// The faction owns membership. Characters display the reverse lookup without a second list.
function factionMemberLinks(faction) {
  const roles = faction.member_roles || {};
  const links = new Map();
  (faction.members || []).forEach(member => {
    const id = typeof member === 'string' ? member : member?.id;
    if (id && !links.has(id)) links.set(id, {id, note:roles[id] || (typeof member === 'object' && member.note) || ''});
  });
  return Array.from(links.values());
}

function updateFactionMembership(faction, characterId, note = '', remove = false) {
  const links = factionMemberLinks(faction).filter(link => !remove || link.id !== characterId);
  if (!remove) {
    const found = links.find(link => link.id === characterId);
    if (found) found.note = note; else links.push({id:characterId, note});
  }
  faction.members = links.map(link => link.id);
  faction.member_roles = Object.fromEntries(links.filter(link => link.note).map(link => [link.id,link.note]));
}

function recordRelations(def, rec, onEditorChange) {
  return relationEditor({collection:def.coll,id:rec.id}, onEditorChange);
}

function recordEditor(def, rec, onListChange, onEditorChange) {
  const coll = def.coll;
  rec.elements = rec.elements || [];
  const card = h('div', {class:'card record-detail'});
  const tabs = state.ui.recordTabs = state.ui.recordTabs || {};
  const tabKey = coll + ':' + rec.id, active = tabs[tabKey] || 'content';
  const title = h('input', {class:'record-name-input', value:rec.name || '', 'aria-label':i18n.t('common.name'),
    oninput:e => {rec.name=e.target.value; touch(coll); onListChange();}});
  card.appendChild(h('div', {class:'record-detail-head'}, title, h('span', {class:'small muted', text:i18n.t('records.autosave_hint')})));
  card.appendChild(h('div', {class:'record-tabs', role:'tablist', 'aria-label':i18n.t('records.editor_tabs')},
    ['content','relations','more'].map(tab => h('button', {role:'tab', 'aria-selected':String(active === tab), class:active === tab ? 'active' : '',
      text:i18n.t('records.tab_' + tab), onclick:() => {tabs[tabKey]=tab; onEditorChange();}}))));
  const body = h('div', {class:'record-tab-body', role:'tabpanel'}); card.appendChild(body);
  const field = (label, key, rows) => h('div', {class:'field'}, h('label', {text:label}), h(rows ? 'textarea' : 'input', {
    type:rows ? null : 'text', rows:rows || null, value:rec[key] || '', 'aria-label':label,
    oninput:e => {rec[key]=e.target.value; touch(coll); if(rows) autoGrow(e.target);}
  }));
  if (active === 'relations') body.appendChild(recordRelations(def,rec,onEditorChange));
  else if (active === 'more') {
    if (def.tagLabel) body.appendChild(field(def.tagLabel,'tag'));
    if (def.hasCategory) {
      const categories = recordCategoryNames(state.db[coll]);
      body.appendChild(h('div', {class:'field'}, h('label', {text:i18n.t('common.category')}),
        h('div', {class:'inline'}, h('select', {'aria-label':i18n.t('common.category'), onchange:e => {rec.category=e.target.value; touch(coll); onListChange();}},
          ['',...categories].map(value => h('option', {value,selected:value === (rec.category || ''),text:value || i18n.t('records.uncategorized')}))),
          h('button', {class:'mini',text:i18n.t('records.add_category'),onclick:() => askDialog(i18n.t('records.add_category'),i18n.t('common.name'),'',value => {
            const name=value.trim(); if(!name) return;
            state.db[coll].categories=Array.from(new Set([...categories,name]));rec.category=name;touch(coll);onListChange();onEditorChange();
          })}))));
    }
    if (def.hasSlot) body.appendChild(h('div', {class:'field'}, h('label', {text:i18n.t('records.slot_label')}),
      h('select', {'aria-label':i18n.t('records.slot_label'), onchange:e=>{rec.slot=e.target.value;touch(coll);}},
        (state.db.equipment.slots || []).map(value=>h('option',{value,selected:rec.slot===value,text:value})))));
    body.appendChild(field(def.notesLabel || i18n.t('collections.notes'),'notes',4));
    if (rec.source) body.appendChild(h('div', {class:'small muted',text:i18n.t('common.source_prefix',{source:rec.source})}));
    body.appendChild(h('div', {class:'record-more-actions'},
      h('button', {text:i18n.t('records.edit_structure'),onclick:() => {
        const dialog=modal(i18n.t('records.edit_structure'),elementTree(rec.elements,coll,{onChange:()=>{onListChange();onEditorChange();}}),[
          h('button',{text:i18n.t('common.close'),onclick:()=>{dialog.close();onListChange();onEditorChange();}})]);
      }}),
      h('button', {text:i18n.t('records.move'),onclick:()=>moveDialog(coll,[rec.id],()=>{onListChange();onEditorChange();})}),
      h('button', {class:'danger',text:i18n.t('common.delete'),onclick:()=>confirmDialog(i18n.t('common.delete'),i18n.t('common.delete_confirm',{name:recordName(rec)}),()=>{
        state.db[coll].items=state.db[coll].items.filter(item=>item.id!==rec.id);touch(coll);onListChange();onEditorChange();
      })})));
  } else {
    body.appendChild(field(i18n.t('records.summary'),'summary'));
    body.appendChild(h('div', {class:'field'}, h('label', {text:i18n.t('records.prose')}),h('textarea',{
      class:'record-prose',rows:8,value:rec.content || '',placeholder:i18n.t('records.prose_placeholder'),'aria-label':i18n.t('records.prose'),
      oninput:e=>{rec.content=e.target.value;touch(coll);autoGrow(e.target);}
    })));
    const renderFields = (nodes, parent='') => h('div',{class:'record-fields'},nodes.filter(node=>node.on!==false).map(node=>{
      const label=parent ? parent+' · '+node.key : node.key;
      if(node.children) return renderFields(node.children,label);
      return h('div',{class:'field'},h('label',{text:label}),h('textarea',{rows:Math.min(5,valueRows(node.value)),value:node.value || '',
        'aria-label':label,oninput:e=>{node.value=e.target.value;touch(coll);autoGrow(e.target);}}));
    }));
    rec.elements.filter(node=>node.on!==false).forEach((node,index)=>{
      if(node.children) body.appendChild(h('details',{class:'record-field-group',open:countFilled(node.children)>0 || state.ui.recordNewGroup===coll+':'+rec.id+':'+node.key},h('summary',{text:node.key}),renderFields(node.children)));
      else body.appendChild(renderFields([node]));
    });
    body.appendChild(h('button',{class:'mini',text:i18n.t('records.add_group'),onclick:()=>{
      const options=(presetsOf(coll)||[]).filter(node=>!rec.elements.some(existing=>existing.key===node.key));
      if(!options.length){toast(i18n.t('records.no_more_groups'));return;}
      pickDialog(i18n.t('records.add_group'),options.map((node,index)=>({value:index,label:node.key})),index=>{
        applyPreset(rec.elements,[options[index]]);state.ui.recordNewGroup=coll+':'+rec.id+':'+options[index].key;touch(coll);onEditorChange();
      });
    }}));
  }
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
      await flushPendingSaves();
      const res = await api('/api/import', {
        method: 'POST',
        body: { kind: kindSel.value, source: sourceSel.value, target }
      });
      setDb(res.collections);
      if (opts.onSuccess) opts.onSuccess();
      toast(res.message, 'ok');
      status(i18n.t('records.import_done'), 'ok');
      renderNav(); renderMain();
    } catch (e) {
      toast(i18n.t('records.import_failed_reason', { reason: e.message }), 'err');
      status(i18n.t('records.import_failed'), 'err');
    } finally { btn.disabled = false; }
  };

  if (opts.compact) {
    const input=h('input',{type:'file',accept:target==='other'?'.json,.md':'.json',hidden:true,onchange:async e=>{
      const file=e.target.files?.[0];if(!file)return;
      const novel=state.activeNovelId;
      try {
        const kind=/\.md$/i.test(file.name)?'md':'json';
        if(!kinds.some(option=>option.id===kind))return;
        const content=(await file.text()).replace(/^\uFEFF/,'');
        if(novel!==state.activeNovelId)return;
        const path=(state.paths.import || 'workspace/import').replace(/[\\/]+$/,'')+'/'+newId('import')+(kind==='md'?'.md':'.json');
        await api('/api/io/save',{method:'POST',body:{path,content}});
        kindSel.value=kind;
        sourceSel.appendChild(h('option',{value:path,text:file.name,selected:true}));sourceSel.value=path;
      }catch(error){toast(error.message,'err');}
    }});
    return h('div',{class:'settings-import-fields'},input,
      h('div',{class:'field'},h('label',{text:i18n.t('records.import_format')}),kindSel),
      h('div',{class:'field'},h('label',{text:i18n.t('records.import_source')}),sourceSel),
      h('div',{class:'inline'},h('button',{text:i18n.t('records.pick_import_file'),onclick:()=>input.click()}),btn));
  }

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

// ═══════════════════════════════════════════
// AI 设定生成
// ═══════════════════════════════════════════
// 最近一次生成结果（含 batch_id）：离开页面前提供"撤销本次生成"。
let lastAiBatch = null;

function aiTargetLabel(target) {
  return settingLabel(target, (defFor(target) || {}).label || target);
}

function aiSettingGenButton(def) {
  return h('button', {
    text: i18n.t('setting_gen.button'),
    title: i18n.t('setting_gen.notice'),
    onclick: () => aiSettingGenDialog(def)
  });
}

function showAiSettingGenResult(batch) {
  const body = h('div', { class: 'setting-gen-result' });
  const summary = batch.summary || {};
  body.appendChild(h('p', { text: i18n.t('setting_gen.added', { added: summary.added || 0, skipped: summary.skipped || 0 }) }));
  const itemRow = (item, note) => h('div', { class: 'gen-item' },
    h('span', { class: 'gen-item-name',
      text: (item.target ? aiTargetLabel(item.target) + ' · ' : '') + (item.name || i18n.t('setting_gen.unnamed_item')) }),
    note ? h('span', { class: 'small muted', text: ' —— ' + note }) : null);
  const reasonLabels = {
    duplicate: () => i18n.t('setting_gen.reason_duplicate'),
    unknown_target: () => i18n.t('setting_gen.reason_unknown'),
    disabled: () => i18n.t('setting_gen.reason_disabled'),
    invalid: () => i18n.t('setting_gen.reason_invalid'),
    empty: () => i18n.t('setting_gen.reason_empty'),
    overflow: () => i18n.t('setting_gen.reason_overflow')
  };
  const addedItems = summary.added_items || [];
  if (addedItems.length) {
    body.appendChild(h('p', { class: 'gen-section', text: i18n.t('setting_gen.added_section') }));
    addedItems.forEach(item => body.appendChild(itemRow(item,
      item.dropped_fields ? i18n.t('setting_gen.field_drops', { n: item.dropped_fields }) : '')));
  }
  const droppedItems = summary.dropped_items || [];
  if (droppedItems.length) {
    body.appendChild(h('p', { class: 'gen-section', text: i18n.t('setting_gen.dropped_section') }));
    droppedItems.forEach(item => body.appendChild(itemRow(item,
      (reasonLabels[item.reason] || reasonLabels.empty)())));
  }
  const undoLine = h('p', { class: 'small', style: { color: 'var(--ok, #2e7d32)' } });
  body.appendChild(undoLine);
  const undoBtn = h('button', {
    text: i18n.t('setting_gen.undo'), dataset: { noclose: '1' },
    onclick: async () => {
      undoBtn.disabled = true;
      try {
        const res = await api('/api/ai/setting-gen/undo', { method: 'POST', body: {} });
        setDb(res.collections);
        renderNav(); renderMain();
        lastAiBatch = null;
        undoBtn.remove();
        undoLine.textContent = i18n.t('setting_gen.undo_done', { removed: res.removed || 0, kept: res.kept || 0 });
        i18n.apply(undoLine);
      } catch (e) {
        undoBtn.disabled = false;
        toast(i18n.t('setting_gen.undo_failed_reason', { reason: e.message }), 'err');
      }
    }
  });
  const m = modal(i18n.t('setting_gen.result_title'), body, [
    h('button', { text: i18n.t('common.close') }),
    undoBtn
  ]);
  m.dlg.classList.add('setting-gen-result');
}

function aiSettingGenDialog(def) {
  const textarea = h('textarea', {
    id: 'setting-gen-source', rows: 10,
    'aria-label': i18n.t('setting_gen.source_label'),
    placeholder: i18n.t('setting_gen.placeholder'),
    oninput: e => autoGrow(e.target)
  });
  const fileSel = h('select');
  const loadedLine = h('div', { class: 'small muted', style: { marginTop: '6px' }, hidden: true });
  const drawSources = () => {
    const files = (state.sources || []).filter(s => /\.(txt|md)$/i.test(String(s.path || '')));
    clear(fileSel);
    if (!files.length) {
      fileSel.appendChild(h('option', { value: '', text: i18n.t('setting_gen.no_text_files', { path: state.paths.import || 'workspace/import' }) }));
    } else {
      files.forEach(s => fileSel.appendChild(h('option', { value: s.path, text: s.path })));
    }
  };
  drawSources();
  const readBtn = h('button', { text: i18n.t('setting_gen.file_read') });
  readBtn.onclick = async () => {
    if (!fileSel.value) { toast(i18n.t('records.choose_file_first'), 'err'); return; }
    readBtn.disabled = true;
    try {
      const res = await api('/api/file?' + new URLSearchParams({ path: fileSel.value }));
      textarea.value = res.content || '';
      autoGrow(textarea);
      loadedLine.hidden = false;
      loadedLine.textContent = i18n.t('setting_gen.loaded', { path: res.path || fileSel.value });
    } catch (e) {
      toast(i18n.t('setting_gen.load_failed_reason', { reason: e.message }), 'err');
    } finally { readBtn.disabled = false; }
  };

  let token = 0;   // 取消后忽略迟到的结果
  let controller = null;
  const dialog = modal(i18n.t('setting_gen.title'), h('div', { class: 'setting-gen-form' },
    h('p', { class: 'small muted', text: i18n.t('setting_gen.notice') }),
    h('div', { class: 'field' }, h('label', { for: 'setting-gen-source', text: i18n.t('setting_gen.source_label') }), textarea),
    h('div', { class: 'inline', style: { marginTop: '8px' } },
      h('label', { class: 'small muted', text: i18n.t('setting_gen.file_label') }), fileSel, readBtn),
    loadedLine), [
    h('button', {
      text: i18n.t('common.cancel'),
      onclick: () => { token += 1; if (controller) controller.abort(); dialog.close(); }
    }),
    h('button', { class: 'primary', text: i18n.t('setting_gen.start'), dataset: { noclose: '1' },
      onclick: () => startGen() })
  ]);
  dialog.dlg.classList.add('setting-gen-form');
  textarea.focus();
  const buttons = dialog.dlg.querySelectorAll('.dlg-foot button');
  const cancelBtn = buttons[0], startBtn = buttons[1];

  async function startGen() {
    const text = textarea.value.trim();
    if (!text) { toast(i18n.t('errors.setting_gen_empty'), 'err'); textarea.focus(); return; }
    const myToken = ++token;
    startBtn.disabled = true;
    cancelBtn.textContent = i18n.t('setting_gen.cancel_wait');
    status(i18n.t('setting_gen.busy'), 'busy');
    controller = new AbortController();
    try {
      // 先落盘防抖中的编辑，避免旧集合覆盖服务端刚写入的生成结果。
      await flushPendingSaves();
      const res = await api('/api/ai/setting-gen', { method: 'POST', body: { text }, signal: controller.signal });
      if (token !== myToken) return;
      dialog.close();
      setDb(res.collections);
      renderNav(); renderMain();
      lastAiBatch = res;
      showAiSettingGenResult(res);
    } catch (e) {
      if (token !== myToken || (e && e.name === 'AbortError')) return;
      status(i18n.t('common.save_failed'), 'err');
      toast(i18n.t('setting_gen.failed_reason', { reason: e.message }), 'err');
    } finally {
      if (token === myToken) {
        startBtn.disabled = false;
        cancelBtn.textContent = i18n.t('common.cancel');
        status('', '');
        controller = null;
      }
    }
  }
}
