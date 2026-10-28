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
  if (!state.ui.text) {
    const saved = draftSlot();
    state.ui.text = {
      path: saved.path || '',
      value: saved.value || '',
      dirty: !!saved.dirty,
      scrollTop: saved.scrollTop || 0,
      aiResult: saved.aiResult ? JSON.parse(JSON.stringify(saved.aiResult)) : null
    };
  }
  const ui = state.ui.text;

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
    d.path = ui.path;
    d.value = tooBig() ? '' : ui.value;      // 超大文本只留文件名，靠文件自动保存兜底
    d.skipped = tooBig();
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
    rows: 30, class: 'notepad manuscript-area', placeholder: i18n.t('manuscript.editor_placeholder'),
    value: ui.value,
    oninput: () => setText(area.value),
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
    const done = async () => { writeDraft(); await saveNow('state'); };
    if (ui.path && ui.dirty) return autosaveFile().then(done, done);   // 先落文件，草稿再记录真实状态
    return done();
  };

  const keepAiResult = () => {
    if (!ui.aiResult) return true;
    if (!confirm(i18n.t('manuscript.ai_result_warning'))) return false;
    ui.aiResult = null;
    return true;
  };

  const saveLocal = async () => {
    clearTimeout(fileTimer);
    if (!ui.path) {
      const folder = (state.paths.text || 'workspace/text').replace(/[\\/]+$/, '');
      let name = prompt(i18n.t('manuscript.save_prompt', { folder: folder }), i18n.t('defaults.text.draft_prefix') + new Date().toISOString().slice(0, 10) + '.txt');
      if (!name) return;
      if (!/\.(txt|md)$/i.test(name)) name += '.txt';
      ui.path = folder + '/' + name.replace(/[\\/]/g, '_');
      refreshHint();
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
      else if (!confirm(i18n.t('manuscript.unsaved_clear'))) return;
    }
    if (!keepAiResult()) return;
    clearTimeout(fileTimer); clearTimeout(draftTimer);
    ui.path = ''; ui.value = ''; ui.dirty = false; ui.scrollTop = 0;
    writeDraft();
    saveNow('state').catch(() => { });
    renderMain();
    toast(i18n.t('manuscript.cleared'), 'ok');
  };

  const loadPath = async (path) => {
    if (path === ui.path) return;
    if (ui.dirty) {
      if (ui.path) await flushFile();
      else if (!confirm(i18n.t('manuscript.unsaved_discard'))) return;
    }
    if (!keepAiResult()) return;
    try {
      const r = await api('/api/file?path=' + encodeURIComponent(path));
      clearTimeout(fileTimer); clearTimeout(draftTimer);
      ui.path = path; ui.value = r.content; ui.dirty = false; ui.scrollTop = 0;
      writeDraft();
      saveNow('state').catch(() => { });
      renderMain();
    } catch (e) { toast(i18n.t('manuscript.open_failed_reason', { reason: e.message }), 'err'); }
  };

  // 从产出（workspace/output/）导入：.md 先转成 txt（去掉输出头、清理空行），再拷进文本文件夹。
  const importPath = async (path) => {
    if (ui.dirty) {
      if (ui.path) await flushFile();
      else if (!confirm(i18n.t('manuscript.unsaved_discard'))) return;
    }
    if (!keepAiResult()) return;
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
          !confirm(i18n.t('manuscript.file_overwrite_confirm', { name: name }))) return;
      await api('/api/io/save', { method: 'POST', body: { path: folder + '/' + name, content: r.content } });
      await refreshFiles();
      writeDraft();          // refreshFiles 换掉了 state.db.state，把草稿重新贴回去
      ui.path = '';          // 强制 loadPath 重新读取，即使导入的是当前已打开的文件
      ui.dirty = false;
      await loadPath(folder + '/' + name);
      toast(i18n.t('manuscript.imported', { path: folder + '/' + name }), 'ok');
    } catch (e) { toast(i18n.t('records.import_failed_reason', { reason: e.message }), 'err'); }
  };

  const pickChapter = () => {
    const opts = (state.chapters || [])
      .filter(c => c.path.endsWith('.md') || c.path.endsWith('.txt'))
      .map(c => ({ value: c.path, label: c.name, meta: c.dir + ' · ' + c.mtime }));
    if (!opts.length) { toast(i18n.t('manuscript.no_outputs'), 'err'); return; }
    pickDialog(i18n.t('manuscript.import_output'), opts.slice(0, 120), rel => importPath(rel));
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
          setText(all.checked ? area.value.split(find.value).join(repl.value)
                              : area.value.replace(find.value, repl.value));
          m.close();
        }
      })
    ]);
  };

  // ── 文本文件夹 ───────────────────────────
  const openTextFolderDialog = () => {
    const body = h('div');
    const draw = () => {
      clear(body);
      const files = (state.io.files || []).filter(f => ['.txt', '.md', '.json'].includes(f.ext));
      body.appendChild(h('div', { class: 'small muted', style: { marginBottom: '8px' } },
        i18n.t('manuscript.dir_status', { dir: state.io.rel || 'workspace/text/', file: ui.path || i18n.t('common.unnamed_paren') })));
      if (!files.length) {
        body.appendChild(h('div', { class: 'muted small', style: { marginBottom: '10px' } },
          i18n.t('manuscript.no_text_files')));
      } else {
        const list = h('div', { class: 'list scroll', style: { maxHeight: '360px' } },
          files.map(f => h('div', {
            class: 'list-item' + (ui.path === f.path ? ' active' : ''),
            onclick: async () => { m.close(); await loadPath(f.path); }
          },
            h('div', { class: 'name', text: f.name }),
            h('div', { class: 'meta', text: (f.size / 1024).toFixed(1) + 'KB' }))));
        body.appendChild(list);
      }
      body.appendChild(h('div', { class: 'inline', style: { marginTop: '10px' } },
        h('button', { class: 'mini', text: i18n.t('manuscript.new_text'), onclick: async () => { m.close(); await newText(); } }),
        h('button', {
          class: 'mini', text: i18n.t('common.refresh'),
          onclick: async ev => {
            const btn = ev.target;
            btn.disabled = true;
            try {
              clearTimeout(draftTimer);
              writeDraft();
              await refreshFiles();
              writeDraft();
              draw();
            } catch (e) { toast(i18n.t('common.refresh_failed_reason', { reason: e.message }), 'err'); }
            finally { btn.disabled = false; }
          }
        })));
    };
    const m = modal(i18n.t('manuscript.folder_title'), body, [h('button', { text: i18n.t('common.close'), onclick: () => m.close() })]);
    draw();
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

  const exportCurrentToMemory = () => {
    if (!ui.value.trim()) { toast(i18n.t('manuscript.nothing_export'), 'err'); return; }
    const base = manuscriptShortName(ui.path).replace(/\.(txt|md|json)$/i, '');
    openSaveToMemoryDialog(ui.value, {
      title: (base || i18n.t('defaults.source.manuscript')) + ' · ' + new Date().toLocaleDateString(),
      chapter: manuscriptShortName(ui.path),
      source: i18n.t('defaults.source.manuscript_workspace')
    });
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
          if (!confirm(i18n.t('manuscript.overwrite_confirm'))) return;
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
        onclick: () => {
          if (!confirm(i18n.t('manuscript.delete_result_confirm'))) return;
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
  main.appendChild(pageHead(i18n.t('nav.text'),
    i18n.t('manuscript.page_desc')));

  const toolbar = h('div', { class: 'manuscript-toolbar' },
    h('button', { class: 'primary', text: i18n.t('manuscript.ai_assist'), onclick: openAiAssist }),
    h('button', { text: i18n.t('manuscript.folder_title'), onclick: openTextFolderDialog }),
    h('button', { text: i18n.t('manuscript.export_memory'), onclick: exportCurrentToMemory }),
    h('span', { class: 'toolbar-sep' }),
    h('button', { text: i18n.t('common.save'), onclick: saveLocal }),
    h('button', { text: i18n.t('manuscript.import_output_btn'), onclick: pickChapter }),
    h('button', { text: i18n.t('manuscript.import_other_btn'), onclick: () => browseOpen(path => importPath(path)) }),
    h('button', { text: i18n.t('manuscript.export_txt_btn'), onclick: () => exportAs(ui.value) }),
    h('span', { class: 'toolbar-sep' }),
    h('button', { text: i18n.t('manuscript.find_replace_btn'), onclick: openFindReplace }));

  const cleanTools = h('details', { class: 'input-details' });
  cleanTools.appendChild(h('summary', null, i18n.t('manuscript.clean_tools')));
  cleanTools.appendChild(h('div', { class: 'inline', style: { flexWrap: 'wrap' } },
    ops.map(([label, fn]) => h('button', {
      class: 'mini', text: label,
      onclick: () => setText(fn(area.value))
    }))));

  const panel = h('div', { class: 'card' });
  panel.appendChild(h('h2', null, i18n.t('manuscript.workspace_title'), pathHint));
  panel.appendChild(toolbar);
  panel.appendChild(cleanTools);
  panel.appendChild(area);
  panel.appendChild(statLine);
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
