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

/* NovelHelper —— AI 工作站（对话记录 / 底部输入） */
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
  if(ws.work_prompt.trim()){
    const extra=ws.extra.trim(), requirement=ws.work_prompt.trim();
    ws.extra=extra && extra!==requirement ? extra+'\n\n'+requirement : requirement;
    ws.work_prompt='';touch('state',true);
  }
  ws.output = ws.output || '';
  return ws;
}

function wsSettingChoices() {
  return settingEntries(true).filter(entry => entry.coll).map(entry => ({id:entry.coll,label:entry.label,visible:entry.on}))
    .concat([{id:'memories',label:i18n.t('nav.memories'),visible:true}]);
}

function wsDetailedSelection(ws) {
  const sel=ws.selection, choices=wsSettingChoices();
  if (!sel.record_selections) {
    sel.record_selections={characters:sel.character_ids.slice(),memories:sel.memory_ids.slice()};
    if(sel.include.factions) sel.record_selections.factions=Array.isArray(sel.faction_ids)?sel.faction_ids.slice():collItems('factions').map(rec=>rec.id);
    choices.filter(choice=>choice.id==='other'||choice.id.startsWith('section_')).forEach(choice=>{
      sel.record_selections[choice.id]=collItems(choice.id).filter(rec=>sel.world_ids.includes(rec.id)).map(rec=>rec.id);
    });
  }
  if(!Array.isArray(sel.setting_categories)) sel.setting_categories=choices.filter(choice=>{
    const enabled=choice.id==='characters'?sel.include.characters:choice.id==='memories'?sel.include.memory:
      choice.id==='factions'?sel.include.factions:choice.id==='worldmap'?sel.include.worldmap:
      (choice.id==='other'||choice.id.startsWith('section_'))&&sel.include.world;
    return !!enabled && (choice.visible || (sel.record_selections[choice.id]||[]).length>0);
  }).map(choice=>choice.id);
  return sel;
}

