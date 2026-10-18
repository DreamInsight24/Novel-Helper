/* NovelHelper —— 背包 / 世界地图 / 记忆 / 章节 / 纯文本工作站 */
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
  main.appendChild(pageHead('人物背包',
    '背包只在这里编辑（人物档案页不再重复）。选人物 → 入包 / 穿戴，指针直接指向「道具设定」与「服饰与装备」；' +
    '钱袋是背包的特殊字段，可以填数量或富裕 / 一般 / 紧张，留空＝不体现。'));
  const chars = collItems('characters');
  if (!chars.length) {
    main.appendChild(h('div', { class: 'card muted', text: '人物背包只编辑已有人物的随身物品与穿戴。还没有人物时，请到「人物档案」新建，或在该页导入人物 JSON。' }));
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
    card.appendChild(h('h2', null, recordName(rec) + ' · 背包'));
    // 钱袋：背包的特殊字段。填数量（2金3银2铜）或档位（富裕 / 一般 / 紧张）都行，
    // 留空＝不重要，提示词里不会出现这一行。
    card.appendChild(h('div', { class: 'field' },
      h('label', { text: '钱袋' }),
      h('input', {
        class: 'purse', type: 'text', list: 'purse-levels', value: rec.purse || '',
        placeholder: '留空＝不体现；也可以填 富裕 / 一般 / 紧张',
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
      line.appendChild(h('span', { class: 'tag', text: target ? recordName(target) : '⚠ 指针失效' }));
      if (qty) {
        line.appendChild(h('input', {
          type: 'number', value: entry.qty == null ? 1 : entry.qty, style: { width: '72px' }, title: '数量',
          oninput: e => { entry.qty = e.target.value === '' ? 1 : Number(e.target.value); touch('characters'); }
        }));
      }
      line.appendChild(h('input', {
        type: 'text', value: entry.note || '', placeholder: '备注（就是这一条发给模型的解释）', style: { flex: '1' },
        oninput: e => { entry.note = e.target.value; touch('characters'); }
      }));
      line.appendChild(h('label', { class: 'check small', title: '带上身（随身 / 穿戴）；取消＝放进「已拥有」' },
        h('input', {
          type: 'checkbox', checked: entry.carried !== false,
          onchange: e => {
            if (e.target.checked) delete entry.carried; else entry.carried = false;
            touch('characters'); redraw();
          }
        }), '携带'));
      line.appendChild(h('button', {
        class: 'ghost mini', text: '✕', title: '移出背包',
        onclick: () => { rec[listKey] = rec[listKey].filter(x => x !== entry); touch('characters'); redraw(); }
      }));
      return line;
    };
    const addBar = targets => h('div', { class: 'inline', style: { marginTop: '4px' } }, targets.map(t => h('button', {
      class: 'mini', text: '＋ ' + t.label,
      onclick: () => {
        const options = collItems(t.coll).map(x => ({ value: x.id, label: recordName(x), meta: x.category || '' }));
        if (!options.length) { toast('目标集合还是空的。', 'err'); return; }
        pickDialog('选择要添加的' + t.label, options, id => {
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
      if (!rows.length) box.appendChild(h('div', { class: 'muted small', text: '（空）' }));
      rows.forEach(r => box.appendChild(packRow(r.entry, r.listKey, r.coll, r.idKey, r.qty)));
      box.appendChild(addBar(targets));
      return box;
    };
    const on = e => e.carried !== false;
    card.appendChild(block('随身物品', '携带中',
      rec.inventory.filter(e => e.item_id && on(e)).map(e => ({ entry: e, listKey: 'inventory', coll: 'items', idKey: 'item_id', qty: true })),
      [{ label: '从道具中添加', listKey: 'inventory', coll: 'items', idKey: 'item_id', qty: true, carried: true }]));
    card.appendChild(block('穿戴与装备', '佩戴中',
      rec.equipment.filter(e => e.equip_id && on(e)).map(e => ({ entry: e, listKey: 'equipment', coll: 'equipment', idKey: 'equip_id', qty: false })),
      [{ label: '从服饰/装备中添加', listKey: 'equipment', coll: 'equipment', idKey: 'equip_id', qty: false, carried: true }]));
    card.appendChild(block('已拥有（未携带）', '存在、但没带在身上',
      rec.inventory.filter(e => e.item_id && !on(e)).map(e => ({ entry: e, listKey: 'inventory', coll: 'items', idKey: 'item_id', qty: true }))
        .concat(rec.equipment.filter(e => e.equip_id && !on(e)).map(e => ({ entry: e, listKey: 'equipment', coll: 'equipment', idKey: 'equip_id', qty: false }))),
      [{ label: '道具', listKey: 'inventory', coll: 'items', idKey: 'item_id', qty: true, carried: false },
       { label: '服饰/装备', listKey: 'equipment', coll: 'equipment', idKey: 'equip_id', qty: false, carried: false }]));

    card.appendChild(h('div', { class: 'sep' }));
    const lines = ['### ' + recordName(rec) + ' · 完整外貌拼装'].concat(renderElementsMd(rec.elements, 0));
    const worn = (rec.equipment || []).map(e => findById('equipment', e.equip_id)).filter(Boolean);
    if (worn.length) {
      lines.push('- 穿戴：' + worn.map(w => {
        const look = flatValues(elementToNested(w.elements || [])).slice(0, 2).join('，');
        return w.name + (look ? '（' + look + '）' : '');
      }).join('；'));
    }
    const items = (rec.inventory || []).map(e => findById('items', e.item_id)).filter(Boolean);
    if (items.length) lines.push('- 随身：' + items.map(t => t.name).join('、'));
    if ((rec.purse || '').trim()) lines.splice(1, 0, '- 钱袋：' + rec.purse.trim());
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
  return { rows: ['北', '中', '南'], cols: ['西', '中', '东'], cells: {} };
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
  const prefix = kind === 'row' ? (side === 'start' ? '北' : '南') : (side === 'start' ? '西' : '东');
  const numbered = list.some(x => new RegExp('^' + prefix + '\\d+$').test(x));
  if (!numbered) return list.includes(prefix) ? prefix + '2' : prefix;
  let n = 1;
  while (list.includes(prefix + n)) n += 1;
  return prefix + n;
}

function newRegionRecord(name) {
  const stamp = nowStr();
  return {
    id: newId('rg'), name: (name || '').trim() || '未命名区域', summary: '', details: '',
    elements: [], parent: '', tags: [], created: stamp, updated: stamp
  };
}

function viewWorld(main) {
  const world = state.db.worldmap;
  world.cells = world.cells || {};
  world.regions = world.regions || {};
  state.ui.world = state.ui.world || { sel: null };
  const ui = state.ui.world;

  main.appendChild(pageHead('世界地图',
    '一棵确定的树：根表格每格挂一个区域，区域自己的子表格再挂子区域，最多 ' + WORLD_MAX_DEPTH +
    ' 层。行、列都能加；完全没内容的表格不会写进提示词。',
    h('div', { class: 'inline' },
      exportButtons('worldmap'),
      h('button', {
        text: '重命名地图',
        onclick: () => askDialog('重命名地图', '地图名称', world.name || '', v => {
          world.name = (v || '').trim() || world.name;
          touch('worldmap'); renderMain();
        })
      }))));

  main.appendChild(importPanel('json', { title: '导入地图 JSON', kinds: ['json'], target: 'worldmap' }));

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
    if (parentId && subtreeIds(world, id).includes(parentId)) return '不能把区域挪进它自己的子区域里。';
    const depth = parentId ? worldDepth(world, parentId) + 1 : 1;
    if (depth + subtreeHeight(world, id) - 1 > WORLD_MAX_DEPTH) {
      return '挪过去会超过地图深度上限（' + WORLD_MAX_DEPTH + ' 层）。';
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
      if (!from) { toast('这一格已经有区域了。', 'err'); return; }
      const problem = canPlace(id, parentId) || canPlace(occupant.id, from.parentId);
      if (problem) { toast(problem, 'err'); return; }
      board.cells[key] = id;
      region.parent = parentId || '';
      from.board.cells[from.key] = occupant.id;
      occupant.parent = from.parentId || '';
      toast('已交换「' + region.name + '」与「' + occupant.name + '」', 'ok');
    } else {
      const problem = canPlace(id, parentId);
      if (problem) { toast(problem, 'err'); return; }
      if (from) delete from.board.cells[from.key];
      board.cells = board.cells || {};
      board.cells[key] = id;
      region.parent = parentId || '';
      toast('已移动「' + region.name + '」', 'ok');
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
    const nameInput = h('input', { type: 'text', placeholder: '区域名称，例如：史莱姆森林' });
    const loose = Object.values(world.regions).filter(r => !placedIds(world).has(r.id));
    const body = h('div', null,
      h('div', { class: 'field' }, h('label', { text: label }), nameInput),
      loose.length ? h('div', { class: 'small muted', text: '或者挂接一个还没挂上的区域：' + loose.map(r => r.name).join('、') }) : null);
    const m = modal('这一格放什么', body, [
      loose.length ? h('button', {
        text: '挂接已有区域',
        onclick: () => {
          const options = Object.values(world.regions).filter(r => !placedIds(world).has(r.id))
            .map(r => ({ value: r.id, label: r.name, meta: r.summary || '' }));
          pickDialog('选择要挂上的区域', options, id => {
            attach(id, board, parentId, key);
            touch('worldmap'); m.close(); open(id);
          });
        }
      }) : null,
      h('span', { style: { flex: '1' } }),
      h('button', { text: '取消', onclick: () => m.close() }),
      h('button', {
        class: 'primary', text: '创建并挂上',
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
      class: 'axis-th', text: label, title: '点一下改这一' + (kind === 'row' ? '行' : '列') + '的名字',
      onclick: () => renameAxis(board, kind, index)
    });
    table.appendChild(h('tr', null, h('th', { text: '方位' }),
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
          title: region ? '拖动＝换位置（拖到别的格会互换）；点击＝编辑'
                        : '点一下新建 / 挂接区域，也可以把别的区域拖进来',
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
    if (list.includes(label)) { toast('已经有同名的' + (kind === 'row' ? '行' : '列') + '了：' + label, 'err'); return false; }
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
    askDialog('改这一' + (kind === 'row' ? '行' : '列') + '的名字', '名称', list[index] || '', v => {
      if (setAxisLabel(board, kind, index, v)) { touch('worldmap'); drawGrid(); drawRegion(); }
    });
  };

  /** 整批改名：一行一个名字。 */
  const axisDialog = board => {
    const rowTa = h('textarea', { rows: Math.min(12, Math.max(3, (board.rows || []).length)), value: (board.rows || []).join('\n') });
    const colTa = h('textarea', { rows: Math.min(12, Math.max(3, (board.cols || []).length)), value: (board.cols || []).join('\n') });
    const m = modal('行 / 列名称', h('div', null,
      h('div', { class: 'field' }, h('label', { text: '行（一行一个）' }), rowTa),
      h('div', { class: 'field' }, h('label', { text: '列（一行一个）' }), colTa),
      h('div', { class: 'small muted', text: '改名字直接改；少写几行＝从末尾删掉几行（里面挂的区域会变成未挂接，不会删掉区域）。增加请用 ＋ 按钮。' })), [
      h('button', { text: '取消', onclick: () => m.close() }),
      h('button', {
        class: 'primary', text: '保存', dataset: { noclose: '1' },
        onclick: () => {
          const rows = rowTa.value.split('\n').map(s => s.trim()).filter(s => s !== '');
          const cols = colTa.value.split('\n').map(s => s.trim()).filter(s => s !== '');
          if (!rows.length || !cols.length) { toast('行列不能清空。', 'err'); return; }
          if (rows.length > (board.rows || []).length || cols.length > (board.cols || []).length) {
            toast('名字数量不能多于现有行列；增加请用 ＋ 按钮。', 'err');
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
            confirmDialog('删掉末尾的行列？',
              '会删掉末尾 ' + dropRows + ' 行、' + dropCols + ' 列；挂在上面的区域会变成「未挂接」（区域本身不会删）。',
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
    const label = kind === 'row' ? '行' : '列';
    const cleaned = values.map(v => String(v == null ? '' : v).trim());
    if (!cleaned.length) return label + '不能为空。';
    if (cleaned.some(v => !v)) return '有空的' + label + '名。';
    if (new Set(cleaned).size !== cleaned.length) return '有重复的' + label + '名。';
    const tail = list.slice(cleaned.length);
    const clash = cleaned.filter(v => tail.includes(v));
    if (clash.length) return '和末尾待删的' + label + '名撞了：' + clash.join('、');
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
      return '改名后有两格撞在一起了，换一组名字试试。';
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
    askDialog((position === 'start' ? '在最前面加一' : '在最后面加一') + (kind === 'row' ? '行' : '列'),
      '名称', fallback, v => {
        const name = (v || '').trim() || fallback;
        if (list.includes(name)) { toast('已经有同名的' + (kind === 'row' ? '行' : '列') + '了。', 'err'); return; }
        if (position === 'start') list.unshift(name); else list.push(name);
        touch('worldmap');
        if (board === world) drawGrid(); else drawRegion();
      });
  };

  const drawGrid = () => {
    clear(left);
    const card = h('div', { class: 'card' });
    card.appendChild(h('h2', null, world.name || '世界地图',
      h('span', { class: 'hint', text: '根表格（第 1 层）：点空白格新建 / 挂接区域，点已有区域进入编辑' })));
    card.appendChild(h('div', { class: 'inline', style: { marginBottom: '8px' } },
      h('button', { class: 'mini', text: '＋行·末', title: '在最后面加一行', onclick: () => addAxis(world, 'row', 'end') }),
      h('button', { class: 'mini', text: '＋行·首', title: '在最前面加一行', onclick: () => addAxis(world, 'row', 'start') }),
      h('button', { class: 'mini', text: '＋列·末', title: '在最后面加一列', onclick: () => addAxis(world, 'col', 'end') }),
      h('button', { class: 'mini', text: '＋列·首', title: '在最前面加一列', onclick: () => addAxis(world, 'col', 'start') }),
      h('button', { class: 'mini', text: '行 / 列名称…', title: '整批改名', onclick: () => axisDialog(world) }),
      h('span', { class: 'small muted', text: (world.rows || []).length + ' 行 × ' + (world.cols || []).length + ' 列' })));
    card.appendChild(h('div', { class: 'grid-wrap' }, boardTable(world, '', {})));
    const loose = Object.values(world.regions).filter(r => !placedIds(world).has(r.id));
    if (loose.length) {
      card.appendChild(h('div', { class: 'small muted', style: { marginTop: '8px' } },
        '还没挂到地图上的区域：' + loose.map(r => r.name).join('、') + '（在任意空白格里可以挂接）'));
    }
    left.appendChild(card);
  };

  const drawRegion = () => {
    clear(right);
    const region = world.regions[ui.sel];
    if (!region) {
      right.appendChild(h('div', { class: 'card muted', text: '点左边的格子来查看 / 编辑区域。' }));
      return;
    }
    region.elements = region.elements || [];
    const depth = worldDepth(world, region.id);
    const card = h('div', { class: 'card' });
    const crumbs = h('div', { class: 'crumbs' }, [h('span', {
      class: 'crumb', text: '世界地图',
      onclick: () => { ui.sel = null; drawGrid(); drawRegion(); }
    })]);
    worldChain(world, region.id).forEach(pid => {
      const rg = world.regions[pid];
      if (!rg) return;
      crumbs.appendChild(h('span', { text: '›' }));
      crumbs.appendChild(h('span', { class: 'crumb', text: rg.name, onclick: () => open(rg.id) }));
    });
    crumbs.appendChild(h('span', { text: '›' }));
    crumbs.appendChild(h('span', { text: region.name + '（第 ' + depth + ' 层）' }));
    card.appendChild(crumbs);

    card.appendChild(h('div', { class: 'field' }, h('label', { text: '区域名称' }),
      h('input', { type: 'text', value: region.name || '', oninput: e => { region.name = e.target.value; touch('worldmap'); drawGrid(); } })));
    card.appendChild(h('div', { class: 'field' }, h('label', { text: '一句话简述' }),
      h('input', { type: 'text', value: region.summary || '', oninput: e => { region.summary = e.target.value; touch('worldmap'); } })));

    card.appendChild(h('div', { class: 'sep' }));
    card.appendChild(h('div', { class: 'inline' },
      h('label', { text: '区域元素（地形、气候、居民、危险度……）', style: { flex: '1' } }),
      h('button', {
        class: 'mini', text: '套用「其他设定」模板',
        onclick: () => { const added = applyPreset(region.elements, presetsOf('other')); touch('worldmap'); drawRegion(); toast(added ? '补充了 ' + added + ' 个元素' : '没有可补的元素', 'ok'); }
      })));
    card.appendChild(elementTree(region.elements, 'worldmap', { onChange: () => { } }));

    card.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', { text: '详细描述' }),
      h('textarea', { rows: 6, value: region.details || '', oninput: e => { region.details = e.target.value; touch('worldmap'); autoGrow(e.target); } })));

    card.appendChild(h('div', { class: 'sep' }));
    if (depth >= WORLD_MAX_DEPTH) {
      card.appendChild(h('h2', null, '子表格'));
      card.appendChild(h('div', { class: 'small muted' },
        '这里已经是第 ' + depth + ' 层，达到地图深度上限（' + WORLD_MAX_DEPTH + ' 层），不能再往下开子表格。'));
    } else {
      card.appendChild(h('h2', null, '子表格',
        h('span', { class: 'hint', text: '第 ' + (depth + 1) + ' 层的区域挂在这里' })));
      if (!region.board) {
        card.appendChild(h('div', { class: 'small muted', style: { marginBottom: '6px' } },
          '还没有子表格。需要在下一层细分时再建，空表格不会写进提示词。'));
        card.appendChild(h('button', {
          class: 'mini', text: '＋ 创建 3×3 子表格',
          onclick: () => { region.board = newBoard(); touch('worldmap'); drawRegion(); toast('已创建 3×3 子表格', 'ok'); }
        }));
      } else {
        const board = region.board;
        board.rows = board.rows || [];
        board.cols = board.cols || [];
        card.appendChild(h('div', { class: 'inline', style: { marginBottom: '8px' } },
          h('button', { class: 'mini', text: '＋行·末', title: '在最后面加一行', onclick: () => addAxis(board, 'row', 'end') }),
          h('button', { class: 'mini', text: '＋行·首', title: '在最前面加一行', onclick: () => addAxis(board, 'row', 'start') }),
          h('button', { class: 'mini', text: '＋列·末', title: '在最后面加一列', onclick: () => addAxis(board, 'col', 'end') }),
          h('button', { class: 'mini', text: '＋列·首', title: '在最前面加一列', onclick: () => addAxis(board, 'col', 'start') }),
          h('button', { class: 'mini', text: '行 / 列名称…', title: '整批改名', onclick: () => axisDialog(board) }),
          h('span', { class: 'small muted', text: board.rows.length + ' 行 × ' + board.cols.length + ' 列' })));
        card.appendChild(h('div', { class: 'grid-wrap' }, boardTable(board, region.id, { sub: true, label: '子表格 ' })));
        if (!Object.keys(boardCells(board)).length) {
          card.appendChild(h('div', { class: 'small muted', style: { marginTop: '6px' } },
            '（表格还是空的——完全没有内容的表格不会出现在提示词里）'));
        }
      }
    }

    card.appendChild(h('div', { class: 'sep' }));
    card.appendChild(h('div', { class: 'inline' },
      region.parent ? h('button', {
        text: '解除挂接（放回未挂接）',
        onclick: () => {
          const back = region.parent;
          detach(region.id);
          touch('worldmap');
          ui.sel = back;
          drawGrid(); drawRegion();
        }
      }) : h('span', { class: 'small muted', text: '根表格里的区域' }),
      h('span', { style: { flex: '1' } }),
      h('button', {
        class: 'danger', text: '删除区域（含子区域）',
        onclick: () => {
          const ids = subtreeIds(world, region.id);
          confirmDialog('删除区域', '删除「' + region.name + '」' +
            (ids.length > 1 ? '及其下的 ' + (ids.length - 1) + ' 个子区域' : '') + '？删掉的区域不会出现在提示词里。',
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
  coll.categories = coll.categories || ['短期记忆'];
  state.ui.memories = state.ui.memories || { sel: null, q: '', cat: '' };
  const ui = state.ui.memories;
  if (!coll.items.some(r => r.id === ui.sel)) ui.sel = coll.items.length ? coll.items[0].id : null;

  main.appendChild(pageHead('记忆库',
    '集中管理短期记忆、长期记忆、伏笔与设定备忘。AI 工作站左侧可以按需勾选，只发送本次需要的条目。',
    h('div', { class: 'inline' },
      exportButtons('memories'),
      h('button', { text: '压缩全部记忆', onclick: () => compressMemories(coll.items) }),
      h('button', {
        class: 'primary', text: '＋ 新建记忆',
        onclick: () => {
          const stamp = nowStr();
          const rec = { id: newId('mm'), title: '新记忆', category: '短期记忆', chapter: '', content: '', tags: [], created: stamp, updated: stamp };
          coll.items.unshift(rec); ui.sel = rec.id; touch('memories'); renderMain();
        }
      }))));

  main.appendChild(importPanel('json', { title: '导入记忆 JSON', kinds: ['json'], target: 'memories' }));

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
      [h('option', { value: '', text: '全部分类', selected: ui.cat === '' })]
        .concat(coll.categories.map(c => h('option', { value: c, text: c, selected: ui.cat === c }))));
    const search = h('input', { type: 'text', placeholder: '搜索…', value: ui.q, oninput: e => { ui.q = e.target.value; drawList(); } });
    const q = ui.q.toLowerCase();
    clear(memScroll);
    coll.items
      .filter(r => (!ui.cat || r.category === ui.cat) && (!q || JSON.stringify(r).toLowerCase().includes(q)))
      .forEach(r => {
        const rowEl = h('div', {
        class: 'list-item' + (ui.sel === r.id ? ' active' : ''),
        onclick: () => { ui.sel = r.id; memRowEls.forEach((el, rid) => el.classList.toggle('active', rid === r.id)); drawEditor(); }
      });
        rowEl.appendChild(h('div', { class: 'name', text: r.title || '未命名' }));
        rowEl.appendChild(h('div', { class: 'meta', text: (r.category || '') + ' · ' + String(r.content || '').length + '字' }));
        memRowEls.set(r.id, rowEl);
        memScroll.appendChild(rowEl);
      });
    left.appendChild(h('div', { class: 'card' },
      h('div', { class: 'field' }, catSel),
      h('div', { class: 'field' }, search),
      h('div', { class: 'small muted', style: { marginBottom: '6px' } }, '共 ' + coll.items.length + ' 条'),
      memScroll));
    memScroll.scrollTop = keepTop;
  };

  const drawEditor = () => {
    clear(right);
    const rec = coll.items.find(r => r.id === ui.sel);
    if (!rec) { right.appendChild(h('div', { class: 'card muted', text: '左侧选一条记忆。' })); return; }
    const card = h('div', { class: 'card' });
    card.appendChild(h('h2', null, '编辑记忆', h('span', { class: 'hint', text: '自动保存' })));
    card.appendChild(h('div', { class: 'field' }, h('label', { text: '标题' }),
      h('input', { type: 'text', value: rec.title || '', oninput: e => { rec.title = e.target.value; touch('memories'); } })));
    card.appendChild(h('div', { class: 'inline' },
      h('div', { class: 'field', style: { flex: '1' } }, h('label', { text: '分类' }),
        h('select', { onchange: e => { rec.category = e.target.value; touch('memories'); } },
          coll.categories.map(c => h('option', { value: c, text: c, selected: c === rec.category })))),
      h('div', { class: 'field', style: { flex: '1' } }, h('label', { text: '章节 / 时间' }),
        h('input', { type: 'text', value: rec.chapter || '', oninput: e => { rec.chapter = e.target.value; touch('memories'); } }))));
    card.appendChild(h('div', { class: 'field' }, h('label', { text: '内容' }),
      h('textarea', { rows: 16, value: rec.content || '', oninput: e => { rec.content = e.target.value; touch('memories'); autoGrow(e.target); } })));
    card.appendChild(h('div', { class: 'inline' },
      h('button', {
        class: 'mini', text: '添加分类',
        onclick: () => { const v = prompt('新分类'); if (v) { coll.categories.push(v); rec.category = v; touch('memories'); drawList(); drawEditor(); } }
      }),
      h('button', { text: '压缩本条', onclick: () => compressMemories([rec]) }),
      h('span', { style: { flex: '1' } }),
      rec.source ? h('span', { class: 'tag', text: '来源：' + rec.source }) : null,
      h('button', {
        class: 'danger', text: '删除',
        onclick: () => {
          if (!confirm('删除这条记忆？')) return;
          coll.items.splice(coll.items.indexOf(rec), 1);
          ui.sel = null; touch('memories'); drawList(); drawEditor();
        }
      })));
    right.appendChild(card);
  };

  drawList(); drawEditor();
}

async function compressMemories(records) {
  if (!records.length) { toast('没有可压缩的记忆。', 'err'); return; }
  const text = records.map(r => '### ' + (r.title || '') + '\n' + (r.content || '')).join('\n\n');
  status('压缩记忆中…', 'busy');
  try {
    const res = await api('/api/ai/run', { method: 'POST', body: { tool: 'compress', text, config: state.db.config } });
    const ta = h('textarea', { rows: 18, value: res.text });
    const body = h('div', null,
      h('div', { class: 'small muted', text: '原 ' + text.length + ' 字 → 压缩后 ' + res.text.length + ' 字' }),
      h('div', { class: 'field' }, h('label', { text: '压缩结果（可直接改）' }), ta));
    const m = modal('记忆压缩结果', body, [
      h('button', { text: '取消', onclick: () => m.close() }),
      h('button', {
        text: '作为新条目保存', dataset: { noclose: '1' },
        onclick: () => {
          const stamp = nowStr();
          state.db.memories.items.unshift({
            id: newId('mm'), title: (records[0].title || '压缩记忆') + '（压缩）',
            category: records[0].category || '长期记忆', chapter: records[0].chapter || '',
            content: ta.value, tags: [], created: stamp, updated: stamp
          });
          touch('memories'); renderMain(); m.close(); toast('已保存为新条目', 'ok');
        }
      }),
      h('button', {
        class: 'primary', text: '替换原条目内容', dataset: { noclose: '1' },
        onclick: () => {
          const sections = splitMdSections(ta.value);
          records.forEach((rec, i) => {
            if (sections[i]) rec.content = sections[i].body;
            else if (records.length === 1) rec.content = ta.value;
          });
          touch('memories'); renderMain(); m.close(); toast('已更新记忆', 'ok');
        }
      })
    ]);
    status('压缩完成', 'ok');
  } catch (e) {
    toast('压缩失败：' + e.message, 'err');
    status('压缩失败', 'err');
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
  main.appendChild(pageHead('章节与导出', 'workspace/output/ 下的正文、计划与转换结果。可预览、转 txt，或直接送到纯文本工作站继续整理。',
    h('button', { text: '刷新', onclick: async () => { await refreshFiles(); renderMain(); } })));
  const card = h('div', { class: 'card' });
  const table = h('table', { class: 'grid' });
  table.appendChild(h('tr', null, ['文件', '目录', '大小', '修改时间', '操作'].map(t => h('th', { text: t }))));
  for (const c of state.chapters) {
    const actions = h('div', { class: 'inline', style: { justifyContent: 'center' } },
      h('button', { class: 'mini', text: '预览', onclick: () => previewFile(c.path) }),
      c.path.endsWith('.md') ? h('button', {
        class: 'mini', text: '转 txt',
        onclick: async () => {
          try { const r = await api('/api/txt', { method: 'POST', body: { path: c.path } }); toast('已生成 ' + r.path, 'ok'); await refreshFiles(); }
          catch (e) { toast('转换失败：' + e.message, 'err'); }
        }
      }) : null,
      h('button', {
        class: 'mini', text: '送到纯文本工作站',
        onclick: async () => {
          try {
            const r = await api('/api/file?path=' + encodeURIComponent(c.path));
            appendToTextPanel(r.content);
            go('text');
          } catch (e) { toast('读取失败：' + e.message, 'err'); }
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
    modal(rel, h('pre', { class: 'log', style: { maxHeight: '56vh' }, text: r.content }), [h('button', { text: '关闭' })]);
  } catch (e) { toast('读取失败：' + e.message, 'err'); }
}

// ═══════════════════════════════════════════
// 纯文本工作站（网页版记事本）
//
// 内容不会再「切走就没了」：
//   · 输入先落进内存草稿 → 切到别的栏目再回来，原样还在；
//   · 停手 0.5 秒把草稿写进 data/state.json → 刷新浏览器 / 重开页面也还在；
//   · 绑定到具体文件后，停手 1.5 秒自动写盘 → 不必再点「保存」；
//   · 离开本页时把草稿和文件都立刻落盘。
// ═══════════════════════════════════════════
function viewText(main) {
  const draftSlot = () => {
    const s = state.db.state = state.db.state || {};
    return s.textPanel = s.textPanel || {};
  };
  if (!state.ui.text) {
    const saved = draftSlot();
    state.ui.text = {
      path: saved.path || '',
      value: saved.value || '',
      dirty: !!saved.dirty,
      scrollTop: saved.scrollTop || 0
    };
  }
  const ui = state.ui.text;

  const DRAFT_DELAY = 500;    // 草稿写盘防抖
  const FILE_DELAY = 1500;    // 文件自动保存防抖
  const DRAFT_MAX = 1500000;  // 草稿体积上限：再大就不往 state.json 里塞（文件自动保存照常）
  let draftTimer = null, fileTimer = null, fileSaving = false, filePending = false;
  const shortName = p => String(p || '').split(/[\\/]/).pop() || '（未命名）';
  const tooBig = () => ui.value.length > DRAFT_MAX;

  // ── 草稿：内容 + 当前文件名一起存进 data/state.json ──
  const writeDraft = () => {
    const d = draftSlot();
    d.path = ui.path;
    d.value = tooBig() ? '' : ui.value;      // 超大文本只留文件名，靠文件自动保存兜底
    d.skipped = tooBig();
    d.dirty = !!ui.dirty;
    d.scrollTop = ui.scrollTop || 0;
    d.updated = new Date().toISOString();
    return d;
  };
  const scheduleDraft = () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => { writeDraft(); touch('state', true); }, DRAFT_DELAY);
  };

  // ── 文件自动保存：绑定到具体文件后才写盘 ──
  const saveToFile = async (path, content, quiet) => {
    try {
      await api('/api/io/save', { method: 'POST', body: { path: path, content: content } });
      if (ui.path === path && ui.value === content) ui.dirty = false;
      const item = (state.io.files || []).find(f => f.path === path);
      if (item) item.size = new Blob([content]).size;
      status((quiet ? '已自动保存 ' : '已保存 ') + shortName(path), 'ok');
      if (!quiet) toast('已保存：' + path, 'ok');
      updateStat(); drawFileList();
      return true;
    } catch (e) {
      status('保存失败', 'err');
      toast('保存失败：' + e.message, 'err');
      return false;
    }
  };
  const autosaveFile = async () => {
    if (fileSaving) { filePending = true; return; }
    if (!ui.path || !ui.dirty) { updateStat(); return; }
    fileSaving = true;
    const path = ui.path, content = ui.value;
    try {
      await saveToFile(path, content, true);
    } finally {
      fileSaving = false;
      if (filePending || (ui.path === path && ui.value !== content)) { filePending = false; scheduleFileSave(); }
      updateStat();
    }
  };
  const scheduleFileSave = () => {
    clearTimeout(fileTimer);
    if (!ui.path || !ui.dirty) return;
    fileTimer = setTimeout(autosaveFile, FILE_DELAY);
  };
  const flushFile = async () => {
    clearTimeout(fileTimer);
    if (ui.path && ui.dirty) await saveToFile(ui.path, ui.value, true);
  };

  const area = h('textarea', {
    rows: 24, class: 'notepad', placeholder: '在这里写 / 贴入纯文本…',
    value: ui.value,
    oninput: () => setText(area.value),
    onscroll: () => { ui.scrollTop = area.scrollTop; }
  });
  const statLine = h('div', { class: 'small muted' });
  const pathHint = h('span', { class: 'hint' });
  const refreshHint = () => { pathHint.textContent = ui.path || '（未命名，草稿）'; };

  const updateStat = () => {
    const t = ui.value;
    const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
    const lines = t.split('\n').length;
    const paras = t.split(/\n\s*\n/).filter(p => p.trim()).length;
    let save;
    if (ui.path) save = ui.dirty ? (fileSaving ? '自动保存中…' : '待自动保存…') : '已保存';
    else if (!t) save = '空（未命名）';
    else save = '草稿已自动暂存（未命名，点「保存」定成文件）';
    if (tooBig()) save = '内容过大，草稿不暂存（绑定文件后照常自动写盘）';
    statLine.textContent = '字符 ' + t.length + ' · 汉字 ' + cjk + ' · 行 ' + lines + ' · 段 ' + paras + ' · ' + save;
  };

  // 所有内容改动都走这里：先进内存草稿，再排队写盘
  const setText = (value) => {
    if (area.value !== value) area.value = value;
    ui.value = value;
    ui.dirty = true;
    scheduleDraft();
    scheduleFileSave();
    updateStat();
  };

  // 离开本页 / 切栏目时：草稿与文件都立刻落盘
  const flushNow = () => {
    clearTimeout(draftTimer);
    clearTimeout(fileTimer);
    const done = () => { writeDraft(); saveNow('state').catch(() => { }); };
    if (ui.path && ui.dirty) autosaveFile().then(done, done);   // 先落文件，草稿再记录真实状态
    else done();
  };

  const saveLocal = async () => {
    clearTimeout(fileTimer);
    if (!ui.path) {
      const folder = (state.paths.text || 'workspace/text').replace(/[\\/]+$/, '');
      let name = prompt('保存到 ' + folder + '/ 的文件名', '正文_' + new Date().toISOString().slice(0, 10) + '.txt');
      if (!name) return;
      if (!/\.(txt|md)$/i.test(name)) name += '.txt';
      ui.path = folder + '/' + name.replace(/[\\/]/g, '_');
      refreshHint();
    }
    if (!await saveToFile(ui.path, ui.value, false)) return;
    writeDraft();
    await refreshFiles();
    writeDraft();          // refreshFiles 换掉了 state.db.state，把草稿重新贴回去
    refreshHint(); drawFileList();
  };

  main.appendChild(pageHead('纯文本工作站',
    '处理小说最终产出的独立文件夹：' + (state.paths.text || 'workspace/text') + '／。内容会自动保存——切换页面再回来、刷新浏览器都还在；绑定文件后停手 1.5 秒自动写盘，可清理空行、查找替换、导出 txt。',
    h('div', { class: 'inline' },
      h('button', { class: 'primary', text: '保存', onclick: saveLocal }),
      h('button', { text: '从产出导入…', onclick: () => pickChapter() }),
      h('button', { text: '从其他导入…', onclick: () => browseOpen(path => importPath(path)) }),
      h('button', { text: '另存为 / 导出 txt…', onclick: () => exportAs(ui.value) }))));

  const row = h('div', { class: 'row' });
  const left = h('div', { class: 'col', style: { flex: '0 0 300px' } });
  const right = h('div', { class: 'col' });
  row.appendChild(left); row.appendChild(right);
  main.appendChild(row);

  const drawFileList = () => {
    const prevList = left.querySelector('.list.scroll');
    const keepTop = prevList ? prevList.scrollTop : 0;
    clear(left);
    const files = (state.io.files || []).filter(f => ['.txt', '.md', '.json'].includes(f.ext));
    const list = h('div', { class: 'list scroll' }, files.map(f => h('div', {
      class: 'list-item' + (ui.path === f.path ? ' active' : ''),
      onclick: () => loadPath(f.path)
    },
      h('div', { class: 'name', text: f.name }),
      h('div', { class: 'meta', text: (f.size / 1024).toFixed(1) + 'KB' }))));
    const card = h('div', { class: 'card' },
      h('h2', null, '文本文件夹', h('span', { class: 'hint', text: state.io.rel || 'workspace/text/' })),
      h('div', { class: 'small muted', style: { marginBottom: '6px' } },
        '最终产出放这里，和正文目录分开；也可以把 AI 工作站的输出直接追加进来。'),
      list,
      h('div', { class: 'inline', style: { marginTop: '8px' } },
        h('button', {
          class: 'mini', text: '新建文本',
          onclick: async () => {
            if (ui.dirty) {
              if (ui.path) await flushFile();
              else if (!confirm('「（未命名）」里还没落盘的内容会被清掉，继续吗？')) return;
            }
            clearTimeout(fileTimer); clearTimeout(draftTimer);
            ui.path = ''; ui.value = ''; ui.dirty = false; ui.scrollTop = 0;
            area.value = ''; area.scrollTop = 0;
            refreshHint(); writeDraft(); updateStat(); drawFileList();
            saveNow('state').catch(() => { });
            toast('已清空，保存时会让你选文件名', 'ok');
          }
        }),
        h('button', {
          class: 'mini', text: '刷新',
          onclick: async () => { await refreshFiles(); writeDraft(); drawFileList(); }
        })));
    left.appendChild(card);
    list.scrollTop = keepTop;
  };

  const loadPath = async (path) => {
    if (ui.dirty) {
      if (ui.path) await flushFile();
      else if (!confirm('「（未命名）」里还没落盘的内容会被丢弃，继续吗？')) return;
    }
    try {
      const r = await api('/api/file?path=' + encodeURIComponent(path));
      clearTimeout(fileTimer); clearTimeout(draftTimer);
      ui.path = path; ui.value = r.content; ui.dirty = false; ui.scrollTop = 0;
      area.value = ui.value; area.scrollTop = 0;
      refreshHint(); writeDraft(); updateStat(); drawFileList();
      saveNow('state').catch(() => { });
    } catch (e) { toast('打开失败：' + e.message, 'err'); }
  };

  // 从产出（workspace/output/）导入：.md 先转成 txt（去掉输出头、清理空行），再拷进文本文件夹。
  const importPath = async (path) => {
    if (ui.dirty) {
      if (ui.path) await flushFile();
      else if (!confirm('「（未命名）」里还没落盘的内容会被丢弃，继续吗？')) return;
    }
    try {
      let source = path;
      if (/\.md$/i.test(path)) {
        const conv = await api('/api/txt', { method: 'POST', body: { path } });
        source = conv.path;
      }
      const r = await api('/api/file?path=' + encodeURIComponent(source));
      const name = source.split(/[\\/]/).pop();
      const folder = (state.paths.text || 'workspace/text').replace(/[\\/]+$/, '');
      if ((state.io.files || []).some(f => f.name === name) &&
          !confirm('「' + name + '」已存在，覆盖吗？')) return;
      await api('/api/io/save', { method: 'POST', body: { path: folder + '/' + name, content: r.content } });
      await refreshFiles();
      writeDraft();          // refreshFiles 换掉了 state.db.state，把草稿重新贴回去
      await loadPath(folder + '/' + name);
      toast('已导入：' + folder + '/' + name, 'ok');
    } catch (e) { toast('导入失败：' + e.message, 'err'); }
  };

  const pickChapter = () => {
    const opts = (state.chapters || [])
      .filter(c => c.path.endsWith('.md') || c.path.endsWith('.txt'))
      .map(c => ({ value: c.path, label: c.name, meta: c.dir + ' · ' + c.mtime }));
    if (!opts.length) { toast('workspace/output/ 下还没有产出。', 'err'); return; }
    pickDialog('从产出导入（workspace/output/）', opts.slice(0, 120), rel => importPath(rel));
  };

  const toolBar = h('div', { class: 'inline', style: { marginBottom: '8px', flexWrap: 'wrap' } });
  const ops = [
    ['删除所有空行', t => t.split('\n').filter(l => l.trim() !== '').join('\n')],
    ['空行合并为一个', t => t.replace(/\n{3,}/g, '\n\n')],
    ['合并段内换行', t => t.replace(/([^\n])\n(?!\n)/g, '$1')],
    ['去掉行首缩进', t => t.split('\n').map(l => l.replace(/^[　 \t]+/, '')).join('\n')],
    ['去首尾空白', t => t.trim()],
    ['全角空格→半角', t => t.replace(/　/g, ' ')],
    ['中文引号→英文', t => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")]
  ];
  ops.forEach(([label, fn]) => {
    toolBar.appendChild(h('button', {
      class: 'mini', text: label,
      onclick: () => setText(fn(area.value))
    }));
  });
  toolBar.appendChild(h('button', {
    class: 'mini', text: '查找替换…',
    onclick: () => {
      const find = h('input', { type: 'text', placeholder: '查找' });
      const repl = h('input', { type: 'text', placeholder: '替换为' });
      const all = h('input', { type: 'checkbox', checked: true });
      const body = h('div', null,
        h('div', { class: 'field' }, h('label', { text: '查找' }), find),
        h('div', { class: 'field' }, h('label', { text: '替换为' }), repl),
        h('label', { class: 'check' }, all, '全部替换'));
      const m = modal('查找替换', body, [
        h('button', { text: '取消', onclick: () => m.close() }),
        h('button', {
          class: 'primary', text: '替换',
          onclick: () => {
            if (!find.value) return;
            setText(all.checked ? area.value.split(find.value).join(repl.value)
                                : area.value.replace(find.value, repl.value));
            m.close();
          }
        })
      ]);
    }
  }));

  const panel = h('div', { class: 'card' });
  panel.appendChild(h('h2', null, '文本', pathHint));
  panel.appendChild(toolBar);
  panel.appendChild(area);
  panel.appendChild(statLine);
  right.appendChild(panel);

  area.scrollTop = ui.scrollTop || 0;
  refreshHint();
  drawFileList();
  updateStat();
  if (ui.dirty && ui.path) scheduleFileSave();   // 上次没写完的，回到本页就补上

  // 切到别的栏目时（go()）把草稿和文件都立刻落盘
  state.ui.leave = { view: 'text', fn: flushNow };
}

function exportAs(content) {
  let cwd = state.paths.export || '';
  const pathInput = h('input', { type: 'text', value: cwd });
  const nameInput = h('input', { type: 'text', placeholder: '文件名.txt', value: '正文_' + new Date().toISOString().slice(0, 10) + '.txt' });
  const encSel = h('select', null, [
    ['utf-8', 'UTF-8（推荐）'], ['utf-8-sig', 'UTF-8 带 BOM（部分编辑器）'], ['gbk', 'GBK（部分中文站点需要）']
  ].map(([v, l]) => h('option', { value: v, text: l })));
  const dirList = h('div', { class: 'list scroll', style: { maxHeight: '240px' } });

  const load = async (path) => {
    try {
      const r = await api('/api/io/browse?path=' + encodeURIComponent(path || ''));
      cwd = r.path;
      pathInput.value = r.path;
      clear(dirList);
      if (r.parent) dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(r.parent) }, h('div', { class: 'name', text: '⬆ 上一层' })));
      if (r.shortcut) dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(r.shortcut.path) }, h('div', { class: 'name', text: '🏠 ' + r.shortcut.name })));
      (r.dirs || []).forEach(d => dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(d.path) }, h('div', { class: 'name', text: '📁 ' + d.name }))));
      (r.files || []).forEach(f => dirList.appendChild(h('div', { class: 'list-item' }, h('div', { class: 'name muted', text: f.name }), h('div', { class: 'meta', text: (f.size / 1024).toFixed(1) + 'KB' }))));
    } catch (e) { toast('无法访问：' + e.message, 'err'); }
  };

  const body = h('div', null,
    h('div', { class: 'field' }, h('label', { text: '目标目录（可以一路点进去，也可以直接改路径）' }), pathInput),
    dirList,
    h('div', { class: 'inline', style: { marginTop: '10px' } },
      h('div', { class: 'field', style: { flex: '1' } }, h('label', { text: '文件名' }), nameInput),
      h('div', { class: 'field' }, h('label', { text: '编码' }), encSel)));

  const m = modal('导出为 txt', body, [
    h('button', { text: '取消', onclick: () => m.close() }),
    h('button', {
      class: 'primary', text: '导出', dataset: { noclose: '1' },
      onclick: async () => {
        let dir = pathInput.value.trim();
        let name = nameInput.value.trim() || 'untitled.txt';
        if (!/\.(txt|md)$/i.test(name)) name += '.txt';
        const full = dir.replace(/[\\/]+$/, '') + '\\' + name;
        try {
          const res = await api('/api/io/export', { method: 'POST', body: { path: full, content, encoding: encSel.value } });
          toast('已导出：' + res.path + '（' + (res.size / 1024).toFixed(1) + 'KB）', 'ok');
          m.close();
        } catch (e) { toast('导出失败：' + e.message, 'err'); }
      }
    })
  ]);
  load(cwd);
}

function browseOpen(onPick) {
  let cwd = state.paths.root || '';
  const pathInput = h('input', { type: 'text', value: cwd });
  const dirList = h('div', { class: 'list scroll', style: { maxHeight: '360px' } });
  const load = async (path) => {
    try {
      const r = await api('/api/io/browse?path=' + encodeURIComponent(path || ''));
      cwd = r.path;
      pathInput.value = r.path;
      clear(dirList);
      if (r.parent) dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(r.parent) }, h('div', { class: 'name', text: '⬆ 上一层' })));
      if (r.shortcut) dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(r.shortcut.path) }, h('div', { class: 'name', text: '🏠 ' + r.shortcut.name })));
      (r.dirs || []).forEach(d => dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(d.path) }, h('div', { class: 'name', text: '📁 ' + d.name }))));
      (r.files || []).forEach(f => dirList.appendChild(h('div', {
        class: 'list-item',
        onclick: () => { m.close(); onPick(f.path); }
      }, h('div', { class: 'name', text: '📄 ' + f.name }), h('div', { class: 'meta', text: (f.size / 1024).toFixed(1) + 'KB' }))));
    } catch (e) { toast('无法访问：' + e.message, 'err'); }
  };
  const m = modal('打开文本文件', h('div', null,
    h('div', { class: 'field' }, h('label', { text: '当前目录' }), pathInput),
    dirList), [h('button', { text: '取消', onclick: () => m.close() })]);
  load(cwd);
}
