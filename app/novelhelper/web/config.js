/* NovelHelper —— 元素模板 / 提示词 / 模型设置 */
'use strict';

// ═══════════════════════════════════════════
// 元素模板
// ═══════════════════════════════════════════
const SCHEMA_KEYS = [
  ['characters', '人物档案'],
  ['factions', '势力设定'],
  ['items', '道具设定'],
  ['equipment', '服饰与装备'],
  ['other', '其他设定']
];

/** 元素模板页的可选集合 = 内置 5 个 + 所有自定义栏目。 */
function schemaKeyChoices() {
  return SCHEMA_KEYS.concat(sectionDefs(true).map(sec =>
    ['section_' + sec.key, (sec.label || sec.key) + (sec.on === false ? '（已停用）' : '')]));
}

function viewElements(main) {
  state.db.schema = state.db.schema || {};
  state.ui.elements = state.ui.elements || { key: 'characters' };
  const ui = state.ui.elements;
  const entry = state.db.schema[ui.key] = state.db.schema[ui.key] || { label: '', elements: [] };
  entry.elements = entry.elements || [];

  main.appendChild(pageHead('元素模板',
    '定义每类设定「默认包含哪些元素」。新建条目时会按模板生成；已有条目可以点「套用模板补齐」。' +
    '取消勾选表示默认不需要这个元素，导出与发送时会忽略。',
    h('div', { class: 'inline' },
      h('button', {
        text: '应用到全部记录',
        onclick: () => {
          const coll = ui.key;
          const items = collItems(coll);
          if (!items.length) { toast('该集合还没有记录。', 'err'); return; }
          if (!confirm('给「' + coll + '」的 ' + items.length + ' 条记录补齐模板元素？（不覆盖已填内容）')) return;
          let total = 0;
          items.forEach(rec => { rec.elements = rec.elements || []; total += applyPreset(rec.elements, entry.elements); });
          touch(coll);
          toast('共补充 ' + total + ' 个元素', 'ok');
        }
      }),
      h('button', {
        text: '导出模板 JSON',
        onclick: async () => {
          try {
            await saveNow('schema');
            const blob = JSON.stringify(state.db.schema[ui.key] || {}, null, 2);
            const res = await api('/api/io/export', {
              method: 'POST',
              body: { path: (state.paths.export || 'workspace/export') + '\\schema_' + ui.key + '.json', content: blob }
            });
            toast('已导出：' + res.path, 'ok');
          } catch (e) { toast('导出失败：' + e.message, 'err'); }
        }
      }))));

  const card = h('div', { class: 'card' });
  card.appendChild(h('div', { class: 'field' },
    h('label', { text: '编辑哪个集合的模板' }),
    h('select', {
      onchange: e => { ui.key = e.target.value; renderMain(); }
    }, schemaKeyChoices().map(([v, l]) => h('option', { value: v, selected: v === ui.key, text: l })))));

  card.appendChild(h('div', { class: 'sep' }));
  card.appendChild(h('div', { class: 'small muted', style: { marginBottom: '8px' } },
    '提示：在名称末尾加 / 可以建立「分组」，分组可以继续往下分（子集的子集）。'));
  card.appendChild(elementTree(entry.elements, 'schema', {
    hideValues: true,
    onChange: () => { entry.label = entry.label || ''; }
  }));
  main.appendChild(card);

  const help = h('div', { class: 'card' });
  help.appendChild(h('h2', null, '元素是怎么影响输出与 JSON 的'));
  help.appendChild(h('div', { class: 'md', html: md(
    '- 勾选的元素 + 有内容的元素 → 才会出现在**发送给模型**的提示词和**导出的 JSON / TXT**里。\n' +
    '- 取消勾选（或留空）的元素不会出现，导出的 JSON 里不会有这个键，也不会留下空行。\n' +
    '- 元素名称随便改：改成「外貌」「战斗能力」都行，改动只影响之后导出与发送的标题。\n' +
    '- 想让所有人物都自带某组元素：在这里加好，然后点「应用到全部记录」。'
  ) }));
  main.appendChild(help);
}

