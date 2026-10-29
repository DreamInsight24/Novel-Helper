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

/* NovelHelper —— 背包 / 世界地图 / 记忆 / 章节 */
'use strict';

/** 把嵌套对象里的字符串值摊平（元素树 → 一句人看的摘要）。 */
function flatValues(obj, out) {
  out = out || [];
  Object.values(obj || {}).forEach(v => {
    if (typeof v === 'string') { if (v.trim()) out.push(v.trim()); }
    else if (v && typeof v === 'object') flatValues(v, out);
  });
  return out;
}

// ═══════════════════════════════════════════
// 人物背包
// ═══════════════════════════════════════════
function viewInventory(main) {
  main.appendChild(pageHead(settingLabel('inventory', i18n.t('nav.inventory')),
    settingEntries(true).find(entry => entry.id === 'inventory')?.desc || i18n.t('inventory.page_desc')));
  const chars = collItems('characters');
  if (!chars.length) {
    main.appendChild(h('div', { class: 'card muted', text: i18n.t('inventory.no_characters') }));
    return;
  }
  state.ui.inventory = state.ui.inventory || { sel: chars[0].id };
  const ui = state.ui.inventory;
  if (!findById('characters', ui.sel)) ui.sel = chars[0].id;

  const row = h('div', { class: 'row' });
  const left = h('div', { class: 'col', style: { flex: '0 0 260px' } });
  const right = h('div', { class: 'col' });
  row.appendChild(left); row.appendChild(right);
  main.appendChild(row);

  const drawLeft = () => {
    clear(left);
    left.appendChild(h('div', { class: 'card' },
      h('div', { class: 'list scroll' }, chars.map(c => h('div', {
        class: 'list-item' + (ui.sel === c.id ? ' active' : ''),
        onclick: () => { ui.sel = c.id; drawLeft(); drawRight(); }
      }, h('div', { class: 'name', text: recordName(c) }))))));
  };

  const drawRight = () => {
    clear(right);
    const rec = findById('characters', ui.sel);
    if (!rec) return;
    rec.inventory = rec.inventory || [];
    rec.equipment = rec.equipment || [];
    const card = h('div', { class: 'card' });
    card.appendChild(h('h2', null, i18n.t('inventory.title', { name: recordName(rec) })));
    // 钱袋：背包的特殊字段。填数量（2金3银2铜）或档位（富裕 / 一般 / 紧张）都行，
    // 留空＝不重要，提示词里不会出现这一行。
    card.appendChild(h('div', { class: 'field' },
      h('label', { text: i18n.t('inventory.purse_label') }),
      h('input', {
        class: 'purse', type: 'text', list: 'purse-levels', value: rec.purse || '',
        placeholder: i18n.t('inventory.purse_placeholder'),
        oninput: e => { rec.purse = e.target.value; touch('characters'); }
      }),
      h('datalist', { id: 'purse-levels' },
        ['富裕', '一般', '紧张'].map(v => h('option', { value: v })))));

    // 每条背包指针都有「携带 / 佩戴」开关：
    // 勾上＝随身物品 / 穿戴与装备；取消＝归入「已拥有（未携带）」。
    const redraw = () => drawRight();
    const packRow = (entry, listKey, targetColl, idKey, qty) => {
      const target = findById(targetColl, entry[idKey]);
      const line = h('div', { class: 'inline', style: { marginBottom: '6px' } });
      line.appendChild(h('span', { class: 'tag', text: target ? recordName(target) : i18n.t('records.broken_pointer') }));
      if (qty) {
        line.appendChild(h('input', {
          type: 'number', value: entry.qty == null ? 1 : entry.qty, style: { width: '72px' }, title: i18n.t('records.qty'),
          oninput: e => { entry.qty = e.target.value === '' ? 1 : Number(e.target.value); touch('characters'); }
        }));
      }
      line.appendChild(h('input', {
        type: 'text', value: entry.note || '', placeholder: i18n.t('inventory.note_label'), style: { flex: '1' },
        oninput: e => { entry.note = e.target.value; touch('characters'); }
      }));
      line.appendChild(h('label', { class: 'check small', title: i18n.t('inventory.carried_hint') },
        h('input', {
          type: 'checkbox', checked: entry.carried !== false,
          onchange: e => {
            if (e.target.checked) delete entry.carried; else entry.carried = false;
            touch('characters'); redraw();
          }
        }), i18n.t('inventory.carried_label')));
      line.appendChild(h('button', {
        class: 'ghost mini', text: '✕', title: i18n.t('inventory.remove'),
        onclick: () => { rec[listKey] = rec[listKey].filter(x => x !== entry); touch('characters'); redraw(); }
      }));
      return line;
    };
    const addBar = targets => h('div', { class: 'inline', style: { marginTop: '4px' } }, targets.map(t => h('button', {
      class: 'mini', text: '＋ ' + t.label,
      onclick: () => {
        const options = collItems(t.coll).map(x => ({ value: x.id, label: recordName(x), meta: x.category || '' }));
        if (!options.length) { toast(i18n.t('records.target_empty'), 'err'); return; }
        pickDialog(i18n.t('records.pick_label', { label: t.label }), options, id => {
          const entry = { note: '', carried: t.carried };
          entry[t.idKey] = id;
          if (t.qty) entry.qty = 1;
          rec[t.listKey].push(entry);
          touch('characters'); redraw();
        });
      }
    })));
    const block = (title, hint, rows, targets) => {
      const box = h('div', { class: 'field' });
      box.appendChild(h('label', { text: title }, h('span', { class: 'hint', text: hint })));
      if (!rows.length) box.appendChild(h('div', { class: 'muted small', text: i18n.t('common.empty_paren') }));
      rows.forEach(r => box.appendChild(packRow(r.entry, r.listKey, r.coll, r.idKey, r.qty)));
      box.appendChild(addBar(targets));
      return box;
    };
    const on = e => e.carried !== false;
    card.appendChild(block(i18n.t('inventory.carried_title'), i18n.t('inventory.carried_status'),
      rec.inventory.filter(e => e.item_id && on(e)).map(e => ({ entry: e, listKey: 'inventory', coll: 'items', idKey: 'item_id', qty: true })),
      [{ label: i18n.t('inventory.add_item'), listKey: 'inventory', coll: 'items', idKey: 'item_id', qty: true, carried: true }]));
    card.appendChild(block(i18n.t('inventory.worn_title'), i18n.t('inventory.worn_status'),
      rec.equipment.filter(e => e.equip_id && on(e)).map(e => ({ entry: e, listKey: 'equipment', coll: 'equipment', idKey: 'equip_id', qty: false })),
      [{ label: i18n.t('inventory.add_equipment'), listKey: 'equipment', coll: 'equipment', idKey: 'equip_id', qty: false, carried: true }]));
    card.appendChild(block(i18n.t('inventory.owned_title'), i18n.t('inventory.owned_status'),
      rec.inventory.filter(e => e.item_id && !on(e)).map(e => ({ entry: e, listKey: 'inventory', coll: 'items', idKey: 'item_id', qty: true }))
        .concat(rec.equipment.filter(e => e.equip_id && !on(e)).map(e => ({ entry: e, listKey: 'equipment', coll: 'equipment', idKey: 'equip_id', qty: false }))),
      [{ label: i18n.t('collections.singular_item'), listKey: 'inventory', coll: 'items', idKey: 'item_id', qty: true, carried: false },
       { label: i18n.t('collections.singular_equipment'), listKey: 'equipment', coll: 'equipment', idKey: 'equip_id', qty: false, carried: false }]));

    card.appendChild(h('div', { class: 'sep' }));
    const lines = ['### ' + i18n.t('inventory.assembly_title', { name: recordName(rec) })].concat(renderElementsMd(rec.elements, 0));
    const worn = (rec.equipment || []).map(e => findById('equipment', e.equip_id)).filter(Boolean);
    if (worn.length) {
      lines.push('- ' + i18n.t('inventory.worn_line') + ' ' + worn.map(w => {
        const look = flatValues(elementToNested(w.elements || [])).slice(0, 2).join('，');
        return w.name + (look ? '（' + look + '）' : '');
      }).join('；'));
    }
    const items = (rec.inventory || []).map(e => findById('items', e.item_id)).filter(Boolean);
    if (items.length) lines.push('- ' + i18n.t('inventory.carried_line') + ' ' + items.map(t => t.name).join('、'));
    if ((rec.purse || '').trim()) lines.splice(1, 0, '- ' + i18n.t('inventory.purse_line') + ' ' + rec.purse.trim());
    card.appendChild(h('div', { class: 'md', html: md(lines.join('\n')) }));
    right.appendChild(card);
  };

  drawLeft(); drawRight();
}

