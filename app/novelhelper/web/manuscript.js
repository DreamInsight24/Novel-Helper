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

/* NovelHelper —— 稿件处理（大文本工作区 + AI 辅助） */
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

// Map the pointer to a text offset using a temporary, identically laid-out mirror.
function manuscriptDropPosition(area, x, y) {
  const rect = area.getBoundingClientRect();
  const style = getComputedStyle(area);
  const mirror = document.createElement('div');
  for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
    'borderBottomWidth', 'borderLeftWidth', 'wordSpacing', 'tabSize', 'textIndent', 'textAlign']) mirror.style[key] = style[key];
  Object.assign(mirror.style, {position:'fixed', left:rect.left+'px', top:rect.top+'px', width:rect.width+'px',
    height:rect.height+'px', boxSizing:'border-box', borderStyle:'solid', overflow:style.overflow,
    whiteSpace:'pre-wrap', overflowWrap:'break-word', opacity:'0', zIndex:'2147483646', pointerEvents:'auto'});
  mirror.textContent = area.value + '\u200b';
  document.body.appendChild(mirror);
  mirror.scrollTop = area.scrollTop; mirror.scrollLeft = area.scrollLeft;
  try {
    let node, offset;
    if (document.caretPositionFromPoint) {
      const caret = document.caretPositionFromPoint(x, y); node = caret?.offsetNode; offset = caret?.offset;
    } else {
      const caret = document.caretRangeFromPoint(x, y); node = caret?.startContainer; offset = caret?.startOffset;
    }
    if (!node || !mirror.contains(node)) return {index:area.selectionStart};
    const before = document.createRange(); before.selectNodeContents(mirror); before.setEnd(node, offset);
    const index = Math.min(area.value.length, before.toString().length);
    const caret = document.createRange(); caret.setStart(node, offset); caret.collapse(true);
    let caretRect = caret.getBoundingClientRect();
    if (!caretRect.height && node.nodeType === 3 && offset < node.length) {
      caret.setEnd(node, offset + 1); caretRect = caret.getBoundingClientRect();
    }
    return {index, x:caretRect.left, y:caretRect.top, height:caretRect.height || parseFloat(style.lineHeight)};
  } finally { mirror.remove(); }
}

function manuscriptConfirm(message) {
  return new Promise(resolve => {
    const dialog = modal(i18n.t('common.confirm'), h('div', {text:message}), [
      h('button', {text:i18n.t('common.cancel'), onclick:() => dialog.close()}),
      h('button', {class:'primary', text:i18n.t('common.confirm'), onclick:() => {resolve(true); dialog.close();}})
    ], () => resolve(false));
  });
}

function manuscriptInsertedText(value, content, index) {
  index = Math.max(0, Math.min(value.length, index));
  return {value:value.slice(0, index) + content + value.slice(index), cursor:index + content.length};
}