// ═══════════════════════════════════════════
// 提示词
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// 设定栏目（自定义分类）
// ═══════════════════════════════════════════
function viewSections(main) {
  state.db.sections = state.db.sections || { items: [] };
  const defs = state.db.sections.items = state.db.sections.items || [];

  main.appendChild(pageHead('自定义栏目',
    '把设定拆成若干栏目（世界观、物种、魔法与技能……）。新增栏目会在侧栏多一个页面，并在 data/ 下生成独立 JSON。',
    h('div', { class: 'inline' },
      h('button', {
        class: 'primary', text: '＋ 新增栏目',
        onclick: () => {
          const label = prompt('栏目名称（例如：政治格局 / 军事 / 民俗）');
          if (!label) return;
          let key = (prompt('英文 key（用于文件名，字母数字下划线，例如 politics）') || '').trim().toLowerCase();
          if (!/^[a-z][a-z0-9_]*$/.test(key)) {
            key = 'sec' + Math.random().toString(36).slice(2, 6);
            toast('key 不合法，已自动用 ' + key, 'err');
          }
          if (defs.some(s => s.key === key)) { toast('这个 key 已经存在。', 'err'); return; }
          defs.push({ key, label, desc: '', auto_from: [], on: true });
          touch('sections'); renderNav(); renderMain();
        }
      }),
      h('button', {
        text: '按分类一键归类',
        title: '把「其他设定」里的内容按下面的「归类依据」搬进对应栏目',
        onclick: async ev => {
          ev.target.disabled = true;
          status('归类中…', 'busy');
          try {
            const res = await api('/api/sections/auto-sort', { method: 'POST', body: {} });
            setDb(res.collections);
            toast(res.message, 'ok');
            renderNav(); renderMain();
          } catch (e) { toast('归类失败：' + e.message, 'err'); }
          finally { ev.target.disabled = false; }
        }
      }))));

  const card = h('div', { class: 'card' });
  card.appendChild(h('h2', null, '栏目列表', h('span', { class: 'hint', text: '取消勾选＝暂时隐藏（数据不删）' })));
  if (!defs.length) card.appendChild(h('div', { class: 'muted small', text: '（还没有栏目）' }));
  defs.forEach((sec, i) => {
    const view = 'section_' + sec.key;
    const count = collItems(view).length;
    card.appendChild(h('div', { class: 'row', style: { borderBottom: '1px solid var(--line)', padding: '10px 0' } },
      h('div', { class: 'col', style: { flex: '0 0 240px' } },
        h('label', { class: 'check' },
          h('input', {
            type: 'checkbox', checked: sec.on !== false,
            onchange: e => { sec.on = e.target.checked; touch('sections'); renderNav(); renderMain(); }
          }), '启用'),
        h('div', { class: 'field', style: { marginTop: '6px' } },
          h('input', { type: 'text', value: sec.label || '', placeholder: '栏目名称', oninput: e => { sec.label = e.target.value; touch('sections'); renderNav(); } })),
        h('div', { class: 'small muted', text: 'key: ' + sec.key + ' · ' + count + ' 条' })), 
      h('div', { class: 'col' },
        h('div', { class: 'field' }, h('label', { text: '一句话说明（显示在页面标题下）' }),
          h('input', { type: 'text', value: sec.desc || '', oninput: e => { sec.desc = e.target.value; touch('sections'); } })),
        h('div', { class: 'field' }, h('label', { text: '归类依据（「其他设定」里出现的「原分类」名，用逗号分隔）' }),
          h('input', {
            type: 'text', value: (sec.auto_from || []).join('，'),
            oninput: e => { sec.auto_from = e.target.value.split(/[，,、]/).map(s => s.trim()).filter(Boolean); touch('sections'); }
          })),
        h('div', { class: 'inline' },
          h('button', { class: 'mini', text: '↑', title: '上移', onclick: () => { if (i > 0) { [defs[i - 1], defs[i]] = [defs[i], defs[i - 1]]; touch('sections'); renderNav(); renderMain(); } } }),
          h('button', { class: 'mini', text: '↓', title: '下移', onclick: () => { if (i < defs.length - 1) { [defs[i + 1], defs[i]] = [defs[i], defs[i + 1]]; touch('sections'); renderNav(); renderMain(); } } }),
          h('button', {
            text: '打开这一栏', onclick: () => go(view)
          }),
          h('button', {
            class: 'danger', text: '删除栏目',
            onclick: () => {
              if (!confirm('删除栏目「' + (sec.label || sec.key) + '」？\n界面上的入口会消失，data/section_' + sec.key + '.json 会留在磁盘上（不会删文件）。')) return;
              defs.splice(i, 1);
              touch('sections'); renderNav(); renderMain();
            }
          })))));
  });
  main.appendChild(card);

  const tip = h('div', { class: 'card' });
  tip.appendChild(h('h2', null, '说明'));
  tip.appendChild(h('div', { class: 'md', html: md(
    '- 每个栏目就是一个普通设定集合：和「其他设定」一样可以放条目、写元素树、导出 JSON / TXT。\n' +
    '- 想给栏目配一套默认元素模板：到「元素模板」页，在下拉框里选中这个栏目即可。\n' +
    '- 「按分类一键归类」会把「其他设定」里分类名匹配的条目搬进对应栏目，原文与来源都保留。\n' +
    '- 删除栏目只删入口，不动文件；想彻底清掉可以自己删 `data/section_<key>.json`。'
  ) }));
  main.appendChild(tip);
}

// ═══════════════════════════════════════════
// 模式管理
// ═══════════════════════════════════════════
function dbModes() {
  state.db.modes = state.db.modes || { items: [] };
  state.db.modes.items = state.db.modes.items || [];
  return state.db.modes.items;
}

function defaultModeFor(id) {
  return (state.default_modes || []).find(m => m.id === id) || null;
}

function providerById(id) {
  return (state.providers || []).find(p => p.id === id) ||
    (state.providers || [])[(state.providers || []).length - 1] || null;
}

function sameProviderUrl(left, right) {
  const a = String(left || '').replace(/\/+$/, '');
  const b = String(right || '').replace(/\/+$/, '');
  return !!a && !!b && (a === b || a === b + '/v1' || b === a + '/v1');
}

