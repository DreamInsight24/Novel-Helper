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
              body: { path: (state.paths.export || 'workspace/io/out') + '\\schema_' + ui.key + '.json', content: blob }
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

const PROMPT_TOOLS = [
  ['reason', '逻辑推理 + 剧情梗概'],
  ['write', '正文写作'],
  ['summarize', '章节总结'],
  ['compress', '记忆压缩'],
  ['idea', '灵感方案'],
  ['fix', '定点修复'],
  ['restyle', '格式重排']
];

const PROMPT_WORK = [
  ['logic', '逻辑写作'],
  ['outline', '框架写作'],
  ['draft', '完整写作'],
  ['polish', '润色修订'],
  ['brainstorm', '灵感方案']
];

const SECTION_LABELS = {
  world: '世界观区块标题',
  state: '当前状态区块标题',
  memory: '故事记忆区块标题',
  characters: '人物档案区块标题',
  factions: '势力设定区块标题',
  items: '道具设定区块标题',
  equipment: '服饰与装备区块标题',
  extra: '补充说明区块标题',
  files: '附加资料区块标题（可用 {path}）',
  plan: '已确认梗概区块标题',
  instruction: '（推理用）用户提示词区块标题',
  instruction_write: '（写作用）用户提示词区块标题',
  work_prompt: '工作提示词区块标题',
  length: '字数要求区块标题',
  task: '任务区块标题',
  task_reason: '推理任务说明',
  task_idea: '灵感任务说明',
  task_write: '写作任务说明',
  task_default: '无指令时的任务说明',
  length_strict: '字数硬要求（可用 {n}）',
  length_soft: '字数建议（可用 {n}）'
};

function viewPrompts(main) {
  state.db.prompts = state.db.prompts || { tools: {}, work: {}, sections: {} };
  const prm = state.db.prompts;
  prm.tools = prm.tools || {};
  prm.work = prm.work || {};
  prm.sections = prm.sections || {};
  state.ui.prompts = state.ui.prompts || { group: 'work', entry: 'draft' };
  const ui = state.ui.prompts;
  ui.group = ui.group || 'work';
  const entries = ui.group === 'work' ? PROMPT_WORK : PROMPT_TOOLS;
  if (!entries.some(([id]) => id === ui.entry)) ui.entry = entries[0][0];
  const bucket = ui.group === 'work' ? prm.work : prm.tools;

  main.appendChild(pageHead('提示词管理',
    '编辑 AI 工作站的工作提示词、旧版工具提示词与消息区块标题。修改会写入 data/prompts.json，界面与命令行共用同一份配置。'));

  const card = h('div', { class: 'card' });
  card.appendChild(h('h2', null, '系统提示词'));
  card.appendChild(h('div', { class: 'inline' },
    h('div', { class: 'field' },
      h('label', { text: '提示词分组' }),
      h('select', {
        onchange: e => {
          ui.group = e.target.value;
          ui.entry = (ui.group === 'work' ? PROMPT_WORK : PROMPT_TOOLS)[0][0];
          renderMain();
        }
      },
        h('option', { value: 'work', text: 'AI 工作站 · 工作提示词', selected: ui.group === 'work' }),
        h('option', { value: 'tool', text: '旧版工具 · system prompt', selected: ui.group === 'tool' }))),
    h('div', { class: 'field' },
      h('label', { text: '条目' }),
      h('select', {
        onchange: e => { ui.entry = e.target.value; renderMain(); }
      }, entries.map(([v, l]) => h('option', { value: v, text: l + '（' + v + '）', selected: v === ui.entry }))))));
  card.appendChild(h('div', { class: 'field' },
    h('label', { text: '提示词全文（支持 Markdown）' })));
  const toolArea = h('textarea', {
    rows: 24, value: bucket[ui.entry] || '',
    oninput: e => { bucket[ui.entry] = e.target.value; touch('prompts'); }
  });
  card.appendChild(toolArea);
  card.appendChild(h('div', { class: 'inline', style: { marginTop: '8px' } },
    h('span', { class: 'small muted', text: '当前 ' + (bucket[ui.entry] || '').length + ' 字' }),
    h('span', { style: { flex: '1' } }),
    h('button', {
      text: '恢复这一条的默认',
      onclick: async () => {
        try {
          const def = await api('/api/prompts/default?group=' + encodeURIComponent(ui.group) +
            '&tool=' + encodeURIComponent(ui.entry));
          bucket[ui.entry] = def.text;
          touch('prompts'); renderMain();
          toast('已恢复默认', 'ok');
        } catch (e) { toast('失败：' + e.message, 'err'); }
      }
    }),
    h('button', {
      class: 'primary', text: '保存',
      onclick: async () => { try { await saveNow('prompts'); toast('已保存', 'ok'); } catch (e) { toast('失败：' + e.message, 'err'); } }
    })));
  main.appendChild(card);

  const secCard = h('div', { class: 'card' });
  secCard.appendChild(h('h2', null, '拼装标题与任务说明',
    h('span', { class: 'hint', text: '发给模型的 user 消息由这些区块拼成；留空会使用内置默认值' })));
  const rows = h('div');
  Object.entries(SECTION_LABELS).forEach(([key, label]) => {
    const value = prm.sections[key] === undefined ? '' : prm.sections[key];
    const multi = value.length > 60 || /\n/.test(value);
    const input = multi
      ? h('textarea', { rows: 3, value, oninput: e => { prm.sections[key] = e.target.value; touch('prompts'); autoGrow(e.target); } })
      : h('input', { type: 'text', value, oninput: e => { prm.sections[key] = e.target.value; touch('prompts'); } });
    rows.appendChild(h('div', { class: 'field' },
      h('label', { text: label + '  (' + key + ')' }), input));
  });
  secCard.appendChild(rows);
  secCard.appendChild(h('div', { class: 'inline' },
    h('span', { class: 'small muted', text: '留空的项会被内置默认值替代' }),
    h('span', { style: { flex: '1' } }),
    h('button', {
      class: 'primary', text: '保存',
      onclick: async () => { try { await saveNow('prompts'); toast('已保存', 'ok'); } catch (e) { toast('失败：' + e.message, 'err'); } }
    })));
  main.appendChild(secCard);
}

