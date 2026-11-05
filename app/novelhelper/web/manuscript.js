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

/* NovelHelper —— 稿件处理（大文本工作区 + 对话式 AI 辅助） */
'use strict';

function processModes() {
  return modesOfKind('process');
}

function manuscriptModeLabel(id) {
  const mode = allModes().find(m => m.id === id);
  return mode ? (mode.label || mode.id) : (id || i18n.t('manuscript.mode_fallback'));
}

function manuscriptShortName(path) {
  return String(path || '').split(/[\\/]/).pop() || i18n.t('common.unnamed_paren');
}

function manuscriptConfirm(message) {
  return new Promise(resolve => {
    const dialog = modal(i18n.t('common.confirm'), h('div', {text:message}), [
      h('button', {text:i18n.t('common.cancel'), onclick:() => dialog.close()}),
      h('button', {class:'primary', text:i18n.t('common.confirm'), onclick:() => {resolve(true); dialog.close();}})
    ], () => resolve(false));
  });
}

function manuscriptToggleClass(el, name, on) {
  if (!el || !el.classList) return;
  if (typeof el.classList.toggle === 'function') el.classList.toggle(name, !!on);
  else if (on) el.classList.add(name);
  else el.classList.remove(name);
}

let manuscriptRun = null;              // 当前 AI 改写的请求（跨页面重建也能停）
let manuscriptStopRequested = false;   // 是「用户主动停止」还是真的失败

function manuscriptClip(text, max) {
  const value = String(text || '');
  return value.length > max ? value.slice(0, max) + '…' : value;
}

/** 草稿里只保留最近一段对话：正文片段截短，避免 state.json 越滚越大。 */
function manuscriptChatForDraft(chat) {
  return (chat || []).slice(-60).map(message => {
    const copy = { ...message };
    if (copy.original) copy.original = manuscriptClip(copy.original, 4000);
    if (copy.added) copy.added = manuscriptClip(copy.added, 4000);
    return copy;
  });
}

/**
 * 本次改写的范围：有选区只改选区，否则改整篇。
 * 返回的 text 是发给模型的原文，start/end 用于把结果原位写回。
 */
function manuscriptEditRange(ui) {
  const value = String(ui.value || '');
  let start = Math.min(value.length, Math.max(0, ui.selectionStart || 0));
  let end = Math.min(value.length, Math.max(start, ui.selectionEnd || 0));
  if (end <= start) { start = 0; end = value.length; }
  return {
    start, end, text: value.slice(start, end),
    scope: end - start < value.length ? 'selection' : 'document'
  };
}

/**
 * 开始一次原位改写。head / tail 是选区两侧的原文，流式过程中正文由
 * 「head + 正在返回的文本 + tail」拼成，所以停止或回滚都能还原。
 */
function manuscriptStartEdit(ui, start, end) {
  const value = String(ui.value || '');
  ui.pending = {
    status: 'streaming',
    start, end, text: '', original: value.slice(start, end),
    head: value.slice(0, start), tail: value.slice(end), before: value.length
  };
  return ui.pending;
}

/** 收到一段新文本：只重拼受影响的区间，不触碰正文其他部分。 */
function manuscriptSetEditText(ui, text) {
  const pending = ui.pending;
  if (!pending) return;
  pending.text = String(text || '');
  pending.end = pending.start + pending.text.length;
  ui.value = pending.head + pending.text + pending.tail;
}

/** 保留：记一次撤销点，正文留下 AI 的版本。 */
function manuscriptFinishEdit(ui) {
  const pending = ui.pending;
  if (!pending) return false;
  ui.undo.push({ value: pending.head + pending.original + pending.tail,
    start: pending.start, end: pending.end });
  while (ui.undo.length > 50) ui.undo.shift();
  ui.redo = [];
  ui.pending = null;
  ui.dirty = true;
  return true;
}

/** 回滚：正文回到改写前，不记撤销点。 */
function manuscriptRevertEdit(ui) {
  const pending = ui.pending;
  if (!pending) return false;
  ui.value = pending.head + pending.original + pending.tail;
  ui.pending = null;
  return true;
}

/** 放弃未确认的改写（换章、追加结果等）：正文还原，对话里那条结果标成已停止。 */
function manuscriptDiscardPending(ui) {
  const pending = ui && ui.pending;
  if (!pending) return false;
  const message = (ui.chat || []).find(item => item.id === pending.messageId);
  if (!manuscriptRevertEdit(ui)) return false;
  if (message && message.status === 'review') message.status = 'cancelled';
  return true;
}

