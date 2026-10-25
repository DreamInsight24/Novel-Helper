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

/* NovelHelper —— 基础工具 / 全局状态 / 路由 */
'use strict';

// ═══════════════════════════════════════════
// DOM 与网络
// ═══════════════════════════════════════════
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v);
    }
  }
  appendKids(el, kids);
  i18n.apply(el);
  return el;
}

function appendKids(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) appendKids(el, k);
    else if (k instanceof Node) el.appendChild(k);
    else el.appendChild(document.createTextNode(String(k)));
  }
}

function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function toast(msg, kind) {
  const root = document.getElementById('toast-root');
  const node = h('div', { class: 'toast ' + (kind || ''), text: msg });
  root.appendChild(node);
  setTimeout(() => { node.style.transition = 'opacity .3s'; node.style.opacity = '0'; }, 4200);
  setTimeout(() => node.remove(), 4700);
}

function status(text, kind) {
  const el = document.getElementById('status-mini');
  if (!el) return;
  el.textContent = text;
  el.className = 'status-mini ' + (kind || '');
}

async function api(path, opts) {
  opts = opts || {};
  const init = { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', 'X-NovelHelper-Language': document.documentElement.lang } };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const res = await fetch(path, init);
  const raw = await res.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch (e) { data = { ok: false, error: i18n.t('errors.parse_failed'), detail: raw.slice(0, 300) }; }
  if (!res.ok || data.ok === false) {
    const msg = data.error || ('HTTP ' + res.status);
    throw new Error(data.detail ? msg + '（' + String(data.detail).slice(0, 300) + '）' : msg);
  }
  return data;
}

/** 避免页面里用 api 作为配置对象时与全局请求函数重名。 */
async function apiCall(path, opts) {
  return api(path, opts);
}

function autoGrow(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 420) + 'px';
}

// ═══════════════════════════════════════════
// 极简 Markdown 渲染
// ═══════════════════════════════════════════
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mdInline(s) {
  let out = s;
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return out;
}

function mdTable(rows) {
  const cells = rows.map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  const isSep = r => /^[\s:|-]+$/.test(r);
  let html = '<table><thead><tr>' + cells[0].map(c => '<th>' + mdInline(esc(c)) + '</th>').join('') + '</tr></thead><tbody>';
  html += cells.slice(1).filter((c, i) => !isSep(rows[i + 1]))
    .map(r => '<tr>' + r.map(c => '<td>' + mdInline(esc(c)) + '</td>').join('') + '</tr>').join('');
  return html + '</tbody></table>';
}

