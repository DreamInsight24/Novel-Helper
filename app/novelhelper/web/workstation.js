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

/* NovelHelper —— AI 工作站（左输入 / 右输出） */
'use strict';

const WORK_FALLBACK = [
  { id: 'logic', label: i18n.t('modes.logic_label'), desc: i18n.t('modes.logic_desc') },
  { id: 'outline', label: i18n.t('modes.outline_label'), desc: i18n.t('modes.outline_desc') },
  { id: 'draft', label: i18n.t('modes.draft_label'), desc: i18n.t('modes.draft_desc') },
  { id: 'brainstorm', label: i18n.t('modes.brainstorm_label'), desc: i18n.t('modes.brainstorm_desc') }
];

/** AI 工作站只使用写稿模式；稿件处理模式在「稿件处理」页使用。 */
function workModes() {
  const items = modesOfKind('write');
  if (items.length) return items;
  return allModes().length ? [] : WORK_FALLBACK;
}

function workModeLabel(id) {
  const mode = allModes().find(m => m.id === id) ||
    WORK_FALLBACK.find(m => m.id === id);
  return mode ? mode.label : (id || i18n.t('modes.draft_label'));
}

/** 把工作站状态补齐，兼容旧版 state.json。 */
function wsState() {
  const ws = (state.db.state = state.db.state || {}).workstation = state.db.state.workstation || {};
  ws.selection = ws.selection || {};
  const sel = ws.selection;
  sel.include = sel.include || {
    characters: true, memory: true, world: true, factions: false, worldmap: false, state: true
  };
  ['character_ids', 'memory_ids', 'world_ids'].forEach(key => {
    sel[key] = Array.isArray(sel[key]) ? sel[key] : [];
  });
  sel.project_files = (sel.project_files || [])
    .map(item => typeof item === 'string' ? item : (item && item.path) || '')
    .filter(Boolean);
  ws.mode = ws.mode || 'draft';
  const writes = workModes();
  if (!writes.some(m => m.id === ws.mode)) ws.mode = writes.length ? writes[0].id : '';
  ws.prompt = ws.prompt || '';
  ws.work_prompt = ws.work_prompt || '';
  ws.current_state = ws.current_state || '';
  ws.extra = ws.extra || '';
  ws.output = ws.output || '';
  return ws;
}

function wsSelection() {
  const ws = wsState();
  const sel = ws.selection;
  return {
    prompt: ws.prompt || '',
    extra: ws.extra || '',
    current_state: ws.current_state || '',
    work_prompt: ws.work_prompt || '',
    include: sel.include || {},
    character_ids: sel.character_ids || [],
    memory_ids: sel.memory_ids || [],
    world_ids: sel.world_ids || [],
    target_chars: sel.target_chars || 0,
    strict_length: sel.strict_length !== false,
    project_files: []
  };
}

async function wsLoadProjectFiles() {
  const sel = wsSelection();
  for (const rel of wsState().selection.project_files || []) {
    try {
      const r = await api('/api/file?path=' + encodeURIComponent(rel));
      sel.project_files.push({ path: rel, label: rel, content: r.content });
    } catch (e) {
      toast(i18n.t('workstation.extra_read_failed', { path: rel }), 'err');
    }
  }
  return sel;
}

function shownSession() {
  return state.ui.historySession || null;
}

function shownTurn() {
  const session = shownSession();
  if (!session) return null;
  const turns = session.turns || [];
  return state.ui.historyTurn || turns[turns.length - 1] || null;
}

function currentOutput() {
  const turn = shownTurn();
  if (turn) return turn.output || '';
  return wsState().output || '';
}

function modeBadge(id) {
  return h('span', { class: 'tag mode-tag', text: workModeLabel(id) });
}

function previewText(text, n) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n) + '…' : (clean || i18n.t('common.empty_paren'));
}

// ─────────────────────────────────────────────
// 选择器
// ─────────────────────────────────────────────
function pickerRows(items, selectedIds, onToggle, describe) {
  const box = h('div', { class: 'picker' });
  if (!items.length) {
    box.appendChild(h('div', { class: 'muted small', text: i18n.t('workstation.no_options') }));
    return box;
  }
  items.forEach(item => {
    const checked = selectedIds.includes(item.id);
    const row = h('label', { class: 'check picker-row' },
      h('input', {
        type: 'checkbox', checked,
        onchange: e => onToggle(item.id, e.target.checked)
      }),
      h('span', { class: 'name', text: describe(item) }));
    box.appendChild(row);
  });
  return box;
}

function toggleId(list, id, on) {
  const idx = list.indexOf(id);
  if (on && idx < 0) list.push(id);
  if (!on && idx >= 0) list.splice(idx, 1);
}