// ═══════════════════════════════════════════
// 模型设置
// ═══════════════════════════════════════════
function viewAI(main) {
  const cfg = state.db.config;
  cfg.api = cfg.api || {};
  cfg.tools = cfg.tools || {};
  cfg.writing = cfg.writing || {};
  cfg.paths = cfg.paths || {};

  main.appendChild(pageHead('模型设置',
    '配置模型接口、各工具的模型与推理档，以及导入导出目录。API Key 只保存在本机 data/config.json，不会上传到任何第三方服务。',
    h('div', { class: 'inline' },
      h('button', {
        text: '备份全部数据',
        onclick: async () => {
          try { const r = await api('/api/backup', { method: 'POST' }); toast('已备份到：' + r.path, 'ok'); }
          catch (e) { toast('备份失败：' + e.message, 'err'); }
        }
      }))));

  const apiCard = h('div', { class: 'card' });
  apiCard.appendChild(h('h2', null, '接口'));
  if (!(cfg.api.api_key || '').trim()) {
    apiCard.appendChild(h('div', { class: 'notice warn', text: '还没有填写 API Key。填入后点「保存配置」，或设置环境变量 DEEPSEEK_API_KEY。' }));
  }
  apiCard.appendChild(h('div', { class: 'field' }, h('label', { text: 'Base URL' }),
    h('input', { type: 'text', value: cfg.api.base_url || '', oninput: e => { cfg.api.base_url = e.target.value; touch('config'); } })));
  apiCard.appendChild(h('div', { class: 'field' }, h('label', { text: 'API Key' }),
    h('input', { type: 'password', value: cfg.api.api_key || '', placeholder: 'sk-…（留空则读取 DEEPSEEK_API_KEY）', oninput: e => { cfg.api.api_key = e.target.value; touch('config'); } })));
  apiCard.appendChild(h('div', { class: 'field' }, h('label', { text: '超时（秒）' }),
    h('input', { type: 'number', value: cfg.api.timeout || 899, oninput: e => { cfg.api.timeout = Number(e.target.value) || 899; touch('config'); } })));
  apiCard.appendChild(h('div', { class: 'field' }, h('label', { text: '可选模型（每行一个，会出现在下面的下拉框里）' }),
    h('textarea', {
      rows: 4, value: (cfg.api.models || []).join('\n'),
      oninput: e => { cfg.api.models = e.target.value.split('\n').map(s => s.trim()).filter(Boolean); touch('config'); }
    })));
  main.appendChild(apiCard);

  const toolsCard = h('div', { class: 'card' });
  toolsCard.appendChild(h('h2', null, '工具与模型',
    h('span', { class: 'hint', text: '逻辑/框架使用 reason，完整写作使用 write，润色使用 fix，灵感使用 idea' })));
  const table = h('table', { class: 'grid' });
  table.appendChild(h('tr', null, ['工具', '模型', '推理档', 'max_tokens', 'top_p', 'thinking'].map(t => h('th', { text: t }))));
  const models = (cfg.api.models && cfg.api.models.length) ? cfg.api.models.slice() : ['deepseek-flash'];
  Object.keys(cfg.tools).forEach(key => {
    const t = cfg.tools[key];
    if (t.model && !models.includes(t.model)) models.push(t.model);
    table.appendChild(h('tr', null,
      h('td', { style: { textAlign: 'left' } }, h('div', { text: t.label || key }), h('div', { class: 'small muted', text: key })),
      h('td', null, h('select', { onchange: e => { t.model = e.target.value; touch('config'); } },
        models.map(m => h('option', { value: m, text: m, selected: m === t.model })))),
      h('td', null, h('select', { onchange: e => { t.effort = e.target.value; touch('config'); } },
        EFFORTS.map(m => h('option', { value: m, text: m, selected: m === t.effort })))),
      h('td', null, h('input', { type: 'number', value: t.max_tokens, oninput: e => { t.max_tokens = Number(e.target.value) || 8192; touch('config'); } })),
      h('td', null, h('input', { type: 'number', step: '0.05', value: t.top_p, oninput: e => { t.top_p = Number(e.target.value) || 0.95; touch('config'); } })),
      h('td', null, h('input', { type: 'checkbox', checked: !!t.thinking, onchange: e => { t.thinking = e.target.checked; touch('config'); } }))));
  });
  toolsCard.appendChild(table);
  toolsCard.appendChild(h('div', { class: 'inline', style: { marginTop: '10px' } },
    h('button', {
      class: 'primary', text: '保存配置',
      onclick: async () => { try { await saveNow('config'); toast('配置已保存', 'ok'); } catch (e) { toast('保存失败：' + e.message, 'err'); } }
    }),
    h('button', {
      text: '测试连接',
      onclick: async ev => {
        const btn = ev.target;
        btn.disabled = true;
        status('测试中…', 'busy');
        try {
          const res = await api('/api/ai/ping', { method: 'POST', body: { config: cfg } });
          toast('连通成功：' + res.result.model + '（' + res.result.elapsed + 's）', 'ok');
          status('连通正常', 'ok');
        } catch (e) { toast('测试失败：' + e.message, 'err'); status('测试失败', 'err'); }
        finally { btn.disabled = false; }
      }
    })));
  main.appendChild(toolsCard);

  const wCard = h('div', { class: 'card' });
  wCard.appendChild(h('h2', null, '默认写作偏好'));
  wCard.appendChild(h('div', { class: 'inline' },
    h('div', { class: 'field' }, h('label', { text: '默认目标字数（字符）' }),
      h('input', { type: 'number', value: cfg.writing.target_chars || 8000, oninput: e => { cfg.writing.target_chars = Number(e.target.value) || 8000; touch('config'); } })),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: cfg.writing.strict_length !== false, onchange: e => { cfg.writing.strict_length = e.target.checked; touch('config'); } }),
      '默认作为硬性要求发送')));
  wCard.appendChild(h('div', { class: 'small muted', style: { marginTop: '6px' },
    text: '这里只是默认值；每次生成时可以在 AI 工作站左侧单独修改目标字数，那一条优先。' }));
  main.appendChild(wCard);

  const pCard = h('div', { class: 'card' });
  pCard.appendChild(h('h2', null, '目录',
    h('span', { class: 'hint', text: '相对于 app/ 目录 ' + (state.paths.root || '') })));
  [['import_dir', '导入默认目录'], ['export_dir', '导出默认目录'], ['output_dir', '小说产出目录'],
   ['plan_dir', '写作计划目录'], ['txt_dir', 'txt 转换目录'], ['text_dir', '纯文本工作站文件夹']].forEach(([key, label]) => {
    pCard.appendChild(h('div', { class: 'field' }, h('label', { text: label + '（' + key + '）' }),
      h('input', { type: 'text', value: cfg.paths[key] || '', oninput: e => { cfg.paths[key] = e.target.value; touch('config'); } })));
  });
  pCard.appendChild(h('div', { class: 'small muted' },
    '数据目录默认是 app/data/，可通过环境变量 NOVELHELPER_DATA 覆盖。改完目录记得重启服务。'));
  main.appendChild(pCard);
}