function wsSelection() {
  const ws=wsState(), sel=wsDetailedSelection(ws);
  return {
    prompt:ws.prompt || '',extra:ws.extra || '',current_state:'',work_prompt:'',
    include:{worldmap:sel.setting_categories.includes('worldmap'),state:false},
    setting_categories:sel.setting_categories.slice(),
    record_selections:JSON.parse(JSON.stringify(sel.record_selections)),
    target_chars:sel.target_chars || 0, strict_length:sel.strict_length!==false,project_files:[]
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

function currentOutput() {
  return state.ui.currentSession?.turns?.slice(-1)[0]?.output || wsState().output || '';
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
  collItems('other').forEach(rec => out.push({ id: rec.id, rec, group: i18n.t('nav.other') }));
  sectionDefs().forEach(sec => collItems('section_' + sec.key)
    .forEach(rec => out.push({ id: rec.id, rec, group: settingLabel('section_' + sec.key, sec.label || sec.key) })));
  return out;
}

// ─────────────────────────────────────────────
// 主界面
// ─────────────────────────────────────────────
function wsRememberDraft() {
  const ws = wsState();
  ws.drafts = ws.drafts || {};
  ws.drafts[ws.current_session || '_new'] = ws.prompt;
  touch('state', true);
}

function wsSummary() {
  const ws=wsState(), sel=wsDetailedSelection(ws);
  const bits=wsSettingChoices().filter(choice=>sel.setting_categories.includes(choice.id)).map(choice=>
    choice.id==='worldmap' ? choice.label : choice.label+' '+collItems(choice.id).filter(rec=>(sel.record_selections[choice.id]||[]).includes(rec.id)).length);
  if(sel.project_files.length)bits.push(i18n.t('common.file_count',{count:sel.project_files.length}));
  return bits.join(' · ') || i18n.t('workstation.no_settings_selected');
}

function viewWorkstation(main) {
  const ws = wsState();
  const busy = !!state.ui.busy;
  const session = state.ui.currentSession;
  const modes = workModes();
  const mode = modes.find(m => m.id === ws.mode);
  const shell = h('section', { class: 'agent-workstation' });
  shell.appendChild(h('header', { class: 'agent-head' },
    h('div', null, h('div', { class: 'small muted', text: i18n.t('nav.writer') }),
      h('h1', { text: session?.title || i18n.t('history.untitled') })),
    h('details', { class: 'agent-info' }, h('summary', { text: i18n.t('workstation.log_title') }),
      h('pre', { class: 'log', text: state.ui.log || i18n.t('workstation.log_empty') }))));
  const feed = h('div', { class: 'agent-feed', tabindex: '0', 'aria-label': i18n.t('history.current'),
    onscroll: e => {
      const el = e.currentTarget;
      state.ui.wsScroll = { id: ws.current_session, top: el.scrollTop,
        bottom: el.scrollHeight - el.scrollTop - el.clientHeight < 80 };
    }
  });
  const turns = session?.turns || [];
  const shown = turns.length ? turns : (ws.output ? [{ output: ws.output, mode: ws.last_mode }] : []);
  shown.forEach((turn, index) => {
    const message = h('article', { class: 'agent-turn', dataset: { turn: turn.id || index } });
    if (turn.user_prompt) message.appendChild(h('div', { class: 'agent-user', text: turn.user_prompt }));
    message.appendChild(h('div', { class: 'agent-answer-head' }, modeBadge(turn.mode),
      h('span', { class: 'small muted', text: i18n.t('workstation.char_count', { count: (turn.output || '').length }) })));
    const body = h('div', { class: 'md agent-answer', html: md(turn.output || '') });
    message.appendChild(body);
    if ((turn.output || '').length > 5000) {
      const collapsed = (state.ui.wsCollapsedTurns || {})[turn.id || index] === true;
      body.classList.toggle('collapsed', collapsed);
      const toggle = h('button', { class: 'mini agent-collapse', text: i18n.t(collapsed ? 'workstation.expand_result' : 'workstation.collapse_result'),
        onclick: () => {
          state.ui.wsCollapsedTurns = state.ui.wsCollapsedTurns || {};
          const next = !body.classList.contains('collapsed');
          state.ui.wsCollapsedTurns[turn.id || index] = next;
          body.classList.toggle('collapsed', next);
          toggle.textContent = i18n.t(next ? 'workstation.expand_result' : 'workstation.collapse_result');
        }
      });
      message.appendChild(toggle);
    }
    const text = turn.output || '';
    message.appendChild(h('div', { class: 'output-actions agent-actions' },
      h('button', { text: i18n.t('common.copy'), onclick: () => copyOutput(text) }),
      h('button', { text: i18n.t('workstation.save_txt'), onclick: () => saveOutputDialog('txt', text) }),
      h('button', { text: i18n.t('workstation.to_manuscript'), disabled: busy, onclick: () => sendOutputToText(text) }),
      h('details', { class: 'agent-more' }, h('summary', { text: i18n.t('workstation.more') }),
        h('div', { class: 'agent-more-menu' },
          h('button', { text: i18n.t('workstation.save_md'), onclick: () => saveOutputDialog('md', text) }),
          h('button', { text: i18n.t('workstation.append_prompt'), disabled: busy, onclick: () => appendOutput(text) }),
          h('button', { text: i18n.t('workstation.view_raw'), onclick: () => showRawOutput(text) })))));
    feed.appendChild(message);
  });
  if (!shown.length) feed.appendChild(h('div', { class: 'agent-empty' },
    h('div', { class: 'empty-icon', text: '✎' }),
    h('h2', { text: i18n.t('workstation.welcome') }),
    h('p', { class: 'muted', text: i18n.t('workstation.welcome_hint') })));
  if (busy) feed.appendChild(h('div', { class: 'agent-pending', role: 'status' },
    h('div', { class: 'spinner' }), h('span', { text: i18n.t('common.generating') })));
  if (state.ui.wsError) feed.appendChild(h('div', { class: 'notice warn', role: 'alert' },
    h('span', { text: state.ui.wsError }), h('button', { text: i18n.t('workstation.retry'), onclick: runWorkstation })));
  shell.appendChild(feed);
  const prompt = h('textarea', { class: 'agent-prompt', rows: 3, value: ws.prompt,
    'aria-label': i18n.t('workstation.prompt_label'), placeholder: i18n.t('workstation.prompt_placeholder'), disabled: busy,
    oninput: e => { ws.prompt = e.target.value; wsRememberDraft(); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px'; },
    onkeydown: e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); runWorkstation(); } }
  });
  const composer = h('div', { class: 'agent-composer' }, prompt);
  const target = h('details', { class: 'agent-target' },
    h('summary', { text: i18n.t('workstation.chip_target', { count: ws.selection.target_chars || ((state.db.config || {}).writing || {}).target_chars || 8000 }) }));
  target.appendChild(h('div', { class: 'agent-target-menu' },
    h('label', { text: i18n.t('workstation.target_label') }),
    h('input', { type: 'number', min: 1, value: ws.selection.target_chars || ((state.db.config || {}).writing || {}).target_chars || 8000,
      'aria-label': i18n.t('workstation.target_label'), disabled: busy,
      oninput: e => { ws.selection.target_chars = Number(e.target.value) || 0; touch('state', true);
        target.querySelector('summary').textContent = i18n.t('workstation.chip_target', { count: ws.selection.target_chars }); }
    }),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ws.selection.strict_length !== false, disabled: busy,
      onchange: e => { ws.selection.strict_length = e.target.checked; touch('state', true); }
    }), i18n.t('workstation.strict'))));
  composer.appendChild(h('div', { class: 'agent-controls' },
    h('select', { class: 'agent-mode', 'aria-label': i18n.t('modes.kind_write'), disabled: busy || !modes.length,
      onchange: e => { ws.mode = e.target.value; touch('state', true); }
    }, modes.map(item => h('option', { value: item.id, text: item.label, selected: ws.mode === item.id }))),
    target,
    h('button', { text: i18n.t('workstation.details'), disabled: busy, onclick: openWorkstationDetails }),
    h('button', { class: 'primary agent-send', text: i18n.t(busy ? 'common.generating' : 'workstation.start'),
      title: 'Ctrl+Enter', disabled: busy || !mode, onclick: runWorkstation })));
  if ((ws.extra || '').trim()) {
    composer.appendChild(h('div', { class: 'agent-extra-hint small muted' },
      h('span', { text: i18n.t('workstation.extra_saved_hint') }),
      h('button', { class: 'ghost mini', text: i18n.t('workstation.details'),
        onclick: openWorkstationDetails })));
  }
  composer.appendChild(h('div', { class: 'agent-summary small muted', text: wsSummary() }));
  composer.appendChild(h('div', { class: 'small muted agent-prompt-help', text: i18n.t('workstation.prompt_help') }));
  if (!modes.length) composer.appendChild(h('button', { text: i18n.t('workstation.go_modes'), onclick: () => go('modes') }));
  shell.appendChild(h('div', { class: 'agent-compose-wrap' }, composer,
    h('div', { class: 'agent-footnote', text: i18n.t('workstation.context_hint') })));
  main.appendChild(shell);
  const scroll = state.ui.wsScroll;
  requestAnimationFrame(() => {
    if (!feed.isConnected) return;
    feed.scrollTop = !scroll || scroll.id !== ws.current_session || scroll.bottom ? feed.scrollHeight : scroll.top;
  });
}