function worldItems() {
  const out = [];
  collItems('other').forEach(rec => out.push({ rec, group: i18n.t('nav.other') }));
  sectionDefs().forEach(sec => collItems('section_' + sec.key)
    .forEach(rec => out.push({ rec, group: sec.label || sec.key })));
  return out;
}

// ─────────────────────────────────────────────
// 主界面
// ─────────────────────────────────────────────
function viewWorkstation(main) {
  const ws = wsState();
  const sel = ws.selection;
  const busy = !!state.ui.busy;
  const session = shownSession();
  const isCurrentSession = !!(session && session.id === ws.current_session);
  const turn = shownTurn();
  const output = currentOutput();
  const modes = workModes();
  const mode = modes.find(m => m.id === ws.mode) || modes[0] || null;

  main.appendChild(pageHead(i18n.t('nav.writer'),
    i18n.t('workstation.page_desc'),
    h('div', { class: 'inline' },
      h('button', { text: i18n.t('history.title'), onclick: () => openHistoryDialog() }),
      h('button', { text: i18n.t('history.current'), onclick: () => returnToCurrent() }),
      h('button', {
        class: 'primary', text: i18n.t('history.new'),
        onclick: () => newConversation()
      }))));

  if (session && !isCurrentSession) {
    main.appendChild(h('div', { class: 'notice' },
      h('span', { text: i18n.t('history.viewing', { title: session.title || i18n.t('common.unnamed') }) }),
      h('button', { class: 'mini', text: i18n.t('history.return'), onclick: () => returnToCurrent() })));
  }

  const row = h('div', { class: 'workbench-row' });
  const left = h('div', { class: 'workbench-input' });
  const right = h('div', { class: 'workbench-output' });
  row.appendChild(left);
  row.appendChild(right);
  main.appendChild(row);

  // ── 左侧：写稿模式 ───────────────────────
  const modeCard = h('div', { class: 'card' });
  modeCard.appendChild(h('h2', null, i18n.t('modes.kind_write'),
    h('span', { class: 'hint', text: i18n.t('workstation.mode_hint') })));
  if (!modes.length) {
    modeCard.appendChild(h('div', { class: 'notice warn' },
      h('span', { text: i18n.t('workstation.no_mode') }),
      h('button', {
        class: 'mini', text: i18n.t('workstation.go_modes'),
        onclick: () => { state.ui.modes = { kind: 'write', sel: '' }; go('modes'); }
      })));
  } else {
    modeCard.appendChild(h('div', { class: 'field' },
      h('select', {
        onchange: e => { ws.mode = e.target.value; touch('state', true); renderMain(); }
      }, modes.map(m => h('option', {
        value: m.id, text: m.label, selected: m.id === ws.mode
      })))));
    modeCard.appendChild(h('div', { class: 'mode-desc', text: mode ? (mode.desc || '') : '' }));
    const api = (state.db.config || {}).api || {};
    modeCard.appendChild(h('div', { class: 'small muted', style: { marginTop: '6px' } },
      i18n.t('workstation.meta_line', { model: mode.model || api.default_model || i18n.t('workstation.follow_default'), effort: mode.effort || api.default_effort || 'medium' })));
    modeCard.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } },
      h('label', { text: i18n.t('workstation.extra_label') }),
      h('textarea', {
        rows: 4, value: ws.work_prompt || '',
        placeholder: i18n.t('workstation.extra_placeholder'),
        oninput: e => { ws.work_prompt = e.target.value; touch('state', true); }
      })));
  }
  left.appendChild(modeCard);

  // ── 左侧：输入设定 ───────────────────────
  const inputCard = h('div', { class: 'card' });
  inputCard.appendChild(h('h2', null, i18n.t('workstation.input_title'),
    h('span', { class: 'hint', text: i18n.t('workstation.input_hint') })));

  const summary = h('div', { class: 'small muted input-summary' });
  const refreshSummary = () => {
    const bits = [
      i18n.t('workstation.chip_characters', { count: (sel.character_ids || []).length }),
      i18n.t('workstation.chip_memory', { count: (sel.memory_ids || []).length }),
      i18n.t('workstation.chip_world', { count: (sel.world_ids || []).length })
    ];
    if (sel.include.worldmap) bits.push(i18n.t('nav.worldmap'));
    if (sel.include.factions) bits.push(i18n.t('workstation.chip_factions'));
    bits.push(i18n.t('workstation.chip_target', { count: sel.target_chars || ((state.db.config || {}).writing || {}).target_chars || 8000 }));
    summary.textContent = i18n.t('workstation.send_summary', { list: bits.join(' · ') });
  };
  refreshSummary();
  inputCard.appendChild(summary);

  const chip = (key, label) => h('span', {
    class: 'chip' + (sel.include[key] ? ' on' : ''),
    onclick: () => {
      sel.include[key] = !sel.include[key];
      touch('state', true);
      renderMain();
    }
  }, label);
  inputCard.appendChild(h('div', { class: 'field' },
    h('label', { text: i18n.t('workstation.include_label') }),
    h('div', { class: 'chips' }, [
      chip('characters', i18n.t('nav.characters')),
      chip('memory', i18n.t('workstation.chip_memory_label')),
      chip('world', i18n.t('workstation.chip_world_label')),
      chip('factions', i18n.t('workstation.chip_factions_label')),
      chip('worldmap', i18n.t('nav.worldmap')),
      chip('state', i18n.t('workstation.chip_state'))
    ])));

  // 人物
  const chars = collItems('characters');
  const charDetails = h('details', { class: 'input-details', open: true });
  charDetails.appendChild(h('summary', null,
    i18n.t('nav.characters'), h('span', { class: 'hint', text: i18n.t('workstation.selected_of', { count: (sel.character_ids || []).length, total: chars.length }) })));
  if (chars.length) {
    charDetails.appendChild(h('div', { class: 'inline', style: { marginBottom: '6px' } },
      h('button', {
        class: 'mini', text: i18n.t('common.select_all'),
        onclick: () => { sel.character_ids = chars.map(c => c.id); touch('state', true); renderMain(); }
      }),
      h('button', {
        class: 'mini', text: i18n.t('common.clear'),
        onclick: () => { sel.character_ids = []; touch('state', true); renderMain(); }
      })));
    charDetails.appendChild(pickerRows(chars, sel.character_ids,
      (id, on) => { toggleId(sel.character_ids, id, on); touch('state', true); renderMain(); },
      c => recordName(c) + (c.category ? ' · ' + c.category : '')));
  } else {
    charDetails.appendChild(h('div', { class: 'muted small', text: i18n.t('workstation.no_characters') }));
  }
  inputCard.appendChild(charDetails);

  // 记忆
  const mems = collItems('memories');
  const memDetails = h('details', { class: 'input-details' });
  memDetails.appendChild(h('summary', null,
    i18n.t('workstation.chip_memory_label'), h('span', { class: 'hint', text: i18n.t('workstation.selected_of', { count: (sel.memory_ids || []).length, total: mems.length }) })));
  memDetails.appendChild(h('div', { class: 'inline', style: { marginBottom: '6px' } },
    h('button', {
      class: 'mini', text: i18n.t('common.select_all'),
      onclick: () => { sel.memory_ids = mems.map(m => m.id); touch('state', true); renderMain(); }
    }),
    h('button', {
      class: 'mini', text: i18n.t('common.clear'),
      onclick: () => { sel.memory_ids = []; touch('state', true); renderMain(); }
    })));
  memDetails.appendChild(pickerRows(mems, sel.memory_ids,
    (id, on) => { toggleId(sel.memory_ids, id, on); touch('state', true); renderMain(); },
    m => (m.category ? '[' + m.category + '] ' : '') + (m.title || i18n.t('common.unnamed'))));
  inputCard.appendChild(memDetails);

  // 世界观条目
  const world = worldItems();
  const worldDetails = h('details', { class: 'input-details' });
  worldDetails.appendChild(h('summary', null,
    i18n.t('workstation.world_entries'), h('span', { class: 'hint', text: i18n.t('workstation.selected_of', { count: (sel.world_ids || []).length, total: world.length }) })));
  worldDetails.appendChild(pickerRows(world, sel.world_ids,
    (id, on) => { toggleId(sel.world_ids, id, on); touch('state', true); renderMain(); },
    entry => (entry.rec.name || entry.rec.title || i18n.t('common.unnamed')) + ' · ' + entry.group));
  inputCard.appendChild(worldDetails);

  // 附加项目文件
  const files = state.sources || [];
  const fileDetails = h('details', { class: 'input-details' });
  fileDetails.appendChild(h('summary', null,
    i18n.t('workstation.attachments'), h('span', { class: 'hint', text: i18n.t('common.file_count', {count: (sel.project_files || []).length}) })));
  if (files.length) {
    const fileBox = h('div', { class: 'picker' });
    files.forEach(f => fileBox.appendChild(h('label', { class: 'check picker-row' },
      h('input', {
        type: 'checkbox', checked: (sel.project_files || []).includes(f.path),
        onchange: e => {
          sel.project_files = sel.project_files || [];
          if (e.target.checked) { if (!sel.project_files.includes(f.path)) sel.project_files.push(f.path); }
          else sel.project_files = sel.project_files.filter(x => x !== f.path);
          touch('state', true);
          renderMain();
        }
      }),
      h('span', { class: 'name', text: f.path }))));
    fileDetails.appendChild(fileBox);
  } else {
    fileDetails.appendChild(h('div', { class: 'muted small', text: i18n.t('workstation.attach_hint') }));
  }
  inputCard.appendChild(fileDetails);

  // 当前状态 / 用户提示词 / 补充
  inputCard.appendChild(h('div', { class: 'field' },
    h('label', { text: i18n.t('workstation.state_label') }),
    h('textarea', {
      rows: 5, value: ws.current_state || '',
      placeholder: i18n.t('workstation.state_placeholder'),
      oninput: e => { ws.current_state = e.target.value; touch('state', true); }
    })));
  inputCard.appendChild(h('div', { class: 'field' },
    h('label', { text: i18n.t('workstation.prompt_label') }),
    h('textarea', {
      rows: 12, value: ws.prompt || '', class: 'prompt-area',
      placeholder: i18n.t('workstation.prompt_placeholder'),
      oninput: e => { ws.prompt = e.target.value; touch('state', true); }
    })));
  inputCard.appendChild(h('div', { class: 'field' },
    h('label', { text: i18n.t('workstation.extra2_label') }),
    h('textarea', {
      rows: 3, value: ws.extra || '',
      placeholder: i18n.t('workstation.extra2_placeholder'),
      oninput: e => { ws.extra = e.target.value; touch('state', true); }
    })));

  const defaultChars = ((state.db.config || {}).writing || {}).target_chars || 8000;
  inputCard.appendChild(h('div', { class: 'field' },
    h('label', { text: i18n.t('workstation.target_label') }),
    h('div', { class: 'inline' },
      h('input', {
        type: 'number', style: { width: '120px' }, value: sel.target_chars || defaultChars,
        oninput: e => { sel.target_chars = Number(e.target.value) || 0; touch('state', true); refreshSummary(); }
      }),
      h('label', { class: 'check' },
        h('input', {
          type: 'checkbox', checked: sel.strict_length !== false,
          onchange: e => { sel.strict_length = e.target.checked; touch('state', true); }
        }), i18n.t('workstation.strict')),
      h('span', { class: 'small muted', text: i18n.t('workstation.target_default', { count: defaultChars }) }))));

  const runBtn = h('button', {
    class: 'primary wide run-btn', text: busy ? i18n.t('common.generating') : i18n.t('workstation.start'),
    disabled: busy || !mode, onclick: () => runWorkstation()
  });
  inputCard.appendChild(runBtn);
  inputCard.appendChild(h('div', { class: 'inline', style: { marginTop: '8px' } },
    h('button', { text: i18n.t('workstation.preview_send'), disabled: !mode, onclick: () => previewWorkstation() }),
    h('button', {
      text: i18n.t('workstation.clear_input'),
      onclick: () => {
        if (!confirm(i18n.t('workstation.clear_confirm'))) return;
        ws.prompt = ''; ws.current_state = ''; ws.extra = ''; ws.work_prompt = '';
        touch('state', true); renderMain();
      }
    })));
  left.appendChild(inputCard);

  // ── 右侧：输出 ───────────────────────────
  const outputCard = h('div', { class: 'card output-card' });
  const outHead = h('h2', null, i18n.t('workstation.output_title'),
    modeBadge(session ? (turn && turn.mode) : ws.last_mode || ws.mode),
    h('span', { class: 'hint', text: i18n.t('workstation.char_count', { count: output.length }) }));
  outputCard.appendChild(outHead);

  if (session && !isCurrentSession) {
    outputCard.appendChild(h('div', { class: 'history-view-head' },
      h('span', { text: i18n.t('history.viewing_short', { title: session.title || i18n.t('common.unnamed') }) }),
      h('button', { class: 'mini', text: i18n.t('history.return'), onclick: () => returnToCurrent() })));
  }

  if (output.trim()) {
    outputCard.appendChild(h('div', { class: 'md output-md', html: md(output) }));
  } else {
    outputCard.appendChild(h('div', { class: 'empty-output' },
      h('div', { class: 'empty-icon', text: '✎' }),
      h('div', { text: i18n.t('workstation.output_empty') }),
      h('div', { class: 'small muted', text: i18n.t('workstation.output_empty_hint') })));
  }

  const meta = state.ui.lastMeta;
  if (meta && !session) {
    outputCard.appendChild(h('div', { class: 'small muted output-meta' },
      i18n.t('workstation.output_meta', {model: meta.model || '—', effort: meta.effort || '—', elapsed: meta.elapsed != null ? meta.elapsed + 's' : '—', tokens: meta.usage?.total_tokens || '—'})));
  }

  outputCard.appendChild(h('div', { class: 'output-actions' },
    h('button', { class: 'primary', text: i18n.t('workstation.append_prompt'), disabled: !output.trim(), onclick: () => appendOutput() }),
    h('button', { text: i18n.t('workstation.save_txt'), disabled: !output.trim(), onclick: () => saveOutputDialog('txt') }),
    h('button', { text: i18n.t('workstation.save_md'), disabled: !output.trim(), onclick: () => saveOutputDialog('md') }),
    h('button', { text: i18n.t('workstation.to_manuscript'), disabled: !output.trim(), onclick: () => sendOutputToText() }),
    h('button', { text: i18n.t('common.copy'), disabled: !output.trim(), onclick: () => copyOutput() }),
    h('button', { text: i18n.t('workstation.view_raw'), disabled: !output.trim(), onclick: () => showRawOutput() })));
  right.appendChild(outputCard);

  // ── 右侧：当前对话 / 最近轮次 ────────────
  const convCard = h('div', { class: 'card' });
  const currentSession = state.ui.currentSession;
  convCard.appendChild(h('h2', null, i18n.t('history.current'),
    h('span', { class: 'hint', text: currentSession ? i18n.t('history.turn_count', { count: (currentSession.turns || []).length }) : i18n.t('history.not_started') }),
    h('span', { style: { flex: '1' } }),
    h('button', { class: 'mini', text: i18n.t('history.view_all'), onclick: () => openHistoryDialog() })));
  if (currentSession && (currentSession.turns || []).length) {
    convCard.appendChild(h('div', { class: 'small muted', style: { marginBottom: '8px' } },
      currentSession.title || i18n.t('history.untitled')));
    const turns = (currentSession.turns || []).slice(-4).reverse();
    turns.forEach(t => {
      convCard.appendChild(h('div', {
        class: 'turn-row', onclick: () => viewHistoryTurn(currentSession, t)
      },
        h('div', { class: 'turn-top' },
          modeBadge(t.mode),
          h('span', { class: 'small muted', text: t.created || '' }),
          h('span', { style: { flex: '1' } }),
          h('span', { class: 'small muted', text: i18n.t('workstation.char_count', { count: (t.output || '').length }) })),
        h('div', { class: 'turn-preview', text: i18n.t('history.input_prefix', { text: previewText(t.user_prompt, 64) }) }),
        h('div', { class: 'turn-preview', text: i18n.t('history.output_prefix', { text: previewText(t.output, 88) }) })));
    });
  } else {
    convCard.appendChild(h('div', { class: 'muted small', text: i18n.t('history.autosave_hint') }));
  }
  right.appendChild(convCard);

  const logCard = h('div', { class: 'card' });
  logCard.appendChild(h('h2', null, i18n.t('workstation.log_title'), h('span', { class: 'hint', text: i18n.t('workstation.log_hint') })));
  logCard.appendChild(h('pre', { class: 'log', text: state.ui.log || i18n.t('workstation.log_empty') }));
  right.appendChild(logCard);

  main.appendChild(h('div', { class: 'legal-footer' },
    h('strong', { text: i18n.t('workstation.disclaimer_label') }),
    i18n.t('workstation.disclaimer')));

  // 生成期间：禁用全部控件，并盖一层全屏锁。
  if (busy) {
    main.querySelectorAll('input, textarea, select, button').forEach(el => { el.disabled = true; });
    main.appendChild(h('div', { class: 'work-lock' },
      h('div', { class: 'work-lock-box' },
        h('div', { class: 'spinner' }),
        h('strong', { text: i18n.t('workstation.lock_title') }),
        h('div', { class: 'small muted', text: i18n.t('workstation.lock_hint') }))));
  }
}

