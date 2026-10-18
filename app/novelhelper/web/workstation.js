/* NovelHelper —— AI 工作站（左输入 / 右输出） */
'use strict';

const WORK_FALLBACK = [
  { id: 'logic', label: '逻辑写作', desc: '核对设定一致性，整理约束、风险与推进节点' },
  { id: 'outline', label: '框架写作', desc: '输出场景框架、节拍与可直接执行的写作提示词' },
  { id: 'draft', label: '完整写作', desc: '根据设定与提示词生成完整正文' },
  { id: 'polish', label: '润色修订', desc: '按指定问题修订文本，保留事实与情节' },
  { id: 'brainstorm', label: '灵感方案', desc: '给出多条有差异的后续方向供选择' }
];

function workModes() {
  return (state.work_modes && state.work_modes.length) ? state.work_modes : WORK_FALLBACK;
}

function workModeLabel(id) {
  const mode = workModes().find(m => m.id === id);
  return mode ? mode.label : (id || '完整写作');
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
      toast('附加资料读取失败：' + rel, 'err');
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
  return clean.length > n ? clean.slice(0, n) + '…' : (clean || '（空）');
}

// ─────────────────────────────────────────────
// 选择器
// ─────────────────────────────────────────────
function pickerRows(items, selectedIds, onToggle, describe) {
  const box = h('div', { class: 'picker' });
  if (!items.length) {
    box.appendChild(h('div', { class: 'muted small', text: '（暂无可选项）' }));
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
  collItems('other').forEach(rec => out.push({ rec, group: '其他设定' }));
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
  const mode = modes.find(m => m.id === ws.mode) || modes[2] || modes[0];

  main.appendChild(pageHead('AI 工作站',
    '左侧选择设定、撰写用户提示词并选择工作提示词；右侧只显示本次 AI 输出。生成期间工作站会完全锁定。',
    h('div', { class: 'inline' },
      h('button', { text: '对话历史', onclick: () => openHistoryDialog() }),
      h('button', { text: '当前对话', onclick: () => returnToCurrent() }),
      h('button', {
        class: 'primary', text: '＋ 新对话',
        onclick: () => newConversation()
      }))));

  if (session && !isCurrentSession) {
    main.appendChild(h('div', { class: 'notice' },
      h('span', { text: '正在查看历史对话：' + (session.title || '未命名') + '。左侧输入仍是当前草稿，不会覆盖历史。' }),
      h('button', { class: 'mini', text: '返回当前对话', onclick: () => returnToCurrent() })));
  }

  const row = h('div', { class: 'workbench-row' });
  const left = h('div', { class: 'workbench-input' });
  const right = h('div', { class: 'workbench-output' });
  row.appendChild(left);
  row.appendChild(right);
  main.appendChild(row);

  // ── 左侧：工作模式 ───────────────────────
  const modeCard = h('div', { class: 'card' });
  modeCard.appendChild(h('h2', null, '工作提示词',
    h('span', { class: 'hint', text: '先选择要 AI 做哪一类工作' })));
  modeCard.appendChild(h('div', { class: 'field' },
    h('select', {
      onchange: e => { ws.mode = e.target.value; touch('state', true); renderMain(); }
    }, modes.map(m => h('option', {
      value: m.id, text: m.label, selected: m.id === ws.mode
    })))));
  modeCard.appendChild(h('div', { class: 'mode-desc', text: mode.desc || '' }));
  modeCard.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } },
    h('label', { text: '本次工作要求（可选，会与上面的工作提示词一起发送）' }),
    h('textarea', {
      rows: 4, value: ws.work_prompt || '',
      placeholder: '例如：先列 3 个方案，再选一个展开；或“只写 1500 字，收在悬念处”。',
      oninput: e => { ws.work_prompt = e.target.value; touch('state', true); }
    })));
  left.appendChild(modeCard);

  // ── 左侧：输入设定 ───────────────────────
  const inputCard = h('div', { class: 'card' });
  inputCard.appendChild(h('h2', null, '输入设定',
    h('span', { class: 'hint', text: '勾选才发送；未勾选的内容不会进入提示词' })));

  const summary = h('div', { class: 'small muted input-summary' });
  const refreshSummary = () => {
    const bits = [
      '人物 ' + (sel.character_ids || []).length,
      '记忆 ' + (sel.memory_ids || []).length,
      '世界观 ' + (sel.world_ids || []).length
    ];
    if (sel.include.worldmap) bits.push('世界地图');
    if (sel.include.factions) bits.push('势力整栏');
    bits.push('目标 ' + (sel.target_chars || ((state.db.config || {}).writing || {}).target_chars || 8000) + ' 字');
    summary.textContent = '本次将发送：' + bits.join(' · ');
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
    h('label', { text: '带入哪些设定' }),
    h('div', { class: 'chips' }, [
      chip('characters', '人物档案'),
      chip('memory', '故事记忆'),
      chip('world', '世界观与自定义栏目'),
      chip('factions', '势力设定（整栏）'),
      chip('worldmap', '世界地图'),
      chip('state', '当前状态')
    ])));

  // 人物
  const chars = collItems('characters');
  const charDetails = h('details', { class: 'input-details', open: true });
  charDetails.appendChild(h('summary', null,
    '人物档案', h('span', { class: 'hint', text: (sel.character_ids || []).length + ' / ' + chars.length + ' 已选' })));
  if (chars.length) {
    charDetails.appendChild(h('div', { class: 'inline', style: { marginBottom: '6px' } },
      h('button', {
        class: 'mini', text: '全选',
        onclick: () => { sel.character_ids = chars.map(c => c.id); touch('state', true); renderMain(); }
      }),
      h('button', {
        class: 'mini', text: '清空',
        onclick: () => { sel.character_ids = []; touch('state', true); renderMain(); }
      })));
    charDetails.appendChild(pickerRows(chars, sel.character_ids,
      (id, on) => { toggleId(sel.character_ids, id, on); touch('state', true); renderMain(); },
      c => recordName(c) + (c.category ? ' · ' + c.category : '')));
  } else {
    charDetails.appendChild(h('div', { class: 'muted small', text: '还没有人物。可在「人物档案」中新建，或从「其他设定」导入并搬运。' }));
  }
  inputCard.appendChild(charDetails);

  // 记忆
  const mems = collItems('memories');
  const memDetails = h('details', { class: 'input-details' });
  memDetails.appendChild(h('summary', null,
    '故事记忆', h('span', { class: 'hint', text: (sel.memory_ids || []).length + ' / ' + mems.length + ' 已选' })));
  memDetails.appendChild(h('div', { class: 'inline', style: { marginBottom: '6px' } },
    h('button', {
      class: 'mini', text: '全选',
      onclick: () => { sel.memory_ids = mems.map(m => m.id); touch('state', true); renderMain(); }
    }),
    h('button', {
      class: 'mini', text: '清空',
      onclick: () => { sel.memory_ids = []; touch('state', true); renderMain(); }
    })));
  memDetails.appendChild(pickerRows(mems, sel.memory_ids,
    (id, on) => { toggleId(sel.memory_ids, id, on); touch('state', true); renderMain(); },
    m => (m.category ? '[' + m.category + '] ' : '') + (m.title || '未命名')));
  inputCard.appendChild(memDetails);

  // 世界观条目
  const world = worldItems();
  const worldDetails = h('details', { class: 'input-details' });
  worldDetails.appendChild(h('summary', null,
    '世界观条目', h('span', { class: 'hint', text: (sel.world_ids || []).length + ' / ' + world.length + ' 已选' })));
  worldDetails.appendChild(pickerRows(world, sel.world_ids,
    (id, on) => { toggleId(sel.world_ids, id, on); touch('state', true); renderMain(); },
    entry => (entry.rec.name || entry.rec.title || '未命名') + ' · ' + entry.group));
  inputCard.appendChild(worldDetails);

  // 附加项目文件
  const files = state.sources || [];
  const fileDetails = h('details', { class: 'input-details' });
  fileDetails.appendChild(h('summary', null,
    '附加资料', h('span', { class: 'hint', text: (sel.project_files || []).length + ' 个文件' })));
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
    fileDetails.appendChild(h('div', { class: 'muted small', text: '把参考资料放进 workspace/io/in/，刷新后即可勾选。' }));
  }
  inputCard.appendChild(fileDetails);

  // 当前状态 / 用户提示词 / 补充
  inputCard.appendChild(h('div', { class: 'field' },
    h('label', { text: '当前状态（此刻的时间、地点、人物状态…）' }),
    h('textarea', {
      rows: 5, value: ws.current_state || '',
      placeholder: '例如：当前时间、地点、人物位置与情绪……',
      oninput: e => { ws.current_state = e.target.value; touch('state', true); }
    })));
  inputCard.appendChild(h('div', { class: 'field' },
    h('label', { text: '用户提示词' }),
    h('textarea', {
      rows: 12, value: ws.prompt || '', class: 'prompt-area',
      placeholder: '写下本次想让 AI 做的事：情节、场景、人物动作、风格、必须出现的细节……',
      oninput: e => { ws.prompt = e.target.value; touch('state', true); }
    })));
  inputCard.appendChild(h('div', { class: 'field' },
    h('label', { text: '补充说明（可选）' }),
    h('textarea', {
      rows: 3, value: ws.extra || '',
      placeholder: '额外的风格、禁忌或参考信息',
      oninput: e => { ws.extra = e.target.value; touch('state', true); }
    })));

  const defaultChars = ((state.db.config || {}).writing || {}).target_chars || 8000;
  inputCard.appendChild(h('div', { class: 'field' },
    h('label', { text: '本次目标字数' }),
    h('div', { class: 'inline' },
      h('input', {
        type: 'number', style: { width: '120px' }, value: sel.target_chars || defaultChars,
        oninput: e => { sel.target_chars = Number(e.target.value) || 0; touch('state', true); refreshSummary(); }
      }),
      h('label', { class: 'check' },
        h('input', {
          type: 'checkbox', checked: sel.strict_length !== false,
          onchange: e => { sel.strict_length = e.target.checked; touch('state', true); }
        }), '硬性要求'),
      h('span', { class: 'small muted', text: '默认 ' + defaultChars + ' 字' }))));

  const runBtn = h('button', {
    class: 'primary wide run-btn', text: busy ? 'AI 正在生成…' : '开始生成',
    disabled: busy, onclick: () => runWorkstation()
  });
  inputCard.appendChild(runBtn);
  inputCard.appendChild(h('div', { class: 'inline', style: { marginTop: '8px' } },
    h('button', { text: '预览将发送的内容', onclick: () => previewWorkstation() }),
    h('button', {
      text: '清空输入',
      onclick: () => {
        if (!confirm('清空当前输入（提示词、当前状态、补充说明）？设定勾选会保留。')) return;
        ws.prompt = ''; ws.current_state = ''; ws.extra = ''; ws.work_prompt = '';
        touch('state', true); renderMain();
      }
    })));
  left.appendChild(inputCard);

  // ── 右侧：输出 ───────────────────────────
  const outputCard = h('div', { class: 'card output-card' });
  const outHead = h('h2', null, 'AI 输出',
    modeBadge(session ? (turn && turn.mode) : ws.last_tool || ws.mode),
    h('span', { class: 'hint', text: output.length + ' 字' }));
  outputCard.appendChild(outHead);

  if (session && !isCurrentSession) {
    outputCard.appendChild(h('div', { class: 'history-view-head' },
      h('span', { text: '历史对话：' + (session.title || '未命名') }),
      h('button', { class: 'mini', text: '返回当前对话', onclick: () => returnToCurrent() })));
  }

  if (output.trim()) {
    outputCard.appendChild(h('div', { class: 'md output-md', html: md(output) }));
  } else {
    outputCard.appendChild(h('div', { class: 'empty-output' },
      h('div', { class: 'empty-icon', text: '✎' }),
      h('div', { text: '在左侧写好输入，选择工作提示词，然后点「开始生成」。' }),
      h('div', { class: 'small muted', text: '生成结果会显示在这里，并自动保存到对话历史。' })));
  }

  const meta = state.ui.lastMeta;
  if (meta && !session) {
    outputCard.appendChild(h('div', { class: 'small muted output-meta' },
      '模型 ' + (meta.model || '—') +
      ' · 耗时 ' + (meta.elapsed != null ? meta.elapsed + 's' : '—') +
      (meta.usage && meta.usage.total_tokens ? ' · tokens ' + meta.usage.total_tokens : '')));
  }

  outputCard.appendChild(h('div', { class: 'output-actions' },
    h('button', { class: 'primary', text: '追加到用户提示词', disabled: !output.trim(), onclick: () => appendOutput() }),
    h('button', { text: '另存为 TXT', disabled: !output.trim(), onclick: () => saveOutputDialog('txt') }),
    h('button', { text: '另存为 MD', disabled: !output.trim(), onclick: () => saveOutputDialog('md') }),
    h('button', { text: '转到纯文本工作站', disabled: !output.trim(), onclick: () => sendOutputToText() }),
    h('button', { text: '复制', disabled: !output.trim(), onclick: () => copyOutput() }),
    h('button', { text: '查看原文', disabled: !output.trim(), onclick: () => showRawOutput() })));
  right.appendChild(outputCard);

  // ── 右侧：当前对话 / 最近轮次 ────────────
  const convCard = h('div', { class: 'card' });
  const currentSession = state.ui.currentSession;
  convCard.appendChild(h('h2', null, '当前对话',
    h('span', { class: 'hint', text: currentSession ? (currentSession.turns || []).length + ' 轮' : '尚未开始' }),
    h('span', { style: { flex: '1' } }),
    h('button', { class: 'mini', text: '查看全部历史', onclick: () => openHistoryDialog() })));
  if (currentSession && (currentSession.turns || []).length) {
    convCard.appendChild(h('div', { class: 'small muted', style: { marginBottom: '8px' } },
      currentSession.title || '未命名对话'));
    const turns = (currentSession.turns || []).slice(-4).reverse();
    turns.forEach(t => {
      convCard.appendChild(h('div', {
        class: 'turn-row', onclick: () => viewHistoryTurn(currentSession, t)
      },
        h('div', { class: 'turn-top' },
          modeBadge(t.mode),
          h('span', { class: 'small muted', text: t.created || '' }),
          h('span', { style: { flex: '1' } }),
          h('span', { class: 'small muted', text: (t.output || '').length + ' 字' })),
        h('div', { class: 'turn-preview', text: '输入：' + previewText(t.user_prompt, 64) }),
        h('div', { class: 'turn-preview', text: '输出：' + previewText(t.output, 88) })));
    });
  } else {
    convCard.appendChild(h('div', { class: 'muted small', text: '每次生成会自动创建会话；历史按轮次保存，随时可以回来查看。' }));
  }
  right.appendChild(convCard);

  const logCard = h('div', { class: 'card' });
  logCard.appendChild(h('h2', null, '运行记录', h('span', { class: 'hint', text: '错误与调用信息' })));
  logCard.appendChild(h('pre', { class: 'log', text: state.ui.log || '（暂无调用）' }));
  right.appendChild(logCard);

  // 生成期间：禁用全部控件，并盖一层全屏锁。
  if (busy) {
    main.querySelectorAll('input, textarea, select, button').forEach(el => { el.disabled = true; });
    main.appendChild(h('div', { class: 'work-lock' },
      h('div', { class: 'work-lock-box' },
        h('div', { class: 'spinner' }),
        h('strong', { text: 'AI 正在生成中' }),
        h('div', { class: 'small muted', text: '工作站已完全锁定，完成前无法修改输入或切换操作。' }))));
  }
}