function apiCfg() {
  const cfg = state.db.config = state.db.config || {};
  cfg.api = cfg.api || {};
  return cfg.api;
}

function currentModels() {
  const api = apiCfg();
  let models = (api.models || []).slice();
  if (!models.length) {
    const preset = providerById(api.provider);
    models = (preset && preset.models) || [];
  }
  return models;
}

function defaultModelName() {
  const api = apiCfg();
  return api.default_model || currentModels()[0] || '';
}

function effortChoices() {
  return state.efforts && state.efforts.length
    ? state.efforts
    : ['none', 'low', 'medium', 'high', 'max'];
}

function modeModelOptions(mode) {
  const models = currentModels();
  const options = [{ value: '', label: '跟随默认模型' + (defaultModelName() ? '（' + defaultModelName() + '）' : '') }];
  models.forEach(m => options.push({ value: m, label: m }));
  if (mode.model && !models.includes(mode.model)) {
    options.push({ value: mode.model, label: mode.model + '（不在当前模型列表）' });
  }
  return options;
}

function viewModes(main) {
  const modes = dbModes();
  if (!modes.length && state.default_modes && state.default_modes.length) {
    state.default_modes.forEach(m => modes.push(JSON.parse(JSON.stringify(m))));
    touch('modes');
  }
  state.ui.modes = state.ui.modes || { sel: modes[0] ? modes[0].id : '' };
  const ui = state.ui.modes;
  if (!modes.some(m => m.id === ui.sel)) ui.sel = modes[0] ? modes[0].id : '';

  const models = currentModels();
  const stale = modes.filter(m => m.model && models.length && !models.includes(m.model));

  main.appendChild(pageHead('模式管理',
    '每个模式就是一套独立的系统提示词，并拥有自己的模型与推理强度。模式可以自由新增、删除和排序。',
    h('div', { class: 'inline' },
      h('button', {
        text: '同步到当前接口',
        title: '把所有模式的模型改为跟随当前接口的默认模型，推理强度改为默认值',
        onclick: () => {
          const api = apiCfg();
          modes.forEach(m => {
            m.model = '';
            m.effort = api.default_effort || 'medium';
          });
          touch('modes'); renderMain();
          toast('已同步到当前接口的默认模型与推理强度。', 'ok');
        }
      }),
      h('button', {
        class: 'primary', text: '＋ 新增模式',
        onclick: () => addModeDialog()
      }))));

  if (stale.length) {
    main.appendChild(h('div', { class: 'notice warn' },
      h('span', { text: '有 ' + stale.length + ' 个模式使用了当前接口不存在的模型，生成时会回退到默认模型。' }),
      h('button', { class: 'mini', text: '一键同步', onclick: () => {
        const api = apiCfg();
        modes.forEach(m => { m.model = ''; m.effort = api.default_effort || 'medium'; });
        touch('modes'); renderMain();
      } })));
  }
  if (!models.length) {
    main.appendChild(h('div', { class: 'notice warn',
      text: '当前接口还没有模型列表。请先到「模型设置」获取或手动填写模型，否则模式无法生成。' }));
  }

  const row = h('div', { class: 'row' });
  const left = h('div', { class: 'col', style: { flex: '0 0 300px' } });
  const right = h('div', { class: 'col' });
  row.appendChild(left); row.appendChild(right);
  main.appendChild(row);

  const drawList = () => {
    clear(left);
    const card = h('div', { class: 'card' },
      h('h2', null, '模式列表', h('span', { class: 'hint', text: modes.length + ' 个' })));
    const list = h('div', { class: 'list' });
    modes.forEach((mode, index) => {
      list.appendChild(h('div', {
        class: 'list-item' + (mode.id === ui.sel ? ' active' : ''),
        onclick: () => { ui.sel = mode.id; drawList(); drawEditor(); }
      },
        h('div', { class: 'name', text: mode.label || mode.id }),
        h('div', { class: 'meta', text: (mode.model || '默认模型') + ' · ' + (mode.effort || 'medium') })));
    });
    card.appendChild(list);
    left.appendChild(card);
  };

  const drawEditor = () => {
    clear(right);
    const mode = modes.find(m => m.id === ui.sel);
    if (!mode) {
      right.appendChild(h('div', { class: 'card muted', text: '左侧选择一个模式，或新增模式。' }));
      return;
    }
    const card = h('div', { class: 'card' });
    card.appendChild(h('h2', null, mode.label || mode.id,
      h('span', { class: 'hint', text: '自动保存；模型与推理放在最上面' })));

    // 模型与推理强度：放在模式编辑器顶部
    const modelRow = h('div', { class: 'mode-settings-top' });
    modelRow.appendChild(h('div', { class: 'field' },
      h('label', { text: '模型' }),
      h('select', {
        onchange: e => { mode.model = e.target.value; touch('modes'); drawList(); }
      }, modeModelOptions(mode).map(opt => h('option', {
        value: opt.value, text: opt.label, selected: opt.value === (mode.model || '')
      })))));
    modelRow.appendChild(h('div', { class: 'field' },
      h('label', { text: '推理强度' }),
      h('select', {
        onchange: e => { mode.effort = e.target.value; touch('modes'); drawList(); }
      }, effortChoices().map(value => h('option', {
        value, text: value, selected: value === (mode.effort || 'medium')
      })))));
    card.appendChild(modelRow);
    card.appendChild(h('div', { class: 'small muted', style: { marginBottom: '10px' } },
      '模型选项来自当前接口的模型列表；选择「跟随默认模型」时会自动使用上面的默认模型。'));

    card.appendChild(h('div', { class: 'field' },
      h('label', { text: '模式名称' }),
      h('input', { type: 'text', value: mode.label || '', oninput: e => { mode.label = e.target.value; touch('modes'); drawList(); } })));
    card.appendChild(h('div', { class: 'field' },
      h('label', { text: '一句话说明' }),
      h('input', { type: 'text', value: mode.desc || '', oninput: e => { mode.desc = e.target.value; touch('modes'); } })));

    const advanced = h('details', { class: 'input-details' });
    advanced.appendChild(h('summary', null, '高级参数'));
    advanced.appendChild(h('div', { class: 'inline' },
      h('div', { class: 'field' }, h('label', { text: 'max_tokens' }),
        h('input', { type: 'number', value: mode.max_tokens || 32768, oninput: e => { mode.max_tokens = Number(e.target.value) || 32768; touch('modes'); } })),
      h('div', { class: 'field' }, h('label', { text: 'top_p' }),
        h('input', { type: 'number', step: '0.05', value: mode.top_p == null ? 0.95 : mode.top_p, oninput: e => { mode.top_p = Number(e.target.value) || 0.95; touch('modes'); } })),
      h('div', { class: 'field' }, h('label', { text: 'temperature（可留空）' }),
        h('input', {
          type: 'number', step: '0.05', value: mode.temperature == null ? '' : mode.temperature,
          placeholder: '接口默认',
          oninput: e => {
            const v = e.target.value.trim();
            const n = Number(v);
            mode.temperature = v === '' || !Number.isFinite(n) ? null : n;
            touch('modes');
          }
        })),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: !!mode.thinking, onchange: e => { mode.thinking = e.target.checked; touch('modes'); } }),
        '发送 thinking 参数（仅部分接口支持）'),
      h('label', { class: 'check' },
        h('input', {
          type: 'checkbox', checked: mode.use_target_chars !== false,
          onchange: e => { mode.use_target_chars = e.target.checked; touch('modes'); }
        }),
        '拼装目标字数')));
    card.appendChild(advanced);

    card.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } },
      h('label', { text: '系统提示词（这个模式的核心内容）' }),
      h('textarea', {
        rows: 22, value: mode.system_prompt || '',
        oninput: e => { mode.system_prompt = e.target.value; touch('modes'); autoGrow(e.target); }
      })));
    card.appendChild(h('div', { class: 'small muted', text: '提示词保存后立即用于该模式；不再有旧版的提示词分组或工具说明。' }));

    card.appendChild(h('div', { class: 'inline', style: { marginTop: '10px' } },
      h('button', {
        text: '恢复内置提示词',
        onclick: () => {
          const def = defaultModeFor(mode.id);
          if (!def) { toast('这是自定义模式，没有内置版本。', 'err'); return; }
          if (!confirm('恢复「' + (def.label || def.id) + '」的内置系统提示词与默认参数？')) return;
          mode.system_prompt = def.system_prompt;
          mode.effort = def.effort;
          mode.max_tokens = def.max_tokens;
          mode.top_p = def.top_p;
          mode.temperature = def.temperature;
          mode.thinking = def.thinking;
          mode.use_target_chars = def.use_target_chars;
          touch('modes'); renderMain(); toast('已恢复内置设置', 'ok');
        }
      }),
      h('button', {
        text: '↑', title: '上移',
        onclick: () => {
          const i = modes.indexOf(mode);
          if (i > 0) { [modes[i - 1], modes[i]] = [modes[i], modes[i - 1]]; touch('modes'); renderMain(); }
        }
      }),
      h('button', {
        text: '↓', title: '下移',
        onclick: () => {
          const i = modes.indexOf(mode);
          if (i >= 0 && i < modes.length - 1) { [modes[i + 1], modes[i]] = [modes[i], modes[i + 1]]; touch('modes'); renderMain(); }
        }
      }),
      h('span', { style: { flex: '1' } }),
      h('button', {
        class: 'danger', text: '删除模式',
        onclick: () => {
          if (modes.length <= 1) { toast('至少保留一个模式。', 'err'); return; }
          if (!confirm('删除模式「' + (mode.label || mode.id) + '」？')) return;
          modes.splice(modes.indexOf(mode), 1);
          ui.sel = modes[0] ? modes[0].id : '';
          touch('modes'); renderMain(); toast('已删除模式', 'ok');
        }
      })));
    right.appendChild(card);
  };

  drawList(); drawEditor();
}