// ═══════════════════════════════════════════
// 世界地图
// ═══════════════════════════════════════════
// 一棵确定的树：根表格（第 1 层）→ 区域的子表格（第 2 层）→ …，最多 WORLD_MAX_DEPTH 层。
const WORLD_MAX_DEPTH = 4;

/** 区域在第几层：根表格里的区域＝1 层。 */
function worldDepth(world, id) {
  let depth = 1, cur = (world.regions || {})[id], guard = 0;
  while (cur && cur.parent && guard++ < 50) {
    depth += 1;
    cur = (world.regions || {})[cur.parent];
  }
  return depth;
}

/** 祖先链（根在前，不含自己）。 */
function worldChain(world, id) {
  const chain = [];
  let cur = (world.regions || {})[id], guard = 0;
  while (cur && cur.parent && guard++ < 50) {
    cur = (world.regions || {})[cur.parent];
    if (cur) chain.unshift(cur.id);
  }
  return chain;
}

/** 新子表格：默认 3×3，行列名用方位（北/中/南 × 西/中/东）。 */
function newBoard() {
  return {
    rows: [i18n.t('defaults.axis.north'), i18n.t('defaults.axis.center'), i18n.t('defaults.axis.south')],
    cols: [i18n.t('defaults.axis.west'), i18n.t('defaults.axis.center'), i18n.t('defaults.axis.east')],
    cells: {}
  };
}

/** 表格里真正有内容的格子（"行|列" → 区域 id）。 */
function boardCells(board) {
  const out = {};
  Object.entries((board || {}).cells || {}).forEach(([k, v]) => { if (v) out[k] = v; });
  return out;
}

/** 已经挂在树上的区域 id（根表格 + 所有子表格）。 */
function placedIds(world) {
  const placed = new Set();
  Object.values(world.cells || {}).forEach(id => { if (id) placed.add(id); });
  Object.values(world.regions || {}).forEach(r => {
    Object.values(boardCells(r.board)).forEach(id => placed.add(id));
  });
  return placed;
}

/** 一个区域及其整棵子树。 */
function subtreeIds(world, id) {
  const out = [];
  const walk = rid => {
    if (!rid || !(world.regions || {})[rid] || out.includes(rid)) return;
    out.push(rid);
    Object.values(boardCells(world.regions[rid].board)).forEach(walk);
  };
  walk(id);
  return out;
}

/** 这棵子树有几层（1＝没有子区域）。 */
function subtreeHeight(world, id, guard) {
  const region = (world.regions || {})[id];
  if (!region || (guard || 0) > 20) return 1;
  const kids = Object.values(boardCells(region.board)).filter(x => (world.regions || {})[x]);
  if (!kids.length) return 1;
  return 1 + Math.max(...kids.map(k => subtreeHeight(world, k, (guard || 0) + 1)));
}

/** 新行/新列的建议名字：跟着现有命名风格走（北6 / 南6 或 北 / 南）。 */
function nextAxisLabel(list, side, kind) {
  // 优先沿用现有名字的前缀（非数字部分），兼容初始化时冻结的方位命名；
  // 没有可参考的名字时用当前语言的方位词。
  const sample = (list || []).find(x => /^[^\d]*\d+$/.test(x));
  let prefix = sample ? sample.replace(/\d+$/, '') : '';
  if (!prefix) {
    prefix = kind === 'row'
      ? (side === 'start' ? i18n.t('defaults.axis.north') : i18n.t('defaults.axis.south'))
      : (side === 'start' ? i18n.t('defaults.axis.west') : i18n.t('defaults.axis.east'));
  }
  const numbered = list.some(x => new RegExp('^' + prefix + '\\d+$').test(x));
  if (!numbered) return list.includes(prefix) ? prefix + '2' : prefix;
  let n = 1;
  while (list.includes(prefix + n)) n += 1;
  return prefix + n;
}