function openWorkstationDetails() {
  if(state.ui.busy)return;
  const oldDrawer=document.querySelector('.agent-drawer');
  const detailOpen=new Map(oldDrawer?Array.from(oldDrawer.querySelectorAll('details')).map(el=>[el.dataset.setting,el.open]):[]);
  const scroll=oldDrawer?.querySelector('.agent-detail-body')?.scrollTop || 0;
  const focusIndex=oldDrawer?Array.from(oldDrawer.querySelectorAll('input, textarea, button, summary')).indexOf(document.activeElement):-1;
  if(state.ui.wsDrawerClose){state.ui.wsDrawerClose();state.ui.wsDrawerClose=null;}
  const ws=wsState(), sel=wsDetailedSelection(ws), choices=wsSettingChoices();
  const body=h('div',{class:'agent-detail-body'});
  const changed=()=>{touch('state',true);openWorkstationDetails();};
  const chip=choice=>h('button',{class:'chip'+(sel.setting_categories.includes(choice.id)?' on':''),
    'aria-pressed':String(sel.setting_categories.includes(choice.id)),
    onclick:()=>{toggleId(sel.setting_categories,choice.id,!sel.setting_categories.includes(choice.id));changed();}},choice.label);
  body.appendChild(h('div',{class:'field'},h('label',{text:i18n.t('workstation.include_label')}),
    h('div',{class:'chips ws-setting-choices'},choices.filter(choice=>choice.visible).map(chip))));
  const more=choices.filter(choice=>!choice.visible);
  if(more.length)body.appendChild(h('details',{class:'input-details ws-more-settings',dataset:{setting:'more'},open:detailOpen.get('more') || false},
    h('summary',{text:i18n.t('workstation.more_settings')}),h('div',{class:'chips'},more.map(chip))));
  const selected=choices.filter(choice=>sel.setting_categories.includes(choice.id));
  if(selected.length)body.appendChild(h('div',{class:'ws-detail-divider',text:i18n.t('workstation.pick_setting_records')}));
  selected.forEach(choice=>{
    const ids=sel.record_selections[choice.id]=sel.record_selections[choice.id] || [];
    const records=collItems(choice.id);
    const details=h('details',{class:'input-details ws-record-picker',dataset:{setting:choice.id},open:detailOpen.has(choice.id)?detailOpen.get(choice.id):true},
      h('summary',null,choice.label,choice.id==='worldmap'?null:h('span',{class:'hint',text:i18n.t('workstation.selected_of',{count:records.filter(rec=>ids.includes(rec.id)).length,total:records.length})})));
    if(choice.id==='worldmap') details.appendChild(h('div',{class:'small muted',text:i18n.t('workstation.map_whole')}));
    else {
      details.appendChild(h('div',{class:'inline ws-picker-actions'},
        h('button',{class:'mini',text:i18n.t('common.select_all'),onclick:()=>{sel.record_selections[choice.id]=records.map(rec=>rec.id);changed();}}),
        h('button',{class:'mini',text:i18n.t('common.clear'),onclick:()=>{sel.record_selections[choice.id]=[];changed();}})));
      details.appendChild(pickerRows(records,ids,(id,on)=>{toggleId(ids,id,on);changed();},rec=>recordName(rec)+(rec.category?' · '+rec.category:'')));
    }
    body.appendChild(details);
  });
  const files=h('details',{class:'input-details',dataset:{setting:'files'},open:detailOpen.get('files') || false},
    h('summary',null,i18n.t('workstation.attachments'),h('span',{class:'hint',text:i18n.t('common.file_count',{count:sel.project_files.length})})));
  if((state.sources||[]).length) files.appendChild(h('div',{class:'picker'},state.sources.map(file=>h('label',{class:'check picker-row'},
    h('input',{type:'checkbox',checked:sel.project_files.includes(file.path),onchange:e=>{toggleId(sel.project_files,file.path,e.target.checked);changed();}}),
    h('span',{class:'name',text:file.path})))));
  else files.appendChild(h('div',{class:'small muted',text:i18n.t('workstation.attach_hint')}));
  body.appendChild(files);
  body.appendChild(h('div',{class:'field ws-supplement'},h('label',{for:'ws-supplement',text:i18n.t('workstation.supplement')}),
    h('div',{class:'small muted ws-supplement-hint',text:i18n.t('workstation.supplement_hint')}),
    h('textarea',{id:'ws-supplement',rows:5,value:ws.extra,placeholder:i18n.t('workstation.supplement_placeholder'),
      oninput:e=>{ws.extra=e.target.value;touch('state',true);}})));
  const dialog=modal(i18n.t('workstation.details'),body,[
    h('button',{text:i18n.t('workstation.preview_send'),onclick:previewWorkstation,dataset:{noclose:'1'}}),
    h('button',{text:i18n.t('workstation.clear_input'),dataset:{noclose:'1'},onclick:()=>{
      dialog.close();confirmDialog(i18n.t('workstation.clear_input'),i18n.t('workstation.clear_confirm'),()=>{
        ws.prompt='';ws.extra='';ws.work_prompt='';ws.current_state='';wsRememberDraft();openWorkstationDetails();
      });
    }}),h('button',{class:'primary',text:i18n.t('common.close'),onclick:()=>dialog.close()})
  ],()=>renderMain());
  dialog.dlg.classList.add('agent-drawer');state.ui.wsDrawerClose=dialog.close;
  body.scrollTop=scroll;
  const focusables=dialog.dlg.querySelectorAll('input, textarea, button, summary');
  focusables[Math.max(0,focusIndex)]?.focus({preventScroll:true});
}