function addModeDialog() {
  askDialog('新增模式', '模式名称', '新工作模式', name => {
    const label = (name || '').trim() || '新工作模式';
    const modes = dbModes();
    const api = apiCfg();
    const id = 'mode_' + Math.random().toString(36).slice(2, 8);
    modes.push({
      id, label, desc: '',
      system_prompt: '任务：根据用户提供的设定、当前状态、记忆与提示词完成本次工作。\n\n' +
        '要求：\n1. 严格遵循用户提供的设定与提示词。\n2. 不擅自新增未授权的设定、人物或情节。\n' +
        '3. 直接输出本次工作结果，不写与任务无关的前言后语。',
      model: '', effort: api.default_effort || 'medium',
      max_tokens: 32768, top_p: 0.95, temperature: null, thinking: false,
      use_target_chars: false, builtin: false
    });
    state.ui.modes = { sel: id };
    touch('modes'); renderMain();
    toast('已新增模式，可以开始编辑提示词。', 'ok');
  });
}

// ═══════════════════════════════════════════
// 模型设置
// ═══════════════════════════════════════════
function ensureApiProfiles(cfg) {
  cfg.api = cfg.api || {};
  cfg.server = cfg.server || {};
  cfg.server.host = cfg.server.host || '127.0.0.1';
  cfg.server.port = Number(cfg.server.port) || 8765;
  cfg.onboarding = cfg.onboarding || { done: false, version: 1 };
  cfg.api.profiles = cfg.api.profiles || {};
  cfg.api.provider = cfg.api.provider || 'deepseek';
  const preset = providerById(cfg.api.provider) || { base_url: '', models: [], default_model: '', default_effort: 'medium' };
  cfg.api.base_url = cfg.api.base_url != null ? cfg.api.base_url : (preset.base_url || '');
  cfg.api.models = (cfg.api.models && cfg.api.models.length) ? cfg.api.models : (preset.models || []).slice();
  cfg.api.default_model = cfg.api.default_model || preset.default_model || cfg.api.models[0] || '';
  if (cfg.api.models.length && !cfg.api.models.includes(cfg.api.default_model)) {
    cfg.api.default_model = cfg.api.models[0];
  }
  cfg.api.default_effort = cfg.api.default_effort || preset.default_effort || 'medium';
  cfg.api.max_tokens_field = cfg.api.max_tokens_field || preset.max_tokens_field || 'max_tokens';
  cfg.writing = cfg.writing || {};
  cfg.paths = cfg.paths || {};
  cfg.paths.log_dir = cfg.paths.log_dir || '../log';
}

