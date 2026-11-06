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

/** 提示条：成功 3.2s、失败 8s，可手动关闭，可带一个动作按钮（如「重试」「撤销」）。 */
function toast(msg, kind, opts) {
  const root = document.getElementById('toast-root');
  if (!root) return null;
  opts = opts || {};
  const isError = kind === 'err';
  // 输入栏贴着窗口底部时（AI 工作站 / 稿件处理的 AI 对话），提示条抬到它上方，
  // 别把「开始生成 / 开始改写」盖住。
  const composer = document.querySelector('.agent-compose-wrap, .manuscript-agent-compose');
  let lift = 0;
  if (composer && typeof composer.getBoundingClientRect === 'function') {
    const rect = composer.getBoundingClientRect();
    const viewport = window.innerHeight || 0;
    if (rect.top < viewport && rect.bottom > viewport - 240) {
      lift = Math.max(0, Math.round(viewport - rect.top + 12));
    }
  }
  root.style.bottom = lift ? lift + 'px' : '';
  const node = h('div', { class: 'toast ' + (kind || ''), role: isError ? 'alert' : 'status' },
    h('span', { class: 'toast-text', text: msg }));
  let timer = null;
  function dismiss() {
    clearTimeout(timer);
    if (!node.isConnected) return;
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 180);
  }
  if (opts.action) {
    node.appendChild(h('button', {
      class: 'toast-action', text: opts.action.label,
      onclick: () => { dismiss(); opts.action.onClick(); }
    }));
  }
  node.appendChild(h('button', {
    class: 'toast-close', text: '×', title: i18n.t('common.close'),
    'aria-label': i18n.t('common.close'), onclick: dismiss
  }));
  root.appendChild(node);
  const ttl = opts.duration || (isError ? 8000 : 3200);
  timer = setTimeout(dismiss, ttl);
  // 悬停暂停计时，给用户读完和点按钮的时间。
  node.addEventListener('mouseenter', () => clearTimeout(timer));
  node.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1600); });
  return { dismiss };
}

let statusTimer = null;
/** 侧栏状态：保存类状态 4s 后回落「就绪」，避免长期显示旧时间戳。 */
function status(text, kind) {
  const el = document.getElementById('status-mini');
  if (!el) return;
  el.textContent = text;
  el.className = 'status-mini ' + (kind || '');
  el.title = text;
  clearTimeout(statusTimer);
  if (kind === 'ok') {
    statusTimer = setTimeout(() => {
      el.textContent = i18n.t('common.ready');
      el.className = 'status-mini';
      el.title = '';
    }, 4000);
  }
}

async function api(path, opts) {
  opts = opts || {};
  const init = { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', 'X-NovelHelper-Language': document.documentElement.lang } };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  if (opts.signal) init.signal = opts.signal;
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
/**
 * 弹窗。`opts.size` 决定宽度：confirm(440) / form(640，默认) / wide(940)。
 * 弹窗只做通用交互（Esc、Tab 循环、聚焦），不预设业务按钮。
 */
function modal(title, bodyNode, footNodes, onClose, opts) {
  opts = opts || {};
  const root = document.getElementById('overlay-root');
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const controls = Array.from(dlg.querySelectorAll('button, input, textarea, select, summary, [tabindex="0"]'))
        .filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dlg.contains(document.activeElement))) {
        e.preventDefault(); last?.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dlg.contains(document.activeElement))) {
        e.preventDefault(); first?.focus();
      }
    }
  };
  let closed = false;
  function close() {
    if (closed) return;
    closed = true; clear(root); document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  }
  const dlg = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
    dataset: opts.size ? { size: opts.size } : {} },
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
  // 调用方没指定焦点时，把焦点交给弹窗内第一个可操作元素（通常是「取消」）。
  requestAnimationFrame(() => {
    if (closed || !dlg.isConnected || dlg.contains(document.activeElement)) return;
    const target = dlg.querySelector('.dlg-foot button:not(.primary)') ||
      dlg.querySelector('input, textarea, select, button');
    target?.focus({ preventScroll: true });
  });
  return { close, dlg };
}

/** 确认弹窗：替代原生 confirm；确认按钮要复述后果（如「删除人物」）。 */
function confirmDialog(title, text, onYes, opts) {
  opts = opts || {};
  const m = modal(title, h('div', { class: 'small' }, text), [
    h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() }),
    h('button', {
      class: 'primary' + (opts.danger ? ' danger-solid' : ''),
      text: opts.confirmLabel || i18n.t('common.confirm'),
      dataset: { noclose: '1' },
      onclick: () => { m.close(); onYes(); }
    })
  ], null, { size: 'confirm' });
  m.dlg.querySelector('.dlg-foot button:not(.primary)')?.focus();
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
  ], null, { size: 'confirm' });
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
  novels: [],
  activeNovelId: '',
  view: 'home',
  level: 'home',
  configMeta: null,
  switchingNovel: false,
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