function md(text) {
  let src = String(text == null ? '' : text);
  const blocks = [];
  src = src.replace(/```[^\n]*\n([\s\S]*?)```/g, (m, code) => {
    blocks.push(code);
    return '\u0000B' + (blocks.length - 1) + '\u0000';
  });
  const lines = esc(src).split('\n');
  let html = '', para = [], table = null;
  // 列表按缩进分层：每 2 个空格算一级，最多 4 级（子集的子集也能看出结构）。
  let lists = [];
  const flushPara = () => { if (para.length) { html += '<p>' + para.join('<br>') + '</p>'; para = []; } };
  const closeList = () => { while (lists.length) html += '</' + lists.pop().tag + '>'; };
  const flushTable = () => { if (table) { html += mdTable(table); table = null; } };
  for (const line of lines) {
    const raw = line.replace(/\t/g, '  ');
    const indent = (raw.match(/^ */) || [''])[0].length;
    const t = raw.trim();
    if (t === '') { flushPara(); closeList(); flushTable(); continue; }
    let m;
    if ((m = t.match(/^(#{1,6})\s+(.*)$/))) { flushPara(); closeList(); flushTable(); html += '<h' + m[1].length + '>' + mdInline(m[2]) + '</h' + m[1].length + '>'; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); closeList(); flushTable(); html += '<hr>'; continue; }
    if (t.startsWith('|') && t.endsWith('|')) { flushPara(); closeList(); (table = table || []).push(t); continue; }
    flushTable();
    const bullet = t.match(/^[-*+]\s+(.*)$/);
    if (bullet || (m = t.match(/^\d+[.)]\s+(.*)$/))) {
      const tag = bullet ? 'ul' : 'ol';
      const depth = Math.min(4, Math.floor(indent / 2));
      flushPara();
      while (lists.length && lists[lists.length - 1].depth >= depth) html += '</' + lists.pop().tag + '>';
      html += '<' + tag + '>';
      lists.push({ tag, depth });
      html += '<li>' + mdInline((bullet || m)[1]) + '</li>';
      continue;
    }
    closeList();
    para.push(mdInline(t));
  }
  flushPara(); closeList(); flushTable();
  return html.replace(/\u0000B(\d+)\u0000/g, (m, i) => '<pre>' + blocks[Number(i)] + '</pre>');
}

// ═══════════════════════════════════════════
// 弹窗
// ═══════════════════════════════════════════
function modal(title, bodyNode, footNodes) {
  const root = document.getElementById('overlay-root');
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() { clear(root); document.removeEventListener('keydown', onKey); }
  const dlg = h('div', { class: 'dialog' },
    h('h3', { text: title }),
    bodyNode,
    footNodes ? h('div', { class: 'dlg-foot' }, footNodes) : null);
  const overlay = h('div', { class: 'overlay', onclick: e => { if (e.target === overlay) close(); } }, dlg);
  // 底部按钮默认点完就关（取消 / 关闭 / 确定 这类）；需要自己处理动作的按钮
  // 加 dataset.noclose 豁免，由它自己决定何时关。
  const foot = dlg.querySelector('.dlg-foot');
  if (foot) {
    foot.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (btn && btn.dataset.noclose === undefined) close();
    });
  }
  clear(root);
  root.appendChild(overlay);
  i18n.apply(overlay);
  document.addEventListener('keydown', onKey);
  return { close, dlg };
}

/** 确认弹窗：替代原生 confirm，样式统一。 */
function confirmDialog(title, text, onYes) {
  const m = modal(title, h('div', { class: 'small' }, text), [
    h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() }),
    h('button', { class: 'primary', text: i18n.t('common.confirm'), dataset: { noclose: '1' }, onclick: () => { m.close(); onYes(); } })
  ]);
  return m;
}

/** 小输入框弹窗：替代原生 prompt，样式统一、回车即确认。 */
function askDialog(title, label, defaultValue, onSubmit) {
  const input = h('input', { type: 'text', value: defaultValue == null ? '' : String(defaultValue) });
  const submit = () => { const v = input.value; m.close(); onSubmit(v); };
  const m = modal(title, h('div', null,
    h('div', { class: 'field' }, h('label', { text: label || i18n.t('common.name') }), input)), [
    h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() }),
    h('button', { class: 'primary', text: i18n.t('common.confirm'), dataset: { noclose: '1' }, onclick: submit })
  ]);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  input.focus();
  input.select();
  return m;
}

function pickDialog(title, options, onPick) {
  const list = h('div', { class: 'list scroll' }, options.map(opt =>
    h('div', { class: 'list-item', onclick: () => { m.close(); onPick(opt.value); } },
      h('div', { class: 'name', text: opt.label }),
      opt.meta ? h('div', { class: 'meta', text: opt.meta }) : null)));
  const m = modal(title, list, [h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() })]);
}

// ═══════════════════════════════════════════
// 全局状态
// ═══════════════════════════════════════════
const state = {
  db: null,
  sources: [],
  chapters: [],
  io: { files: [] },
  providers: [],
  default_modes: [],
  efforts: [],
  debug: false,
  runtime_root: '',
  log_file: '',
  paths: {},
  view: 'writer',
  ui: {},
  sel: {}
};

function collItems(name) {
  if (!state.db || !state.db[name]) return [];
  return state.db[name].items || [];
}

// ─────────────────────────────────────────────
// 模式用途：write = 写稿模式（AI 工作站）
//           process = 稿件处理模式（稿件处理页）
// ─────────────────────────────────────────────
function allModes() {
  return ((state.db || {}).modes || {}).items || [];
}

function modeKind(mode) {
  return mode && mode.kind === 'process' ? 'process' : 'write';
}

function modesOfKind(kind) {
  return allModes().filter(mode => modeKind(mode) === kind);
}