function saveProviderProfile(cfg, providerId) {
  if (!providerId) return;
  const api = cfg.api;
  cfg.api.profiles[providerId] = {
    base_url: api.base_url || '',
    api_key: api.api_key || '',
    models: (api.models || []).slice(),
    default_model: api.default_model || '',
    default_effort: api.default_effort || 'medium',
    max_tokens_field: api.max_tokens_field || 'max_tokens'
  };
}

function loadProviderProfile(cfg, providerId) {
  const preset = providerById(providerId) || { base_url: '', models: [], default_model: '', default_effort: 'medium' };
  const saved = cfg.api.profiles[providerId] || {};
  cfg.api.base_url = saved.base_url != null ? saved.base_url : (preset.base_url || '');
  cfg.api.api_key = saved.api_key != null ? saved.api_key : '';
  cfg.api.models = (saved.models || preset.models || []).slice();
  cfg.api.default_model = saved.default_model || preset.default_model || cfg.api.models[0] || '';
  if (cfg.api.models.length && !cfg.api.models.includes(cfg.api.default_model)) {
    cfg.api.default_model = cfg.api.models[0];
  }
  cfg.api.default_effort = saved.default_effort || preset.default_effort || 'medium';
  cfg.api.max_tokens_field = saved.max_tokens_field || preset.max_tokens_field || 'max_tokens';
}

