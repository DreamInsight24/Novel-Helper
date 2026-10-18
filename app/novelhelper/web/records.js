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
    const input = prompt('新元素名称' + (prefix ? '（加到「' + prefix + '」下面）' : '') +
      '\n名称末尾加 / 表示这是分组，可以继续往下分');
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
          class: 'ghost mini caret', text: open ? '▾' : '▸', title: '展开 / 收起这一组',
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
        title: '是否需要这个元素（取消勾选＝导出与发送时忽略它）',
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
          placeholder: '内容（可多行）',
          oninput: e => { item.value = e.target.value; touch(coll); autoGrow(e.target); }
        });
        area.value = item.value || '';
        row.appendChild(area);
      }
      row.appendChild(h('span', { style: { flex: '1' } }));
      row.appendChild(h('button', {
        class: 'ghost mini', title: '在这个元素下面加子元素', text: '＋',
        onclick: () => addNode(p, item.key)
      }));
      row.appendChild(h('button', {
        class: 'ghost mini', title: '上移', text: '↑',
        onclick: () => swap(nodes, p, -1)
      }));
      row.appendChild(h('button', {
        class: 'ghost mini', title: '下移', text: '↓',
        onclick: () => swap(nodes, p, 1)
      }));
      row.appendChild(h('button', {
        class: 'ghost mini', title: '删除这个元素', text: '✕',
        onclick: () => {
          if (!confirm('删除元素「' + (item.key || '') + '」？子元素会一起删除。')) return;
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
          }, '（空分组）'));
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
          class: 'mini' + (mode === 'doc' ? ' seg-on' : ''), text: '总览',
          title: '文档式：一次看完所有元素，只改需要改的地方',
          onclick: () => { state.ui.elemMode = 'doc'; draw(); }
        }),
        h('button', {
          class: 'mini' + (mode === 'tree' ? ' seg-on' : ''), text: '树状',
          title: '结构化：折叠分组、加子元素、上下移动、改元素名',
          onclick: () => { state.ui.elemMode = 'tree'; draw(); }
        })),
      h('button', { class: 'mini', text: '＋ 顶层元素', onclick: () => addNode([], '') }),
      mode === 'tree' ? h('button', { class: 'mini', text: '全部展开', onclick: () => { setAll(nodes, true); draw(); } }) : null,
      mode === 'tree' ? h('button', { class: 'mini', text: '全部折叠', onclick: () => { setAll(nodes, false); draw(); } }) : null,
      h('span', { class: 'small muted', style: { marginLeft: '4px' } },
        mode === 'tree' ? '点 ▸ 展开分组；元素名可直接改' : '文档总览；加 / 删 / 改名请切到「树状」')));
    if (!nodes.length) box.appendChild(h('div', { class: 'muted small', text: '（还没有元素，点「＋ 顶层元素」添加）' }));
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
        title: '是否需要这个元素（取消勾选＝导出与发送时忽略它）',
        onchange: e => {
          if (e.target.checked) delete item.on; else item.on = false;
          touch(coll); draw(); if (opts.onChange) opts.onChange();
        }
      }));
      line.appendChild(h('span', { class: 'doc-mark', text: isGroup ? '▾' : '–' }));
      line.appendChild(h('span', { class: 'doc-key', text: (item.key || '（未命名）') + (isGroup ? '' : '：') }));
      if (isGroup) {
        if (!item.children.length) line.appendChild(h('span', { class: 'small muted', text: '（空分组）' }));
      } else if (!opts.hideValues) {
        const area = h('textarea', {
          class: 'doc-value', rows: valueRows(item.value), placeholder: '（空）',
          oninput: e => { item.value = e.target.value; touch(coll); autoGrow(e.target); }
        });
        area.value = item.value || '';
        line.appendChild(area);
      }
      const tools = h('span', { class: 'doc-tools' });
      tools.appendChild(h('button', {
        class: 'ghost mini', title: '在这个元素下面加子元素', text: '＋',
        onclick: () => addNode(p, item.key)
      }));
      tools.appendChild(h('button', {
        class: 'ghost mini', title: '删除这个元素', text: '✕',
        onclick: () => {
          if (!confirm('删除元素「' + (item.key || '') + '」？子元素会一起删除。')) return;
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
  return total + ' 项' + (filled ? ' · 已填 ' + filled : '');
}

// ═══════════════════════════════════════════
// 记录列表 + 编辑器
// ═══════════════════════════════════════════
function newRecord(def) {
  const stamp = nowStr();
  const rec = { id: newId(def.idPrefix), name: '未命名', elements: [], tags: [], created: stamp, updated: stamp };
  if (def.tagLabel) rec.tag = '';
  if (def.notesLabel) rec.notes = '';
  if (def.hasCategory) rec.category = ((state.db[def.coll].categories || [])[0]) || '其他';
  if (def.hasSlot) rec.slot = ((state.db.equipment.slots || [])[0]) || '其他';
  if (def.hasContent) rec.content = '';
  if (def.hasInventory) { rec.inventory = []; rec.equipment = []; }
  if (def.hasMembers) rec.members = [];
  rec.elements = JSON.parse(JSON.stringify(presetsOf(def.coll) || []));
  return rec;
}

function viewRecords(main, key) {
  const def = defFor(key);
  if (!def) { main.appendChild(h('div', { class: 'card muted', text: '未知集合：' + key })); return; }
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
        class: 'primary', text: '＋ 新建' + def.singular,
        onclick: () => { const rec = newRecord(def); bucket.items.unshift(rec); ui.sel = rec.id; touch(def.coll); renderMain(); }
      }))));

  if (key === 'other') {
    main.appendChild(importPanel('md', { title: '导入 Markdown / JSON 到其他设定' }));
    main.appendChild(moveBar(def.coll, key));
  }

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
    countLine.textContent = '共 ' + bucket.items.length + ' 条' +
      (key === 'other' && state.sel[key] && state.sel[key].size ? '，已选 ' + state.sel[key].size + ' 条' : '');
  };
  const setActive = id => rowEls.forEach((el, rid) => el.classList.toggle('active', rid === id));

  const drawList = () => {
    const keepTop = listScroll.scrollTop;
    clear(listBox);
    rowEls.clear();
    const search = h('input', { type: 'text', placeholder: '搜索…', value: ui.q, oninput: e => { ui.q = e.target.value; drawList(); } });
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
      const meta = [rec.category, filled ? filled + '项' : ''].filter(Boolean).join(' · ');
      rowEl.appendChild(h('div', { class: 'meta', text: meta }));
      rowEls.set(rec.id, rowEl);
      listScroll.appendChild(rowEl);
    });
    if (!items.length) {
      listScroll.appendChild(h('div', { class: 'muted small', style: { padding: '10px' } }, '没有匹配的条目'));
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
    if (!rec) { editBox.appendChild(h('div', { class: 'card muted', text: '左侧选一条记录，或新建一条。' })); return; }
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
  const title = h('h2', null, recordName(rec), h('span', { class: 'hint', text: '编辑后自动保存' }));
  card.appendChild(title);

  card.appendChild(h('div', { class: 'field' },
    h('label', { text: '名称' }),
    h('input', { type: 'text', value: rec.name || '', oninput: e => { rec.name = e.target.value; touch(coll); } })));

  if (def.tagLabel) {
    card.appendChild(h('div', { class: 'field' },
      h('label', { text: def.tagLabel }),
      h('input', { type: 'text', value: rec.tag || '', oninput: e => { rec.tag = e.target.value; touch(coll); } })));
  }

  if (def.hasSlot) {
    card.appendChild(h('div', { class: 'field' },
      h('label', { text: '穿戴部位' }),
      h('select', { onchange: e => { rec.slot = e.target.value; touch(coll); } },
        (state.db.equipment.slots || []).map(s => h('option', { value: s, selected: s === rec.slot, text: s })))));
  }

  if (def.hasCategory) {
    const store = state.db[coll];
    store.categories = store.categories || [];
    card.appendChild(h('div', { class: 'field' }, h('label', { text: '类别' }),
      h('div', { class: 'inline' },
        h('select', { onchange: e => { rec.category = e.target.value; touch(coll); } },
          store.categories.map(c => h('option', { value: c, selected: c === rec.category, text: c }))),
        h('button', {
          class: 'mini', text: '添加类别',
          onclick: () => {
            const v = prompt('新类别名称');
            if (!v) return;
            store.categories.push(v); rec.category = v; touch(coll); onEditorChange();
          }
        }))));
  }

  card.appendChild(h('div', { class: 'sep' }));
  const stat = h('span', { class: 'hint' });
  const refreshStat = () => { stat.textContent = '共 ' + countAll(rec.elements) + ' 个元素，已填 ' + countFilled(rec.elements) + ' 项'; };
  refreshStat();
  card.appendChild(h('div', { class: 'inline' },
    h('label', { text: '元素', style: { flex: '1' } }),
    stat,
    h('button', {
      class: 'mini', text: '套用模板补齐',
      title: '按「元素模板」页的模板补上缺的元素（不覆盖已填内容）',
      onclick: () => {
        const added = applyPreset(rec.elements, presetsOf(coll));
        touch(coll); refreshStat(); onEditorChange();
        toast(added ? '补充了 ' + added + ' 个元素' : '模板元素都已存在', 'ok');
      }
    }),
    h('button', {
      class: 'mini', text: '预览输出',
      onclick: () => {
        const lines = ['### ' + recordName(rec)].concat(renderElementsMd(rec.elements, 0));
        if (rec.content) lines.push('', rec.content);
        if (rec.notes) lines.push('', rec.notes);
        modal(recordName(rec) + ' · 将发送 / 导出的内容',
          h('div', { class: 'md', html: md(lines.join('\n') || '（空）') }), [h('button', { text: '关闭' })]);
      }
    })));
  card.appendChild(elementTree(rec.elements, coll, {
    onChange: () => { refreshStat(); if (onEditorChange) onEditorChange(); }
  }));

  if (def.hasContent) {
    card.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } },
      h('label', { text: '内容（原文 / 长文本）' }),
      h('textarea', {
        rows: (rec.content || '').length > 400 ? 14 : 6, value: rec.content || '',
        oninput: e => { rec.content = e.target.value; touch(coll); autoGrow(e.target); }
      })));
  }

  if (rec.notes !== undefined) {
    card.appendChild(h('div', { class: 'field' },
      h('label', { text: def.notesLabel || '补充说明' }),
      h('textarea', { rows: 3, value: rec.notes || '', oninput: e => { rec.notes = e.target.value; touch(coll); autoGrow(e.target); } })));
  }

  if (def.hasMembers) {
    card.appendChild(h('div', { class: 'sep' }));
    card.appendChild(h('div', { class: 'field' }, h('label', { text: '成员（指针 → 人物档案）' })));
    card.appendChild(pointerList(rec, 'members', coll, 'characters', 'id', onListChange));
  }

  if (def.hasInventory) {
    card.appendChild(h('div', { class: 'sep' }));
    card.appendChild(h('div', { class: 'small muted', text:
      '随身物品与穿戴不在这里编辑：请到左侧「人物背包」页，选中人物后入包 / 穿戴（两处共用同一份数据，这里不再重复）。' }));
  }

  card.appendChild(h('div', { class: 'sep' }));
  card.appendChild(h('div', { class: 'inline' },
    rec.source ? h('span', { class: 'tag', text: '来源：' + rec.source }) : null,
    h('span', { style: { flex: '1' } }),
    h('button', { text: '搬运到…', onclick: () => moveDialog(coll, [rec.id], () => { onListChange(); onEditorChange(); }) }),
    h('button', {
      class: 'danger', text: '删除',
      onclick: () => {
        if (!confirm('确定删除「' + recordName(rec) + '」？')) return;
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
    if (!entries.length) box.appendChild(h('div', { class: 'muted small', text: '（空）' }));
    entries.forEach((entry, idx) => {
      const target = findById(targetColl, entry[idKey]);
      const row = h('div', { class: 'inline', style: { marginBottom: '6px' } });
      row.appendChild(h('span', { class: 'tag', text: target ? recordName(target) : '⚠ 指针失效' }));
      if (opts.qty) {
        row.appendChild(h('input', {
          type: 'number', value: entry.qty == null ? 1 : entry.qty, style: { width: '72px' }, title: '数量',
          oninput: e => { entry.qty = e.target.value === '' ? 1 : Number(e.target.value); touch(coll); }
        }));
      }
      row.appendChild(h('input', {
        type: 'text', value: entry.note || '', placeholder: '备注', style: { flex: '1' },
        oninput: e => { entry.note = e.target.value; touch(coll); }
      }));
      row.appendChild(h('button', {
        class: 'ghost mini', text: '✕',
        onclick: () => { entries.splice(idx, 1); touch(coll); draw(); if (onChange) onChange(); }
      }));
      box.appendChild(row);
    });
    box.appendChild(h('button', {
      class: 'mini', text: '＋ 从' + (opts.pickLabel || '列表') + '中添加',
      onclick: () => {
        const options = collItems(targetColl).map(t => ({ value: t.id, label: recordName(t), meta: t.category || '' }));
        if (!options.length) { toast('目标集合还是空的。', 'err'); return; }
        pickDialog('选择要添加的条目', options, id => {
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
  const sources = state.sources || [];
  const kinds = [
    { id: 'md', label: 'Markdown → 其他设定（原文入库）' },
    { id: 'json', label: 'NovelHelper JSON → 指定集合' }
  ];
  const kindSel = h('select', { onchange: () => drawTarget() },
    kinds.map(k => h('option', { value: k.id, selected: k.id === (defaultKind || 'md'), text: k.label })));
  const sourceSel = h('select', null, sources.length
    ? sources.map(s => h('option', {
      value: s.path,
      text: '[' + s.group + '] ' + s.path
    }))
    : [h('option', { value: '', text: '（workspace/io/in 里还没有可导入的文件）' })]);
  const targetSel = h('select', null, ['other', 'characters', 'factions', 'items', 'equipment', 'memories']
    .map(c => h('option', { value: c, text: '导入到：' + c })));
  const targetWrap = h('span');
  const drawTarget = () => {
    clear(targetWrap);
    if (kindSel.value === 'json') targetWrap.appendChild(targetSel);
  };
  drawTarget();

  const btn = h('button', { class: 'primary', text: '导入' });
  btn.disabled = !sources.length;
  btn.onclick = async () => {
    btn.disabled = true;
    status('导入中…', 'busy');
    try {
      const res = await api('/api/import', {
        method: 'POST',
        body: { kind: kindSel.value, source: sourceSel.value, target: targetSel.value }
      });
      setDb(res.collections);
      toast(res.message, 'ok');
      status('导入完成', 'ok');
      renderNav(); renderMain();
    } catch (e) {
      toast('导入失败：' + e.message, 'err');
      status('导入失败', 'err');
    } finally { btn.disabled = false; }
  };

  return h('details', { class: 'card' },
    h('summary', null, (opts.title || '导入') + '　（' + (state.paths.import || 'workspace/io/in') + ' 里的文件）'),
    h('div', { class: 'field', style: { marginTop: '10px' } }, kindSel),
    h('div', { class: 'inline' }, sourceSel, targetWrap, btn),
    h('div', { class: 'small muted', style: { marginTop: '8px' } },
      'Markdown 现在只允许导入到「其他设定」。导入后在左侧勾选条目，点「搬运选中的条目到…」，即可转为人物、势力、道具、装备或自定义栏目的条目；原文会保留在补充说明里。'));
}

function exportButtons(coll) {
  return h('div', { class: 'inline' },
    h('button', {
      text: '导出 JSON',
      title: '只包含开启且已填的元素，没有的元素不会出现',
      onclick: async () => {
        try {
          const res = await api('/api/export', { method: 'POST', body: { collection: coll, format: 'json' } });
          toast('已导出：' + res.rel, 'ok');
        } catch (e) { toast('导出失败：' + e.message, 'err'); }
      }
    }),
    h('button', {
      text: '导出 TXT',
      onclick: async () => {
        try {
          const res = await api('/api/export', { method: 'POST', body: { collection: coll, format: 'txt' } });
          toast('已导出：' + res.rel, 'ok');
        } catch (e) { toast('导出失败：' + e.message, 'err'); }
      }
    }));
}

function moveBar(coll, key) {
  return h('div', { class: 'card' },
    h('h2', null, '整理导入的内容',
      h('span', { class: 'hint', text: '勾选后一键搬到人物 / 势力 / 道具 / 装备 / 记忆，或转为任意自定义栏目的条目' })),
    h('div', { class: 'inline' },
      h('button', {
        class: 'primary', text: '搬运选中的条目到…',
        onclick: () => {
          const ids = Array.from(state.sel[key] || []);
          if (!ids.length) { toast('先在左侧勾选要搬运的条目。', 'err'); return; }
          moveDialog(coll, ids, () => { state.sel[key].clear(); renderMain(); });
        }
      }),
      h('button', {
        text: '全选（当前列表）',
        onclick: () => { collItems('other').forEach(r => state.sel[key].add(r.id)); renderMain(); }
      }),
      h('button', { text: '清空选择', onclick: () => { state.sel[key].clear(); renderMain(); } })));
}

function moveDialog(fromColl, ids, done) {
  const builtins = [
    ['characters', '人物档案'], ['factions', '势力设定'], ['items', '道具设定'],
    ['equipment', '服饰与装备'], ['memories', '记忆库'], ['other', '其他设定']
  ].filter(t => t[0] !== fromColl);
  const custom = sectionDefs().map(sec => ['section_' + sec.key, '自定义：' + (sec.label || sec.key)]);
  const targets = builtins.concat(custom);
  const keepBox = h('input', { type: 'checkbox' });
  const body = h('div', null,
    h('div', { class: 'small muted', text: '共 ' + ids.length + ' 条。搬运会按目标集合的模板建立新条目，原文放进「补充说明」；自定义栏目会出现在下方。' }),
    h('label', { class: 'check', style: { marginTop: '8px' } }, keepBox, '保留原条目（复制而不是移动）'));
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
      } catch (e) { toast('搬运失败：' + e.message, 'err'); }
    }
  }));
  foot.unshift(h('button', { text: '取消', onclick: () => m.close() }));
  const m = modal('搬运到…', body, foot);
}