// ─────────────────────────────────────────────
// 生成
// ─────────────────────────────────────────────
async function runWorkstation() {
  if (state.ui.busy) return;
  const ws = wsState();
  if (!ws.mode) { toast(i18n.t('workstation.no_mode_toast'), 'err'); return; }
  state.ui.busy = true;
  state.ui.historySession = null;
  state.ui.historyTurn = null;
  renderMain();
  status(i18n.t('common.generating'), 'busy');

  try {
    await saveNow('modes').catch(() => {});
    const selection = await wsLoadProjectFiles();
    const res = await api('/api/workstation/run', {
      method: 'POST',
      body: {
        surface: 'workstation',
        mode_id: ws.mode,
        prompt: ws.prompt,
        work_prompt: ws.work_prompt,
        selection,
        session_id: ws.current_session || '',
        config: state.db.config
      }
    });

    state.ui.busy = false;
    state.ui.lastMeta = res;
    state.ui.currentSession = res.session || null;
    const local = wsState();
    local.output = res.text || '';
    local.mode = res.mode_id || res.work_mode || local.mode;
    local.last_mode = res.mode_id || res.work_mode || local.last_mode;
    local.current_session = res.session_id || local.current_session;
    state.ui.log = '[' + new Date().toLocaleTimeString() + '] ' + workModeLabel(res.mode_id) +
      ' | 模型 ' + (res.model || '—') + ' | 耗时 ' + (res.elapsed || 0) + 's' +
      (res.usage && res.usage.total_tokens ? ' | tokens ' + res.usage.total_tokens : '') +
      '\n' + (state.ui.log || '');

    try {
      await saveNow('state');
      await refreshFiles();
    } catch (e) {
      // 历史已由后端保存；刷新失败不影响本次显示。
    }
    const next = wsState();
    next.output = res.text || '';
    next.mode = res.mode_id || res.work_mode || next.mode;
    next.last_mode = res.mode_id || res.work_mode || next.last_mode;
    next.current_session = res.session_id || next.current_session;
    state.ui.currentSession = res.session || state.ui.currentSession;
    renderNav();
    renderMain();
    status(i18n.t('workstation.done'), 'ok');
    toast(i18n.t('workstation.done_saved'), 'ok');
  } catch (e) {
    state.ui.busy = false;
    renderMain();
    status(i18n.t('workstation.failed'), 'err');
    toast(i18n.t('workstation.failed_reason', { reason: e.message }), 'err');
  }
}