function viewAI(main) {
  const cfg = state.db.config = state.db.config || {};
  ensureApiProfiles(cfg);
  const api = cfg.api;
  const preset = providerById(api.provider) || { label: '自定义 / OpenAI 兼容', base_url: '', models: [], key_env: 'CUSTOM_API_KEY' };
  const customUrl = !preset || preset.id === 'custom' ||
    (api.base_url && preset.base_url && !sameProviderUrl(api.base_url, preset.base_url));
  const host = (() => {
    try { return new URL(api.base_url || preset.base_url || '').hostname.toLowerCase(); }
    catch (e) { return ''; }
  })();
  const keyOptional = preset.generic || preset.id === 'custom' ||
    ['127.0.0.1', 'localhost', '::1'].includes(host);
  const models = currentModels();

  main.appendChild(pageHead('模型设置',
    '支持多种 OpenAI 兼容提供商，也可以填写任意自定义 URL。API Key 只保存在本机 data/config.json。',
    h('div', { class: 'inline' },
      h('button', {
        text: '设置向导',
        onclick: () => showOnboarding(true)
      }),
      h('button', {
        text: '备份全部数据',
        onclick: async () => {
          try { const r = await apiCall('/api/backup', { method: 'POST' }); toast('已备份到：' + r.path, 'ok'); }
          catch (e) { toast('备份失败：' + e.message, 'err'); }
        }
      }))));

  const apiCard = h('div', { class: 'card' });
  apiCard.appendChild(h('h2', null, '接口与提供商'));
  apiCard.appendChild(h('div', { class: 'field' },
    h('label', { text: '提供商预设' }),
    h('select', {
      onchange: e => {
        saveProviderProfile(cfg, api.provider);
        api.provider = e.target.value;
        loadProviderProfile(cfg, api.provider);
        touch('config'); renderMain();
      }
    }, (state.providers || []).map(p => h('option', {
      value: p.id, text: p.label, selected: p.id === api.provider
    })))));
  if (!(api.api_key || '').trim() && !keyOptional) {
    apiCard.appendChild(h('div', { class: 'notice warn',
      text: '还没有填写 API Key。可以手动填写，或设置环境变量 ' + (preset.key_env || 'OPENAI_API_KEY') + '。' }));
  } else if (!(api.api_key || '').trim() && keyOptional) {
    apiCard.appendChild(h('div', { class: 'notice',
      text: '当前是自定义或本地接口，API Key 可以留空；如果接口要求鉴权，再手动填写即可。' }));
  }
  apiCard.appendChild(h('div', { class: 'field' },
    h('label', { text: '接口 URL（可留空使用预设，也可以自己填）' }),
    h('input', {
      type: 'text', value: api.base_url || '', placeholder: preset.base_url || 'https://example.com/v1',
      oninput: e => { api.base_url = e.target.value; touch('config'); }
    })));
  apiCard.appendChild(h('div', { class: 'field' },
    h('label', { text: 'API Key' }),
    h('input', {
      type: 'password', value: api.api_key || '',
      placeholder: (preset.key_env || 'CUSTOM_API_KEY') + '（可手动填写）',
      oninput: e => { api.api_key = e.target.value; touch('config'); }
    })));
  apiCard.appendChild(h('div', { class: 'field' },
    h('label', { text: '超时（秒）' }),
    h('input', {
      type: 'number', value: api.timeout || 899,
      oninput: e => { api.timeout = Number(e.target.value) || 899; touch('config'); }
    })));
  apiCard.appendChild(h('div', { class: customUrl ? 'notice warn' : 'notice' },
    h('span', { text: customUrl
      ? '自定义 URL：使用通用接口提示词，不强调具体模型或厂商。'
      : '使用「' + preset.label + '」预设接口提示词。' }),
    h('span', { class: 'small', text: customUrl ? '通用提示词' : preset.label })));
  apiCard.appendChild(h('div', { class: 'small muted',
    text: customUrl
      ? '通用接口提示词：不假定具体模型名称、厂商或特殊能力。'
      : (preset.prompt_note || '当前使用 OpenAI 兼容接口。') }));
  const adv = h('details', { class: 'input-details' });
  adv.appendChild(h('summary', null, '高级请求参数'));
  adv.appendChild(h('div', { class: 'inline' },
    h('div', { class: 'field' },
      h('label', { text: 'max_tokens 字段名' }),
      h('select', {
        onchange: e => { api.max_tokens_field = e.target.value; touch('config'); }
      }, ['max_tokens', 'max_completion_tokens'].map(value => h('option', {
        value, text: value, selected: value === (api.max_tokens_field || 'max_tokens')
      })))),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', checked: !!api.send_reasoning_effort,
        onchange: e => { api.send_reasoning_effort = e.target.checked; touch('config'); }
      }), '强制发送 reasoning_effort（自定义接口可能需要）'),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', checked: !!api.send_thinking,
        onchange: e => { api.send_thinking = e.target.checked; touch('config'); }
      }), '强制发送 thinking 参数')));
  apiCard.appendChild(adv);
  main.appendChild(apiCard);

  const modelCard = h('div', { class: 'card' });
  modelCard.appendChild(h('h2', null, '模型与默认参数',
    h('span', { class: 'hint', text: '模型列表可以从接口获取，也可以手动填写' })));
  modelCard.appendChild(h('div', { class: 'inline', style: { marginBottom: '8px' } },
    h('button', {
      text: '从接口获取可用模型',
      onclick: async ev => {
        const btn = ev.target;
        btn.disabled = true;
        status('获取模型中…', 'busy');
        try {
          const res = await apiCall('/api/models', { method: 'POST', body: { config: cfg } });
          api.models = res.models || [];
          if (!api.models.includes(api.default_model)) api.default_model = api.models[0] || '';
          touch('config'); renderMain();
          toast('已获取 ' + api.models.length + ' 个模型。', 'ok');
          status('模型列表已更新', 'ok');
        } catch (e) {
          toast('获取模型失败：' + e.message, 'err');
          status('获取失败', 'err');
        } finally { btn.disabled = false; }
      }
    }),
    h('span', { class: 'small muted', text: '需要接口支持 /models 端点；不支持时请手动填写。' })));
  modelCard.appendChild(h('div', { class: 'field' },
    h('label', { text: '可选模型（每行一个）' }),
    h('textarea', {
      rows: 6, value: (api.models || []).join('\n'),
      oninput: e => {
        api.models = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
        if (!api.models.includes(api.default_model)) api.default_model = api.models[0] || '';
        touch('config');
      }
    }),
    h('button', {
      class: 'mini', text: '刷新模型选项',
      onclick: () => renderMain()
    })));
  modelCard.appendChild(h('div', { class: 'inline' },
    h('div', { class: 'field', style: { flex: '1' } },
      h('label', { text: '默认模型' }),
      h('select', {
        onchange: e => { api.default_model = e.target.value; touch('config'); }
      }, (models.length ? models : [api.default_model || '']).map(m => h('option', {
        value: m, text: m || '（请先填写模型）', selected: m === api.default_model
      })))),
    h('div', { class: 'field' },
      h('label', { text: '默认推理强度' }),
      h('select', {
        onchange: e => { api.default_effort = e.target.value; touch('config'); }
      }, effortChoices().map(value => h('option', {
        value, text: value, selected: value === (api.default_effort || 'medium')
      }))))));
  modelCard.appendChild(h('div', { class: 'inline' },
    h('button', {
      class: 'primary', text: '保存配置',
      onclick: async () => {
        try {
          cfg.onboarding = cfg.onboarding || {};
          cfg.onboarding.done = true;
          saveProviderProfile(cfg, api.provider);
          await saveNow('config');
          toast('配置已保存', 'ok');
        } catch (e) { toast('保存失败：' + e.message, 'err'); }
      }
    }),
    h('button', {
      text: '测试连接',
      onclick: async ev => {
        const btn = ev.target;
        btn.disabled = true;
        status('测试中…', 'busy');
        try {
          const res = await apiCall('/api/ai/ping', {
            method: 'POST',
            body: { config: cfg, model: api.default_model || (api.models || [])[0] || '' }
          });
          toast('连通成功：' + res.result.model + '（' + res.result.elapsed + 's）', 'ok');
          status('连通正常', 'ok');
        } catch (e) {
          toast('测试失败：' + e.message, 'err');
          status('测试失败', 'err');
        } finally { btn.disabled = false; }
      }
    })));
  main.appendChild(modelCard);

  const wCard = h('div', { class: 'card' });
  wCard.appendChild(h('h2', null, '默认写作偏好'));
  wCard.appendChild(h('div', { class: 'inline' },
    h('div', { class: 'field' }, h('label', { text: '默认目标字数（字符）' }),
      h('input', { type: 'number', value: cfg.writing.target_chars || 8000, oninput: e => { cfg.writing.target_chars = Number(e.target.value) || 8000; touch('config'); } })),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: cfg.writing.strict_length !== false, onchange: e => { cfg.writing.strict_length = e.target.checked; touch('config'); } }),
      '默认作为硬性要求')));
  wCard.appendChild(h('div', { class: 'small muted', style: { marginTop: '6px' },
    text: '默认值会作为工作站目标字数的初始值；每次生成仍可单独修改。' }));
  main.appendChild(wCard);

  const sCard = h('div', { class: 'card' });
  sCard.appendChild(h('h2', null, '应用',
    h('span', { class: 'hint', text: '端口修改后需要重新启动' })));
  sCard.appendChild(h('div', { class: 'inline' },
    h('div', { class: 'field' },
      h('label', { text: '端口号（1–65535）' }),
      h('input', {
        type: 'number', min: 1, max: 65535,
        value: cfg.server.port || 8765,
        oninput: e => {
          const value = Number(e.target.value);
          if (Number.isInteger(value) && value >= 1 && value <= 65535) {
            cfg.server.port = value;
            touch('config');
          }
        }
      })),
    h('span', { class: 'small muted',
      text: '默认 8765。保存后下一次启动会自动使用新端口；命令行 --port 可临时覆盖。' })));
  main.appendChild(sCard);

  const pCard = h('div', { class: 'card' });
  pCard.appendChild(h('h2', null, '目录设置',
    h('span', { class: 'hint', text: '相对于 app/ 目录 ' + (state.paths.root || '') })));
  [['import_dir', '导入目录'], ['export_dir', '导出目录'],
   ['output_dir', '正文输出目录'], ['text_dir', '纯文本工作站'],
   ['log_dir', '日志目录']].forEach(([key, label]) => {
    pCard.appendChild(h('div', { class: 'field' }, h('label', { text: label + '（' + key + '）' }),
      h('input', { type: 'text', value: cfg.paths[key] || '', oninput: e => { cfg.paths[key] = e.target.value; touch('config'); } })));
  });
  pCard.appendChild(h('div', { class: 'small muted' },
    '数据目录默认是 app/data/，可通过环境变量 NOVELHELPER_DATA 覆盖。改完目录记得重启服务。'));
  main.appendChild(pCard);
}