function newRegionRecord(name) {
  const stamp = nowStr();
  return {
    id: newId('rg'), name: (name || '').trim() || i18n.t('defaults.region.unnamed'), summary: '', details: '',
    elements: [], parent: '', tags: [], created: stamp, updated: stamp
  };
}

function viewWorld(main) {
  const world = state.db.worldmap;
  world.cells = world.cells || {};
  world.regions = world.regions || {};
  state.ui.world = state.ui.world || { sel: null };
  const ui = state.ui.world;

  main.appendChild(pageHead(settingLabel('world', i18n.t('nav.worldmap')),
    '',
    h('div', { class: 'inline' },
      guidanceButton(i18n.t('nav.worldmap'),i18n.t('worldmap.page_desc',{max:WORLD_MAX_DEPTH})),
      exportButtons('worldmap'),
      h('button', {
        text: i18n.t('worldmap.rename'),
        onclick: () => askDialog(i18n.t('worldmap.rename'), i18n.t('worldmap.name_label'), world.name || '', v => {
          world.name = (v || '').trim() || world.name;
          touch('worldmap'); renderMain();
        })
      }))));



  const row = h('div', { class: 'row' });
  const left = h('div', { class: 'col', style: { flex: '1 1 620px' } });
  const right = h('div', { class: 'col' });
  row.appendChild(left); row.appendChild(right);
  main.appendChild(row);

  /** 选中某个区域并重绘（面包屑按 parent 链推出来，不依赖浏览历史）。 */
  const open = id => { ui.sel = id; drawGrid(); drawRegion(); };

  const drag = { id: null };

  /** 区域现在挂在哪张表格的哪一格。 */
  const locate = id => {
    for (const [k, v] of Object.entries(world.cells)) if (v === id) return { board: world, parentId: '', key: k };
    for (const r of Object.values(world.regions)) {
      const cells = (r.board || {}).cells || {};
      for (const [k, v] of Object.entries(cells)) if (v === id) return { board: r.board, parentId: r.id, key: k };
    }
    return null;
  };

  /** 能不能把 id 放到 parentId 这张表下面（防环 + 防超深）。返回错误说明或空串。 */
  const canPlace = (id, parentId) => {
    if (parentId && subtreeIds(world, id).includes(parentId)) return i18n.t('worldmap.cannot_move_into_self');
    const depth = parentId ? worldDepth(world, parentId) + 1 : 1;
    if (depth + subtreeHeight(world, id) - 1 > WORLD_MAX_DEPTH) {
      return i18n.t('worldmap.depth_limit', { max: WORLD_MAX_DEPTH });
    }
    return '';
  };

  /** 拖动换位：空格＝移过去；已是别的区域＝两边互换。 */
  const moveRegion = (id, board, parentId, key) => {
    const region = world.regions[id];
    if (!region || !board) return;
    const cells = boardCells(board);
    const occupant = world.regions[cells[key]];
    if (occupant && occupant.id === id) return;
    const from = locate(id);
    if (occupant) {
      if (!from) { toast(i18n.t('worldmap.cell_occupied'), 'err'); return; }
      const problem = canPlace(id, parentId) || canPlace(occupant.id, from.parentId);
      if (problem) { toast(problem, 'err'); return; }
      board.cells[key] = id;
      region.parent = parentId || '';
      from.board.cells[from.key] = occupant.id;
      occupant.parent = from.parentId || '';
      toast(i18n.t('worldmap.swapped', { a: region.name, b: occupant.name }), 'ok');
    } else {
      const problem = canPlace(id, parentId);
      if (problem) { toast(problem, 'err'); return; }
      if (from) delete from.board.cells[from.key];
      board.cells = board.cells || {};
      board.cells[key] = id;
      region.parent = parentId || '';
      toast(i18n.t('worldmap.moved', { name: region.name }), 'ok');
    }
    region.updated = nowStr();
    touch('worldmap');
  };

  /** 把区域放进某张表格的某格：先摘掉原来的位置，保证还是棵树。 */
  const attach = (id, board, parentId, key) => {
    const region = world.regions[id];
    if (!region) return;
    detach(id);
    board.cells = board.cells || {};
    board.cells[key] = id;
    region.parent = parentId || '';
    region.updated = nowStr();
  };
  /** 从根表格与所有子表格里摘掉（清掉多余的格子，不留空记录）。 */
  const detach = id => {
    Object.keys(world.cells).forEach(k => { if (world.cells[k] === id) delete world.cells[k]; });
    Object.values(world.regions).forEach(r => {
      const cells = (r.board || {}).cells || {};
      Object.keys(cells).forEach(k => { if (cells[k] === id) delete cells[k]; });
    });
    const region = world.regions[id];
    if (region) region.parent = '';
  };
  /** 空格的选项：新建一个区域 / 挂上一个还没挂上的区域。 */
  const fillDialog = (board, parentId, key, label) => {
    const nameInput = h('input', { type: 'text', placeholder: i18n.t('worldmap.name_placeholder') });
    const loose = Object.values(world.regions).filter(r => !placedIds(world).has(r.id));
    const body = h('div', null,
      h('div', { class: 'field' }, h('label', { text: label }), nameInput),
      loose.length ? h('div', { class: 'small muted', text: i18n.t('worldmap.attach_loose', { list: loose.map(r => r.name).join('、') }) }) : null);
    const m = modal(i18n.t('worldmap.cell_modal_title'), body, [
      loose.length ? h('button', {
        text: i18n.t('worldmap.attach_existing'),
        onclick: () => {
          const options = Object.values(world.regions).filter(r => !placedIds(world).has(r.id))
            .map(r => ({ value: r.id, label: r.name, meta: r.summary || '' }));
          pickDialog(i18n.t('worldmap.pick_region'), options, id => {
            attach(id, board, parentId, key);
            touch('worldmap'); m.close(); open(id);
          });
        }
      }) : null,
      h('span', { style: { flex: '1' } }),
      h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() }),
      h('button', {
        class: 'primary', text: i18n.t('worldmap.create_attach'),
        onclick: () => {
          const region = newRegionRecord(nameInput.value);
          world.regions[region.id] = region;
          attach(region.id, board, parentId, key);
          touch('worldmap'); m.close(); open(region.id);
        }
      })
    ]);
    nameInput.focus();
  };
  /** 表格（根表格与子表格共用）。 */
  const boardTable = (board, parentId, opts) => {
    opts = opts || {};
    const table = h('table', { class: 'grid' + (opts.sub ? ' subgrid-table' : '') });
    const cells = boardCells(board);
    const head = (label, kind, index) => h('th', {
      class: 'axis-th', text: label, title: i18n.t('worldmap.axis_rename_title', { axis: i18n.t(kind === 'row' ? 'worldmap.row' : 'worldmap.col') }),
      onclick: () => renameAxis(board, kind, index)
    });
    table.appendChild(h('tr', null, h('th', { text: i18n.t('worldmap.corner_label') }),
      (board.cols || []).map((c, i) => head(c, 'col', i))));
    (board.rows || []).forEach((r, ri) => {
      const tr = h('tr', null, head(r, 'row', ri));
      (board.cols || []).forEach(c => {
        const key = r + '|' + c;
        const region = world.regions[cells[key]];
        const btn = h('button', {
          class: 'cell-btn ' + (region ? 'has' : 'empty'),
          text: region ? region.name : '＋',
          draggable: region ? 'true' : null,
          title: region ? i18n.t('worldmap.cell_drag_title')
                        : i18n.t('worldmap.cell_empty_title'),
          ondragstart: region ? (e => {
            drag.id = region.id;
            try {
              e.dataTransfer.setData('text/plain', region.id);
              e.dataTransfer.effectAllowed = 'move';
            } catch (err) { /* 忽略 */ }
            btn.classList.add('dragging');
          }) : null,
          ondragend: () => { drag.id = null; btn.classList.remove('dragging'); },
          ondragover: e => {
            if (!drag.id) return;
            e.preventDefault();
            try { e.dataTransfer.dropEffect = 'move'; } catch (err) { /* 忽略 */ }
            btn.classList.add('drop-target');
          },
          ondragleave: () => btn.classList.remove('drop-target'),
          ondrop: e => {
            e.preventDefault();
            btn.classList.remove('drop-target');
            const id = drag.id || e.dataTransfer.getData('text/plain');
            drag.id = null;
            if (!id || (region && region.id === id)) return;
            moveRegion(id, board, parentId, key);
            drawGrid(); drawRegion();
          }
        });
        btn.onclick = () => {
          if (region) open(region.id);
          else fillDialog(board, parentId, key, (opts.label || '') + r + ' / ' + c);
        };
        tr.appendChild(h('td', null, btn));
      });
      table.appendChild(tr);
    });
    return table;
  };
  /** 加一行 / 一列。 */
  /** 改行/列名（格子 key 会跟着改，内容不丢）。 */
  const setAxisLabel = (board, kind, index, value) => {
    const list = kind === 'row' ? (board.rows = board.rows || []) : (board.cols = board.cols || []);
    const old = list[index] || '';
    const label = String(value == null ? '' : value).trim();
    if (!label || label === old) return false;
    if (list.includes(label)) { toast(i18n.t('worldmap.axis_duplicate', { axis: i18n.t(kind === 'row' ? 'worldmap.row' : 'worldmap.col'), label: label }), 'err'); return false; }
    list[index] = label;
    const moved = {};
    Object.keys(board.cells || {}).forEach(k => {
      const cut = k.indexOf('|');
      const r0 = k.slice(0, cut);
      const c0 = k.slice(cut + 1);
      const nr = kind === 'row' && r0 === old ? label : r0;
      const nc = kind === 'col' && c0 === old ? label : c0;
      moved[nr + '|' + nc] = board.cells[k];
    });
    board.cells = moved;
    return true;
  };

  /** 点表头的行/列名 → 直接改名。 */
  const renameAxis = (board, kind, index) => {
    const list = kind === 'row' ? (board.rows || []) : (board.cols || []);
    askDialog(i18n.t('worldmap.rename_axis_title', { axis: i18n.t(kind === 'row' ? 'worldmap.row' : 'worldmap.col') }), i18n.t('common.name'), list[index] || '', v => {
      if (setAxisLabel(board, kind, index, v)) { touch('worldmap'); drawGrid(); drawRegion(); }
    });
  };

  /** 整批改名：一行一个名字。 */
  const axisDialog = board => {
    const rowTa = h('textarea', { rows: Math.min(12, Math.max(3, (board.rows || []).length)), value: (board.rows || []).join('\n') });
    const colTa = h('textarea', { rows: Math.min(12, Math.max(3, (board.cols || []).length)), value: (board.cols || []).join('\n') });
    const m = modal(i18n.t('worldmap.axes_title'), h('div', null,
      h('div', { class: 'field' }, h('label', { text: i18n.t('worldmap.rows_label') }), rowTa),
      h('div', { class: 'field' }, h('label', { text: i18n.t('worldmap.cols_label') }), colTa),
      h('div', { class: 'small muted', text: i18n.t('worldmap.axes_hint') })), [
      h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() }),
      h('button', {
        class: 'primary', text: i18n.t('common.save'), dataset: { noclose: '1' },
        onclick: () => {
          const rows = rowTa.value.split('\n').map(s => s.trim()).filter(s => s !== '');
          const cols = colTa.value.split('\n').map(s => s.trim()).filter(s => s !== '');
          if (!rows.length || !cols.length) { toast(i18n.t('worldmap.axes_empty'), 'err'); return; }
          if (rows.length > (board.rows || []).length || cols.length > (board.cols || []).length) {
            toast(i18n.t('worldmap.axes_too_many'), 'err');
            return;
          }
          const dropRows = (board.rows || []).length - rows.length;
          const dropCols = (board.cols || []).length - cols.length;
          const apply = () => {
            const dropRowNames = (board.rows || []).slice(rows.length);
            const dropColNames = (board.cols || []).slice(cols.length);
            const err = setAxisLabels(board, 'row', rows) || setAxisLabels(board, 'col', cols);
            if (err) { toast(err, 'err'); return; }
            dropCells(board, 'row', dropRowNames);
            dropCells(board, 'col', dropColNames);
            m.close(); touch('worldmap'); drawGrid(); drawRegion();
          };
          if (dropRows > 0 || dropCols > 0) {
            m.close();
            confirmDialog(i18n.t('worldmap.drop_confirm_title'),
              i18n.t('worldmap.drop_confirm', { rows: dropRows, cols: dropCols }),
              apply);
            return;
          }
          apply();
        }
      })
    ]);
  };

  /** 删掉指定的行/列（末尾那几行）：格子里的区域变成未挂接，区域本身不删。 */
  const dropCells = (board, kind, names) => {
    if (!names || !names.length) return;
    Object.keys(board.cells || {}).forEach(k => {
      const cut = k.indexOf('|');
      const r0 = k.slice(0, cut);
      const c0 = k.slice(cut + 1);
      if ((kind === 'row' && names.includes(r0)) || (kind === 'col' && names.includes(c0))) {
        const rid = board.cells[k];
        delete board.cells[k];
        const region = world.regions[rid];
        if (region) region.parent = '';
      }
    });
  };

  /**
   * 整批改名（原子操作）：先把新名字整套算好，再一次性搬 key。
   * 逐个改会在中间状态撞上「已经有同名的行了」，所以必须一次算完。
   */
  const setAxisLabels = (board, kind, values) => {
    const list = kind === 'row' ? (board.rows = board.rows || []) : (board.cols = board.cols || []);
    const label = i18n.t(kind === 'row' ? 'worldmap.row' : 'worldmap.col');
    const cleaned = values.map(v => String(v == null ? '' : v).trim());
    if (!cleaned.length) return i18n.t('worldmap.axis_empty_msg', { axis: label });
    if (cleaned.some(v => !v)) return i18n.t('worldmap.axis_blank_name', { axis: label });
    if (new Set(cleaned).size !== cleaned.length) return i18n.t('worldmap.axis_dup_name', { axis: label });
    const tail = list.slice(cleaned.length);
    const clash = cleaned.filter(v => tail.includes(v));
    if (clash.length) return i18n.t('worldmap.axis_clash', { axis: label, list: clash.join('、') });
    const map = {};
    list.forEach((old, i) => { if (i < cleaned.length) map[old] = cleaned[i]; });
    const moved = {};
    Object.keys(board.cells || {}).forEach(k => {
      const cut = k.indexOf('|');
      const r0 = k.slice(0, cut);
      const c0 = k.slice(cut + 1);
      const nr = kind === 'row' ? (map[r0] || r0) : r0;
      const nc = kind === 'col' ? (map[c0] || c0) : c0;
      moved[nr + '|' + nc] = board.cells[k];
    });
    if (Object.keys(moved).length !== Object.keys(board.cells || {}).length) {
      return i18n.t('worldmap.rename_clash');
    }
    board.cells = moved;
    list.length = 0;
    cleaned.forEach(v => list.push(v));
    return '';
  };

  /** 加一行 / 一列：position 是 'end'（末尾）或 'start'（最前）。 */
  const addAxis = (board, kind, position) => {
    position = position || 'end';
    const list = kind === 'row' ? (board.rows = board.rows || []) : (board.cols = board.cols || []);
    const fallback = nextAxisLabel(list, position, kind);
    askDialog(i18n.t(position === 'start' ? 'worldmap.add_axis_front' : 'worldmap.add_axis_end', {axis: i18n.t(kind === 'row' ? 'worldmap.row' : 'worldmap.col')}),
      i18n.t('common.name'), fallback, v => {
        const name = (v || '').trim() || fallback;
        if (list.includes(name)) { toast(i18n.t('worldmap.axis_name_exists', {axis: i18n.t(kind === 'row' ? 'worldmap.row' : 'worldmap.col')}), 'err'); return; }
        if (position === 'start') list.unshift(name); else list.push(name);
        touch('worldmap');
        if (board === world) drawGrid(); else drawRegion();
      });
  };

  const drawGrid = () => {
    clear(left);
    const card = h('div', { class: 'card' });
    card.appendChild(h('h2', null, world.name || i18n.t('nav.worldmap'),
      h('span', { class: 'hint', text: i18n.t('worldmap.root_hint') })));
    card.appendChild(h('div', { class: 'inline', style: { marginBottom: '8px' } },
      h('button', { class: 'mini', text: i18n.t('worldmap.add_row_end'), title: i18n.t('worldmap.add_axis_end', {axis: i18n.t('worldmap.row')}), onclick: () => addAxis(world, 'row', 'end') }),
      h('button', { class: 'mini', text: i18n.t('worldmap.add_row_start'), title: i18n.t('worldmap.add_axis_front', {axis: i18n.t('worldmap.row')}), onclick: () => addAxis(world, 'row', 'start') }),
      h('button', { class: 'mini', text: i18n.t('worldmap.add_col_end'), title: i18n.t('worldmap.add_axis_end', {axis: i18n.t('worldmap.col')}), onclick: () => addAxis(world, 'col', 'end') }),
      h('button', { class: 'mini', text: i18n.t('worldmap.add_col_start'), title: i18n.t('worldmap.add_axis_front', {axis: i18n.t('worldmap.col')}), onclick: () => addAxis(world, 'col', 'start') }),
      h('button', { class: 'mini', text: i18n.t('worldmap.axes_button'), title: i18n.t('worldmap.batch_rename'), onclick: () => axisDialog(world) }),
      h('span', { class: 'small muted', text: i18n.t('worldmap.grid_size', { rows: (world.rows || []).length, cols: (world.cols || []).length }) })));
    card.appendChild(h('div', { class: 'grid-wrap' }, boardTable(world, '', {})));
    const loose = Object.values(world.regions).filter(r => !placedIds(world).has(r.id));
    if (loose.length) {
      card.appendChild(h('div', { class: 'small muted', style: { marginTop: '8px' } },
        i18n.t('worldmap.loose_hint', { list: loose.map(r => r.name).join('、') })));
    }
    left.appendChild(card);
  };

  const drawRegion = () => {
    clear(right);
    const region = world.regions[ui.sel];
    if (!region) {
      right.appendChild(h('div', { class: 'card muted', text: i18n.t('worldmap.pick_cell') }));
      return;
    }
    region.elements = region.elements || [];
    const depth = worldDepth(world, region.id);
    const card = h('div', { class: 'card' });
    const crumbs = h('div', { class: 'crumbs' }, [h('span', {
      class: 'crumb', text: i18n.t('nav.worldmap'),
      onclick: () => { ui.sel = null; drawGrid(); drawRegion(); }
    })]);
    worldChain(world, region.id).forEach(pid => {
      const rg = world.regions[pid];
      if (!rg) return;
      crumbs.appendChild(h('span', { text: '›' }));
      crumbs.appendChild(h('span', { class: 'crumb', text: rg.name, onclick: () => open(rg.id) }));
    });
    crumbs.appendChild(h('span', { text: '›' }));
    crumbs.appendChild(h('span', { text: i18n.t('worldmap.depth_crumb', { name: region.name, depth: depth }) }));
    card.appendChild(crumbs);
    card.appendChild(h('button',{class:'mini',text:i18n.t('relations.graph'),onclick:()=>openRelationRecord({collection:'worldmap',id:region.id})}));

    card.appendChild(h('div', { class: 'field' }, h('label', { text: i18n.t('worldmap.region_name_label') }),
      h('input', { type: 'text', value: region.name || '', oninput: e => { region.name = e.target.value; touch('worldmap'); drawGrid(); } })));
    card.appendChild(h('div', { class: 'field' }, h('label', { text: i18n.t('worldmap.summary_label') }),
      h('input', { type: 'text', value: region.summary || '', oninput: e => { region.summary = e.target.value; touch('worldmap'); } })));

    card.appendChild(h('div', { class: 'sep' }));
    card.appendChild(h('div', { class: 'inline' },
      h('label', { text: i18n.t('worldmap.elements_label'), style: { flex: '1' } }),
      h('button', {
        class: 'mini', text: i18n.t('worldmap.apply_other_template'),
        onclick: () => { const added = applyPreset(region.elements, presetsOf('other')); touch('worldmap'); drawRegion(); toast(added ? i18n.t('records.template_added', { count: added }) : i18n.t('worldmap.nothing_to_add'), 'ok'); }
      })));
    card.appendChild(elementTree(region.elements, 'worldmap', { onChange: () => { } }));

    card.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', { text: i18n.t('worldmap.details_label') }),
      h('textarea', { rows: 6, value: region.details || '', oninput: e => { region.details = e.target.value; touch('worldmap'); autoGrow(e.target); } })));

    card.appendChild(h('div', { class: 'sep' }));
    if (depth >= WORLD_MAX_DEPTH) {
      card.appendChild(h('h2', null, i18n.t('worldmap.subgrid')));
      card.appendChild(h('div', { class: 'small muted' },
        i18n.t('worldmap.depth_max', { depth: depth, max: WORLD_MAX_DEPTH })));
    } else {
      card.appendChild(h('h2', null, i18n.t('worldmap.subgrid'),
        h('span', { class: 'hint', text: i18n.t('worldmap.subgrid_hint', {depth: depth + 1}) })));
      if (!region.board) {
        card.appendChild(h('div', { class: 'small muted', style: { marginBottom: '6px' } },
          i18n.t('worldmap.no_subgrid')));
        card.appendChild(h('button', {
          class: 'mini', text: i18n.t('worldmap.create_subgrid'),
          onclick: () => { region.board = newBoard(); touch('worldmap'); drawRegion(); toast(i18n.t('worldmap.subgrid_created'), 'ok'); }
        }));
      } else {
        const board = region.board;
        board.rows = board.rows || [];
        board.cols = board.cols || [];
        card.appendChild(h('div', { class: 'inline', style: { marginBottom: '8px' } },
          h('button', { class: 'mini', text: i18n.t('worldmap.add_row_end'), title: i18n.t('worldmap.add_axis_end', {axis: i18n.t('worldmap.row')}), onclick: () => addAxis(board, 'row', 'end') }),
          h('button', { class: 'mini', text: i18n.t('worldmap.add_row_start'), title: i18n.t('worldmap.add_axis_front', {axis: i18n.t('worldmap.row')}), onclick: () => addAxis(board, 'row', 'start') }),
          h('button', { class: 'mini', text: i18n.t('worldmap.add_col_end'), title: i18n.t('worldmap.add_axis_end', {axis: i18n.t('worldmap.col')}), onclick: () => addAxis(board, 'col', 'end') }),
          h('button', { class: 'mini', text: i18n.t('worldmap.add_col_start'), title: i18n.t('worldmap.add_axis_front', {axis: i18n.t('worldmap.col')}), onclick: () => addAxis(board, 'col', 'start') }),
          h('button', { class: 'mini', text: i18n.t('worldmap.axes_button'), title: i18n.t('worldmap.batch_rename'), onclick: () => axisDialog(board) }),
          h('span', { class: 'small muted', text: i18n.t('worldmap.grid_size', { rows: board.rows.length, cols: board.cols.length }) })));
        card.appendChild(h('div', { class: 'grid-wrap' }, boardTable(board, region.id, { sub: true, label: i18n.t('worldmap.subgrid') })));
        if (!Object.keys(boardCells(board)).length) {
          card.appendChild(h('div', { class: 'small muted', style: { marginTop: '6px' } },
            i18n.t('worldmap.grid_empty_note')));
        }
      }
    }

    card.appendChild(h('div', { class: 'sep' }));
    card.appendChild(h('div', { class: 'inline' },
      region.parent ? h('button', {
        text: i18n.t('worldmap.detach'),
        onclick: () => {
          const back = region.parent;
          detach(region.id);
          touch('worldmap');
          ui.sel = back;
          drawGrid(); drawRegion();
        }
      }) : h('span', { class: 'small muted', text: i18n.t('worldmap.in_root') }),
      h('span', { style: { flex: '1' } }),
      h('button', {
        class: 'danger', text: i18n.t('worldmap.delete_region'),
        onclick: () => {
          const ids = subtreeIds(world, region.id);
          confirmDialog(i18n.t('worldmap.delete_region_title'), i18n.t(ids.length > 1 ? 'worldmap.delete_with_children' : 'worldmap.delete_full', {name: region.name, count: ids.length - 1}),
            () => {
              ids.forEach(rid => { detach(rid); delete world.regions[rid]; });
              ui.sel = null;
              touch('worldmap'); drawGrid(); drawRegion();
            });
        }
      })));
    right.appendChild(card);
  };

  drawGrid();
  drawRegion();
}