// ═══════════════════════════════════════════
// 稿件处理页
//
// 内容不会「切走就没了」：
//   · 输入先落进内存草稿 → 切到别的栏目再回来，原样还在；
//   · 停手 0.5 秒把草稿写进 data/state.json → 刷新浏览器 / 重开页面也还在；
//   · 绑定到具体文件后，停手 1.5 秒自动写盘 → 不必再点「保存」；
//   · AI 辅助是右侧对话：改写直接落在正文上并高亮，保留或回滚都由你决定。
// ═══════════════════════════════════════════
function viewManuscript(main) {
  if (state.ui.textObserver) { state.ui.textObserver.disconnect(); state.ui.textObserver = null; }
  const draftSlot = () => {
    const s = state.db.state = state.db.state || {};
    return s.textPanel = s.textPanel || {};
  };
  if (!state.ui.text || state.ui.text.novelId !== state.activeNovelId) {
    const saved = draftSlot();
    state.ui.text = {
      novelId: state.activeNovelId,
      undo: [], redo: [],
      selectionStart: 0, selectionEnd: 0,
      scrollTop: 0,
      path: saved.path || '',
      value: saved.value || '',
      dirty: !!saved.dirty,
      chat: Array.isArray(saved.chat) ? saved.chat : [],
      pending: saved.pending && typeof saved.pending === 'object' ? saved.pending : null,
      assistant: !!saved.assistant,
      assistantPrompt: saved.assistantPrompt || '',
      mode: saved.mode || '',
      model: saved.model || '',
      effort: saved.effort || '',
      chapterCollapsed: !!saved.chapterCollapsed
    };
  }
  const ui = state.ui.text;
  // 记得上次没处理完的改写：正文对不上（文件被外部改过）就放弃这次结果。
  if (ui.pending) {
    const p = ui.pending;
    if (typeof p.start !== 'number' || typeof p.text !== 'string' ||
        ui.value.slice(p.start, p.start + p.text.length) !== p.text) {
      const message = ui.chat.find(item => item.id === p.messageId);
      if (message && message.status === 'review') message.status = 'cancelled';
      ui.pending = null;
    } else {
      p.end = p.start + p.text.length;
      p.status = p.status || 'done';
      p.head = ui.value.slice(0, p.start);
      p.tail = ui.value.slice(p.end);
    }
  }
  // 上次刷新 / 关闭页面时还在生成的那一轮已经断了：标成「已停止」，不要一直转。
  ui.chat.forEach(message => {
    if (message.status === 'streaming' && (!ui.pending || ui.pending.messageId !== message.id) &&
        (!manuscriptRun || manuscriptRun.messageId !== message.id)) {
      message.status = 'cancelled';
    }
  });

  const DRAFT_DELAY = 500;    // 草稿写盘防抖
  const FILE_DELAY = 1500;    // 文件自动保存防抖
  const DRAFT_MAX = 1500000;  // 草稿体积上限：再大就不往 state.json 里塞（文件自动保存照常）
  let draftTimer = null, fileTimer = null, fileSaving = false, filePending = false;
  const tooBig = () => ui.value.length > DRAFT_MAX;

  // ── 草稿：内容 + 当前文件名 + 对话 + 未确认的改写一起存进 data/state.json ──
  const writeDraft = () => {
    const d = draftSlot();
    const streaming = !!(ui.pending && ui.pending.status === 'streaming');
    // 流式过程中不把半截结果写进草稿：刷新页面时正文回到改写前。
    const draftValue = streaming
      ? ui.pending.head + ui.pending.original + ui.pending.tail
      : ui.value;
    d.path = ui.path;
    d.value = tooBig() && ui.path ? '' : draftValue;    // 超大文本只留文件名，靠文件自动保存兜底
    d.skipped = tooBig() && !!ui.path;
    d.dirty = !!ui.dirty;
    d.scrollTop = ui.scrollTop || 0;
    d.chat = manuscriptChatForDraft(ui.chat);
    d.assistant = !!ui.assistant;
    d.assistantPrompt = ui.assistantPrompt || '';
    d.mode = ui.mode || '';
    d.model = ui.model || '';
    d.effort = ui.effort || '';
    d.chapterCollapsed = !!ui.chapterCollapsed;
    if (ui.pending && !streaming) {
      const p = ui.pending;
      d.pending = {
        start: p.start, end: p.end, text: p.text, original: p.original,
        prompt: p.prompt || '', mode: p.mode || '', messageId: p.messageId || ''
      };
    } else delete d.pending;
    d.updated = new Date().toISOString();
    return d;
  };
  const scheduleDraft = () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => { writeDraft(); touch('state', true); }, DRAFT_DELAY);
  };
  const persistNow = () => {
    writeDraft(); touch('state', true);
  };

  // ── 文件自动保存：绑定到具体文件后才写盘 ──
  const saveToFile = async (path, content, quiet) => {
    try {
      const fresh=!path.includes('/') && !path.includes('\\');
      const res=await api('/api/io/save', { method: 'POST', body: { novel_id:state.activeNovelId,
        ...(fresh ? {directory:'text',filename:path} : {path}), content } });
      if(fresh && ui.path===path)ui.path=res.path;
      if (ui.path === path && ui.value === content) ui.dirty = false;
      const item = (state.io.files || []).find(f => f.path === path);
      if (item) item.size = new Blob([content]).size;
      status(i18n.t(quiet ? 'manuscript.autosaved' : 'manuscript.saved_status', {name: manuscriptShortName(path)}), 'ok');
      if (!quiet) toast(i18n.t('common.saved_to', { path: path }), 'ok');
      updateStat();
      return true;
    } catch (e) {
      status(i18n.t('common.save_failed'), 'err');
      toast(i18n.t('common.save_failed_reason', { reason: e.message }), 'err');
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

  // ── 章节：完整写作的结果会自己出现在这里，也可以直接打开某一章 ──
  const chapterBooks = () => (state.chapters || []).filter(chapter =>
    /\.(md|txt)$/i.test(chapter.path || '') && !/(^|[\\/])plan[\\/]/.test(chapter.dir || ''));
  const chapterOrigins = () => ((state.db.state || {}).workstation || {}).chapters || {};
  const loadChapter = async (rel, name) => {
    if (!rel || ui.path === rel) return;
    const label = name || manuscriptShortName(rel);
    if (ui.dirty) {
      if (ui.path) await flushFile();
      else if (!await manuscriptConfirm(i18n.t('manuscript.unsaved_clear'))) return;
    }
    if (ui.pending) {
      manuscriptDiscardPending(ui);
      toast(i18n.t('manuscript.ai_discarded'), 'ok');
    }
    try {
      const r = await api('/api/file?path=' + encodeURIComponent(rel));
      clearTimeout(draftTimer); clearTimeout(fileTimer);
      ui.path = rel; ui.value = r.content; ui.dirty = false;
      ui.undo = []; ui.redo = []; ui.selectionStart = 0; ui.selectionEnd = 0; ui.scrollTop = 0;
      writeDraft();
      saveNow('state').catch(() => {});
      renderMain();
      toast(i18n.t('manuscript.chapter_opened', { name: label }), 'ok');
    } catch (e) {
      toast(i18n.t('common.load_failed_reason', { reason: e.message }), 'err');
    }
  };
  const openChapterOrigin = sessionId => {
    if (!sessionId) return;
    switchWorkstationSession(sessionId).catch(() => {});
  };
  const chapterBar = () => {
    const books = chapterBooks();
    const origins = chapterOrigins();
    const collapsed = ui.chapterCollapsed === true;
    const bar = h('section', { class: 'chapter-bar', 'aria-label': i18n.t('manuscript.chapters_title') });
    bar.appendChild(h('button', {
      class: 'chapter-bar-head', 'aria-expanded': String(!collapsed),
      title: i18n.t(collapsed ? 'manuscript.chapters_expand' : 'manuscript.chapters_collapse'),
      onclick: () => {
        ui.chapterCollapsed = !collapsed;
        writeDraft(); touch('state', true);
        renderMain();
      }
    },
      h('span', { class: 'chapter-bar-caret', 'aria-hidden': 'true', text: collapsed ? '▸' : '▾' }),
      h('span', { class: 'chapter-bar-title', text: i18n.t('manuscript.chapters_title') }),
      h('span', { class: 'small muted', text: i18n.t('manuscript.chapters_count', { count: books.length }) }),
      ui.path ? h('span', { class: 'chapter-bar-current small', text: manuscriptShortName(ui.path) }) : null));
    if (collapsed) return bar;
    const list = h('div', { class: 'chapter-bar-list' });
    if (!books.length) list.appendChild(h('div', { class: 'small muted chapter-bar-empty',
      text: i18n.t('manuscript.chapter_empty') }));
    books.forEach(chapter => {
      const origin = origins[chapter.path] || null;
      const chip = h('div', { class: 'chapter-chip' + (ui.path === chapter.path ? ' on' : '') });
      chip.appendChild(h('button', {
        class: 'chapter-chip-open', title: chapter.path,
        onclick: () => loadChapter(chapter.path, chapter.name)
      }, h('span', { class: 'chapter-chip-name', text: String(chapter.name || '').replace(/\.(md|txt)$/i, '') }),
         h('span', { class: 'chapter-chip-size small muted', text: i18n.t('manuscript.chapter_size', { size: Math.max(1, Math.round((chapter.size || 0) / 1024)) }) })));
      if (origin && origin.session_id) {
        chip.appendChild(h('button', {
          class: 'chapter-chip-ai', text: i18n.t('manuscript.chapter_ai'),
          title: i18n.t('manuscript.chapter_ai_hint'),
          onclick: () => openChapterOrigin(origin.session_id)
        }));
      }
      list.appendChild(chip);
    });
    bar.appendChild(list);
    return bar;
  };

  // ── 正文 + 改动高亮 ──────────────────────
  const layer = h('div', { class: 'manuscript-edit-layer', 'aria-hidden': 'true' });
  const area = h('textarea', {
    rows: 18, class: 'notepad manuscript-area', placeholder: i18n.t('manuscript.editor_placeholder'),
    value: ui.value,
    'aria-label': i18n.t('manuscript.editor_label'),
    oninput: () => setText(area.value),
    onselect: () => rememberSelection(), onclick: () => rememberSelection(), onkeyup: () => rememberSelection(),
    onkeydown: e => {
      if ((e.ctrlKey || e.metaKey) && !e.isComposing && ['z', 'y'].includes(e.key.toLowerCase())) {
        e.preventDefault(); undoEdit(e.key.toLowerCase() === 'y' || e.shiftKey);
      }
    },
    onscroll: () => { ui.scrollTop = area.scrollTop; syncLayer(); }
  });
  area.readOnly = !!ui.pending;
  const editBox = h('div', { class: 'manuscript-edit-box' + (ui.pending ? ' has-pending' : '') }, layer, area);
  let layerIns = null;
  const syncLayer = () => {
    if (!layer || !layer.style || typeof area.clientWidth !== 'number') return;
    layer.style.width = area.clientWidth + 'px';
    layer.style.height = area.clientHeight + 'px';
    layer.style.left = (area.offsetLeft + area.clientLeft) + 'px';
    layer.style.top = (area.offsetTop + area.clientTop) + 'px';
    layer.scrollTop = area.scrollTop;
    layer.scrollLeft = area.scrollLeft;
  };
  const buildLayer = () => {
    clear(layer);
    layerIns = null;
    manuscriptToggleClass(layer, 'on', !!ui.pending);
    if (!ui.pending) { syncLayer(); return; }
    const p = ui.pending;
    layer.appendChild(h('span', { class: 'manuscript-edit-plain' }, ui.value.slice(0, p.start)));
    layerIns = h('ins', { class: 'manuscript-edit-ins' }, p.text);
    layer.appendChild(layerIns);
    layer.appendChild(h('span', { class: 'manuscript-edit-plain' }, p.tail));
    syncLayer();
  };
  const updateLayerText = () => {
    if (!layerIns || !ui.pending) return;
    layerIns.textContent = ui.pending.text;
    syncLayer();
  };
  const statLine = h('div', { class: 'small muted' });
  const pathHint = h('span', { class: 'hint' });
  const refreshHint = () => { pathHint.textContent = ui.path || i18n.t('manuscript.unnamed_draft'); };

  const updateStat = () => {
    const t = ui.value;
    const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
    const lines = t.split('\n').length;
    const paras = t.split(/\n\s*\n/).filter(p => p.trim()).length;
    let save;
    if (ui.path) save = ui.dirty ? (fileSaving ? i18n.t('manuscript.autosaving') : i18n.t('manuscript.pending_save')) : i18n.t('common.saved');
    else if (!t) save = i18n.t('manuscript.empty_unnamed');
    else save = i18n.t('manuscript.draft_staged');
    if (tooBig()) save = i18n.t('manuscript.too_big');
    statLine.textContent = i18n.t('manuscript.stat_line', { chars: t.length, han: cjk, lines: lines, paras: paras, save: save });
  };

  const rememberSelection = () => {
    ui.selectionStart = area.selectionStart; ui.selectionEnd = area.selectionEnd;
  };
  const snapshot = () => ({value:ui.value, start:ui.selectionStart || 0, end:ui.selectionEnd || 0});
  let refreshUndoState = () => {};   // 工具栏建好后回填：空栈时按钮必须 disabled
  const setText = (value, record = true) => {
    if (record && value !== ui.value) {
      ui.undo.push(snapshot()); ui.redo = [];
      while (ui.undo.length > 50 || (ui.undo.length > 1 && ui.undo.reduce((n, entry) => n + entry.value.length, 0) > 4000000)) ui.undo.shift();
    }
    if (area.value !== value) area.value = value;
    ui.value = value; ui.dirty = true;
    scheduleDraft(); scheduleFileSave(); updateStat(); refreshUndoState();
  };
  const undoEdit = (redo = false) => {
    if (ui.pending) return;   // 未确认的改写先保留或回滚，撤销栈以它为准
    const from = redo ? ui.redo : ui.undo, to = redo ? ui.undo : ui.redo;
    if (!from.length) return;
    to.push(snapshot()); const entry = from.pop();
    setText(entry.value, false); area.focus(); area.setSelectionRange(entry.start, entry.end); rememberSelection();
    refreshUndoState();
  };

  // 离开本页 / 切栏目时：草稿与文件都立刻落盘
  const flushNow = () => {
    clearTimeout(draftTimer);
    clearTimeout(fileTimer);
    const done = async () => { writeDraft(); await saveNow('state'); };
    if (ui.path && ui.dirty) return autosaveFile().then(done, done);   // 先落文件，草稿再记录真实状态
    return done();
  };

  const saveLocal = async () => {
    clearTimeout(fileTimer);
    if (!ui.path) {
      askDialog(i18n.t('common.save'), i18n.t('common.filename'),
        i18n.t('defaults.text.draft_prefix') + new Date().toISOString().slice(0, 10) + '.txt', async value => {
          let name = value.trim();
          if (!name) return;
          if (!/\.(txt|md)$/i.test(name)) name += '.txt';
          ui.path = name.replace(/[\\/]/g, '_');
          refreshHint(); await saveLocal();
        });
      return;
    }
    if (!await saveToFile(ui.path, ui.value, false)) return;
    writeDraft();
    await refreshFiles();
    writeDraft();          // refreshFiles 换掉了 state.db.state，把草稿重新贴回去
    refreshHint();
  };

  // ── 文本清理 / 查找替换 ───────────────────
  const ops = [
    [i18n.t('manuscript.clean_remove_empty'), t => t.split('\n').filter(l => l.trim() !== '').join('\n')],
    [i18n.t('manuscript.clean_merge_empty'), t => t.replace(/\n{3,}/g, '\n\n')],
    [i18n.t('manuscript.clean_merge_breaks'), t => t.replace(/([^\n])\n(?!\n)/g, '$1')],
    [i18n.t('manuscript.clean_trim_indent'), t => t.split('\n').map(l => l.replace(/^[　 \t]+/, '')).join('\n')],
    [i18n.t('manuscript.clean_trim'), t => t.trim()],
    [i18n.t('manuscript.clean_fullwidth_space'), t => t.replace(/　/g, ' ')],
    [i18n.t('manuscript.clean_cn_quotes'), t => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")]
  ];

  const transformText = fn => {
    const start = ui.selectionStart || 0, end = ui.selectionEnd || 0;
    if (processSelection.checked && end > start) {
      const text = fn(ui.value.slice(start, end));
      setText(ui.value.slice(0, start) + text + ui.value.slice(end));
      area.setSelectionRange(start, start + text.length); rememberSelection();
    } else setText(fn(ui.value));
  };
  const openFindReplace = () => {
    const find = h('input', { type: 'text', placeholder: i18n.t('common.find') });
    const repl = h('input', { type: 'text', placeholder: i18n.t('common.replace_with') });
    const all = h('input', { type: 'checkbox', checked: true });
    const body = h('div', null,
      h('div', { class: 'field' }, h('label', { text: i18n.t('common.find') }), find),
      h('div', { class: 'field' }, h('label', { text: i18n.t('common.replace_with') }), repl),
      h('label', { class: 'check' }, all, i18n.t('manuscript.replace_all')));
    const m = modal(i18n.t('manuscript.find_replace'), body, [
      h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() }),
      h('button', {
        class: 'primary', text: i18n.t('common.replace'),
        onclick: () => {
          if (!find.value) return;
          transformText(text => all.checked ? text.split(find.value).join(repl.value) : text.replace(find.value, repl.value));
          m.close();
        }
      })
    ]);
  };

  // ── 导入至章节 ───────────────────────────
  const importToChapter = () => {
    if (ui.pending) { toast(i18n.t('manuscript.ai_pending_block'), 'err'); return; }
    if (!ui.value.trim()) { toast(i18n.t('manuscript.nothing_export'), 'err'); return; }
    const name = h('input', {type:'text', value:ui.path ? manuscriptShortName(ui.path).replace(/\.(txt|md)$/i, '') : '',
      'aria-label':i18n.t('manuscript.chapter_name')});
    const dialog = modal(i18n.t('manuscript.to_chapter'), h('div', {class:'field'},
      h('label', {text:i18n.t('manuscript.chapter_name')}), name), [
      h('button', {text:i18n.t('common.cancel'), onclick:() => dialog.close()}),
      h('button', {class:'primary', text:i18n.t('manuscript.to_chapter'), dataset:{noclose:'1'}, onclick:async e => {
        if (!name.value.trim()) { name.focus(); return; }
        e.target.disabled = true;
        try {
          await api('/api/chapters', {method:'POST', body:{name:name.value.trim(),content:ui.value}});
          await refreshFiles(); dialog.close(); toast(i18n.t('manuscript.chapter_saved'), 'ok');
        } catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
      }})]);
    name.focus();
  };

  // ═══════════════════════════════════════════
  // AI 辅助：右侧对话 + 原位改写
  // ═══════════════════════════════════════════
  const modes = processModes();
  const mode = modes.find(item => item.id === ui.mode) || modes[0] || null;
  if (mode && ui.mode !== mode.id) { ui.mode = mode.id; }
  const assistantEffort = () => ui.effort || (mode && mode.effort) || 'medium';

  const scopeText = (scope, chars) => i18n.t(
    scope === 'document' ? 'manuscript.ai_scope_document' : 'manuscript.ai_scope_selection',
    { count: chars });

  let assistantPrompt = ui.assistantPrompt || '';
  let chatInput = null;
  const feed = h('div', { class: 'manuscript-agent-feed', role: 'log', 'aria-live': 'polite' });
  const editBarStats = h('span', { class: 'small muted' });
  const editBarTitle = h('span', { class: 'manuscript-edit-title' });
  const revertBtn = h('button', { class: 'mini', text: i18n.t('manuscript.ai_revert'), onclick: () => rejectEdit() });
  const keepBtn = h('button', { class: 'primary mini', text: i18n.t('manuscript.ai_keep'), onclick: () => acceptEdit() });
  const editBar = h('div', { class: 'manuscript-edit-bar', hidden: !ui.pending },
    editBarTitle, editBarStats, h('span', { class: 'manuscript-edit-actions' }, revertBtn, keepBtn));

  const updateEditBar = () => {
    editBar.hidden = !ui.pending;
    if (!ui.pending) return;
    // 还在流式写入时不提供「保留 / 回滚」：等这一轮写完再让你决定。
    const streaming = ui.pending.status === 'streaming';
    editBarTitle.textContent = i18n.t(streaming ? 'manuscript.ai_writing' : 'manuscript.ai_pending_hint');
    editBarStats.textContent = streaming ? '' : i18n.t('manuscript.ai_pending_stats',
      { before: ui.pending.original.length, after: ui.pending.text.length });
    revertBtn.hidden = streaming;
    keepBtn.hidden = streaming;
  };

  const chatMessageById = id => ui.chat.find(message => message.id === id) || null;

  const diffBlock = (original, added) => h('div', { class: 'manuscript-diff-body' },
    h('div', { class: 'manuscript-diff-label', text: i18n.t('manuscript.ai_diff_removed') }),
    h('pre', { class: 'manuscript-diff-old', text: manuscriptClip(original, 1600) || i18n.t('common.empty_paren') }),
    h('div', { class: 'manuscript-diff-label', text: i18n.t('manuscript.ai_diff_added') }),
    h('pre', { class: 'manuscript-diff-new', text: manuscriptClip(added, 1600) }));

  const assistantStats = message => i18n.t('manuscript.ai_edit_stats',
    { before: message.before || 0, after: message.after || 0 });

  const chatMessageNode = message => {
    if (message.role === 'user') {
      return h('div', { class: 'manuscript-msg user', dataset: { msg: message.id } },
        h('div', { class: 'manuscript-msg-text', text: message.text }),
        h('div', { class: 'manuscript-msg-meta small muted', text: scopeText(message.scope, message.chars) }));
    }
    const node = h('div', { class: 'manuscript-msg assistant', dataset: { msg: message.id } });
    node.appendChild(h('div', { class: 'manuscript-msg-head' },
      h('span', { class: 'tag mode-tag', text: message.modeLabel || manuscriptModeLabel(message.mode) }),
      h('span', { class: 'manuscript-msg-meta small muted', text: scopeText(message.scope, message.chars) })));
    if (message.status === 'streaming') {
      node.appendChild(h('div', { class: 'manuscript-msg-status' },
        h('span', { class: 'agent-dot', 'aria-hidden': 'true' }),
        h('span', { text: i18n.t('manuscript.ai_writing') }),
        h('span', { class: 'manuscript-stream-count small muted',
          text: i18n.t('workstation.char_count', { count: (ui.pending && ui.pending.text || '').length }) })));
    } else if (message.status === 'review') {
      node.appendChild(h('div', { class: 'manuscript-msg-status' },
        h('span', { class: 'manuscript-msg-done', text: i18n.t('manuscript.ai_done') }),
        h('span', { class: 'small muted', text: assistantStats(message) })));
      node.appendChild(h('details', { class: 'manuscript-diff' },
        h('summary', { text: i18n.t('manuscript.ai_view_diff') }),
        diffBlock(message.original, message.added || '')));
      if (ui.pending && ui.pending.messageId === message.id) {
        node.appendChild(h('div', { class: 'manuscript-msg-actions' },
          h('button', { class: 'primary', text: i18n.t('manuscript.ai_keep'), onclick: () => acceptEdit() }),
          h('button', { text: i18n.t('manuscript.ai_revert'), onclick: () => rejectEdit() })));
      } else {
        node.appendChild(h('div', { class: 'small muted manuscript-msg-stale',
          text: i18n.t('manuscript.ai_review_stale') }));
      }
    } else if (message.status === 'applied') {
      node.appendChild(h('div', { class: 'manuscript-msg-status' },
        h('span', { class: 'tag ok', text: i18n.t('manuscript.ai_kept') }),
        h('span', { class: 'small muted', text: assistantStats(message) })));
    } else if (message.status === 'reverted') {
      node.appendChild(h('div', { class: 'manuscript-msg-status' },
        h('span', { class: 'tag', text: i18n.t('manuscript.ai_reverted') }),
        h('span', { class: 'small muted', text: i18n.t('manuscript.ai_reverted_hint') })));
    } else if (message.status === 'cancelled') {
      node.appendChild(h('div', { class: 'manuscript-msg-status' },
        h('span', { class: 'manuscript-msg-done', text: i18n.t('manuscript.ai_cancelled') }),
        h('span', { class: 'small muted', text: i18n.t('manuscript.ai_cancelled_hint') })));
    } else if (message.status === 'error') {
      node.appendChild(h('div', { class: 'manuscript-msg-status error', role: 'alert' },
        h('span', { text: message.error || i18n.t('manuscript.ai_failed') })));
    }
    return node;
  };

  const refreshChat = () => {
    if (!feed) return;
    // 重排对话后停在最新一条：第一次打开、或本来就贴着底部，就滚到底部；
    // 用户手动往上翻的时候不抢滚动位置。
    const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 160;
    const stick = !ui.chatSeen || nearBottom;
    const top = feed.scrollTop;
    clear(feed);
    if (!ui.chat.length) {
      feed.appendChild(h('div', { class: 'manuscript-agent-empty' },
        h('div', { class: 'small muted', text: i18n.t('manuscript.ai_empty') })));
      return;
    }
    ui.chat.forEach(message => feed.appendChild(chatMessageNode(message)));
    ui.chatSeen = true;
    if (stick) requestAnimationFrame(() => { if (feed.isConnected) feed.scrollTop = feed.scrollHeight; });
    else feed.scrollTop = top;
  };
  const updateStreamStatus = () => {
    const node = feed && typeof feed.querySelector === 'function'
      ? feed.querySelector('.manuscript-stream-count') : null;
    if (node) node.textContent = i18n.t('workstation.char_count',
      { count: (ui.pending && ui.pending.text || '').length });
  };

  // 改写期间正文会整段重设，textarea 的滚动位置别跟着跳回顶部。
  const applyValue = value => {
    const top = area.scrollTop;
    if (area.value !== value) area.value = value;
    if (area.scrollTop !== top) area.scrollTop = top;
    syncLayer();
  };

  const paintPending = () => {
    if (!area.isConnected) return;
    area.readOnly = !!ui.pending;
    applyValue(ui.value);
    manuscriptToggleClass(editBox, 'has-pending', !!ui.pending);
    updateLayerText();
    if (!layerIns) buildLayer();
    updateEditBar();
    updateStat();
    updateStreamStatus();
  };
  state.ui.textLive = { paint: paintPending, refreshChat, updateEditBar };

  const acceptEdit = () => {
    if (!ui.pending) return;
    const message = chatMessageById(ui.pending.messageId);
    if (!manuscriptFinishEdit(ui)) return;
    if (message) message.status = 'applied';
    if (area.isConnected) {
      applyValue(ui.value); area.readOnly = false;
      manuscriptToggleClass(editBox, 'has-pending', false);
      buildLayer(); updateEditBar(); updateStat(); refreshUndoState(); refreshChat();
    }
    scheduleDraft(); scheduleFileSave(); persistNow();
    toast(i18n.t('manuscript.ai_kept_toast'), 'ok');
  };
  const rejectEdit = () => {
    if (!ui.pending) return;
    const message = chatMessageById(ui.pending.messageId);
    if (!manuscriptRevertEdit(ui)) return;
    if (message) message.status = 'reverted';
    if (area.isConnected) {
      applyValue(ui.value); area.readOnly = false;
      manuscriptToggleClass(editBox, 'has-pending', false);
      buildLayer(); updateEditBar(); updateStat(); refreshUndoState(); refreshChat();
    }
    scheduleDraft(); persistNow();
    toast(i18n.t('manuscript.ai_reverted_toast'), 'ok');
  };

  const openProcessModePicker = () => {
    if (!modes.length) {
      const empty = modal(i18n.t('manuscript.ai_mode_picker'), h('div', { class: 'small muted',
        text: i18n.t('manuscript.no_mode') }), [
        h('button', { text: i18n.t('common.close'), onclick: () => empty.close() }),
        h('button', { class: 'primary', text: i18n.t('workstation.go_modes'), onclick: () => {
          empty.close(); state.ui.modes = { kind: 'process', sel: '' }; go('modes');
        } })
      ], null, { size: 'confirm' });
      return;
    }
    let dialog = null;
    const body = h('div', { class: 'mode-picker' }, modes.map(item => h('button', {
      class: 'mode-picker-row' + (item.id === ui.mode ? ' on' : ''),
      'aria-pressed': String(item.id === ui.mode),
      onclick: () => {
        ui.mode = item.id;
        writeDraft(); touch('state', true);
        dialog.close();
        renderMain();
      }
    },
      h('span', { class: 'mode-picker-name', text: item.label || item.id }),
      h('span', { class: 'mode-picker-desc small muted', text: item.desc || '' }))));
    dialog = modal(i18n.t('manuscript.ai_mode_picker'), body, [
      h('button', { text: i18n.t('common.close'), onclick: () => dialog.close() })
    ], null, { size: 'confirm' });
    dialog.dlg.classList.add('mode-picker-dialog');
  };

  const stopManuscriptEdit = async () => {
    if (!manuscriptRun) return;
    manuscriptStopRequested = true;
    try { await api('/api/workstation/cancel', { method: 'POST', body: {} }); }
    catch (e) { /* 可能刚好结束了，忽略 */ }
    manuscriptRun.controller.abort();
  };

  // 生成中把「开始改写」换成「停止」，结束再换回来（不重排整个页面）。
  let sendBtn = null, stopBtn = null;
  const setRunningUi = () => {
    const running = !!manuscriptRun;
    if (sendBtn) { sendBtn.hidden = running; sendBtn.disabled = running; }
    if (stopBtn) { stopBtn.hidden = !running; }
  };
  if (state.ui.textLive) state.ui.textLive.runUi = setRunningUi;

  const runManuscriptEdit = async () => {
    if (state.ui.busy || manuscriptRun) return;
    if (ui.pending) { toast(i18n.t('manuscript.ai_pending_block'), 'err'); return; }
    const promptText = String(assistantPrompt || '').trim();
    if (!promptText) { toast(i18n.t('manuscript.ai_empty_prompt'), 'err'); return; }
    if (!mode) { toast(i18n.t('manuscript.no_mode'), 'err'); return; }
    const range = manuscriptEditRange(ui);
    if (!range.text.trim()) { toast(i18n.t('manuscript.nothing_process'), 'err'); return; }

    manuscriptStopRequested = false;
    assistantPrompt = ''; ui.assistantPrompt = '';
    if (chatInput) chatInput.value = '';
    const userMessage = { id: newId('msg'), role: 'user', text: promptText,
      scope: range.scope, chars: range.text.length, created: nowStr() };
    const reply = { id: newId('msg'), role: 'assistant', status: 'streaming',
      mode: mode.id, modeLabel: mode.label || mode.id,
      model: ui.model || defaultModelName(), effort: assistantEffort(),
      scope: range.scope, chars: range.text.length, prompt: promptText, created: nowStr() };
    ui.chat.push(userMessage, reply);
    if (ui.chat.length > 120) ui.chat.splice(0, ui.chat.length - 120);

    const pending = manuscriptStartEdit(ui, range.start, range.end);
    pending.prompt = promptText; pending.mode = mode.id; pending.messageId = reply.id;
    pending.model = reply.model; pending.effort = reply.effort;
    paintPending();
    refreshChat();
    persistNow();
    status(i18n.t('workstation.generating'), 'busy');

    const controller = new AbortController();
    manuscriptRun = { controller, messageId: reply.id };
    setRunningUi();
    state.ui.textLive?.runUi?.();
    try {
      const res = await streamWorkstation({
        surface: 'manuscript', mode_id: mode.id, prompt: promptText,
        source_text: range.text,
        override: {
          ...(ui.model ? { model: ui.model } : {}),
          ...(ui.effort ? { effort: ui.effort } : {})
        },
        config: state.db.config
      }, controller.signal, delta => {
        if (!ui.pending || ui.pending.messageId !== reply.id) return;
        manuscriptSetEditText(ui, ui.pending.text + delta);
        state.ui.textLive?.paint();
      });
      if (!ui.pending || ui.pending.messageId !== reply.id) return;   // 中途被回滚/切章
      if (res && res.cancelled) throw Object.assign(new Error(i18n.t('workstation.stopped_hint')), { stopped: true });
      const text = String(res && res.clean_text != null ? res.clean_text : (res && res.text) || '').replace(/\s+$/, '');
      if (!text.trim()) throw new Error(i18n.t('manuscript.ai_empty_result'));
      manuscriptSetEditText(ui, text);
      pending.status = 'done';
      reply.status = 'review';
      reply.original = pending.original;
      reply.added = text;
      reply.before = pending.original.length;
      reply.after = text.length;
      state.ui.textLive?.paint?.();
      state.ui.textLive?.refreshChat?.();
      persistNow();
      status(i18n.t('manuscript.ai_ready'), 'ok');
      if (area.isConnected) { area.focus(); }
    } catch (e) {
      const stopped = manuscriptStopRequested || e?.stopped || e?.name === 'AbortError' || !!controller.signal.aborted;
      if (ui.pending && ui.pending.messageId === reply.id) manuscriptRevertEdit(ui);
      reply.status = stopped ? 'cancelled' : 'error';
      if (!stopped) reply.error = e.message;
      assistantPrompt = promptText; ui.assistantPrompt = promptText;
      if (chatInput) chatInput.value = promptText;   // 失败时把要求放回输入框，直接重试
      state.ui.textLive?.paint?.();
      state.ui.textLive?.refreshChat?.();
      persistNow();
      if (stopped) {
        status(i18n.t('manuscript.ai_cancelled'), 'ok');
        toast(i18n.t('manuscript.ai_cancelled_toast'), 'ok');
      } else {
        status(i18n.t('manuscript.ai_failed'), 'err');
        toast(i18n.t('manuscript.ai_failed_reason', { reason: e.message }), 'err');
      }
    } finally {
      if (manuscriptRun && manuscriptRun.messageId === reply.id) manuscriptRun = null;
      manuscriptStopRequested = false;
      setRunningUi();
      state.ui.textLive?.runUi?.();
    }
  };

  const assistantPanel = () => {
    const panel = h('aside', { class: 'manuscript-agent', 'aria-label': i18n.t('manuscript.ai_panel_title') });
    const running = !!manuscriptRun;
    panel.appendChild(h('header', { class: 'manuscript-agent-head' },
      h('div', { class: 'manuscript-agent-title' },
        h('h2', { text: i18n.t('manuscript.ai_panel_title') }),
        h('span', { class: 'small muted', text: i18n.t('manuscript.ai_panel_subtitle') })),
      h('button', {
        class: 'agent-mode agent-mode-compact', type: 'button',
        title: mode ? (mode.desc || mode.label) : i18n.t('manuscript.ai_mode_picker'),
        'aria-haspopup': 'dialog', onclick: openProcessModePicker
      }, h('span', { text: mode ? (mode.label || mode.id) : i18n.t('manuscript.ai_mode_picker') }),
        h('span', { class: 'agent-mode-caret', 'aria-hidden': 'true', text: '▾' })),
      h('button', {
        class: 'manuscript-agent-close', text: '×', title: i18n.t('common.close'),
        'aria-label': i18n.t('common.close'),
        onclick: () => { ui.assistant = false; writeDraft(); touch('state', true); renderMain(); }
      })));
    refreshChat();
    panel.appendChild(feed);
    chatInput = h('textarea', {
      rows: 2, class: 'manuscript-agent-input', value: assistantPrompt,
      'aria-label': i18n.t('manuscript.ai_prompt_label'),
      placeholder: i18n.t('manuscript.ai_placeholder'),
      oninput: e => { assistantPrompt = e.target.value; ui.assistantPrompt = assistantPrompt; },
      onkeydown: e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
          e.preventDefault(); runManuscriptEdit();
        }
      }
    });
    const input = chatInput;
    const scope = () => {
      const range = manuscriptEditRange(ui);
      return scopeText(range.scope, range.text.length);
    };
    const scopeNode = h('span', { class: 'small muted manuscript-agent-scope', text: scope() });
    area.addEventListener('keyup', () => { scopeNode.textContent = scope(); });
    area.addEventListener('mouseup', () => { scopeNode.textContent = scope(); });
    const menu = aiModelEffortMenu({
      model: () => ui.model || defaultModelName(),
      setModel: name => { ui.model = name; writeDraft(); touch('state', true); },
      effort: assistantEffort,
      setEffort: name => { ui.effort = name; writeDraft(); touch('state', true); }
    });
    sendBtn = h('button', {
      class: 'primary agent-send', text: i18n.t('manuscript.ai_send'),
      title: 'Ctrl+Enter', hidden: running, onclick: runManuscriptEdit
    });
    stopBtn = h('button', {
      class: 'agent-send agent-stop', text: i18n.t('workstation.stop'),
      hidden: !running, onclick: stopManuscriptEdit
    });
    panel.appendChild(h('div', { class: 'manuscript-agent-compose' },
      input,
      h('div', { class: 'manuscript-agent-tools' },
        scopeNode, h('span', { class: 'spacer' }), menu, sendBtn, stopBtn),
      h('div', { class: 'small muted manuscript-agent-hint', text: i18n.t('manuscript.ai_hint') })));
    return panel;
  };

  // ── 页面 ─────────────────────────────────
  main.appendChild(pageHead(i18n.t('nav.text'), i18n.t('manuscript.page_desc')));
  main.appendChild(chapterBar());

  const processSelection = h('input', {type:'checkbox', checked:true});
  const cleanTools = h('details', {class:'manuscript-process-tools'});
  cleanTools.appendChild(h('summary', {text:i18n.t('manuscript.process_tools')}));
  cleanTools.appendChild(h('div', {class:'process-tools-body'},
    h('label', {class:'check small'}, processSelection, i18n.t('manuscript.selection_scope')),
    h('div', {class:'inline process-tools-actions'},
      h('button', {class:'mini', text:i18n.t('manuscript.find_replace'), onclick:openFindReplace}),
      ops.map(([label, fn]) => h('button', {class:'mini', text:label, onclick:() => transformText(fn)})))));
  const undoBtn = h('button', {text:i18n.t('manuscript.undo'), title:'Ctrl+Z', onclick:() => undoEdit()});
  const redoBtn = h('button', {text:i18n.t('manuscript.redo'), title:'Ctrl+Shift+Z', onclick:() => undoEdit(true)});
  refreshUndoState = () => { undoBtn.disabled = !ui.undo.length; redoBtn.disabled = !ui.redo.length; };
  refreshUndoState();
  const toolbar = h('div', {class:'manuscript-toolbar'},
    h('button', {
      class: 'primary manuscript-ai-toggle' + (ui.assistant ? ' on' : ''),
      text: i18n.t('manuscript.ai_assist'), 'aria-pressed': String(!!ui.assistant),
      onclick: () => {
        ui.assistant = !ui.assistant;
        writeDraft(); touch('state', true);
        renderMain();
        if (ui.assistant && typeof document.querySelector === 'function') {
          requestAnimationFrame(() => document.querySelector('.manuscript-agent-input')?.focus());
        }
      }
    }),
    undoBtn,
    redoBtn,
    h('span', {class:'toolbar-sep'}),
    h('button', {text:i18n.t('common.save'), onclick:saveLocal}),
    h('button', {text:i18n.t('manuscript.export_txt_btn'), onclick:() => exportAs(ui.value)}),
    h('button', {text:i18n.t('manuscript.to_chapter'), onclick:importToChapter}));
  const workspace = h('div', { class: 'manuscript-workspace' + (ui.assistant ? '' : ' assistant-off') },
    h('div', { class: 'manuscript-main' }, editBar, editBox),
    ui.assistant ? assistantPanel() : null);
  const panel = h('div', {class:'card manuscript-editor-panel'},
    toolbar, cleanTools, h('div', {class:'manuscript-document-name'}, pathHint), workspace, statLine);
  main.appendChild(panel);

  area.scrollTop = ui.scrollTop || 0;
  refreshHint();
  updateStat();
  updateEditBar();
  buildLayer();
  if (ui.dirty && ui.path) scheduleFileSave();   // 上次没写完的，回到本页就补上

  // 高亮层要跟正文完全重合：滚动、输入和窗口尺寸变化都重新对齐。
  if (typeof ResizeObserver !== 'undefined' && area.parentElement) {
    const observer = new ResizeObserver(() => syncLayer());
    observer.observe(area);
    state.ui.textObserver = observer;
  }

  // 生成期间：禁用全部控件，并盖一层全屏锁（模型/设定生成等会用到）。
  if (state.ui.busy) {
    main.querySelectorAll('input, textarea, select, button').forEach(el => { el.disabled = true; });
    main.appendChild(h('div', { class: 'work-lock' },
      h('div', { class: 'work-lock-box' },
        h('div', { class: 'spinner' }),
        h('strong', { text: i18n.t('manuscript.lock_title') }),
        h('div', { class: 'small muted', text: i18n.t('manuscript.lock_hint') }))));
  }

  // 切到别的栏目时（go()）把草稿和文件都立刻落盘
  state.ui.leave = { view: 'text', fn: () => {
    if (state.ui.textObserver) { state.ui.textObserver.disconnect(); state.ui.textObserver = null; }
    return flushNow();
  } };

  // 从 AI 工作站点「前往稿件处理」进来：直接打开那一章。
  const pendingChapter = state.ui.pendingChapter;
  if (pendingChapter && pendingChapter.novel === state.activeNovelId) {
    state.ui.pendingChapter = null;
    loadChapter(pendingChapter.rel, pendingChapter.name);
  }
}