function previewWorkstation() {
  const body = h('div', null, h('div', { class: 'muted', text: i18n.t('common.assembling') }));
  const m = modal(i18n.t('workstation.preview_title'), body, [h('button', { text: i18n.t('common.close'), onclick: () => m.close() })]);
  (async () => {
    try {
      const ws = wsState();
      await saveNow('modes').catch(() => {});
      const selection = await wsLoadProjectFiles();
      const res = await api('/api/ai/preview', {
        method: 'POST',
        body: {
          surface: 'workstation',
          mode_id: ws.mode, work_prompt: ws.work_prompt,
          selection
        }
      });
      clear(body);
      body.appendChild(h('div', { class: 'field' },
        h('label', { text: i18n.t('workstation.system_label', { count: res.system.length }) }),
        h('pre', { class: 'log', text: res.system })));
      body.appendChild(h('div', { class: 'field' },
        h('label', { text: i18n.t('workstation.user_label', { count: res.user.length }) }),
        h('pre', { class: 'log', style: { maxHeight: '46vh' }, text: res.user })));
    } catch (e) {
      clear(body);
      body.appendChild(h('div', { class: 'muted', text: i18n.t('workstation.preview_failed_reason', { reason: e.message }) }));
    }
  })();
}

// ─────────────────────────────────────────────
// 输出操作
// ─────────────────────────────────────────────
function appendOutput() {
  const text = currentOutput();
  if (!text.trim()) return;
  const ws = wsState();
  ws.prompt = (ws.prompt.trim() ? ws.prompt.replace(/\s+$/, '') + '\n\n' : '') + text;
  touch('state', true);
  state.ui.historySession = null;
  state.ui.historyTurn = null;
  renderMain();
  toast(i18n.t('workstation.appended'), 'ok');
}