function findById(name, id) { return collItems(name).find(r => r.id === id) || null; }

function presetsOf(name) {
  const schema = (state.db && state.db.schema) || {};
  return ((schema[name] || {}).elements) || [];
}

function sectionDefs(includeHidden) {
  const raw = ((state.db || {}).sections || {}).items || [];
  return raw.filter(s => s && s.key && (includeHidden || s.on !== false));
}

function isSectionView(view) {
  return typeof view === 'string' && view.indexOf('section_') === 0;
}

/** 视图 key → 集合定义（内置集合或自定义栏目都走同一套编辑器）。 */
function defFor(view) {
  if (COLLECTIONS[view]) return COLLECTIONS[view];
  if (!isSectionView(view)) return null;
  const key = view.slice('section_'.length);
  const sec = sectionDefs(true).find(s => s.key === key) || {};
  return {
    coll: view, singular: i18n.t('collections.singular_entry'), label: sec.label || key, idPrefix: 'ot',
    desc: sec.desc || i18n.t('sections.default_desc'),
    tagLabel: i18n.t('common.note'), notesLabel: i18n.t('common.field_notes'), hasCategory: true, hasContent: true
  };
}

function recordName(rec) {
  if (!rec) return i18n.t('common.missing');
  const base = rec.name || rec.title || i18n.t('common.unnamed');
  return rec.tag ? base + '（' + rec.tag + '）' : base;
}

function newId(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 10); }

function nowStr() { return new Date().toLocaleString(); }

/**
 * 把服务端返回的集合装进内存，并补齐结构。
 * 任何一条记录缺 elements / 指针列表都会在这里被兜住，避免整页渲染崩掉。
 */
function setDb(collections) {
  if (!collections) return;
  state.db = collections;
  state.db.sections = state.db.sections || { items: [] };
  const defs = Object.values(COLLECTIONS).concat(
    sectionDefs(true).map(sec => defFor('section_' + sec.key)).filter(Boolean));
  defs.forEach(def => {
    const bucket = state.db[def.coll];
    if (!bucket) {
      if (isSectionView(def.coll)) state.db[def.coll] = { items: [], categories: [] };
      return;
    }
    bucket.items = bucket.items || [];
    bucket.items.forEach(rec => {
      if (!Array.isArray(rec.elements)) rec.elements = [];
      if (def.hasInventory) {
        if (!Array.isArray(rec.inventory)) rec.inventory = [];
        if (!Array.isArray(rec.equipment)) rec.equipment = [];
      }
      if (def.hasMembers && !Array.isArray(rec.members)) rec.members = [];
    });
  });
  const memories = state.db.memories;
  if (memories) memories.items = memories.items || [];
  const world = state.db.worldmap;
  if (world) { world.cells = world.cells || {}; world.regions = world.regions || {}; }
  state.db.state = state.db.state || {};
  state.db.state.workstation = state.db.state.workstation || {};
  state.db.schema = state.db.schema || {};
  state.db.modes = state.db.modes || { items: [] };
  state.db.modes.items = state.db.modes.items || [];
  state.db.history = state.db.history || { items: [], current: '' };
}

// ═══════════════════════════════════════════
// 保存（防抖）
// ═══════════════════════════════════════════
const saveTimers = {};

function touch(coll, quiet) {
  if (!quiet) status(i18n.t('common.saving'), 'busy');
  clearTimeout(saveTimers[coll]);
  saveTimers[coll] = setTimeout(async () => {
    try {
      await api('/api/collections/' + coll, { method: 'POST', body: { data: state.db[coll] } });
      if (!quiet) status(i18n.t('common.saved_at', { time: new Date().toLocaleTimeString() }), 'ok');
    } catch (e) {
      status(i18n.t('common.save_failed'), 'err');
      toast(i18n.t('common.save_failed_reason', { reason: e.message }), 'err');
    }
  }, 500);
}

async function saveNow(coll) {
  clearTimeout(saveTimers[coll]);
  await api('/api/collections/' + coll, { method: 'POST', body: { data: state.db[coll] } });
  status(i18n.t('common.saved_at', { time: new Date().toLocaleTimeString() }), 'ok');
}