/** Navigation preferences use the existing sections collection; record formats stay intact. */
const WORLD_MAX_DEPTH = 4;
const SETTING_BASE_KEYS = ['species', 'magic', 'places', 'history', 'economy', 'rules', 'religion'];

function settingEntries(includeHidden) {
  const prefs = ((state.db || {}).sections || {}).builtins || {};
  const builtin = (id, coll, label, desc) => {
    const saved = prefs[id] || {};
    return { id, coll, label: saved.label || label, desc: saved.desc || desc || '', builtin: true,
      on: saved.on === undefined ? true : saved.on !== false };
  };
  const sections = sectionDefs(true).map(sec => ({
    id: 'section_' + sec.key, coll: 'section_' + sec.key, section: sec,
    label: sec.key === 'world' && ['世界观', 'Worldview'].includes(sec.label)
      ? i18n.t('nav.world_setting') : (sec.label || sec.key),
    desc: sec.desc || '',
    // Each section owns its visibility; expansion defaults only affect new novels.
    on: sec.on !== false
  }));
  const world = sections.find(entry => entry.id === 'section_world');
  const baseSections = sections
    .filter(entry => entry !== world && SETTING_BASE_KEYS.includes(entry.section.key))
    .sort((a, b) => SETTING_BASE_KEYS.indexOf(a.section.key) - SETTING_BASE_KEYS.indexOf(b.section.key));
  const customSections = sections.filter(entry => entry !== world && !SETTING_BASE_KEYS.includes(entry.section.key));

  const entries = [];
  const add = (entry, parent = null) => {
    if (!entry) return;
    entry.parent = parent;
    entry.depth = parent ? 1 : 0;
    entries.push(entry);
  };
  add(builtin('characters', 'characters', i18n.t('nav.characters'), i18n.t('collections.characters.desc')));
  add(builtin('inventory', null, i18n.t('nav.inventory'), i18n.t('inventory.page_desc')), 'characters');
  if (world) add(world);
  add(builtin('world', 'worldmap', i18n.t('nav.worldmap'), i18n.t('worldmap.page_desc', { max: WORLD_MAX_DEPTH })),
    world ? 'section_world' : null);
  add(builtin('factions', 'factions', i18n.t('nav.factions'), i18n.t('collections.factions.desc')),
    world ? 'section_world' : null);
  add(builtin('items', 'items', i18n.t('nav.items'), i18n.t('collections.items.desc')));
  baseSections.forEach(entry => add(entry));
  customSections.forEach(entry => add(entry));
  add(builtin('other', 'other', i18n.t('nav.other'), i18n.t('collections.other.desc')));

  const order = (((state.db || {}).sections || {}).order || []).filter(id => id !== 'equipment');
  if (order.length) {
    const rank = id => order.includes(id) ? order.indexOf(id) : order.length - 0.5;
    entries.sort((a, b) => rank(a.id) - rank(b.id));
  }
  // Other settings is always the last entry; new sections are inserted before it.
  const other = entries.find(entry => entry.id === 'other');
  if (other) {
    entries.splice(entries.indexOf(other), 1);
    entries.push(other);
  }

  return includeHidden ? entries : entries.filter(entry => entry.on);
}

/** 统一的线性图标：单一路径、1.5px 描边、currentColor（颜色与状态交给 CSS）。 */
function svgIcon(pathD, size) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (size) { svg.setAttribute('width', size); svg.setAttribute('height', size); }
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', pathD);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

const ICONS = {
  pen: 'M4 20l4.5-1.2L20 7.3 16.7 4 5.2 15.5 4 20zM14.5 6.2l3.3 3.3',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6'
};

/** Sliders icon reads as “settings” much more clearly than the old sun-like gear. */function settingsIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const line = (x1, y1, x2, y2) => {
    const node = document.createElementNS(ns, 'line');
    node.setAttribute('x1', x1); node.setAttribute('y1', y1);
    node.setAttribute('x2', x2); node.setAttribute('y2', y2);
    return node;
  };
  const knob = (cx, cy) => {
    const node = document.createElementNS(ns, 'circle');
    node.setAttribute('cx', cx); node.setAttribute('cy', cy);
    node.setAttribute('r', '2.2');
    return node;
  };
  svg.append(line(4, 6, 20, 6), knob(9, 6), line(4, 12, 20, 12), knob(15, 12),
    line(4, 18, 20, 18), knob(8, 18));
  return svg;
}