function copyOutput() {
  const text = currentOutput();
  if (!text.trim()) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => toast(i18n.t('common.copied'), 'ok'),
      () => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = h('textarea', { value: text, style: { position: 'fixed', left: '-9999px' } });
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast(i18n.t('common.copied'), 'ok'); }
  catch (e) { toast(i18n.t('common.copy_failed'), 'err'); }
  ta.remove();
}

function showRawOutput() {
  const text = currentOutput();
  const ta = h('textarea', { rows: 22, value: text, readonly: true });
  const m = modal(i18n.t('workstation.raw_title'), ta, [h('button', { text: i18n.t('common.close'), onclick: () => m.close() })]);
}

function saveOutputDialog(fmt) {
  const text = currentOutput();
  if (!text.trim()) return;
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const folder = state.paths.export || '';
  const folderInput = h('input', { type: 'text', value: folder });
  const nameInput = h('input', {
    type: 'text', value: 'ai_output_' + stamp + '.' + fmt,
    placeholder: i18n.t('workstation.filename_placeholder', { fmt: fmt })
  });
  const body = h('div', null,
    h('div', { class: 'field' }, h('label', { text: i18n.t('workstation.save_dir') }), folderInput),
    h('div', { class: 'field' }, h('label', { text: i18n.t('common.filename') }), nameInput),
    h('div', { class: 'small muted', text: i18n.t('workstation.save_note') }));
  const m = modal(i18n.t('workstation.save_as', { fmt: fmt.toUpperCase() }), body, [
    h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() }),
    h('button', {
      class: 'primary', text: i18n.t('common.save'), dataset: { noclose: '1' },
      onclick: async ev => {
        ev.target.disabled = true;
        let name = nameInput.value.trim() || ('ai_output.' + fmt);
        if (!name.toLowerCase().endsWith('.' + fmt)) name += '.' + fmt;
        const dir = (folderInput.value.trim() || folder).replace(/[\\/]+$/, '');
        if (!dir) { toast(i18n.t('workstation.dir_required'), 'err'); ev.target.disabled = false; return; }
        try {
          const res = await api('/api/io/export', {
            method: 'POST', body: { path: dir + '\\' + name.replace(/[\\/]/g, '_'), content: text }
          });
          toast(i18n.t('common.saved_to', { path: res.path }), 'ok');
          m.close();
        } catch (e) {
          toast(i18n.t('common.save_failed_reason', { reason: e.message }), 'err');
          ev.target.disabled = false;
        }
      }
    })
  ]);
}