// ─────────────────────────────────────────────
// 生成
// ─────────────────────────────────────────────
async function runWorkstation() {
  if (state.ui.busy || state.ui.wsSwitching) return;
  const ws = wsState();
  if (!ws.mode) { toast(i18n.t('workstation.no_mode_toast'), 'err'); return; }
  state.ui.wsError = '';
  wsRememberDraft();
  state.ui.busy = true;
  renderNav();
  state.ui.historySession = null;
  state.ui.historyTurn = null;
  renderMain();
  status(i18n.t('common.generating'), 'busy');

  try {
    await flushPendingSaves();
    await saveNow('modes');
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
    next.prompt = '';
    wsRememberDraft();
    await refreshWorkstationHistory();
    state.ui.currentSession = res.session || state.ui.currentSession;
    renderNav();
    renderMain();
    status(i18n.t('workstation.done'), 'ok');
    toast(i18n.t('workstation.done_saved'), 'ok');
  } catch (e) {
    state.ui.busy = false;
    state.ui.wsError = e.message;
    renderNav();
    renderMain();
    status(i18n.t('workstation.failed'), 'err');
    toast(i18n.t('workstation.failed_reason', { reason: e.message }), 'err');
  }
}

function previewWorkstation() {
  if (state.ui.wsDrawerClose) { state.ui.wsDrawerClose(); state.ui.wsDrawerClose = null; }
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
          mode_id: ws.mode, prompt: ws.prompt, work_prompt: ws.work_prompt, session_id: ws.current_session || '',
          selection
        }
      });
      clear(body);
      if (res.history?.length) body.appendChild(h('pre', { class: 'log', text: res.history.map(message => message.role + ':\n' + message.content).join('\n\n') }));
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
function appendOutput(text = currentOutput()) {
  if (!text.trim()) return;
  const ws = wsState();
  ws.prompt = (ws.prompt.trim() ? ws.prompt.replace(/\s+$/, '') + '\n\n' : '') + text;
  touch('state', true);
  wsRememberDraft();
  renderMain();
  toast(i18n.t('workstation.appended'), 'ok');
}