/** 把一段文本追加到稿件处理工作区（不清空已有内容）。 */
function appendToTextPanel(content, quiet) {
  const text = String(content || '');
  if (!text.trim()) return;
  const s = state.db.state = state.db.state || {};
  const saved = s.textPanel = s.textPanel || {};
  const base = state.ui.text ? state.ui.text.value : (saved.value || '');
  const merged = base.trim() ? base.replace(/\s+$/, '') + '\n\n' + text : text;
  if (state.ui.text) {
    state.ui.text.value = merged;
    state.ui.text.dirty = true;
    saved.path = state.ui.text.path || saved.path || '';
  }
  saved.value = merged;
  saved.dirty = true;
  saved.updated = new Date().toISOString();
  touch('state', true);
  if (!quiet) toast(i18n.t('common.appended_to_workspace'), 'ok');
}

// 浏览器端异常也写入本地日志，便于排查界面问题。
function clientLog(level, message, detail) {
  try {
    fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-NovelHelper-Language': document.documentElement.lang },
      body: JSON.stringify({ level, message, detail })
    }).catch(() => {});
  } catch (e) { /* 日志失败不影响界面 */ }
}

window.addEventListener('error', e => {
  clientLog('error', e.message || 'window error',
    (e.filename || '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0));
});
window.addEventListener('unhandledrejection', e => {
  clientLog('error', 'unhandled rejection', String(e.reason || ''));
});

// ═══════════════════════════════════════════
// 侧栏与路由
// ═══════════════════════════════════════════
const NAV = [
  { group: i18n.t('nav.group_writing') },
  { id: 'writer', label: i18n.t('nav.writer') },
  { id: 'chapters', label: i18n.t('nav.chapters') },
  { id: 'text', label: i18n.t('nav.text') },
  { group: i18n.t('nav.group_core') },
  { id: 'characters', label: i18n.t('nav.characters'), coll: 'characters' },
  { id: 'inventory', label: i18n.t('nav.inventory') },
  { id: 'world', label: i18n.t('nav.worldmap') },
  { id: 'items', label: i18n.t('nav.items'), coll: 'items' },
  { id: 'equipment', label: i18n.t('nav.equipment'), coll: 'equipment' },
  { group: i18n.t('nav.group_custom') },
  { id: 'factions', label: i18n.t('nav.factions'), coll: 'factions' },
  { sections: true },
  { id: 'other', label: i18n.t('nav.other'), coll: 'other' },
  { group: i18n.t('nav.group_memory') },
  { id: 'memories', label: i18n.t('nav.memories'), coll: 'memories' },
  { group: i18n.t('nav.group_system') },
  { id: 'elements', label: i18n.t('nav.elements') },
  { id: 'sections', label: i18n.t('nav.sections') },
  { id: 'modes', label: i18n.t('nav.modes') },
  { id: 'ai', label: i18n.t('nav.settings') }
];

function renderNav() {
  const nav = document.getElementById('nav');
  clear(nav);
  for (const entry of NAV) {
    if (entry.group) { nav.appendChild(h('div', { class: 'nav-group', text: entry.group })); continue; }
    if (entry.sections) {
      sectionDefs().forEach(sec => {
        const view = 'section_' + sec.key;
        nav.appendChild(h('div', {
          class: 'nav-item' + (state.view === view ? ' active' : ''),
          onclick: () => go(view)
        },
          h('span', { text: sec.label || sec.key }),
          h('span', { class: 'count', text: String(collItems(view).length) })));
      });
      continue;
    }
    const count = entry.coll ? collItems(entry.coll).length : '';
    nav.appendChild(h('div', {
      class: 'nav-item' + (state.view === entry.id ? ' active' : ''),
      onclick: () => go(entry.id)
    },
      h('span', { text: entry.label }),
      count !== '' ? h('span', { class: 'count', text: String(count) }) : null));
  }
}

function go(view) {
  // 有些页（如稿件处理）需要在离开前把手上的内容落盘，各自注册 leave 钩子。
  const leave = state.ui.leave;
  if (leave && leave.view === state.view && leave.view !== view) {
    state.ui.leave = null;
    try { leave.fn(); } catch (e) { /* 落盘失败不阻塞切页 */ }
  }
  state.view = view;
  renderNav();
  renderMain();
}

function renderMain() {
  const main = document.getElementById('main');
  const keepTop = main.scrollTop;
  clear(main);
  if (state.debug) {
    main.appendChild(h('div', { class: 'debug-strip',
      text: i18n.t('common.debug_banner') }));
  }
  const map = {
    writer: viewWorkstation, chapters: viewChapters, text: viewManuscript,
    inventory: viewInventory, memories: viewMemories, world: viewWorld,
    elements: viewElements, sections: viewSections, modes: viewModes, ai: viewAI
  };
  if (map[state.view]) map[state.view](main);
  else if (defFor(state.view)) viewRecords(main, state.view);
  else main.appendChild(h('div', { class: 'card muted', text: i18n.t('common.unknown_page') }));
  main.appendChild(h('div', {class: 'small muted', text: i18n.t('common.data_content')}));
  i18n.apply(main);
  main.scrollTop = keepTop;
}

function pageHead(title, desc, actions) {
  return h('div', { class: 'page-head' },
    h('div', null, h('h1', { text: title }), desc ? h('div', { class: 'desc', text: desc }) : null),
    h('div', { class: 'spacer' }),
    actions || null);
}

// ═══════════════════════════════════════════
// 集合定义
// ═══════════════════════════════════════════
const COLLECTIONS = {
  characters: {
    coll: 'characters', singular: i18n.t('collections.singular_character'), label: i18n.t('nav.characters'), idPrefix: 'ch',
    desc: i18n.t('collections.characters.desc'),
    tagLabel: i18n.t('collections.characters.tag_label'), notesLabel: i18n.t('collections.notes'),
    hasInventory: true, hasEquipment: true
  },
  factions: {
    coll: 'factions', singular: i18n.t('collections.singular_faction'), label: i18n.t('nav.factions'), idPrefix: 'fa',
    desc: i18n.t('collections.factions.desc'),
    tagLabel: i18n.t('collections.factions.tag_label'), notesLabel: i18n.t('collections.notes'), hasMembers: true
  },
  items: {
    coll: 'items', singular: i18n.t('collections.singular_item'), label: i18n.t('nav.items'), idPrefix: 'it',
    desc: i18n.t('collections.items.desc'),
    tagLabel: i18n.t('collections.alias'), notesLabel: i18n.t('collections.notes'), hasCategory: true
  },
  equipment: {
    coll: 'equipment', singular: i18n.t('collections.singular_equipment'), label: i18n.t('nav.equipment'), idPrefix: 'eq',
    desc: i18n.t('collections.equipment.desc'),
    tagLabel: i18n.t('collections.alias'), notesLabel: i18n.t('collections.notes'), hasSlot: true, hasCategory: true
  },
  other: {
    coll: 'other', singular: i18n.t('collections.singular_entry'), label: i18n.t('nav.other'), idPrefix: 'ot',
    desc: i18n.t('collections.other.desc'),
    tagLabel: i18n.t('common.note'), notesLabel: i18n.t('common.field_notes'), hasCategory: true, hasContent: true
  }
};

const EFFORTS = ['none', 'low', 'medium', 'high', 'max'];

// ═══════════════════════════════════════════
// 数据刷新
// ═══════════════════════════════════════════
async function refreshFiles() {
  const r = await api('/api/state');
  setDb(r.collections);
  state.sources = r.sources;
  state.chapters = r.chapters;
  state.io = r.io;
  state.providers = r.providers || [];
  state.default_modes = r.default_modes || [];
  state.efforts = r.efforts || EFFORTS;
  state.debug = !!r.debug;
  state.runtime_root = r.runtime_root || '';
  state.log_file = r.log_file || '';
  const badge = document.getElementById('debug-badge');
  if (badge) badge.hidden = !state.debug;
  document.body.classList.toggle('debug-mode', state.debug);
  document.title = state.debug
    ? i18n.t('common.doc_title_debug')
    : i18n.t('common.doc_title');
  state.paths = {
    root: r.root, data: r.data_dir, export: r.export_dir,
    import: r.import_dir, text: r.text_dir
  };
}