// ═══════════════════════════════════════════
// 导出 / 打开文件（沿用原文本面板的工具）
// ═══════════════════════════════════════════
function exportAs(content) {
  let cwd = state.paths.export || '';
  const pathInput = h('input', { type: 'text', value: cwd });
  const nameInput = h('input', { type: 'text', placeholder: i18n.t('manuscript.filename_placeholder'), value: i18n.t('defaults.text.draft_prefix') + new Date().toISOString().slice(0, 10) + '.txt' });
  const encSel = h('select', null, [
    ['utf-8', i18n.t('manuscript.enc_utf8')], ['utf-8-sig', i18n.t('manuscript.enc_utf8_bom')], ['gbk', i18n.t('manuscript.enc_gbk')]
  ].map(([v, l]) => h('option', { value: v, text: l })));
  const dirList = h('div', { class: 'list scroll', style: { maxHeight: '240px' } });

  const load = async (path) => {
    try {
      const r = await api('/api/io/browse?path=' + encodeURIComponent(path || ''));
      cwd = r.path;
      pathInput.value = r.path;
      clear(dirList);
      if (r.parent) dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(r.parent) }, h('div', { class: 'name', text: i18n.t('manuscript.up_level') })));
      if (r.shortcut) dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(r.shortcut.path) }, h('div', { class: 'name', text: '🏠 ' + r.shortcut.name })));
      (r.dirs || []).forEach(d => dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(d.path) }, h('div', { class: 'name', text: '📁 ' + d.name }))));
      (r.files || []).forEach(f => dirList.appendChild(h('div', { class: 'list-item' }, h('div', { class: 'name muted', text: f.name }), h('div', { class: 'meta', text: (f.size / 1024).toFixed(1) + 'KB' }))));
    } catch (e) { toast(i18n.t('manuscript.access_failed_reason', { reason: e.message }), 'err'); }
  };

  const body = h('div', null,
    h('div', { class: 'field' }, h('label', { text: i18n.t('manuscript.dir_label') }), pathInput),
    dirList,
    h('div', { class: 'inline', style: { marginTop: '10px' } },
      h('div', { class: 'field', style: { flex: '1' } }, h('label', { text: i18n.t('common.filename') }), nameInput),
      h('div', { class: 'field' }, h('label', { text: i18n.t('manuscript.encoding') }), encSel)));

  const m = modal(i18n.t('manuscript.export_txt'), body, [
    h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() }),
    h('button', {
      class: 'primary', text: i18n.t('common.export'), dataset: { noclose: '1' },
      onclick: async () => {
        let dir = pathInput.value.trim();
        let name = nameInput.value.trim() || 'untitled.txt';
        if (!/\.(txt|md)$/i.test(name)) name += '.txt';
        const full = dir.replace(/[\\/]+$/, '') + '/' + name;
        try {
          const request={path:full,content,encoding:encSel.value};
          let res=await api('/api/io/export',{method:'POST',body:request});
          if(res.exists){
            confirmDialog(i18n.t('common.export'),i18n.t('records.overwrite_confirm',{path:res.path}),async()=>{
              try{
                res=await api('/api/io/export',{method:'POST',body:{...request,overwrite:true}});
                toast(i18n.t('common.exported_to',{path:res.path}),'ok');m.close();
              }catch(error){toast(error.message,'err');}
            });
            return;
          }
          toast(i18n.t('manuscript.exported_size', { path: res.path, size: (res.size / 1024).toFixed(1) }), 'ok');
          m.close();
        } catch (e) { toast(i18n.t('common.export_failed_reason', { reason: e.message }), 'err'); }
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
      if (r.parent) dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(r.parent) }, h('div', { class: 'name', text: i18n.t('manuscript.up_level') })));
      if (r.shortcut) dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(r.shortcut.path) }, h('div', { class: 'name', text: '🏠 ' + r.shortcut.name })));
      (r.dirs || []).forEach(d => dirList.appendChild(h('div', { class: 'list-item', onclick: () => load(d.path) }, h('div', { class: 'name', text: '📁 ' + d.name }))));
      (r.files || []).forEach(f => dirList.appendChild(h('div', {
        class: 'list-item',
        onclick: () => { m.close(); onPick(f.path); }
      }, h('div', { class: 'name', text: '📄 ' + f.name }), h('div', { class: 'meta', text: (f.size / 1024).toFixed(1) + 'KB' }))));
    } catch (e) { toast(i18n.t('manuscript.access_failed_reason', { reason: e.message }), 'err'); }
  };
  const m = modal(i18n.t('manuscript.open_file'), h('div', null,
    h('div', { class: 'field' }, h('label', { text: i18n.t('manuscript.current_dir') }), pathInput),
    dirList), [h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() })]);
  load(cwd);
}
