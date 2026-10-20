/* NovelHelper —— 稿件处理（大文本工作区 + AI 辅助） */
'use strict';

function processModes() {
  return modesOfKind('process');
}

function manuscriptModeLabel(id) {
  const mode = allModes().find(m => m.id === id);
  return mode ? (mode.label || mode.id) : (id || 'AI 处理');
}

function manuscriptShortName(path) {
  return String(path || '').split(/[\\/]/).pop() || '（未命名）';
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
      status((quiet ? '已自动保存 ' : '已保存 ') + manuscriptShortName(path), 'ok');
      if (!quiet) toast('已保存：' + path, 'ok');
      updateStat();
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
    rows: 30, class: 'notepad manuscript-area', placeholder: '在这里写 / 贴入要处理的稿件…',
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

  const keepAiResult = () => {
    if (!ui.aiResult) return true;
    if (!confirm('当前工作区还有未处理的 AI 结果，继续后会被清除。')) return false;
    ui.aiResult = null;
    return true;
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
    refreshHint();
  };

  // ── 新建 / 打开 / 导入 ────────────────────
  const newText = async () => {
    if (ui.dirty) {
      if (ui.path) await flushFile();
      else if (!confirm('「（未命名）」里还没落盘的内容会被清掉，继续吗？')) return;
    }
    if (!keepAiResult()) return;
    clearTimeout(fileTimer); clearTimeout(draftTimer);
    ui.path = ''; ui.value = ''; ui.dirty = false; ui.scrollTop = 0;
    writeDraft();
    saveNow('state').catch(() => { });
    renderMain();
    toast('已清空，保存时会让你选文件名', 'ok');
  };

  const loadPath = async (path) => {
    if (path === ui.path) return;
    if (ui.dirty) {
      if (ui.path) await flushFile();
      else if (!confirm('「（未命名）」里还没落盘的内容会被丢弃，继续吗？')) return;
    }
    if (!keepAiResult()) return;
    try {
      const r = await api('/api/file?path=' + encodeURIComponent(path));
      clearTimeout(fileTimer); clearTimeout(draftTimer);
      ui.path = path; ui.value = r.content; ui.dirty = false; ui.scrollTop = 0;
      writeDraft();
      saveNow('state').catch(() => { });
      renderMain();
    } catch (e) { toast('打开失败：' + e.message, 'err'); }
  };

  // 从产出（workspace/output/）导入：.md 先转成 txt（去掉输出头、清理空行），再拷进文本文件夹。
  const importPath = async (path) => {
    if (ui.dirty) {
      if (ui.path) await flushFile();
      else if (!confirm('「（未命名）」里还没落盘的内容会被丢弃，继续吗？')) return;
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
          !confirm('「' + name + '」已存在，覆盖吗？')) return;
      await api('/api/io/save', { method: 'POST', body: { path: folder + '/' + name, content: r.content } });
      await refreshFiles();
      writeDraft();          // refreshFiles 换掉了 state.db.state，把草稿重新贴回去
      ui.path = '';          // 强制 loadPath 重新读取，即使导入的是当前已打开的文件
      ui.dirty = false;
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

  // ── 文本清理 / 查找替换 ───────────────────
  const ops = [
    ['删除所有空行', t => t.split('\n').filter(l => l.trim() !== '').join('\n')],
    ['空行合并为一个', t => t.replace(/\n{3,}/g, '\n\n')],
    ['合并段内换行', t => t.replace(/([^\n])\n(?!\n)/g, '$1')],
    ['去掉行首缩进', t => t.split('\n').map(l => l.replace(/^[　 \t]+/, '')).join('\n')],
    ['去首尾空白', t => t.trim()],
    ['全角空格→半角', t => t.replace(/　/g, ' ')],
    ['中文引号→英文', t => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")]
  ];

  const openFindReplace = () => {
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
  };

  // ── 文本文件夹 ───────────────────────────
  const openTextFolderDialog = () => {
    const body = h('div');
    const draw = () => {
      clear(body);
      const files = (state.io.files || []).filter(f => ['.txt', '.md', '.json'].includes(f.ext));
      body.appendChild(h('div', { class: 'small muted', style: { marginBottom: '8px' } },
        '目录：' + (state.io.rel || 'workspace/text/') + ' · 当前：' + (ui.path || '（未命名）')));
      if (!files.length) {
        body.appendChild(h('div', { class: 'muted small', style: { marginBottom: '10px' } },
          '这个目录里还没有文本文件。'));
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
        h('button', { class: 'mini', text: '新建文本', onclick: async () => { m.close(); await newText(); } }),
        h('button', {
          class: 'mini', text: '刷新',
          onclick: async ev => {
            const btn = ev.target;
            btn.disabled = true;
            try {
              clearTimeout(draftTimer);
              writeDraft();
              await refreshFiles();
              writeDraft();
              draw();
            } catch (e) { toast('刷新失败：' + e.message, 'err'); }
            finally { btn.disabled = false; }
          }
        })));
    };
    const m = modal('文本文件夹', body, [h('button', { text: '关闭', onclick: () => m.close() })]);
    draw();
  };

  // ── 导出 / 转存到记忆库 ───────────────────
  const openSaveToMemoryDialog = (content, opts) => {
    opts = opts || {};
    const coll = state.db.memories = state.db.memories || { items: [], categories: [] };
    coll.items = coll.items || [];
    coll.categories = (coll.categories && coll.categories.length) ? coll.categories : ['短期记忆'];
    const titleInput = h('input', { type: 'text', value: opts.title || '' });
    const catSelect = h('select', null, coll.categories.map(c => h('option', {
      value: c, text: c, selected: c === (opts.category || coll.categories[0])
    })));
    const chapInput = h('input', { type: 'text', value: opts.chapter || '' });
    const contentArea = h('textarea', { rows: 14, value: String(content || '') });
    const body = h('div', null,
      h('div', { class: 'field' }, h('label', { text: '标题' }), titleInput),
      h('div', { class: 'inline' },
        h('div', { class: 'field', style: { flex: '1' } }, h('label', { text: '分类' }), catSelect),
        h('div', { class: 'field', style: { flex: '1' } }, h('label', { text: '章节 / 时间' }), chapInput)),
      h('div', { class: 'field' }, h('label', { text: '内容（可直接改）' }), contentArea),
      h('div', { class: 'small muted', text: opts.source ? '来源：' + opts.source : '' }));
    const m = modal('导出至记忆', body, [
      h('button', { text: '取消', onclick: () => m.close() }),
      h('button', {
        class: 'primary', text: '保存到记忆', dataset: { noclose: '1' },
        onclick: () => {
          const value = contentArea.value;
          if (!value.trim()) { toast('内容为空，未保存。', 'err'); return; }
          const stamp = nowStr();
          coll.items.unshift({
            id: newId('mm'),
            title: titleInput.value.trim() || opts.title || '稿件处理记忆',
            category: catSelect.value || coll.categories[0],
            chapter: chapInput.value.trim(),
            content: value,
            source: opts.source || '稿件处理',
            tags: [], created: stamp, updated: stamp
          });
          touch('memories');
          renderNav();
          m.close();
          toast('已保存到记忆库。', 'ok');
        }
      })
    ]);
  };

  const exportCurrentToMemory = () => {
    if (!ui.value.trim()) { toast('工作区没有可导出的文本。', 'err'); return; }
    const base = manuscriptShortName(ui.path).replace(/\.(txt|md|json)$/i, '');
    openSaveToMemoryDialog(ui.value, {
      title: (base || '稿件处理') + ' · ' + new Date().toLocaleDateString(),
      chapter: manuscriptShortName(ui.path),
      source: '稿件处理 · 工作区'
    });
  };

  // ── AI 辅助 ──────────────────────────────
  const runManuscriptProcess = async (mode, instruction) => {
    if (state.ui.busy) return;
    const source = ui.value;
    if (!source.trim()) { toast('工作区还没有可处理的文本。', 'err'); return; }
    state.ui.busy = true;
    renderMain();
    status('AI 处理中…', 'busy');
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
      status('处理完成', 'ok');
      toast('处理完成，结果在文本下方，可编辑后再应用。', 'ok');
    } catch (e) {
      state.ui.busy = false;
      if (state.view === 'text' || state.view === 'writer') renderMain();
      status('处理失败', 'err');
      toast('处理失败：' + e.message, 'err');
    }
  };

  const openAiAssist = () => {
    if (state.ui.busy) { toast('AI 正在处理中，请稍候。', 'err'); return; }
    if (!ui.value.trim()) { toast('工作区还没有可处理的文本。', 'err'); return; }
    const modes = processModes();
    if (!modes.length) {
      const body = h('div', null,
        h('div', { class: 'small muted', text: '还没有稿件处理模式。请到「模式管理 → 稿件处理模式」新增，例如「润色修订」。' }));
      const emptyModal = modal('AI 辅助 · 稿件处理', body, [
        h('button', { text: '关闭', onclick: () => emptyModal.close() }),
        h('button', {
          class: 'primary', text: '前往模式管理',
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
    const m = modal('AI 辅助 · 稿件处理', body, [h('button', { text: '关闭', onclick: () => m.close() })]);

    const drawPicker = () => {
      clear(body);
      body.appendChild(h('div', { class: 'ai-question', text: '我们要对文本怎么做？' }));
      body.appendChild(h('div', { class: 'small muted', style: { marginBottom: '12px' } },
        '将处理当前工作区全文 ' + ui.value.length + ' 字。结果会显示在文本下方，可编辑后再决定覆盖、删除或转存。'));
      body.appendChild(h('div', { class: 'ai-mode-list' }, modes.map(mode => {
        const api = (state.db.config || {}).api || {};
        return h('div', { class: 'ai-mode-card', onclick: () => drawInstruction(mode) },
          h('div', { class: 'ai-mode-name', text: mode.label || mode.id }),
          h('div', { class: 'small muted', text: mode.desc || '' }),
          h('div', { class: 'small muted', style: { marginTop: '4px' } },
            '模型 ' + (mode.model || api.default_model || '跟随默认') +
            ' · 推理 ' + (mode.effort || api.default_effort || 'medium')));
      })));
    };

    const drawInstruction = (mode) => {
      clear(body);
      body.appendChild(h('div', { class: 'inline', style: { marginBottom: '8px' } },
        h('button', { class: 'mini', text: '← 换一种处理', onclick: drawPicker }),
        h('span', { class: 'tag mode-tag', text: mode.label || mode.id })));
      body.appendChild(h('div', { class: 'mode-desc', text: mode.desc || '' }));
      const req = h('textarea', {
        rows: 6, placeholder: '例如：只调整第 3 段的节奏；统一为第三人称；保留全部对话与情节。'
      });
      body.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } },
        h('label', { text: '处理要求（可选）' }), req));
      body.appendChild(h('div', { class: 'small muted' },
        '不填也可以，会按这个模式自己的要求处理。结果会出现在文本下方，可编辑后再应用。'));
      body.appendChild(h('div', { class: 'inline', style: { marginTop: '12px' } },
        h('button', {
          class: 'primary', text: '开始处理',
          onclick: () => { m.close(); runManuscriptProcess(mode, req.value); }
        }),
        h('button', { text: '取消', onclick: () => m.close() })));
    };

    drawPicker();
  };

  // ── AI 结果卡片 ──────────────────────────
  const aiResultCard = () => {
    const ai = ui.aiResult;
    const resultArea = h('textarea', {
      rows: 14, class: 'notepad ai-result-area',
      value: ai.text || '',
      placeholder: 'AI 处理结果会显示在这里，可直接修改。',
      oninput: e => {
        ui.aiResult.text = e.target.value;
        updateAiStat();
        scheduleDraft();
      }
    });
    const aiStat = h('div', { class: 'small muted' });
    const updateAiStat = () => {
      const original = (ai.source_chars != null ? ai.source_chars : ui.value.length);
      aiStat.textContent = '原文 ' + original + ' 字 → 结果 ' + (ui.aiResult.text || '').length +
        ' 字 · 可直接修改后再应用。';
    };
    updateAiStat();

    const meta = ai.meta || {};
    const info = [
      ai.created || '',
      meta.model ? '模型 ' + meta.model : '',
      meta.elapsed != null ? '耗时 ' + meta.elapsed + 's' : '',
      meta.usage && meta.usage.total_tokens ? 'tokens ' + meta.usage.total_tokens : ''
    ].filter(Boolean).join(' · ');

    const card = h('div', { class: 'card ai-result-card' });
    card.appendChild(h('h2', null, 'AI 处理结果',
      h('span', { class: 'tag mode-tag', text: ai.mode_label || manuscriptModeLabel(ai.mode) }),
      h('span', { class: 'hint', text: '结果由 AI 生成，应用前请自行核对' })));
    if (info) card.appendChild(h('div', { class: 'small muted', style: { marginBottom: '8px' } }, info));
    card.appendChild(resultArea);
    card.appendChild(aiStat);
    card.appendChild(h('div', { class: 'output-actions' },
      h('button', {
        class: 'primary', text: '覆盖原工作区',
        onclick: async () => {
          const content = ui.aiResult.text || '';
          if (!content.trim()) { toast('结果为空，无法覆盖。', 'err'); return; }
          if (!confirm('用这个结果覆盖当前工作区？原文本会被替换。')) return;
          setText(content);
          ui.aiResult = null;
          writeDraft();
          await saveNow('state').catch(() => { });
          renderMain();
          toast(ui.path ? '已覆盖工作区，文件会自动保存。' : '已覆盖工作区（当前是未命名草稿，记得保存）。', 'ok');
        }
      }),
      h('button', {
        text: '转存至记忆',
        onclick: () => {
          const aiNow = ui.aiResult;
          if (!aiNow || !String(aiNow.text || '').trim()) { toast('结果为空，无法转存。', 'err'); return; }
          openSaveToMemoryDialog(aiNow.text, {
            title: (aiNow.mode_label || manuscriptModeLabel(aiNow.mode)) + ' · ' +
              manuscriptShortName(ui.path).replace(/\.(txt|md|json)$/i, ''),
            chapter: manuscriptShortName(ui.path),
            source: '稿件处理 · AI 结果 · ' + (aiNow.mode_label || aiNow.mode || '')
          });
        }
      }),
      h('button', {
        text: '复制',
        onclick: () => {
          const text = ui.aiResult.text || '';
          if (!text.trim()) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
              () => toast('已复制到剪贴板', 'ok'),
              () => fallbackCopy(text));
          } else fallbackCopy(text);
        }
      }),
      h('span', { style: { flex: '1' } }),
      h('button', {
        class: 'danger', text: '删除结果',
        onclick: () => {
          if (!confirm('删除这次 AI 处理结果？工作区原文不会改变。')) return;
          ui.aiResult = null;
          writeDraft();
          saveNow('state').catch(() => { });
          renderMain();
          toast('已删除处理结果。', 'ok');
        }
      })));
    return card;
  };

  // ── 页面 ─────────────────────────────────
  main.appendChild(pageHead('稿件处理',
    '独立的大文本工作区：上方工具栏可以调用 AI 辅助、打开文本文件夹或导出到记忆库。内容会自动暂存，绑定文件后停手 1.5 秒自动写盘。'));

  const toolbar = h('div', { class: 'manuscript-toolbar' },
    h('button', { class: 'primary', text: 'AI 辅助', onclick: openAiAssist }),
    h('button', { text: '文本文件夹', onclick: openTextFolderDialog }),
    h('button', { text: '导出至记忆', onclick: exportCurrentToMemory }),
    h('span', { class: 'toolbar-sep' }),
    h('button', { text: '保存', onclick: saveLocal }),
    h('button', { text: '从产出导入…', onclick: pickChapter }),
    h('button', { text: '从其他导入…', onclick: () => browseOpen(path => importPath(path)) }),
    h('button', { text: '另存为 / 导出 txt…', onclick: () => exportAs(ui.value) }),
    h('span', { class: 'toolbar-sep' }),
    h('button', { text: '查找替换…', onclick: openFindReplace }));

  const cleanTools = h('details', { class: 'input-details' });
  cleanTools.appendChild(h('summary', null, '文本清理工具'));
  cleanTools.appendChild(h('div', { class: 'inline', style: { flexWrap: 'wrap' } },
    ops.map(([label, fn]) => h('button', {
      class: 'mini', text: label,
      onclick: () => setText(fn(area.value))
    }))));

  const panel = h('div', { class: 'card' });
  panel.appendChild(h('h2', null, '稿件工作区', pathHint));
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
        h('strong', { text: 'AI 正在处理中' }),
        h('div', { class: 'small muted', text: '完成前无法修改文本或切换操作。' }))));
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