// ═══════════════════════════════════════════
// 记忆库
// ═══════════════════════════════════════════
function viewMemories(main) {
  const coll = state.db.memories;
  coll.items = coll.items || [];
  coll.categories = coll.categories || [i18n.t('defaults.memory.short')];
  // Relation navigation may initialize only sel; complete the page state on every entry.
  const ui = state.ui.memories = state.ui.memories || {};
  ui.sel = ui.sel ?? null;
  ui.q = typeof ui.q === 'string' ? ui.q : '';
  ui.cat = typeof ui.cat === 'string' ? ui.cat : '';
  if (!coll.items.some(r => r.id === ui.sel)) ui.sel = coll.items.length ? coll.items[0].id : null;

  main.appendChild(pageHead(i18n.t('nav.memories'),
    '',
    h('div', { class: 'inline' },
      guidanceButton(i18n.t('nav.memories'),i18n.t('memories.page_desc')),
      exportButtons('memories'),
      h('button', { text: i18n.t('memories.compress_all'), onclick: () => compressMemories(coll.items) }),
      h('button', {
        class: 'primary', text: i18n.t('memories.new'),
        onclick: () => {
          const stamp = nowStr();
          const rec = { id: newId('mm'), title: i18n.t('defaults.memory.new_title'), category: i18n.t('defaults.memory.short'), chapter: '', content: '', tags: [], created: stamp, updated: stamp };
          coll.items.unshift(rec); ui.sel = rec.id; touch('memories'); renderMain();
        }
      }))));



  const row = h('div', { class: 'row' });
  const left = h('div', { class: 'col', style: { flex: '0 0 300px' } });
  const right = h('div', { class: 'col' });
  row.appendChild(left); row.appendChild(right);
  main.appendChild(row);

  // 与其它列表一致：容器复用 + 选中只切高亮，点条目不会跳回顶部
  const memScroll = h('div', { class: 'list scroll' });
  const memRowEls = new Map();

  const drawList = () => {
    const keepTop = memScroll.scrollTop;
    clear(left);
    memRowEls.clear();
    const catSel = h('select', { onchange: e => { ui.cat = e.target.value; drawList(); } },
      [h('option', { value: '', text: i18n.t('memories.all_categories'), selected: ui.cat === '' })]
        .concat(coll.categories.map(c => h('option', { value: c, text: c, selected: ui.cat === c }))));
    const search = h('input', { type: 'text', placeholder: i18n.t('common.search'), value: ui.q, oninput: e => { ui.q = e.target.value; drawList(); } });
    const q = ui.q.toLowerCase();
    clear(memScroll);
    coll.items
      .filter(r => (!ui.cat || r.category === ui.cat) && (!q || JSON.stringify(r).toLowerCase().includes(q)))
      .forEach(r => {
        const rowEl = h('div', {
        class: 'list-item' + (ui.sel === r.id ? ' active' : ''),
        onclick: () => { ui.sel = r.id; memRowEls.forEach((el, rid) => el.classList.toggle('active', rid === r.id)); drawEditor(); }
      });
        rowEl.appendChild(h('div', { class: 'name', text: r.title || i18n.t('common.unnamed') }));
        rowEl.appendChild(h('div', { class: 'meta', text: i18n.t('memories.meta_line', { category: r.category || '', count: String(r.content || '').length }) }));
        memRowEls.set(r.id, rowEl);
        memScroll.appendChild(rowEl);
      });
    left.appendChild(h('div', { class: 'card' },
      h('div', { class: 'field' }, catSel),
      h('div', { class: 'field' }, search),
      h('div', { class: 'small muted', style: { marginBottom: '6px' } }, i18n.t('records.total', { count: coll.items.length })),
      memScroll));
    memScroll.scrollTop = keepTop;
  };

  const drawEditor = () => {
    clear(right);
    const rec = coll.items.find(r => r.id === ui.sel);
    if (!rec) { right.appendChild(h('div', { class: 'card muted', text: i18n.t('memories.pick_hint') })); return; }
    const card = h('div', { class: 'card' });
    card.appendChild(h('h2', null, i18n.t('memories.edit_title'), h('span', { class: 'hint', text: i18n.t('common.autosave') })));
    card.appendChild(h('button',{class:'mini',text:i18n.t('relations.graph'),onclick:()=>openRelationRecord({collection:'memories',id:rec.id})}));
    card.appendChild(h('div', { class: 'field' }, h('label', { text: i18n.t('common.title') }),
      h('input', { type: 'text', value: rec.title || '', oninput: e => { rec.title = e.target.value; touch('memories'); } })));
    card.appendChild(h('div', { class: 'inline' },
      h('div', { class: 'field', style: { flex: '1' } }, h('label', { text: i18n.t('memories.category_label') }),
        h('select', { onchange: e => { rec.category = e.target.value; touch('memories'); } },
          coll.categories.map(c => h('option', { value: c, text: c, selected: c === rec.category })))),
      h('div', { class: 'field', style: { flex: '1' } }, h('label', { text: i18n.t('memories.chapter_label') }),
        h('input', { type: 'text', value: rec.chapter || '', oninput: e => { rec.chapter = e.target.value; touch('memories'); } }))));
    card.appendChild(h('div', { class: 'field' }, h('label', { text: i18n.t('common.content') }),
      h('textarea', { rows: 16, value: rec.content || '', oninput: e => { rec.content = e.target.value; touch('memories'); autoGrow(e.target); } })));
    card.appendChild(h('div', { class: 'inline' },
      h('button', {
        class: 'mini', text: i18n.t('records.add_category'),
        onclick: () => { const v = prompt(i18n.t('records.new_category_prompt')); if (v) { coll.categories.push(v); rec.category = v; touch('memories'); drawList(); drawEditor(); } }
      }),
      h('button', { text: i18n.t('memories.compress_one'), onclick: () => compressMemories([rec]) }),
      h('span', { style: { flex: '1' } }),
      rec.source ? h('span', { class: 'tag', text: i18n.t('common.source_prefix', { source: rec.source }) }) : null,
      h('button', {
        class: 'danger', text: i18n.t('common.delete'),
        onclick: () => {
          if (!confirm(i18n.t('memories.delete_confirm'))) return;
          coll.items.splice(coll.items.indexOf(rec), 1);
          ui.sel = null; touch('memories'); drawList(); drawEditor();
        }
      })));
    right.appendChild(card);
  };

  drawList(); drawEditor();
}