// ─────────────────────────────────────────────
// 生成
// ─────────────────────────────────────────────
async function runWorkstation() {
  if (state.ui.busy) return;
  const ws = wsState();
  state.ui.busy = true;
  state.ui.historySession = null;
  state.ui.historyTurn = null;
  renderMain();
  status('AI 生成中…', 'busy');

  try {
    const selection = await wsLoadProjectFiles();
    const res = await api('/api/workstation/run', {
      method: 'POST',
      body: {
        work_mode: ws.mode,
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
    state.ui.log = '[' + new Date().toLocaleTimeString() + '] ' + workModeLabel(res.work_mode) +
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
    next.mode = res.work_mode || next.mode;
    next.last_tool = res.work_mode || next.last_tool;
    next.current_session = res.session_id || next.current_session;
    state.ui.currentSession = res.session || state.ui.currentSession;
    renderNav();
    renderMain();
    status('生成完成', 'ok');
    toast('生成完成，已保存到对话历史。', 'ok');
  } catch (e) {
    state.ui.busy = false;
    renderMain();
    status('生成失败', 'err');
    toast('生成失败：' + e.message, 'err');
  }
}

function previewWorkstation() {
  const body = h('div', null, h('div', { class: 'muted', text: '组装中…' }));
  const m = modal('实际发送给模型的内容', body, [h('button', { text: '关闭', onclick: () => m.close() })]);
  (async () => {
    try {
      const ws = wsState();
      const selection = await wsLoadProjectFiles();
      const res = await api('/api/ai/preview', {
        method: 'POST',
        body: {
          mode: 'work', work_mode: ws.mode, work_prompt: ws.work_prompt,
          selection
        }
      });
      clear(body);
      body.appendChild(h('div', { class: 'field' },
        h('label', { text: 'system（' + res.system.length + ' 字）' }),
        h('pre', { class: 'log', text: res.system })));
      body.appendChild(h('div', { class: 'field' },
        h('label', { text: 'user（' + res.user.length + ' 字）' }),
        h('pre', { class: 'log', style: { maxHeight: '46vh' }, text: res.user })));
    } catch (e) {
      clear(body);
      body.appendChild(h('div', { class: 'muted', text: '预览失败：' + e.message }));
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
  toast('已追加到用户提示词（未覆盖原内容）。', 'ok');
}

function copyOutput() {
  const text = currentOutput();
  if (!text.trim()) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => toast('已复制到剪贴板', 'ok'),
      () => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = h('textarea', { value: text, style: { position: 'fixed', left: '-9999px' } });
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('已复制到剪贴板', 'ok'); }
  catch (e) { toast('复制失败，请手动选择文本。', 'err'); }
  ta.remove();
}

function showRawOutput() {
  const text = currentOutput();
  const ta = h('textarea', { rows: 22, value: text, readonly: true });
  const m = modal('AI 输出原文', ta, [h('button', { text: '关闭', onclick: () => m.close() })]);
}

function saveOutputDialog(fmt) {
  const text = currentOutput();
  if (!text.trim()) return;
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const folder = state.paths.export || '';
  const folderInput = h('input', { type: 'text', value: folder });
  const nameInput = h('input', {
    type: 'text', value: 'ai_output_' + stamp + '.' + fmt,
    placeholder: '文件名.' + fmt
  });
  const body = h('div', null,
    h('div', { class: 'field' }, h('label', { text: '保存目录' }), folderInput),
    h('div', { class: 'field' }, h('label', { text: '文件名' }), nameInput),
    h('div', { class: 'small muted', text: '保存的是当前显示的 AI 输出原文。' }));
  const m = modal('另存为 ' + fmt.toUpperCase(), body, [
    h('button', { text: '取消', onclick: () => m.close() }),
    h('button', {
      class: 'primary', text: '保存', dataset: { noclose: '1' },
      onclick: async ev => {
        ev.target.disabled = true;
        let name = nameInput.value.trim() || ('ai_output.' + fmt);
        if (!name.toLowerCase().endsWith('.' + fmt)) name += '.' + fmt;
        const dir = (folderInput.value.trim() || folder).replace(/[\\/]+$/, '');
        if (!dir) { toast('请填写保存目录。', 'err'); ev.target.disabled = false; return; }
        try {
          const res = await api('/api/io/export', {
            method: 'POST', body: { path: dir + '\\' + name.replace(/[\\/]/g, '_'), content: text }
          });
          toast('已保存：' + res.path, 'ok');
          m.close();
        } catch (e) {
          toast('保存失败：' + e.message, 'err');
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
  if ((ws.output || '').trim() && !confirm('开始新对话？当前对话已保存在历史中，可以随时回来查看。')) return;
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
    toast('已开始新对话；之前的对话保留在历史中。', 'ok');
  } catch (e) {
    toast('新建对话失败：' + e.message, 'err');
  }
}

async function openHistoryDialog() {
  const body = h('div', { class: 'history-dialog' },
    h('div', { class: 'muted', text: '加载中…' }));
  const m = modal('对话历史', body, [
    h('button', { text: '返回当前对话', onclick: () => { m.close(); returnToCurrent(); } }),
    h('button', { text: '关闭', onclick: () => m.close() })
  ]);
  try {
    const res = await api('/api/history');
    drawHistoryDialog(body, res.items || [], res.current || '');
  } catch (e) {
    clear(body);
    body.appendChild(h('div', { class: 'muted', text: '加载失败：' + e.message }));
  }
}

function drawHistoryDialog(body, items, currentId) {
  clear(body);
  if (!items.length) {
    body.appendChild(h('div', { class: 'muted', text: '还没有对话记录。每次生成后会自动保存到这里。' }));
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
    detail.appendChild(h('div', { class: 'muted', text: '加载中…' }));
    try {
      const res = await api('/api/history/' + encodeURIComponent(id));
      const session = res.session;
      clear(detail);
      detail.appendChild(h('div', { class: 'history-detail-head' },
        h('strong', { text: session.title || '未命名对话' }),
        id === currentId ? h('span', { class: 'tag', text: '当前对话' }) : null,
        h('span', { style: { flex: '1' } }),
        h('span', { class: 'small muted', text: (session.turns || []).length + ' 轮' })));
      detail.appendChild(h('div', { class: 'inline', style: { marginBottom: '10px' } },
        h('button', {
          class: 'primary', text: '查看此对话',
          onclick: () => {
            state.ui.historySession = session;
            state.ui.historyTurn = (session.turns || [])[(session.turns || []).length - 1] || null;
            document.querySelector('#overlay-root').innerHTML = '';
            renderMain();
          }
        }),
        h('button', {
          text: '设为当前对话',
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
              toast('已切换当前对话。', 'ok');
            } catch (e) { toast('切换失败：' + e.message, 'err'); }
          }
        }),
        h('button', {
          class: 'danger', text: '删除',
          onclick: async () => {
            if (!confirm('删除这条对话历史？此操作不可恢复。')) return;
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
              toast('已删除。', 'ok');
            } catch (e) { toast('删除失败：' + e.message, 'err'); }
          }
        })));

      const turns = session.turns || [];
      turns.slice().reverse().forEach((turn, idx) => {
        const box = h('details', { class: 'turn-detail', open: idx === 0 });
        box.appendChild(h('summary', null,
          modeBadge(turn.mode),
          h('span', { class: 'small muted', text: ' ' + (turn.created || '') }),
          h('span', { style: { flex: '1' } }),
          h('span', { class: 'small muted', text: (turn.user_prompt || '').length + ' → ' + (turn.output || '').length + ' 字' })));
        box.appendChild(h('div', { class: 'field', style: { marginTop: '8px' } },
          h('label', { text: '用户提示词' }),
          h('pre', { class: 'log', text: turn.user_prompt || '（空）' })));
        if (turn.work_prompt) {
          box.appendChild(h('div', { class: 'field' },
            h('label', { text: '本次工作要求' }),
            h('pre', { class: 'log', text: turn.work_prompt })));
        }
        box.appendChild(h('div', { class: 'field' },
          h('label', { text: 'AI 输出' }),
          h('div', { class: 'md history-md', html: md(turn.output || '（空）') })));
        if (turn.resolved && turn.resolved.missing) {
          box.appendChild(h('div', { class: 'small muted', text: '有 ' + turn.resolved.missing + ' 个设定指针已失效，查看时已自动跳过。' }));
        }
        detail.appendChild(box);
      });
    } catch (e) {
      clear(detail);
      detail.appendChild(h('div', { class: 'muted', text: '读取失败：' + e.message }));
    }
  };

  items.forEach(item => {
    const row = h('div', {
      class: 'list-item' + (item.id === selectedId ? ' active' : ''),
      dataset: { id: item.id },
      onclick: () => loadDetail(item.id)
    },
      h('div', { class: 'name', text: item.title || '未命名对话' }),
      h('div', { class: 'meta', text: (item.turns || 0) + ' 轮 · ' + (item.updated || '') + (item.id === currentId ? ' · 当前' : '') }));
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
      status('就绪', 'ok');
    }
  } catch (e) { /* 网络短暂失败时下个周期再试 */ }
}

async function boot() {
  try {
    await refreshFiles();
    await loadCurrentSession();
  } catch (e) {
    document.getElementById('main').appendChild(h('div', { class: 'card', text: '加载失败：' + e.message }));
    return;
  }
  renderNav();
  renderMain();
  status('就绪', 'ok');
  const s = await api('/api/workstation/status').catch(() => null);
  if (s && s.busy) pollBusyState();
}

boot();