function sendOutputToText() {
  const text = currentOutput();
  if (!text.trim()) return;
  appendToTextPanel(text);
  go('text');
}

// ─────────────────────────────────────────────
// 对话历史
// ─────────────────────────────────────────────
function viewHistoryTurn(session, turn) {
  if (!session || !turn) return;
  state.ui.historySession = session;
  state.ui.historyTurn = turn;
  renderMain();
}

function returnToCurrent() {
  state.ui.historySession = null;
  state.ui.historyTurn = null;
  const cs = state.ui.currentSession;
  if (cs && (cs.turns || []).length) {
    const last = cs.turns[cs.turns.length - 1];
    const ws = wsState();
    ws.output = last.output || ws.output;
    ws.current_session = cs.id || ws.current_session;
  }
  renderMain();
}

async function newConversation() {
  if (state.ui.busy) return;
  const ws = wsState();
  if ((ws.output || '').trim() && !confirm(i18n.t('history.new_confirm'))) return;
  try {
    const res = await api('/api/history/new', { method: 'POST', body: { mode: ws.mode } });
    ws.current_session = res.session.id;
    ws.output = '';
    ws.prompt = '';
    state.ui.currentSession = res.session;
    state.ui.lastMeta = null;
    state.ui.historySession = null;
    state.ui.historyTurn = null;
    touch('state', true);
    renderMain();
    toast(i18n.t('history.started_new'), 'ok');
  } catch (e) {
    toast(i18n.t('history.new_failed_reason', { reason: e.message }), 'err');
  }
}