async function compressMemories(records) {
  if (!records.length) { toast(i18n.t('memories.nothing_compress'), 'err'); return; }
  const text = records.map(r => '### ' + (r.title || '') + '\n' + (r.content || '')).join('\n\n');
  status(i18n.t('common.compressing'), 'busy');
  try {
    const res = await api('/api/ai/run', { method: 'POST', body: { tool: 'compress', text, config: state.db.config } });
    const ta = h('textarea', { rows: 18, value: res.text });
    const body = h('div', null,
      h('div', { class: 'small muted', text: i18n.t('memories.compress_stat', { before: text.length, after: res.text.length }) }),
      h('div', { class: 'field' }, h('label', { text: i18n.t('memories.compress_result') }), ta));
    const m = modal(i18n.t('memories.compress_title'), body, [
      h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() }),
      h('button', {
        text: i18n.t('memories.save_as_new'), dataset: { noclose: '1' },
        onclick: () => {
          const stamp = nowStr();
          state.db.memories.items.unshift({
            id: newId('mm'), title: (records[0].title || i18n.t('defaults.memory.compress_title')) + i18n.t('memories.compressed_suffix'),
            category: records[0].category || i18n.t('defaults.memory.long'), chapter: records[0].chapter || '',
            content: ta.value, tags: [], created: stamp, updated: stamp
          });
          touch('memories'); renderMain(); m.close(); toast(i18n.t('memories.saved_new'), 'ok');
        }
      }),
      h('button', {
        class: 'primary', text: i18n.t('memories.replace_original'), dataset: { noclose: '1' },
        onclick: () => {
          const sections = splitMdSections(ta.value);
          records.forEach((rec, i) => {
            if (sections[i]) rec.content = sections[i].body;
            else if (records.length === 1) rec.content = ta.value;
          });
          touch('memories'); renderMain(); m.close(); toast(i18n.t('memories.updated'), 'ok');
        }
      })
    ]);
    status(i18n.t('common.compress_done'), 'ok');
  } catch (e) {
    toast(i18n.t('memories.compress_failed_reason', { reason: e.message }), 'err');
    status(i18n.t('memories.compress_failed'), 'err');
  }
}