function settingLabel(id, fallback) {
  return settingEntries(true).find(entry => entry.id === id)?.label || fallback;
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
    coll: view, singular: i18n.t('collections.singular_entry'), label: settingLabel(view, sec.label || key), idPrefix: 'ot',
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
  if (coll === 'config' && typeof refreshRestoreButton === 'function') refreshRestoreButton();
  if (!quiet) status(i18n.t('common.saving'), 'busy');
  clearTimeout(saveTimers[coll]);
  saveTimers[coll] = setTimeout(async () => {
    saveTimers[coll] = null;
    try {
      if (coll === 'config') await persistConfig();
      else await api('/api/collections/' + coll, { method: 'POST', body: { data: state.db[coll] } });
      if (!quiet) status(i18n.t('common.saved_at', { time: new Date().toLocaleTimeString() }), 'ok');
    } catch (e) {
      status(i18n.t('common.save_failed'), 'err');
      toast(i18n.t('common.save_failed_reason', { reason: e.message }), 'err');
    }
  }, 500);
}

async function saveNow(coll) {
  clearTimeout(saveTimers[coll]);
  saveTimers[coll] = null;
  if (coll === 'config') await persistConfig();
  else await api('/api/collections/' + coll, { method: 'POST', body: { data: state.db[coll] } });
  status(i18n.t('common.saved_at', { time: new Date().toLocaleTimeString() }), 'ok');
}

async function persistConfig() {
  const config = state.db.config || {};
  if (state.level === 'novel' && state.activeNovelId) {
    const ref = await api('/api/settings/config');
    const global = ref.global || {};
    const useGlobal = {};
    const values = {};
    Object.keys(config).forEach(key => {
      const changed = JSON.stringify(config[key]) !== JSON.stringify(global[key]);
      useGlobal[key] = !changed;
      if (changed) values[key] = config[key];
    });
    await api('/api/settings/config', { method: 'POST', body: {
      scope: 'novel', config: { version: 1, use_global: useGlobal, values }
    } });
  } else {
    await api('/api/settings/config', { method: 'POST', body: { scope: 'global', config } });
  }
  await refreshWorkspaceFiles();
}