function copyOutput(text = currentOutput()) {
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

function showRawOutput(text = currentOutput()) {
  const ta = h('textarea', { rows: 22, value: text, readonly: true });
  const m = modal(i18n.t('workstation.raw_title'), ta, [h('button', { text: i18n.t('common.close'), onclick: () => m.close() })]);
}

function saveOutputDialog(fmt, text = currentOutput()) {
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

function sendOutputToText(text = currentOutput()) {
  if (!text.trim()) return;
  appendToTextPanel(text);
  go('text');
}

// ─────────────────────────────────────────────
// 对话历史
// ─────────────────────────────────────────────
async function newConversation() {
  if (state.ui.busy || state.ui.wsSwitching) return;
  const ws = wsState();
  if (!ws.prompt.trim() && !ws.output.trim() && !(state.ui.currentSession?.turns || []).length) {
    go('writer');
    document.querySelector('.agent-prompt')?.focus();
    return;
  }
  wsRememberDraft();
  state.ui.wsSwitching = true;
  try {
    await flushPendingSaves();
    const res = await api('/api/history/new', { method: 'POST', body: { mode: ws.mode } });
    ws.current_session = res.session.id;
    ws.output = '';
    ws.prompt = '';
    state.ui.currentSession = res.session;
    state.ui.lastMeta = null;
    state.ui.historySession = null;
    state.ui.historyTurn = null;
    wsRememberDraft();
    state.ui.wsScroll = null;
    state.ui.wsError = '';
    await refreshWorkstationHistory();
    state.ui.wsSwitching = false;
    go('writer');
    toast(i18n.t('history.started_new'), 'ok');
  } catch (e) {
    toast(i18n.t('history.new_failed_reason', { reason: e.message }), 'err');
  } finally { state.ui.wsSwitching = false; }
}

// ─────────────────────────────────────────────
// 启动
// ─────────────────────────────────────────────
async function loadCurrentSession() {
  const ws = wsState();
  await refreshWorkstationHistory();
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


async function refreshWorkstationHistory() {
  const novel = state.activeNovelId;
  try {
    const result = await api('/api/history');
    if (novel === state.activeNovelId) state.ui.wsHistory = { novel, items: result.items || [] };
  } catch (e) {
    if (novel === state.activeNovelId) state.ui.wsHistory = { novel, items: [], error: e.message };
  }
}

function renderWorkstationHistory(nav) {
  const collapsed = state.ui.navCollapsed.history !== false;
  const busy = !!(state.ui.busy || state.ui.wsSwitching);
  nav.appendChild(h('div', { class: 'nav-group nav-settings-head conversation-nav-head' },
    h('button', { class: 'nav-settings-toggle',
      'aria-expanded': String(!collapsed), 'aria-controls': 'conversation-nav',
      onclick: () => { state.ui.navCollapsed.history = !collapsed; renderNav(); }
    }, h('span', { text: collapsed ? '▸' : '▾', 'aria-hidden': 'true' }),
      h('span', { text: i18n.t('workstation.conversations') })),
    h('button', { class: 'nav-settings-manage conversation-add', text: '+',
      title: i18n.t('history.new'), 'aria-label': i18n.t('history.new'), disabled: busy, onclick: newConversation })));
  const list = h('div', { id: 'conversation-nav', class: 'conversation-nav', hidden: collapsed });
  if (collapsed) { nav.appendChild(list); return; }
  const history = state.ui.wsHistory?.novel === state.activeNovelId ? state.ui.wsHistory : null;
  (history?.items || []).forEach(item => {
    list.appendChild(h('div', { class: 'conversation-nav-row' + (wsState().current_session === item.id ? ' active' : '') },
      h('button', { class: 'conversation-nav-link', text: item.title || i18n.t('history.untitled'),
        title: item.title, disabled: busy, 'aria-current': wsState().current_session === item.id ? 'true' : null,
        onclick: () => switchWorkstationSession(item.id) }),
      h('button', { class: 'conversation-menu-button', text: '⋯', disabled: busy,
        'aria-label': i18n.t('workstation.conversation_actions'), 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: e => workstationSessionActions(item, e.currentTarget) })));
  });
  if (!(history?.items || []).length) list.appendChild(h('div', { class: 'small muted history-nav-empty',
    text: history?.error ? i18n.t('common.load_failed_reason', { reason: history.error }) : i18n.t('history.empty') }));
  nav.appendChild(list);
}

async function switchWorkstationSession(id) {
  if (state.ui.busy || state.ui.wsSwitching) return;
  state.ui.wsSwitching = true;
  try {
    wsRememberDraft();
    await flushPendingSaves();
    const result = await api('/api/history/current', { method: 'POST', body: { id } });
    const ws = wsState();
    ws.current_session = id;
    ws.output = result.session?.turns?.slice(-1)[0]?.output || '';
    ws.prompt = ws.drafts?.[id] || '';
    state.ui.currentSession = result.session;
    state.ui.historySession = null; state.ui.historyTurn = null;
    state.ui.wsError = ''; state.ui.wsScroll = null; state.ui.wsCollapsedTurns = {};
    touch('state', true);
    go('writer');
  } catch (e) { toast(i18n.t('history.switch_failed_reason', { reason: e.message }), 'err'); }
  finally { state.ui.wsSwitching = false; }
}

function workstationSessionActions(item, anchor) {
  if (state.ui.wsMenuClose) {
    const same = state.ui.wsMenuAnchor === anchor;
    state.ui.wsMenuClose();
    if (same) return;
  }
  const popup = h('div', { class: 'conversation-popup', popover: 'auto', role: 'dialog',
    'aria-label': i18n.t('workstation.conversation_actions') });
  const close = () => {
    if (popup.matches(':popover-open')) popup.hidePopover();
    popup.remove();
    if (state.ui.wsMenuClose === close) { state.ui.wsMenuClose = null; state.ui.wsMenuAnchor = null; }
    anchor.setAttribute('aria-expanded', 'false');
  };
  const position = () => {
    const rect = anchor.getBoundingClientRect();
    popup.style.left = Math.max(8, Math.min(rect.right + 6, window.innerWidth - popup.offsetWidth - 8)) + 'px';
    popup.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - popup.offsetHeight - 8)) + 'px';
  };
  const rename = () => {
    clear(popup);
    const input = h('input', { value: item.title || '', maxlength: 160, 'aria-label': i18n.t('common.name') });
    const save = h('button', { class: 'primary', text: i18n.t('common.save'), onclick: async () => {
      const title = input.value.trim();
      if (!title || state.ui.busy) return;
      save.disabled = true;
      try {
        await api('/api/history/rename', { method: 'POST', body: { id: item.id, title } });
        if (state.ui.currentSession?.id === item.id) state.ui.currentSession.title = title;
        close(); await refreshWorkstationHistory(); renderNav(); renderMain();
      } catch (e) { toast(e.message, 'err'); save.disabled = false; }
    } });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save.click(); }
    });
    popup.append(h('label', { class: 'small muted', text: i18n.t('workstation.rename_conversation') }), input,
      h('div', { class: 'conversation-popup-actions' },
        h('button', { text: i18n.t('common.cancel'), onclick: close }), save));
    position(); input.focus(); input.select();
  };
  popup.append(
    h('button', { class: 'conversation-popup-item', text: i18n.t('workstation.rename_conversation'), onclick: rename }),
    h('button', { class: 'conversation-popup-item danger', text: i18n.t('common.delete'), onclick: () => {
      close();
      confirmDialog(i18n.t('common.delete'), i18n.t('history.delete_confirm'), async () => {
        if (state.ui.busy) return;
        try {
          await flushPendingSaves();
          const result = await api('/api/history/' + encodeURIComponent(item.id), { method: 'DELETE' });
          const ws = wsState();
          if (ws.drafts) delete ws.drafts[item.id];
          if (ws.current_session === item.id) {
            ws.current_session = result.current || ''; ws.output = ''; ws.prompt = ws.drafts?.[ws.current_session] || '';
            state.ui.historySession = null; state.ui.historyTurn = null;
            await loadCurrentSession();
            ws.output = state.ui.currentSession?.turns?.slice(-1)[0]?.output || '';
            state.ui.wsError = ''; state.ui.wsScroll = null;
          }
          touch('state', true); await refreshWorkstationHistory(); renderNav(); renderMain();
        } catch (e) { toast(e.message, 'err'); }
      });
    } }));
  popup.addEventListener('toggle', () => { if (!popup.matches(':popover-open')) close(); });
  document.body.appendChild(popup);
  state.ui.wsMenuClose = close; state.ui.wsMenuAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  popup.showPopover(); position(); popup.querySelector('button')?.focus();
}