// ═══════════════════════════════════════════
// 稿件处理页
//
// 内容不会「切走就没了」：
//   · 输入先落进内存草稿 → 切到别的栏目再回来，原样还在；
//   · 停手 0.5 秒把草稿写进 data/state.json → 刷新浏览器 / 重开页面也还在；
//   · 绑定到具体文件后，停手 1.5 秒自动写盘 → 不必再点「保存」；
//   · AI 处理结果也保存在 state.textPanel.aiResult，刷新后仍可继续编辑/应用；
//   · 离开本页时把草稿和文件都立刻落盘。
// ═══════════════════════════════════════════
function viewManuscript(main) {
  const draftSlot = () => {
    const s = state.db.state = state.db.state || {};
    return s.textPanel = s.textPanel || {};
  };
  if (!state.ui.text || state.ui.text.novelId !== state.activeNovelId) {
    const saved = draftSlot();
    state.ui.text = {
      novelId: state.activeNovelId,
      materials: saved.materials || [],
      materialFolders: saved.materialFolders || [],
      materialFolder: '',
      undo: [], redo: [],
      selectionStart: 0, selectionEnd: 0,
      path: saved.path || '',
      value: saved.value || '',
      dirty: !!saved.dirty,
      scrollTop: saved.scrollTop || 0,
      aiResult: saved.aiResult ? JSON.parse(JSON.stringify(saved.aiResult)) : null
    };
  }
  const ui = state.ui.text;
  ui.materialFolders = ui.materialFolders || [];
  ui.materialHistory = ui.materialHistory || [ui.materialFolder || ''];
  ui.materialHistoryIndex = ui.materialHistoryIndex || 0;
  if (!ui.materialFolders.some(folder => folder.id === ui.materialFolder)) ui.materialFolder = '';
  if (!draftSlot().materialsInitialized) {
    const examples = [1, 2, 3].map(n => ({id:'sample_' + n, title:i18n.t('manuscript.sample_' + n + '_title'),
      content:i18n.t('manuscript.sample_' + n + '_content'), source:'sample'}));
    ui.materials.push(...examples);
    draftSlot().materials = ui.materials;
    draftSlot().materialsInitialized = true;
    touch('state', true);
  }

  // 服务端保存的结果（比如生成中刷新、另一个标签页完成）优先于旧的内存结果。
  const savedAi = draftSlot().aiResult || null;
  if (savedAi && (!ui.aiResult || ui.aiResult.id !== savedAi.id)) {
    ui.aiResult = JSON.parse(JSON.stringify(savedAi));
  }

  const DRAFT_DELAY = 500;    // 草稿写盘防抖
  const FILE_DELAY = 1500;    // 文件自动保存防抖
  const DRAFT_MAX = 1500000;  // 草稿体积上限：再大就不往 state.json 里塞（文件自动保存照常）
  let draftTimer = null, fileTimer = null, fileSaving = false, filePending = false;
  const tooBig = () => ui.value.length > DRAFT_MAX;

  // ── 草稿：内容 + 当前文件名 + AI 结果一起存进 data/state.json ──
  const writeDraft = () => {
    const d = draftSlot();
    d.materials = ui.materials;
    d.materialFolders = ui.materialFolders;
    d.path = ui.path;
    d.value = tooBig() && ui.path ? '' : ui.value;      // 超大文本只留文件名，靠文件自动保存兜底
    d.skipped = tooBig() && !!ui.path;
    d.dirty = !!ui.dirty;
    d.scrollTop = ui.scrollTop || 0;
    if (ui.aiResult) d.aiResult = ui.aiResult;
    else delete d.aiResult;
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

  const area = h('textarea', {
    rows: 18, class: 'notepad manuscript-area', placeholder: i18n.t('manuscript.composer_placeholder'),
    value: ui.value,
    'aria-label': i18n.t('manuscript.editor_label'),
    onbeforeinput: () => rememberSelection(),
    oninput: () => setText(area.value),
    onselect: () => rememberSelection(), onclick: () => rememberSelection(), onkeyup: () => rememberSelection(),
    onkeydown: e => {
      if ((e.ctrlKey || e.metaKey) && !e.isComposing && ['z', 'y'].includes(e.key.toLowerCase())) {
        e.preventDefault(); undoEdit(e.key.toLowerCase() === 'y' || e.shiftKey);
      }
    },
    ondragover: e => {
      if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; return; }
      if (!Array.from(e.dataTransfer.types).includes('application/x-novelhelper-material')) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
      const bounds = area.getBoundingClientRect();
      if (e.clientY < bounds.top + 32) area.scrollTop -= 20;
      else if (e.clientY > bounds.bottom - 32) area.scrollTop += 20;
      const pos = manuscriptDropPosition(area, e.clientX, e.clientY);
      if (pos.height) {
        if (!dropCaret.isConnected) document.body.appendChild(dropCaret);
        Object.assign(dropCaret.style, {left:pos.x+'px', top:pos.y+'px', height:pos.height+'px'});
      }
      area.classList.add('material-drop-active');
    },
    ondragleave: () => clearDrop(),
    ondrop: e => {
      if (e.dataTransfer.files.length) { e.preventDefault(); clearDrop(); importFiles(Array.from(e.dataTransfer.files)); return; }
      const id = e.dataTransfer.getData('application/x-novelhelper-material');
      const material = ui.materials.find(item => item.id === id);
      if (!material) return;
      e.preventDefault();
      const pos = manuscriptDropPosition(area, e.clientX, e.clientY); clearDrop();
      insertMaterial(material, pos.index);
    },
    onscroll: () => { ui.scrollTop = area.scrollTop; }
  });
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

  const rememberSelection = () => { ui.selectionStart = area.selectionStart; ui.selectionEnd = area.selectionEnd; };
  const snapshot = () => ({value:ui.value, start:ui.selectionStart || 0, end:ui.selectionEnd || 0});
  const setText = (value, record = true) => {
    if (record && value !== ui.value) {
      ui.undo.push(snapshot()); ui.redo = [];
      while (ui.undo.length > 50 || (ui.undo.length > 1 && ui.undo.reduce((n, entry) => n + entry.value.length, 0) > 4000000)) ui.undo.shift();
    }
    if (area.value !== value) area.value = value;
    ui.value = value; ui.dirty = true;
    scheduleDraft(); scheduleFileSave(); updateStat();
  };
  const undoEdit = (redo = false) => {
    const from = redo ? ui.redo : ui.undo, to = redo ? ui.undo : ui.redo;
    if (!from.length) return;
    to.push(snapshot()); const entry = from.pop();
    setText(entry.value, false); area.focus(); area.setSelectionRange(entry.start, entry.end); rememberSelection();
  };
  const insertMaterial = (material, index = ui.selectionStart || 0) => {
    const result = manuscriptInsertedText(ui.value, material.content, index);
    setText(result.value); area.focus(); area.setSelectionRange(result.cursor, result.cursor); rememberSelection();
  };
  const dropCaret = h('div', {class:'manuscript-drop-caret', 'aria-hidden':'true'});
  const clearDrop = () => { dropCaret.remove(); area.classList.remove('material-drop-active'); };

  // 离开本页 / 切栏目时：草稿与文件都立刻落盘
  const flushNow = () => {
    clearDrop();
    clearTimeout(draftTimer);
    clearTimeout(fileTimer);
    const done = async () => { writeDraft(); await saveNow('state'); };
    if (ui.path && ui.dirty) return autosaveFile().then(done, done);   // 先落文件，草稿再记录真实状态
    return done();
  };

  const keepAiResult = async () => {
    if (!ui.aiResult) return true;
    if (!await manuscriptConfirm(i18n.t('manuscript.ai_result_warning'))) return false;
    ui.aiResult = null;
    return true;
  };

  const saveLocal = async () => {
    clearTimeout(fileTimer);
    if (!ui.path) {
      askDialog(i18n.t('common.save'), i18n.t('common.filename'),
        i18n.t('defaults.text.draft_prefix') + new Date().toISOString().slice(0, 10) + '.txt', async value => {
          let name = value.trim();
          if (!name) return;
          if (!/\.(txt|md)$/i.test(name)) name += '.txt';
          const folder = (state.paths.text || 'workspace/text').replace(/[\\/]+$/, '');
          ui.path = folder + '/' + name.replace(/[\\/]/g, '_');
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

  // ── 新建 / 打开 / 导入 ────────────────────
  const newText = async () => {
    if (ui.dirty) {
      if (ui.path) await flushFile();
      else if (!await manuscriptConfirm(i18n.t('manuscript.unsaved_clear'))) return;
    }
    if (!await keepAiResult()) return;
    clearTimeout(fileTimer); clearTimeout(draftTimer);
    ui.path = ''; ui.value = ''; ui.dirty = false; ui.scrollTop = 0; ui.undo = []; ui.redo = []; ui.selectionStart = 0; ui.selectionEnd = 0;
    writeDraft();
    saveNow('state').catch(() => { });
    renderMain();
    toast(i18n.t('manuscript.cleared'), 'ok');
  };

  const addMaterial = (content, title, source = 'file') => {
    const material = {id:newId('material'), title, content, source, folderId:ui.materialFolder || '', created:new Date().toISOString()};
    ui.materials.push(material); writeDraft(); touch('state', true); renderMaterials();
    return material;
  };
  const importPath = async (path, source = 'chapter') => {
    const novel = state.activeNovelId;
    try {
      const result = await api('/api/file?path=' + encodeURIComponent(path));
      if (novel !== state.activeNovelId) return;
      addMaterial(result.content, manuscriptShortName(path), source);
    } catch (e) { toast(i18n.t('records.import_failed_reason', {reason:e.message}), 'err'); }
  };
  const pickChapter = () => {
    const opts = (state.chapters || []).filter(c => /\.(md|txt)$/i.test(c.path))
      .map(c => ({value:c.path, label:c.name, meta:c.dir}));
    if (!opts.length) { toast(i18n.t('manuscript.no_outputs'), 'err'); return; }
    pickDialog(i18n.t('manuscript.import_chapter'), opts, path => importPath(path));
  };
  const importFiles = async files => {
    const novel = state.activeNovelId;
    for (const file of files) {
      if (!/\.(txt|md)$/i.test(file.name)) { toast(i18n.t('manuscript.text_files_only'), 'err'); continue; }
      if (file.size > 8 * 1024 * 1024) { toast(i18n.t('manuscript.file_too_large'), 'err'); continue; }
      try {
        const bytes = await file.arrayBuffer();
        let content;
        try { content = new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
        catch (e) { content = new TextDecoder('gb18030').decode(bytes); }
        if (novel !== state.activeNovelId) return;
        addMaterial(content, file.name);
      } catch (e) { toast(e.message, 'err'); }
    }
  };
  const fileInput = h('input', {type:'file', accept:'.txt,.md,text/plain,text/markdown', multiple:true, hidden:true,
    onchange: async e => { await importFiles(Array.from(e.target.files || [])); e.target.value = ''; }});

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

  // ── 导出 / 转存到记忆库 ───────────────────
  const openSaveToMemoryDialog = (content, opts) => {
    opts = opts || {};
    const coll = state.db.memories = state.db.memories || { items: [], categories: [] };
    coll.items = coll.items || [];
    coll.categories = (coll.categories && coll.categories.length) ? coll.categories : [i18n.t('defaults.memory.short')];
    const titleInput = h('input', { type: 'text', value: opts.title || '' });
    const catSelect = h('select', null, coll.categories.map(c => h('option', {
      value: c, text: c, selected: c === (opts.category || coll.categories[0])
    })));
    const chapInput = h('input', { type: 'text', value: opts.chapter || '' });
    const contentArea = h('textarea', { rows: 14, value: String(content || '') });
    const body = h('div', null,
      h('div', { class: 'field' }, h('label', { text: i18n.t('common.title') }), titleInput),
      h('div', { class: 'inline' },
        h('div', { class: 'field', style: { flex: '1' } }, h('label', { text: i18n.t('memories.category_label') }), catSelect),
        h('div', { class: 'field', style: { flex: '1' } }, h('label', { text: i18n.t('memories.chapter_label') }), chapInput)),
      h('div', { class: 'field' }, h('label', { text: i18n.t('manuscript.memory_content_label') }), contentArea),
      h('div', { class: 'small muted', text: opts.source ? i18n.t('common.source_prefix', { source: opts.source }) : '' }));
    const m = modal(i18n.t('manuscript.export_memory'), body, [
      h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() }),
      h('button', {
        class: 'primary', text: i18n.t('manuscript.save_to_memory'), dataset: { noclose: '1' },
        onclick: () => {
          const value = contentArea.value;
          if (!value.trim()) { toast(i18n.t('manuscript.empty_not_saved'), 'err'); return; }
          const stamp = nowStr();
          coll.items.unshift({
            id: newId('mm'),
            title: titleInput.value.trim() || opts.title || i18n.t('defaults.memory.import_title'),
            category: catSelect.value || coll.categories[0],
            chapter: chapInput.value.trim(),
            content: value,
            source: opts.source || i18n.t('defaults.source.manuscript'),
            tags: [], created: stamp, updated: stamp
          });
          touch('memories');
          renderNav();
          m.close();
          toast(i18n.t('manuscript.saved_to_memory'), 'ok');
        }
      })
    ]);
  };

  const importToChapter = () => {
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

  // ── AI 辅助 ──────────────────────────────
  const runManuscriptProcess = async (mode, instruction) => {
    if (state.ui.busy) return;
    const source = ui.value;
    if (!source.trim()) { toast(i18n.t('manuscript.nothing_process'), 'err'); return; }
    state.ui.busy = true;
    renderMain();
    status(i18n.t('common.processing'), 'busy');
    try {
      clearTimeout(draftTimer);
      writeDraft();
      clearTimeout(fileTimer);
      if (ui.path && ui.dirty) await flushFile();
      await saveNow('state').catch(() => { });

      const res = await api('/api/workstation/run', {
        method: 'POST',
        body: {
          surface: 'manuscript',
          mode_id: mode.id,
          prompt: instruction || '',
          source_text: source,
          config: state.db.config
        }
      });

      state.ui.busy = false;
      state.ui.lastMeta = res;
      try {
        await refreshFiles();
        const saved = draftSlot().aiResult || null;
        if (saved) ui.aiResult = JSON.parse(JSON.stringify(saved));
        else if (res.ai_result) ui.aiResult = res.ai_result;
        else {
          ui.aiResult = {
            id: 'local_' + Date.now(),
            text: res.clean_text || res.text || '',
            mode: res.mode_id || mode.id,
            mode_label: res.mode_label || mode.label || mode.id,
            created: nowStr(),
            meta: res.usage ? { usage: res.usage } : {}
          };
        }
        writeDraft();
        await saveNow('state').catch(() => { });
      } catch (e) {
        ui.aiResult = res.ai_result || ui.aiResult;
        writeDraft();
        await saveNow('state').catch(() => { });
      }

      state.ui.scrollToAiResult = true;
      if (state.view === 'text' || state.view === 'writer') renderMain();
      status(i18n.t('manuscript.process_done'), 'ok');
      toast(i18n.t('manuscript.process_done_hint'), 'ok');
    } catch (e) {
      state.ui.busy = false;
      if (state.view === 'text' || state.view === 'writer') renderMain();
      status(i18n.t('manuscript.process_failed'), 'err');
      toast(i18n.t('manuscript.process_failed_reason', { reason: e.message }), 'err');
    }
  };

  const openAiAssist = () => {
    if (state.ui.busy) { toast(i18n.t('manuscript.busy'), 'err'); return; }
    if (!ui.value.trim()) { toast(i18n.t('manuscript.nothing_process'), 'err'); return; }
    const modes = processModes();
    if (!modes.length) {
      const body = h('div', null,
        h('div', { class: 'small muted', text: i18n.t('manuscript.no_mode') }));
      const emptyModal = modal(i18n.t('manuscript.ai_title'), body, [
        h('button', { text: i18n.t('common.close'), onclick: () => emptyModal.close() }),
        h('button', {
          class: 'primary', text: i18n.t('workstation.go_modes'),
          onclick: () => {
            emptyModal.close();
            state.ui.modes = { kind: 'process', sel: '' };
            go('modes');
          }
        })
      ]);
      return;
    }

    const body = h('div');
    const m = modal(i18n.t('manuscript.ai_title'), body, [h('button', { text: i18n.t('common.close'), onclick: () => m.close() })]);

    const drawPicker = () => {
      clear(body);
      body.appendChild(h('div', { class: 'ai-question', text: i18n.t('manuscript.ai_question') }));
      body.appendChild(h('div', { class: 'small muted', style: { marginBottom: '12px' } },
        i18n.t('manuscript.ai_scope', { count: ui.value.length })));
      body.appendChild(h('div', { class: 'ai-mode-list' }, modes.map(mode => {
        const api = (state.db.config || {}).api || {};
        return h('div', { class: 'ai-mode-card', onclick: () => drawInstruction(mode) },
          h('div', { class: 'ai-mode-name', text: mode.label || mode.id }),
          h('div', { class: 'small muted', text: mode.desc || '' }),
          h('div', { class: 'small muted', style: { marginTop: '4px' } },
            i18n.t('manuscript.meta_line', { model: mode.model || api.default_model || i18n.t('workstation.follow_default'), effort: mode.effort || api.default_effort || 'medium' })));
      })));
    };

    const drawInstruction = (mode) => {
      clear(body);
      body.appendChild(h('div', { class: 'inline', style: { marginBottom: '8px' } },
        h('button', { class: 'mini', text: i18n.t('manuscript.try_another'), onclick: drawPicker }),
        h('span', { class: 'tag mode-tag', text: mode.label || mode.id })));
      body.appendChild(h('div', { class: 'mode-desc', text: mode.desc || '' }));
      const req = h('textarea', {
        rows: 6, placeholder: i18n.t('manuscript.req_placeholder')
      });
      body.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } },
        h('label', { text: i18n.t('manuscript.req_label') }), req));
      body.appendChild(h('div', { class: 'small muted' },
        i18n.t('manuscript.req_hint')));
      body.appendChild(h('div', { class: 'inline', style: { marginTop: '12px' } },
        h('button', {
          class: 'primary', text: i18n.t('manuscript.start'),
          onclick: () => { m.close(); runManuscriptProcess(mode, req.value); }
        }),
        h('button', { text: i18n.t('common.cancel'), onclick: () => m.close() })));
    };

    drawPicker();
  };

  // ── AI 结果卡片 ──────────────────────────
  const aiResultCard = () => {
    const ai = ui.aiResult;
    const resultArea = h('textarea', {
      rows: 14, class: 'notepad ai-result-area',
      value: ai.text || '',
      placeholder: i18n.t('manuscript.result_placeholder'),
      oninput: e => {
        ui.aiResult.text = e.target.value;
        updateAiStat();
        scheduleDraft();
      }
    });
    const aiStat = h('div', { class: 'small muted' });
    const updateAiStat = () => {
      const original = (ai.source_chars != null ? ai.source_chars : ui.value.length);
      aiStat.textContent = i18n.t('manuscript.result_stat', { before: original, after: (ui.aiResult.text || '').length });
    };
    updateAiStat();

    const meta = ai.meta || {};
    const info = [
      ai.created || '',
      meta.model ? i18n.t('manuscript.meta_model', { model: meta.model }) : '',
      meta.elapsed != null ? i18n.t('manuscript.meta_elapsed', { elapsed: meta.elapsed }) : '',
      meta.usage && meta.usage.total_tokens ? 'tokens ' + meta.usage.total_tokens : ''
    ].filter(Boolean).join(' · ');

    const card = h('div', { class: 'card ai-result-card' });
    card.appendChild(h('h2', null, i18n.t('manuscript.result_title'),
      h('span', { class: 'tag mode-tag', text: ai.mode_label || manuscriptModeLabel(ai.mode) }),
      h('span', { class: 'hint', text: i18n.t('manuscript.result_warning') })));
    if (info) card.appendChild(h('div', { class: 'small muted', style: { marginBottom: '8px' } }, info));
    card.appendChild(resultArea);
    card.appendChild(aiStat);
    card.appendChild(h('div', { class: 'output-actions' },
      h('button', {
        class: 'primary', text: i18n.t('manuscript.overwrite'),
        onclick: async () => {
          const content = ui.aiResult.text || '';
          if (!content.trim()) { toast(i18n.t('manuscript.result_empty'), 'err'); return; }
          if (!await manuscriptConfirm(i18n.t('manuscript.overwrite_confirm'))) return;
          setText(content);
          ui.aiResult = null;
          writeDraft();
          await saveNow('state').catch(() => { });
          renderMain();
          toast(ui.path ? i18n.t('manuscript.overwritten_file') : i18n.t('manuscript.overwritten_draft'), 'ok');
        }
      }),
      h('button', {
        text: i18n.t('manuscript.save_result_memory'),
        onclick: () => {
          const aiNow = ui.aiResult;
          if (!aiNow || !String(aiNow.text || '').trim()) { toast(i18n.t('manuscript.result_empty_save'), 'err'); return; }
          openSaveToMemoryDialog(aiNow.text, {
            title: (aiNow.mode_label || manuscriptModeLabel(aiNow.mode)) + ' · ' +
              manuscriptShortName(ui.path).replace(/\.(txt|md|json)$/i, ''),
            chapter: manuscriptShortName(ui.path),
            source: i18n.t('manuscript.source_ai', { mode: aiNow.mode_label || aiNow.mode || '' })
          });
        }
      }),
      h('button', {
        text: i18n.t('common.copy'),
        onclick: () => {
          const text = ui.aiResult.text || '';
          if (!text.trim()) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
              () => toast(i18n.t('common.copied'), 'ok'),
              () => fallbackCopy(text));
          } else fallbackCopy(text);
        }
      }),
      h('span', { style: { flex: '1' } }),
      h('button', {
        class: 'danger', text: i18n.t('manuscript.delete_result'),
        onclick: async () => {
          if (!await manuscriptConfirm(i18n.t('manuscript.delete_result_confirm'))) return;
          ui.aiResult = null;
          writeDraft();
          saveNow('state').catch(() => { });
          renderMain();
          toast(i18n.t('manuscript.result_deleted'), 'ok');
        }
      })));
    return card;
  };

  // ── 页面 ─────────────────────────────────
  main.appendChild(pageHead(i18n.t('nav.text'), '',
    h('div', {class:'inline'}, h('button', {text:i18n.t('manuscript.import_files'), title:'TXT / MD', onclick:() => fileInput.click()}),
      h('button', {text:i18n.t('manuscript.import_chapter'), onclick:pickChapter}))));
  main.appendChild(fileInput);
  const shelf = h('section', {class:'material-shelf', 'aria-label':i18n.t('manuscript.materials'),
    ondragover:e => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); shelf.classList.add('material-drop-active'); } },
    ondragleave:() => shelf.classList.remove('material-drop-active'),
    ondrop:e => { if (e.dataTransfer.files.length) { e.preventDefault(); shelf.classList.remove('material-drop-active'); importFiles(Array.from(e.dataTransfer.files)); } }
  });
  const renderMaterials = () => {
    clear(shelf);
    const persistMaterials = () => { writeDraft(); touch('state', true); renderMaterials(); };
    const moveMaterial = (id, folderId) => {
      const material = ui.materials.find(item => item.id === id);
      if (material) { material.folderId = folderId; persistMaterials(); }
    };
    const navigateFolder = id => {
      if (id === ui.materialFolder) return;
      ui.materialHistory = ui.materialHistory.slice(0, ui.materialHistoryIndex + 1);
      ui.materialHistory.push(id); ui.materialHistoryIndex++; ui.materialFolder=id; renderMaterials();
    };
    const traverseFolder = step => {
      ui.materialHistoryIndex += step; ui.materialFolder=ui.materialHistory[ui.materialHistoryIndex]; renderMaterials();
    };
    const newFolder = () => askDialog(i18n.t('manuscript.new_folder'), i18n.t('common.name'), '', name => {
      if (!name.trim()) return;
      ui.materialFolders.push({id:newId('folder'),name:name.trim()}); writeDraft(); touch('state', true);
      if (ui.materialFolder) navigateFolder(''); else renderMaterials();
    });
    const folder = ui.materialFolders.find(item => item.id === ui.materialFolder);
    const head = h('div', {class:'material-shelf-head'},
      h('div', {class:'inline material-navigation'},
        h('button', {class:'material-nav-arrow',text:'←', title:i18n.t('manuscript.folder_back'),
          'aria-label':i18n.t('manuscript.folder_back'),disabled:ui.materialHistoryIndex===0,onclick:()=>traverseFolder(-1)}),
        h('button', {class:'material-nav-arrow',text:'→', title:i18n.t('manuscript.folder_forward'),
          'aria-label':i18n.t('manuscript.folder_forward'),disabled:ui.materialHistoryIndex>=ui.materialHistory.length-1,onclick:()=>traverseFolder(1)}),
        h('span', {class:'small muted',text:folder ? folder.name : i18n.t('manuscript.materials_count',{count:ui.materials.length})})),
      h('button', {class:'mini material-new-folder',title:i18n.t('manuscript.new_folder'),
        'aria-label':i18n.t('manuscript.new_folder'),onclick:newFolder},
        h('span', {class:'blue-folder-icon','aria-hidden':'true'}),h('span', {class:'folder-plus','aria-hidden':'true',text:'+'})));
    shelf.appendChild(head);
    const cards = h('div', {class:'material-grid'});
    if (!folder) ui.materialFolders.forEach(item => {
      const count = ui.materials.filter(material => material.folderId === item.id).length;
      cards.appendChild(h('button', {class:'material-folder-card',
        'aria-label':i18n.t('manuscript.open_folder', {name:item.name}),
        onclick:() => navigateFolder(item.id),
        ondragover:e => {if(Array.from(e.dataTransfer.types).includes('application/x-novelhelper-material')) {
          e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';e.currentTarget.classList.add('material-drop-active');}},
        ondragleave:e => e.currentTarget.classList.remove('material-drop-active'),
        ondrop:e => {const id=e.dataTransfer.getData('application/x-novelhelper-material');if(id){e.preventDefault();e.stopPropagation();moveMaterial(id,item.id);}}},
        h('strong', {text:item.name}), h('span', {class:'small muted',text:i18n.t('manuscript.folder_count',{count})})));
    });
    const visibleMaterials=ui.materials.filter(material => (material.folderId || '') === (ui.materialFolder || ''));
    visibleMaterials.forEach(material => {
      const preview = () => {
        const body = h('div', {class:'material-preview-body'},
          h('div', {class:'small muted', text:i18n.t('manuscript.' + (material.source === 'ai' ? 'material_source_ai' : 'source_' + material.source))}),
          h('pre', {class:'material-preview-text', text:material.content}));
        const dialog = modal(material.title, body, [h('button', {text:i18n.t('common.close'), onclick:() => dialog.close()}),
          h('button', {class:'primary', text:i18n.t('manuscript.insert_cursor'), onclick:() => { dialog.close(); insertMaterial(material); }})]);
        dialog.dlg.classList.add('material-preview');
      };
      const card = h('article', {class:'material-card' + (material.source === 'sample' ? ' sample-material' : ''), draggable:'true',
        ondragstart:e => { e.dataTransfer.setData('application/x-novelhelper-material', material.id); e.dataTransfer.setData('text/plain', material.content); e.dataTransfer.effectAllowed = 'copyMove'; card.classList.add('dragging'); },
        ondragend:() => { card.classList.remove('dragging'); clearDrop(); }});
      card.appendChild(h('button', {class:'material-card-open', onclick:preview, 'aria-label':i18n.t('manuscript.preview_material', {title:material.title})},
        h('span', {class:'material-card-type', text:i18n.t('manuscript.' + (material.source === 'ai' ? 'material_source_ai' : 'source_' + material.source))}),
        h('strong', {class:'material-card-title', text:material.title}),
        h('span', {class:'material-card-excerpt', text:material.content.replace(/\s+/g, ' ').slice(0, 65)}),
        h('span', {class:'material-card-count', text:i18n.t('workstation.char_count', {count:material.content.length})})));
      card.appendChild(h('button', {class:'material-card-remove', text:'×', title:i18n.t('manuscript.remove_material'),
        'aria-label':i18n.t('manuscript.remove_material_title', {title:material.title}), onclick:() => {
          ui.materials = ui.materials.filter(item => item.id !== material.id); writeDraft(); touch('state', true); renderMaterials();
        }}));
      if (ui.materialFolders.length) card.appendChild(h('button', {class:'material-card-move',text:'↗',
        title:i18n.t('manuscript.move_material'), 'aria-label':i18n.t('manuscript.move_material_title',{title:material.title}),
        onclick:() => pickDialog(i18n.t('manuscript.move_material'),
          [{value:'',label:i18n.t('manuscript.all_materials')},...ui.materialFolders.map(item=>({value:item.id,label:item.name}))]
            .filter(item=>item.value !== (material.folderId || '')), folderId=>moveMaterial(material.id,folderId))}));
      cards.appendChild(card);
    });
    if (!visibleMaterials.length && (folder || !ui.materialFolders.length)) cards.appendChild(h('div', {class:'small muted material-empty', text:i18n.t('manuscript.materials_empty')}));
    shelf.appendChild(cards);
  };
  renderMaterials(); main.appendChild(shelf);

  const processSelection = h('input', {type:'checkbox', checked:true});
  const cleanTools = h('details', {class:'manuscript-process-tools'});
  cleanTools.appendChild(h('summary', {text:i18n.t('manuscript.process_tools')}));
  cleanTools.appendChild(h('div', {class:'process-tools-body'},
    h('label', {class:'check small'}, processSelection, i18n.t('manuscript.selection_scope')),
    h('div', {class:'inline process-tools-actions'},
      h('button', {class:'mini', text:i18n.t('manuscript.find_replace'), onclick:openFindReplace}),
      ops.map(([label, fn]) => h('button', {class:'mini', text:label, onclick:() => transformText(fn)})))));
  const toolbar = h('div', {class:'manuscript-toolbar'},
    h('button', {class:'primary', text:i18n.t('manuscript.ai_assist'), onclick:openAiAssist}),
    h('button', {text:i18n.t('manuscript.undo'), title:'Ctrl+Z', onclick:() => undoEdit()}),
    h('button', {text:i18n.t('manuscript.redo'), title:'Ctrl+Shift+Z', onclick:() => undoEdit(true)}),
    h('span', {class:'toolbar-sep'}),
    h('button', {text:i18n.t('common.save'), onclick:saveLocal}),
    h('button', {text:i18n.t('manuscript.export_txt_btn'), onclick:() => exportAs(ui.value)}),
    h('button', {text:i18n.t('manuscript.to_chapter'), onclick:importToChapter}));
  const panel = h('div', {class:'card manuscript-editor-panel'},
    toolbar, cleanTools, h('div', {class:'manuscript-document-name'}, pathHint), area, statLine);
  main.appendChild(panel);

  if (ui.aiResult) {
    const resultCard = aiResultCard();
    main.appendChild(resultCard);
    if (state.ui.scrollToAiResult) {
      state.ui.scrollToAiResult = false;
      requestAnimationFrame(() => resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  area.scrollTop = ui.scrollTop || 0;
  refreshHint();
  updateStat();
  if (ui.dirty && ui.path) scheduleFileSave();   // 上次没写完的，回到本页就补上

  // 生成期间：禁用全部控件，并盖一层全屏锁。
  if (state.ui.busy) {
    main.querySelectorAll('input, textarea, select, button').forEach(el => { el.disabled = true; });
    main.appendChild(h('div', { class: 'work-lock' },
      h('div', { class: 'work-lock-box' },
        h('div', { class: 'spinner' }),
        h('strong', { text: i18n.t('manuscript.lock_title') }),
        h('div', { class: 'small muted', text: i18n.t('manuscript.lock_hint') }))));
  }

  // 切到别的栏目时（go()）把草稿和文件都立刻落盘
  state.ui.leave = { view: 'text', fn: flushNow };
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
        const full = dir.replace(/[\\/]+$/, '') + '\\' + name;
        try {
          const res = await api('/api/io/export', { method: 'POST', body: { path: full, content, encoding: encSel.value } });
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