/** AI 工作站的内容直接追加到「稿件处理」当前正文末尾（文件与草稿照常自动保存）。 */
function appendToTextPanel(content, quiet) {
  const text = String(content || '');
  if (!text.trim()) return '';
  const saved = ((state.db.state = state.db.state || {}).textPanel = state.db.state.textPanel || {});
  const ui = state.ui.text && state.ui.text.novelId === state.activeNovelId ? state.ui.text : null;
  // 手上还有未确认的修订时先还原原文，避免追加后偏移对不上。
  if (ui && ui.pending) {
    const pending = ui.pending;
    ui.value = ui.value.slice(0, pending.start) + pending.original + ui.value.slice(pending.end);
    ui.pending = null;
  }
  const base = ui ? ui.value : (saved.value || '');
  const merged = base.trim() ? base.replace(/\s+$/, '') + '\n\n' + text.trim() : text.trim();
  if (ui) {
    ui.value = merged; ui.dirty = true;
    ui.selectionStart = merged.length; ui.selectionEnd = merged.length;
  }
  saved.value = merged;
  saved.updated = new Date().toISOString();
  touch('state', true);
  if (!quiet) toast(i18n.t('common.appended_to_workspace'), 'ok');
  return merged;
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
const HOME_NAV = [
  { id: 'home', label: i18n.t('novels.home') },
  { id: 'cards', label: i18n.t('nav.cards') },
  { id: 'settings', label: i18n.t('settings.global_settings') }
];

const NOVEL_NAV = [
  { history: true },
  { group: i18n.t('nav.group_writing'), groupKey: 'writing' },
  { id: 'writer', label: i18n.t('nav.writer') },
  { id: 'text', label: i18n.t('nav.text') },
  { settings: true },
  { group: i18n.t('nav.group_memory'), groupKey: 'memory' },
  { id: 'memories', label: i18n.t('nav.memories'), coll: 'memories' },
  { group: i18n.t('nav.group_system'), groupKey: 'system' },
  { id: 'modes', label: i18n.t('nav.modes') },
  { id: 'settings', label: i18n.t('nav.settings') }
];

function renderNav() {
  if (state.ui.wsMenuClose) state.ui.wsMenuClose();
  const nav = document.getElementById('nav');
  // 重建导航时保留侧栏的滚动位置；否则点击设定项后 #nav 会被清空并跳回顶部。
  const keepTop = nav.scrollTop;
  // 重建会丢掉焦点：记住焦点所在的导航项，重建后还回去。
  const focusedView = document.activeElement?.closest?.('#nav [data-view]')?.dataset.view || null;
  clear(nav);
  state.ui.navCollapsed = state.ui.navCollapsed || {};
  const items = state.level === 'home' ? HOME_NAV : NOVEL_NAV;
  if (state.level === 'novel') {
    const active = state.novels.find(n => n.id === state.activeNovelId);
    const title = active?.title || i18n.t('common.unnamed');
    nav.appendChild(h('div', { class: 'nav-novel' },
      h('span', { class: 'nav-novel-title', text: title, title }),
      h('button', { class: 'nav-novel-back', text: '←', title: i18n.t('novels.back_home'),
        'aria-label': i18n.t('novels.back_home'), onclick: () => go('home') })));

  }
  let skip = false;
  for (const entry of items) {
    if (entry.history) { renderWorkstationHistory(nav); continue; }
    if (entry.settings) {
      const collapsed = state.ui.navCollapsed.settings === true;
      nav.appendChild(h('div', { class: 'nav-group nav-settings-head' },
        h('button', { class: 'nav-settings-toggle',
          'aria-expanded': String(!collapsed), 'aria-controls': 'setting-nav-items',
          onclick: () => { state.ui.navCollapsed.settings = !collapsed; renderNav(); }
        }, h('span', { text: collapsed ? '▸' : '▾', 'aria-hidden': 'true' }),
          h('span', { text: i18n.t('nav.group_settings') })),
        h('button', { class: 'nav-settings-manage' + (state.view === 'sections' ? ' active' : ''),
          title: i18n.t('nav.sections'), 'aria-label': i18n.t('nav.sections'),
          onclick: () => go('sections') }, settingsIcon())));
      const settingNav = h('div', { id: 'setting-nav-items', hidden: collapsed });
      if (!collapsed) settingEntries().forEach(item => {
        const count = item.coll && item.coll !== 'worldmap' ? collItems(item.coll).length : null;
        settingNav.appendChild(h('button', {
          class: 'nav-item nav-setting-item' + (item.parent ? ' nav-setting-child' : '') +
            (state.view === item.id ? ' active' : ''),
          'aria-current': state.view === item.id ? 'page' : null,
          'data-view': item.id,
          title: item.desc || item.label,
          onclick: () => go(item.id)
        }, h('span', { class: 'nav-setting-label' },
             item.parent ? h('span', { class: 'nav-setting-elbow', text: '└', 'aria-hidden': 'true' }) : null,
             h('span', { text: item.label })),
          count === null ? null : h('span', { class: 'count', text: String(count) })));
      });
      if(!collapsed)settingNav.appendChild(h('button',{class:'nav-item nav-setting-item'+(state.view==='relations'?' active':''),'data-view':'relations','aria-current':state.view==='relations'?'page':null,text:i18n.t('relations.network'),onclick:()=>go('relations')}));
      nav.appendChild(settingNav);
      continue;
    }
    if (entry.group) {
      const toggleable = entry.groupKey === 'core' || entry.groupKey === 'custom';
      const collapsed = toggleable && state.ui.navCollapsed[entry.groupKey] !== false;
      skip = !!collapsed;
      const label = !toggleable ? entry.group : (collapsed ? entry.group + ' ▸' : entry.group + ' ▾');
      const groupClass = 'nav-group' + (toggleable ? ' nav-group-toggle' : '') + (collapsed ? ' collapsed' : '');
      // 可折叠分组必须是按钮：div 既不可聚焦，也没有展开状态可播报。
      nav.appendChild(toggleable
        ? h('button', {
            class: groupClass, 'aria-expanded': String(!collapsed), text: label,
            onclick: () => {
              state.ui.navCollapsed[entry.groupKey] = !collapsed;
              renderNav();
            }
          })
        : h('div', { class: groupClass, text: label }));
      continue;
    }
    if (skip) continue;
    if (entry.sections) {
      sectionDefs().forEach(sec => {
        const view = 'section_' + sec.key;
        const active = state.view === view;
        nav.appendChild(h('button', {
          class: 'nav-item' + (active ? ' active' : ''),
          'data-view': view,
          'aria-current': active ? 'page' : null,
          onclick: () => go(view)
        },
          h('span', { text: sec.label || sec.key }),
          h('span', { class: 'count', text: String(collItems(view).length) })));
      });
      continue;
    }
    const count = entry.coll ? collItems(entry.coll).length : '';
    const active = state.view === entry.id;
    // 工作站选项卡右边一个会动的点：切到别的页面也知道还在生成。
    const generating = entry.id === 'writer' && !!state.ui.generating;
    nav.appendChild(h('button', {
      class: 'nav-item' + (active ? ' active' : '') + (generating ? ' nav-item-generating' : ''),
      'data-view': entry.id,
      'aria-current': active ? 'page' : null,
      'aria-busy': generating ? 'true' : null,
      title: generating ? i18n.t('workstation.generating') : null,
      onclick: () => entry.id === 'settings' ? openSettings() : go(entry.id)
    },
      h('span', { text: entry.label }),
      generating ? h('span', { class: 'nav-generating', 'aria-hidden': 'true' }) : null,
      count !== '' ? h('span', { class: 'count', text: String(count) }) : null));
  }
  nav.scrollTop = keepTop;
  // 当前项可能被底部的状态区挡住（长导航 + 小窗口）：滚到只保证可见的位置。
  nav.querySelector('.nav-item.active')?.scrollIntoView({ block: 'nearest' });
  if (focusedView) {
    const restored = nav.querySelector('[data-view="' + focusedView + '"]');
    if (restored) restored.focus({ preventScroll: true });
  }
}

async function loadNovelList() {
  const result = await api('/api/novels');
  state.novels = result.novels || [];
  state.activeNovelId = result.active_novel_id || '';
}

async function flushPendingSaves() {
  if (state.ui.leavePromise) {
    await state.ui.leavePromise;
    state.ui.leavePromise = null;
  }
  const pending = Object.keys(saveTimers).filter(key => saveTimers[key]);
  for (const coll of pending) {
    clearTimeout(saveTimers[coll]);
    saveTimers[coll] = null;
    await saveNow(coll);
  }
}

async function openSettings() {
  await refreshConfigMeta();
  go('settings');
}

function viewHome(main) {
  main.appendChild(pageHead(i18n.t('novels.home'), i18n.t('novels.home_desc'),
    h('button', { class: 'primary', text: i18n.t('novels.create'), onclick: showCreateNovel })));
  if (!state.novels.length) {
    main.appendChild(h('div', { class: 'novel-empty' },
      h('h2', { text: i18n.t('novels.empty_title') }),
      h('p', { text: i18n.t('novels.empty_desc') }),
      h('button', { class: 'primary', text: i18n.t('novels.create'), onclick: showCreateNovel })));
    return;
  }
  const tools = h('div', { class: 'novel-toolbar' });
  const search = h('input', { type: 'text', placeholder: i18n.t('novels.search'), oninput: renderCards });
  const sort = h('select', { onchange: renderCards },
    h('option', { value: 'updated', text: i18n.t('novels.sort_updated') }),
    h('option', { value: 'created', text: i18n.t('novels.sort_created') }));
  tools.append(search, sort);
  const cards = h('div', { class: 'novel-grid' });
  main.append(tools, cards);
  function renderCards() {
    clear(cards);
    const query = search.value.trim().toLocaleLowerCase();
    const items = state.novels.filter(item => `${item.title || ''} ${item.author || ''}`.toLocaleLowerCase().includes(query));
    items.sort((a, b) => String(b[sort.value] || '').localeCompare(String(a[sort.value] || '')));
    if (!items.length) {
      cards.appendChild(h('div', { class: 'muted', text: i18n.t('novels.no_results') }));
      return;
    }
    items.forEach(item => {
      const card = h('article', { class: 'novel-card' });
      card.appendChild(h('div', { class: 'novel-card-head' },
        h('h2', { text: item.ok === false ? i18n.t('novels.broken_title') : (item.title || i18n.t('common.unnamed')) }),
        item.id === state.activeNovelId ? h('span', { class: 'novel-active', text: i18n.t('novels.active') }) : null));
      if (item.ok === false) {
        card.appendChild(h('p', { class: 'muted', text: i18n.t('novels.broken_desc') }));
        card.appendChild(h('div', { class: 'novel-actions' },
          h('button', { class: 'danger', text: i18n.t('novels.delete'), onclick: () => confirmDeleteNovel(item) })));
      } else {
        if (item.author) card.appendChild(h('div', { class: 'muted', text: item.author }));
        card.appendChild(h('div', { class: 'novel-date', text: i18n.t('novels.updated', { date: item.updated || item.created || '' }) }));
        card.appendChild(h('div', { class: 'novel-actions' },
          h('button', { class: 'primary', text: item.id === state.activeNovelId ? i18n.t('novels.continue') : i18n.t('novels.open'), onclick: () => switchNovel(item.id) }),
          h('button', { text: i18n.t('novels.rename'), onclick: () => editNovel(item) }),
          h('button', { class: 'danger', text: i18n.t('novels.delete'), onclick: () => confirmDeleteNovel(item) })));
      }
      cards.appendChild(card);
    });
  }
  renderCards();
}

function showCreateNovel() {
  const title = h('input', { type: 'text', maxlength: 160 });
  const author = h('input', { type: 'text', maxlength: 160 });
  const description = h('textarea', { rows: 4 });
  const body = h('div', null,
    h('div', { class: 'field' }, h('label', { text: i18n.t('novels.title') }), title),
    h('div', { class: 'field' }, h('label', { text: i18n.t('novels.author') }), author),
    h('div', { class: 'field' }, h('label', { text: i18n.t('novels.description') }), description));
  const dialog = modal(i18n.t('novels.create'), body, [
    h('button', { text: i18n.t('common.cancel'), onclick: () => dialog.close() }),
    h('button', { class: 'primary', dataset: { noclose: '1' }, text: i18n.t('novels.create'), onclick: async () => {
      try {
        const result = await api('/api/novels', { method: 'POST', body: { title: title.value, author: author.value, description: description.value } });
        dialog.close();
        await loadNovelList();
        renderMain();
        await switchNovel(result.novel.id);
      } catch (error) { toast(error.message, 'err'); }
    } })
  ]);
  title.focus();
}

function editNovel(item) {
  const title = h('input', { type: 'text', value: item.title || '' });
  const author = h('input', { type: 'text', value: item.author || '' });
  const description = h('textarea', { rows: 4, value: item.description || '' });
  const body = h('div', null,
    h('div', { class: 'field' }, h('label', { text: i18n.t('novels.title') }), title),
    h('div', { class: 'field' }, h('label', { text: i18n.t('novels.author') }), author),
    h('div', { class: 'field' }, h('label', { text: i18n.t('novels.description') }), description));
  const dialog = modal(i18n.t('novels.rename'), body, [
    h('button', { text: i18n.t('common.cancel'), onclick: () => dialog.close() }),
    h('button', { class: 'primary', dataset: { noclose: '1' }, text: i18n.t('common.save'), onclick: async () => {
      try {
        await api('/api/novels/update', { method: 'POST', body: { id: item.id, title: title.value, author: author.value, description: description.value } });
        dialog.close(); await loadNovelList(); renderMain();
      } catch (error) { toast(error.message, 'err'); }
    } })
  ]);
}

function confirmDeleteNovel(item) {
  const broken = item.ok === false;
  const confirmation = broken ? item.id : item.title;
  const name = broken ? item.id : (item.title || i18n.t('common.unnamed'));
  confirmDialog(i18n.t('novels.delete'), i18n.t('novels.delete_confirm', { title: confirmation }), async () => {
    try {
      const wasActive = item.id === state.activeNovelId;
      if (wasActive) await flushPendingSaves();
      await api('/api/novels/delete', { method: 'POST', body: { id: item.id, title_confirmation: confirmation } });
      await loadNovelList();
      if (wasActive) { state.activeNovelId = ''; state.db = null; state.level = 'home'; state.configMeta = null; state.view = 'home'; }
      renderNav(); renderMain();
    } catch (error) { toast(error.message, 'err'); }
  }, { confirmLabel: i18n.t('common.delete_named', { name }), danger: true });
}

async function switchNovel(id) {
  if (state.switchingNovel || state.ui.busy) return;
  state.switchingNovel = true;
  status(i18n.t('novels.switching'), 'busy');
  try {
    if (state.ui.leave?.view === 'text') { const leave = state.ui.leave; state.ui.leave = null; await leave.fn(); }
    await flushPendingSaves();
    const changedNovel = state.activeNovelId !== id;
    await api('/api/novels/open', { method: 'POST', body: { id } });
    state.activeNovelId = id;
    if (changedNovel) { state.ui.text = null; state.ui.settingEditor = null; }
    state.level = 'novel';
    state.configMeta = null;
    await loadNovelList();
    await refreshFiles();
    await loadCurrentSession();
    state.view = 'writer';
    renderNav(); renderMain();
    status(i18n.t('common.ready'), 'ok');
  } catch (error) { toast(error.message, 'err'); }
  finally { state.switchingNovel = false; }
}

function go(view) {
  if (view === 'sections') {
    state.ui.settingEditor = null;
    state.ui.navCollapsed.settings = false;
  } else if (view === 'elements') {
    state.ui.settingEditor = settingEntries(true).find(entry => entry.coll === state.ui.elements?.key)?.id
      || settingEntries(true).find(entry => entry.coll && entry.coll !== 'worldmap')?.id || null;
    state.ui.elemMode = 'tree'; view = 'sections';
  }
  // 有些页（如稿件处理）需要在离开前把手上的内容落盘，各自注册 leave 钩子。
  const leave = state.ui.leave;
  if (leave && leave.view === state.view && leave.view !== view) {
    state.ui.leave = null;
    try {
      const result = leave.fn();
      state.ui.leavePromise = result && typeof result.then === 'function' ? result : null;
    } catch (e) { /* 落盘失败由具体页面反馈；继续允许切页 */ }
  }
  if (view === 'home' || view === 'cards') {
    // 「作品库 / 角色卡」属于库级页面，两者都不依赖当前小说。
    state.level = 'home';
  } else if (view === 'settings') {
    // 设置页沿用当前层级：首页=全局配置，小说内=本小说配置。
  } else if (!state.activeNovelId) {
    view = 'home';
    state.level = 'home';
  } else {
    state.level = 'novel';
  }
  // 换页回到顶部；同一视图重绘（自动保存后）仍保留原滚动位置。
  if (view !== state.view) state.ui.resetScroll = true;
  state.view = view;
  renderNav();
  renderMain();
}

function renderMain() {
  const recordSession=state.ui.recordEditSession;
  if(recordSession && (recordSession.view!==state.view || recordSession.novel!==(state.activeNovelId || '')))delete state.ui.recordEditSession;
  const main = document.getElementById('main');
  const keepTop = main.scrollTop;
  main.classList.toggle('writer-main', state.view === 'writer');
  clear(main);
  if (state.debug) {
    main.appendChild(h('div', { class: 'debug-strip',
      text: i18n.t('common.debug_banner') }));
  }
  const map = {
    home: viewHome,
    cards: viewCharacterCards,
    writer: viewWorkstation, text: viewManuscript,
    relations: viewRelations,
    inventory: viewInventory, memories: viewMemories, world: viewWorld,
    elements: viewElements, sections: viewSections, modes: viewModes, settings: viewAI
  };
  if (map[state.view]) map[state.view](main);
  else if (defFor(state.view)) viewRecords(main, state.view);
  else main.appendChild(h('div', { class: 'card muted', text: i18n.t('common.unknown_page') }));
  i18n.apply(main);
  main.scrollTop = state.ui.resetScroll ? 0 : keepTop;
  delete state.ui.resetScroll;
}

function guidanceButton(title, text) {
  return h('button', {class:'guidance-button',text:'?',title,dataset:{noclose:'1'},'aria-label':title,onclick:e=>{
    const anchor=e.currentTarget;
    const popup=h('div',{class:'guidance-popup',popover:'auto',role:'dialog','aria-label':title},
      h('strong',{text:title}),h('p',{text}));
    popup.addEventListener('toggle',()=>{if(!popup.matches(':popover-open')) popup.remove();});
    document.body.appendChild(popup);popup.showPopover();
    const rect=anchor.getBoundingClientRect();
    popup.style.left=Math.max(8,Math.min(rect.right-popup.offsetWidth,window.innerWidth-popup.offsetWidth-8))+'px';
    popup.style.top=Math.max(8,Math.min(rect.bottom+8,window.innerHeight-popup.offsetHeight-8))+'px';
  }});
}

function pageHead(title, desc, actions) {
  return h('div', { class: 'page-head' },
    h('div', null, h('h1', { text: title }), desc ? h('div', { class: 'desc', text: desc }) : null),
    h('div', { class: 'spacer' }),
    actions || null);
}

// ═══════════════════════════════════════════
// 命令面板（Ctrl+K）：跳页面 / 跳设定条目
// ═══════════════════════════════════════════
function commandEntries() {
  const out = [];
  const add = (label, hint, run, extra) => out.push({ label, hint, run, keys: label + ' ' + (hint || '') + ' ' + (extra || '') });
  add(i18n.t('novels.home'), i18n.t('novels.home_desc'), () => go('home'));
  if (state.level !== 'novel') {
    add(i18n.t('nav.cards'), i18n.t('cards.description'), () => go('cards'));
    add(i18n.t('settings.global_settings'), '', () => openSettings());
    return out;
  }
  NOVEL_NAV.forEach(entry => {
    if (!entry.id) return;
    if (entry.id === 'settings') add(i18n.t('nav.settings'), '', () => openSettings());
    else add(entry.label, '', () => go(entry.id));
  });
  const settings = settingEntries();
  settings.forEach(entry => add(entry.label, entry.desc || '', () => go(entry.id)));
  add(i18n.t('relations.network'), '', () => go('relations'));
  const openRecord = (view, rec) => {
    const ui = state.ui[view] = state.ui[view] || { sel: null, q: '' };
    ui.sel = rec.id; ui.q = ''; ui.category = null; ui.tag = '';
    go(view);
  };
  settings.forEach(entry => {
    if (!entry.coll || entry.coll === 'worldmap') return;
    collItems(entry.coll).forEach(rec => add(recordName(rec), entry.label, () => openRecord(entry.id, rec)));
  });
  return out;
}

function openCommandPalette() {
  if (document.getElementById('overlay-root')?.querySelector('.dialog')) return;
  const entries = commandEntries();
  const previousFocus = document.activeElement;
  let current = [], active = 0;
  const input = h('input', {
    class: 'cmdk-input', type: 'search', autocomplete: 'off',
    placeholder: i18n.t('common.command_placeholder'),
    'aria-label': i18n.t('common.command_placeholder'),
    role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'cmdk-list'
  });
  const list = h('div', { class: 'cmdk-list', id: 'cmdk-list', role: 'listbox' });
  const panel = h('div', { class: 'cmdk', role: 'dialog', 'aria-modal': 'true', 'aria-label': i18n.t('common.command_title') },
    input, list);
  const overlay = h('div', { class: 'cmdk-overlay', onclick: e => { if (e.target === overlay) close(); } }, panel);

  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    previousFocus?.focus?.({ preventScroll: true });
  };
  const run = entry => { close(); entry.run(); };
  function draw() {
    const query = input.value.trim().toLocaleLowerCase();
    current = entries.filter(entry => !query || entry.keys.toLocaleLowerCase().includes(query)).slice(0, 40);
    active = Math.min(active, Math.max(0, current.length - 1));
    clear(list);
    current.forEach((entry, index) => {
      list.appendChild(h('button', {
        class: 'cmdk-row' + (index === active ? ' active' : ''), role: 'option',
        'aria-selected': String(index === active),
        onclick: () => run(entry)
      }, h('span', { class: 'cmdk-label', text: entry.label }),
        entry.hint ? h('span', { class: 'cmdk-hint', text: entry.hint }) : null));
    });
    if (!current.length) list.appendChild(h('div', { class: 'cmdk-empty', text: i18n.t('common.command_empty') }));
    list.querySelector('.cmdk-row.active')?.scrollIntoView({ block: 'nearest' });
  }
  function move(delta) {
    if (!current.length) return;
    active = (active + delta + current.length) % current.length;
    draw();
  }
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (current[active]) run(current[active]); }
  };
  input.addEventListener('input', () => { active = 0; draw(); });
  document.addEventListener('keydown', onKey);
  document.getElementById('overlay-root').appendChild(overlay);
  draw();
  input.focus();
}

// Ctrl+K：命令面板。测试环境（无 DOM）会跳过绑定。
if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (String(e.key).toLowerCase() !== 'k') return;
    e.preventDefault();
    if (document.querySelector('.cmdk')) return;
    openCommandPalette();
  });
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
    tagLabel: i18n.t('collections.alias'), notesLabel: i18n.t('collections.notes'),
    hasCategory: true, hasTags: true, hasSlots: true, defaultCategoryKey: 'defaults.category.item'
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
let workspaceRefreshVersion=0;
async function refreshWorkspaceFiles() {
  const requestVersion=++workspaceRefreshVersion;
  const novel=state.activeNovelId;
  const r=await api('/api/workspace/files');
  if(novel!==state.activeNovelId || r.active_novel_id!==novel || requestVersion!==workspaceRefreshVersion)return;
  state.sources=r.sources || [];state.io=r.io || {files:[]};state.exports=r.exports;
  state.paths={...state.paths,import:r.import_dir,export:r.export_dir,text:r.text_dir};
}

async function refreshFiles() {
  const r = await api('/api/state');
  if(r.relation_discarded)toast(i18n.t('relations.discarded',{count:r.relation_discarded}),'err');
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
  state.activeNovelId = r.active_novel_id || '';
}