async function openHistoryDialog() {
  const body = h('div', { class: 'history-dialog' },
    h('div', { class: 'muted', text: i18n.t('common.loading') }));
  const m = modal(i18n.t('history.title'), body, [
    h('button', { text: i18n.t('history.return'), onclick: () => { m.close(); returnToCurrent(); } }),
    h('button', { text: i18n.t('common.close'), onclick: () => m.close() })
  ]);
  try {
    const res = await api('/api/history');
    drawHistoryDialog(body, res.items || [], res.current || '');
  } catch (e) {
    clear(body);
    body.appendChild(h('div', { class: 'muted', text: i18n.t('common.load_failed_reason', { reason: e.message }) }));
  }
}

function drawHistoryDialog(body, items, currentId) {
  clear(body);
  if (!items.length) {
    body.appendChild(h('div', { class: 'muted', text: i18n.t('history.empty') }));
    return;
  }
  const list = h('div', { class: 'history-list' });
  const detail = h('div', { class: 'history-detail' });
  let selectedId = items[0].id;

  const loadDetail = async id => {
    selectedId = id;
    list.querySelectorAll('.list-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });
    clear(detail);
    detail.appendChild(h('div', { class: 'muted', text: i18n.t('common.loading') }));
    try {
      const res = await api('/api/history/' + encodeURIComponent(id));
      const session = res.session;
      clear(detail);
      detail.appendChild(h('div', { class: 'history-detail-head' },
        h('strong', { text: session.title || i18n.t('history.untitled') }),
        id === currentId ? h('span', { class: 'tag', text: i18n.t('history.current') }) : null,
        h('span', { style: { flex: '1' } }),
        h('span', { class: 'small muted', text: i18n.t('history.turn_count', { count: (session.turns || []).length }) })));
      detail.appendChild(h('div', { class: 'inline', style: { marginBottom: '10px' } },
        h('button', {
          class: 'primary', text: i18n.t('history.view'),
          onclick: () => {
            state.ui.historySession = session;
            state.ui.historyTurn = (session.turns || [])[(session.turns || []).length - 1] || null;
            document.querySelector('#overlay-root').innerHTML = '';
            renderMain();
          }
        }),
        h('button', {
          text: i18n.t('history.set_current'),
          onclick: async () => {
            try {
              const r = await api('/api/history/current', { method: 'POST', body: { id } });
              const ws = wsState();
              ws.current_session = id;
              ws.output = ((session.turns || [])[(session.turns || []).length - 1] || {}).output || ws.output;
              state.ui.currentSession = r.session || session;
              state.ui.historySession = null;
              state.ui.historyTurn = null;
              touch('state', true);
              document.querySelector('#overlay-root').innerHTML = '';
              renderMain();
              toast(i18n.t('history.switched'), 'ok');
            } catch (e) { toast(i18n.t('history.switch_failed_reason', { reason: e.message }), 'err'); }
          }
        }),
        h('button', {
          class: 'danger', text: i18n.t('common.delete'),
          onclick: async () => {
            if (!confirm(i18n.t('history.delete_confirm'))) return;
            try {
              await api('/api/history/' + encodeURIComponent(id), { method: 'DELETE' });
              const again = await api('/api/history');
              currentId = again.current || '';
              if (state.ui.historySession && state.ui.historySession.id === id) {
                state.ui.historySession = null;
                state.ui.historyTurn = null;
              }
              const ws = wsState();
              if (ws.current_session === id) {
                ws.current_session = currentId;
                ws.output = '';
                state.ui.currentSession = null;
                touch('state', true);
              }
              drawHistoryDialog(body, again.items || [], currentId);
              toast(i18n.t('common.deleted'), 'ok');
            } catch (e) { toast(i18n.t('common.delete_failed_reason', { reason: e.message }), 'err'); }
          }
        })));

      const turns = session.turns || [];
      turns.slice().reverse().forEach((turn, idx) => {
        const box = h('details', { class: 'turn-detail', open: idx === 0 });
        box.appendChild(h('summary', null,
          modeBadge(turn.mode),
          h('span', { class: 'small muted', text: ' ' + (turn.created || '') }),
          h('span', { style: { flex: '1' } }),
          h('span', { class: 'small muted', text: i18n.t('history.turn_chars', { input: (turn.user_prompt || '').length, output: (turn.output || '').length }) })));
        box.appendChild(h('div', { class: 'field', style: { marginTop: '8px' } },
          h('label', { text: i18n.t('workstation.prompt_label') }),
          h('pre', { class: 'log', text: turn.user_prompt || i18n.t('common.empty_paren') })));
        if (turn.work_prompt) {
          box.appendChild(h('div', { class: 'field' },
            h('label', { text: i18n.t('history.requirements_label') }),
            h('pre', { class: 'log', text: turn.work_prompt })));
        }
        box.appendChild(h('div', { class: 'field' },
          h('label', { text: i18n.t('workstation.output_title') }),
          h('div', { class: 'md history-md', html: md(turn.output || i18n.t('common.empty_paren')) })));
        if (turn.resolved && turn.resolved.missing) {
          box.appendChild(h('div', { class: 'small muted', text: i18n.t('history.broken_pointers', { count: turn.resolved.missing }) }));
        }
        detail.appendChild(box);
      });
    } catch (e) {
      clear(detail);
      detail.appendChild(h('div', { class: 'muted', text: i18n.t('common.read_failed_reason', { reason: e.message }) }));
    }
  };

  items.forEach(item => {
    const row = h('div', {
      class: 'list-item' + (item.id === selectedId ? ' active' : ''),
      dataset: { id: item.id },
      onclick: () => loadDetail(item.id)
    },
      h('div', { class: 'name', text: item.title || i18n.t('history.untitled') }),
      h('div', { class: 'meta', text: i18n.t(item.id === currentId ? 'history.list_meta' : 'history.item_meta', {turns: item.turns || 0, updated: item.updated || ''}) }));
    list.appendChild(row);
  });
  body.appendChild(h('div', { class: 'history-cols' }, list, detail));
  loadDetail(selectedId);
}

// ─────────────────────────────────────────────
// 启动
// ─────────────────────────────────────────────
async function loadCurrentSession() {
  const ws = wsState();
  if (!ws.current_session) { state.ui.currentSession = null; return; }
  try {
    const res = await api('/api/history/' + encodeURIComponent(ws.current_session));
    state.ui.currentSession = res.session;
  } catch (e) {
    state.ui.currentSession = null;
  }
}

async function pollBusyState() {
  try {
    const s = await api('/api/workstation/status');
    if (s.busy) {
      state.ui.busy = true;
      renderMain();
      setTimeout(pollBusyState, 2500);
    } else if (state.ui.busy) {
      state.ui.busy = false;
      await refreshFiles();
      await loadCurrentSession();
      renderNav();
      renderMain();
      status(i18n.t('common.ready'), 'ok');
    }
  } catch (e) { /* 网络短暂失败时下个周期再试 */ }
}

async function boot() {
  try {
    await loadNovelList();
    await refreshFiles();
    if (state.activeNovelId) await loadCurrentSession();
  } catch (e) {
    document.getElementById('main').appendChild(h('div', { class: 'card', text: i18n.t('common.load_failed_reason', { reason: e.message }) }));
    return;
  }
  renderNav();
  renderMain();
  status(i18n.t('common.ready'), 'ok');
  maybeShowOnboarding();
  const s = await api('/api/workstation/status').catch(() => null);
  if (s && s.busy) pollBusyState();
}