function splitMdSections(text) {
  const out = [];
  let cur = null;
  for (const line of String(text || '').split('\n')) {
    const m = line.match(/^###\s+(.*)$/);
    if (m) { cur = { title: m[1].trim(), body: '' }; out.push(cur); continue; }
    if (cur) cur.body += line + '\n';
  }
  return out.map(s => ({ title: s.title, body: s.body.trim() }));
}

// ═══════════════════════════════════════════
// 章节与产出
// ═══════════════════════════════════════════
function viewChapters(main) {
  main.appendChild(pageHead(i18n.t('nav.chapters'), i18n.t('chapters.page_desc'),
    h('button', { text: i18n.t('common.refresh'), onclick: async () => { await refreshFiles(); renderMain(); } })));
  const card = h('div', { class: 'card' });
  const table = h('table', { class: 'grid' });
  table.appendChild(h('tr', null, ['file', 'dir', 'size', 'mtime', 'actions'].map(key => h('th', { text: i18n.t('chapters.col_' + key) }))));
  for (const c of state.chapters) {
    const actions = h('div', { class: 'inline', style: { justifyContent: 'center' } },
      h('button', { class: 'mini', text: i18n.t('common.preview'), onclick: () => previewFile(c.path) }),
      c.path.endsWith('.md') ? h('button', {
        class: 'mini', text: i18n.t('chapters.to_txt'),
        onclick: async () => {
          try { const r = await api('/api/txt', { method: 'POST', body: { path: c.path } }); toast(i18n.t('chapters.generated', { path: r.path }), 'ok'); await refreshFiles(); }
          catch (e) { toast(i18n.t('chapters.convert_failed_reason', { reason: e.message }), 'err'); }
        }
      }) : null,
      h('button', {
        class: 'mini', text: i18n.t('chapters.send_to_manuscript'),
        onclick: async () => {
          try {
            const r = await api('/api/file?path=' + encodeURIComponent(c.path));
            appendToTextPanel(r.content, false, { title: c.name, source: 'chapter' });
            go('text');
          } catch (e) { toast(i18n.t('common.read_failed_reason', { reason: e.message }), 'err'); }
        }
      }));
    table.appendChild(h('tr', null,
      h('td', { style: { textAlign: 'left' }, text: c.name }),
      h('td', { class: 'muted small', text: c.dir }),
      h('td', { text: (c.size / 1024).toFixed(1) + ' KB' }),
      h('td', { class: 'small muted', text: c.mtime }),
      h('td', null, actions)));
  }
  card.appendChild(table);
  main.appendChild(card);
}

async function previewFile(rel) {
  try {
    const r = await api('/api/file?path=' + encodeURIComponent(rel));
    modal(rel, h('pre', { class: 'log', style: { maxHeight: '56vh' }, text: r.content }), [h('button', { text: i18n.t('common.close') })]);
  } catch (e) { toast(i18n.t('common.read_failed_reason', { reason: e.message }), 'err'); }
}