// ═══════════════════════════════════════════
// 首次使用引导
// ═══════════════════════════════════════════
function maybeShowOnboarding() {
  const cfg = state.db.config || {};
  ensureApiProfiles(cfg);
  if (!(cfg.onboarding || {}).done) showOnboarding(false);
}

function showOnboarding(force) {
  const cfg = state.db.config = state.db.config || {};
  ensureApiProfiles(cfg);
  if (!force && (cfg.onboarding || {}).done) return;

  const body = h('div');
  let dialog = null;

  const finish = async configured => {
    cfg.onboarding = cfg.onboarding || {};
    cfg.onboarding.done = true;
    cfg.onboarding.version = 1;
    try {
      if (configured) saveProviderProfile(cfg, cfg.api.provider);
      await saveNow('config');
      if (dialog) dialog.close();
      await refreshFiles();
      renderNav();
      renderMain();
      toast(configured
        ? '配置已保存，可以开始使用。'
        : '已跳过引导，可随时在「模型设置」中配置。', 'ok');
    } catch (e) {
      toast('保存失败：' + e.message, 'err');
    }
  };

  const draw = () => {
    clear(body);
    const api = cfg.api;
    const preset = providerById(api.provider) ||
      { label: '自定义 / OpenAI 兼容', base_url: '', models: [], key_env: 'CUSTOM_API_KEY' };
    const models = currentModels();
    if (models.length && !models.includes(api.default_model)) {
      api.default_model = models[0];
    }
    const customUrl = preset.id === 'custom' ||
      (api.base_url && preset.base_url && !sameProviderUrl(api.base_url, preset.base_url));

    body.appendChild(h('div', { class: 'notice',
      text: '先选择接口并填写 API Key。可以跳过；不配置也能浏览和编辑设定，但开始生成前需要模型可用。' }));
    body.appendChild(h('div', { class: 'field' },
      h('label', { text: '提供商' }),
      h('select', {
        onchange: e => {
          saveProviderProfile(cfg, api.provider);
          api.provider = e.target.value;
          loadProviderProfile(cfg, api.provider);
          touch('config');
          draw();
        }
      }, (state.providers || []).map(p => h('option', {
        value: p.id, text: p.label, selected: p.id === api.provider
      })))));
    body.appendChild(h('div', { class: 'field' },
      h('label', { text: '接口 URL（可留空使用预设，也可以自己填）' }),
      h('input', {
        type: 'text', value: api.base_url || '',
        placeholder: preset.base_url || 'https://example.com/v1',
        oninput: e => { api.base_url = e.target.value; touch('config'); }
      })));
    body.appendChild(h('div', { class: 'field' },
      h('label', { text: 'API Key' }),
      h('input', {
        type: 'password', value: api.api_key || '',
        placeholder: (preset.key_env || 'CUSTOM_API_KEY') + '（可稍后填写）',
        oninput: e => { api.api_key = e.target.value; touch('config'); }
      })));
    body.appendChild(h('div', { class: 'inline', style: { marginBottom: '8px' } },
      h('button', {
        text: '从接口获取模型',
        onclick: async ev => {
          const btn = ev.target;
          btn.disabled = true;
          try {
            const res = await apiCall('/api/models', { method: 'POST', body: { config: cfg } });
            api.models = res.models || [];
            if (!api.models.includes(api.default_model)) api.default_model = api.models[0] || '';
            touch('config'); draw();
            toast('已获取 ' + api.models.length + ' 个模型。', 'ok');
          } catch (e) {
            toast('获取模型失败：' + e.message, 'err');
          } finally { btn.disabled = false; }
        }
      }),
      h('button', {
        text: '测试连接',
        onclick: async ev => {
          const btn = ev.target;
          btn.disabled = true;
          try {
            const res = await apiCall('/api/ai/ping', {
              method: 'POST',
              body: { config: cfg, model: api.default_model || api.models[0] || '' }
            });
            toast('连通成功：' + res.result.model + '（' + res.result.elapsed + 's）', 'ok');
          } catch (e) {
            toast('测试失败：' + e.message, 'err');
          } finally { btn.disabled = false; }
        }
      })));
    if (models.length) {
      body.appendChild(h('div', { class: 'field' },
        h('label', { text: '默认模型' }),
        h('select', {
          onchange: e => { api.default_model = e.target.value; touch('config'); }
        }, models.map(m => h('option', {
          value: m, text: m, selected: m === api.default_model
        })))));
    } else {
      body.appendChild(h('div', { class: 'field' },
        h('label', { text: '模型名（可手动填写）' }),
        h('input', {
          type: 'text', value: api.default_model || '',
          placeholder: '例如 gpt-4.1-mini / deepseek-flash',
          oninput: e => { api.default_model = e.target.value; touch('config'); }
        })));
    }
    body.appendChild(h('div', { class: 'field' },
      h('label', { text: '默认推理强度' }),
      h('select', {
        onchange: e => { api.default_effort = e.target.value; touch('config'); }
      }, effortChoices().map(value => h('option', {
        value, text: value, selected: value === (api.default_effort || 'medium')
      })))));
    body.appendChild(h('div', { class: 'notice' + (customUrl ? ' warn' : ''),
      text: customUrl
        ? '当前使用自定义 URL：将使用通用接口提示词。'
        : '当前使用「' + preset.label + '」预设接口提示词。' }));
    body.appendChild(h('div', { class: 'small muted',
      text: 'API Key 只保存在本机 app/data/config.json，不会上传到 NovelHelper 自己的服务。' }));
  };

  dialog = modal('欢迎使用 NovelHelper v2610.1', body, [
    h('button', {
      text: '跳过，稍后设置', dataset: { noclose: '1' },
      onclick: () => finish(false)
    }),
    h('button', {
      class: 'primary', text: '保存并开始', dataset: { noclose: '1' },
      onclick: () => finish(true)
    })
  ]);
  draw();
}
