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

/* NovelHelper —— 元素模板 / 提示词 / 模型设置 */
'use strict';

// ═══════════════════════════════════════════
// 元素模板
// ═══════════════════════════════════════════
const SCHEMA_KEYS = [
  ['characters', i18n.t('nav.characters')],
  ['factions', i18n.t('nav.factions')],
  ['items', i18n.t('nav.items')],
  ['equipment', i18n.t('nav.equipment')],
  ['other', i18n.t('nav.other')]
];

/** 元素模板页的可选集合 = 内置 5 个 + 所有自定义栏目。 */
function schemaKeyChoices() {
  return SCHEMA_KEYS.concat(sectionDefs(true).map(sec =>
    ['section_' + sec.key, sec.on === false ? i18n.t('common.disabled_name', {name: sec.label || sec.key}) : (sec.label || sec.key)]));
}

function viewElements(main) {
  state.db.schema = state.db.schema || {};
  state.ui.elements = state.ui.elements || { key: 'characters' };
  const ui = state.ui.elements;
  const entry = state.db.schema[ui.key] = state.db.schema[ui.key] || { label: '', elements: [] };
  entry.elements = entry.elements || [];

  main.appendChild(pageHead(i18n.t('nav.elements'),
    i18n.t('elements.page_desc'),
    h('div', { class: 'inline' },
      h('button', {
        text: i18n.t('elements.apply_to_all'),
        onclick: () => {
          const coll = ui.key;
          const items = collItems(coll);
          if (!items.length) { toast(i18n.t('elements.no_records'), 'err'); return; }
          if (!confirm(i18n.t('elements.apply_confirm', { collection: coll, count: items.length }))) return;
          let total = 0;
          items.forEach(rec => { rec.elements = rec.elements || []; total += applyPreset(rec.elements, entry.elements); });
          touch(coll);
          toast(i18n.t('elements.applied_count', { count: total }), 'ok');
        }
      }),
      h('button', {
        text: i18n.t('elements.export_json'),
        onclick: async () => {
          try {
            await saveNow('schema');
            const blob = JSON.stringify(state.db.schema[ui.key] || {}, null, 2);
            const res = await api('/api/io/export', {
              method: 'POST',
              body: { path: (state.paths.export || 'workspace/export') + '\\schema_' + ui.key + '.json', content: blob }
            });
            toast(i18n.t('common.exported_to', { path: res.path }), 'ok');
          } catch (e) { toast(i18n.t('common.export_failed_reason', { reason: e.message }), 'err'); }
        }
      }))));

  const card = h('div', { class: 'card' });
  card.appendChild(h('div', { class: 'field' },
    h('label', { text: i18n.t('elements.edit_which') }),
    h('select', {
      onchange: e => { ui.key = e.target.value; renderMain(); }
    }, schemaKeyChoices().map(([v, l]) => h('option', { value: v, selected: v === ui.key, text: l })))));

  card.appendChild(h('div', { class: 'sep' }));
  card.appendChild(h('div', { class: 'small muted', style: { marginBottom: '8px' } },
    i18n.t('elements.group_hint')));
  card.appendChild(elementTree(entry.elements, 'schema', {
    hideValues: true,
    onChange: () => { entry.label = entry.label || ''; }
  }));
  main.appendChild(card);

  const help = h('div', { class: 'card' });
  help.appendChild(h('h2', null, i18n.t('elements.help_title')));
  help.appendChild(h('div', { class: 'md', html: md(
    i18n.t('elements.help')
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

  main.appendChild(pageHead(i18n.t('nav.sections'),
    i18n.t('sections.page_desc'),
    h('div', { class: 'inline' },
      h('button', {
        class: 'primary', text: i18n.t('sections.add'),
        onclick: () => {
          const label = prompt(i18n.t('sections.name_prompt'));
          if (!label) return;
          let key = (prompt(i18n.t('sections.key_prompt')) || '').trim().toLowerCase();
          if (!/^[a-z][a-z0-9_]*$/.test(key)) {
            key = 'sec' + Math.random().toString(36).slice(2, 6);
            toast(i18n.t('sections.key_invalid', { key: key }), 'err');
          }
          if (defs.some(s => s.key === key)) { toast(i18n.t('sections.key_exists'), 'err'); return; }
          defs.push({ key, label, desc: '', auto_from: [], on: true });
          touch('sections'); renderNav(); renderMain();
        }
      }),
      h('button', {
        text: i18n.t('sections.auto_sort'),
        title: i18n.t('sections.auto_sort_title'),
        onclick: async ev => {
          ev.target.disabled = true;
          status(i18n.t('common.sorting'), 'busy');
          try {
            const res = await api('/api/sections/auto-sort', { method: 'POST', body: {} });
            setDb(res.collections);
            toast(res.message, 'ok');
            renderNav(); renderMain();
          } catch (e) { toast(i18n.t('sections.sort_failed_reason', { reason: e.message }), 'err'); }
          finally { ev.target.disabled = false; }
        }
      }))));

  const card = h('div', { class: 'card' });
  card.appendChild(h('h2', null, i18n.t('sections.list_title'), h('span', { class: 'hint', text: i18n.t('sections.hide_hint') })));
  if (!defs.length) card.appendChild(h('div', { class: 'muted small', text: i18n.t('sections.empty') }));
  defs.forEach((sec, i) => {
    const view = 'section_' + sec.key;
    const count = collItems(view).length;
    card.appendChild(h('div', { class: 'row', style: { borderBottom: '1px solid var(--line)', padding: '10px 0' } },
      h('div', { class: 'col', style: { flex: '0 0 240px' } },
        h('label', { class: 'check' },
          h('input', {
            type: 'checkbox', checked: sec.on !== false,
            onchange: e => { sec.on = e.target.checked; touch('sections'); renderNav(); renderMain(); }
          }), i18n.t('sections.enable')),
        h('div', { class: 'field', style: { marginTop: '6px' } },
          h('input', { type: 'text', value: sec.label || '', placeholder: i18n.t('sections.name_placeholder'), oninput: e => { sec.label = e.target.value; touch('sections'); renderNav(); } })),
        h('div', { class: 'small muted', text: i18n.t('sections.key_count', { key: sec.key, count: count }) })),
      h('div', { class: 'col' },
        h('div', { class: 'field' }, h('label', { text: i18n.t('sections.desc_label') }),
          h('input', { type: 'text', value: sec.desc || '', oninput: e => { sec.desc = e.target.value; touch('sections'); } })),
        h('div', { class: 'field' }, h('label', { text: i18n.t('sections.auto_from_label') }),
          h('input', {
            type: 'text', value: (sec.auto_from || []).join('，'),
            oninput: e => { sec.auto_from = e.target.value.split(/[，,、]/).map(s => s.trim()).filter(Boolean); touch('sections'); }
          })),
        h('div', { class: 'inline' },
          h('button', { class: 'mini', text: '↑', title: i18n.t('common.move_up'), onclick: () => { if (i > 0) { [defs[i - 1], defs[i]] = [defs[i], defs[i - 1]]; touch('sections'); renderNav(); renderMain(); } } }),
          h('button', { class: 'mini', text: '↓', title: i18n.t('common.move_down'), onclick: () => { if (i < defs.length - 1) { [defs[i + 1], defs[i]] = [defs[i], defs[i + 1]]; touch('sections'); renderNav(); renderMain(); } } }),
          h('button', {
            text: i18n.t('sections.open'), onclick: () => go(view)
          }),
          h('button', {
            class: 'danger', text: i18n.t('sections.delete'),
            onclick: () => {
              if (!confirm(i18n.t('sections.delete_confirm', {label: sec.label || sec.key, key: sec.key}))) return;
              defs.splice(i, 1);
              touch('sections'); renderNav(); renderMain();
            }
          })))));
  });
  main.appendChild(card);

  const tip = h('div', { class: 'card' });
  tip.appendChild(h('h2', null, i18n.t('common.help')));
  tip.appendChild(h('div', { class: 'md', html: md(
    i18n.t('sections.help')
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
  const options = [{ value: '', label: defaultModelName() ? i18n.t('modes.follow_default', {name: defaultModelName()}) : i18n.t('modes.follow_default_empty') }];
  models.forEach(m => options.push({ value: m, label: m }));
  if (mode.model && !models.includes(mode.model)) {
    options.push({ value: mode.model, label: i18n.t('modes.not_in_list', { model: mode.model }) });
  }
  return options;
}

const MODE_KINDS = [
  { id: 'write', label: i18n.t('modes.kind_write'), desc: i18n.t('modes.kind_write_desc') },
  { id: 'process', label: i18n.t('modes.kind_process'), desc: i18n.t('modes.kind_process_desc') }
];

function modeKindLabel(kind) {
  const item = MODE_KINDS.find(k => k.id === kind);
  return item ? item.label : i18n.t('modes.kind_write');
}

function viewModes(main) {
  const modes = dbModes();
  if (!modes.length && state.default_modes && state.default_modes.length) {
    state.default_modes.forEach(m => modes.push(JSON.parse(JSON.stringify(m))));
    touch('modes');
  }
  state.ui.modes = state.ui.modes || {};
  const ui = state.ui.modes;
  ui.kind = ui.kind === 'process' ? 'process' : 'write';
  const listModes = () => modes.filter(m => modeKind(m) === ui.kind);
  if (!listModes().some(m => m.id === ui.sel)) {
    ui.sel = listModes().length ? listModes()[0].id : '';
  }

  const models = currentModels();
  const stale = modes.filter(m => m.model && models.length && !models.includes(m.model));

  main.appendChild(pageHead(i18n.t('nav.modes'),
    i18n.t('modes.page_desc'),
    h('div', { class: 'inline' },
      h('button', {
        text: i18n.t('modes.sync_button'),
        title: i18n.t('modes.sync_title'),
        onclick: () => {
          const api = apiCfg();
          modes.forEach(m => {
            m.model = '';
            m.effort = api.default_effort || 'medium';
          });
          touch('modes'); renderMain();
          toast(i18n.t('modes.synced'), 'ok');
        }
      }),
      h('button', {
        class: 'primary', text: i18n.t('modes.add_kind', { kind: modeKindLabel(ui.kind) }),
        onclick: () => addModeDialog(ui.kind)
      }))));

  const tabs = h('div', { class: 'mode-tabs' },
    MODE_KINDS.map(kind => h('button', {
      class: 'mode-tab' + (ui.kind === kind.id ? ' on' : ''),
      title: kind.desc,
      onclick: () => {
        if (ui.kind === kind.id) return;
        ui.kind = kind.id;
        ui.sel = '';
        renderMain();
      }
    }, kind.label, h('span', { class: 'count', text: String(modes.filter(m => modeKind(m) === kind.id).length) }))));
  main.appendChild(tabs);

  if (stale.length) {
    main.appendChild(h('div', { class: 'notice warn' },
      h('span', { text: i18n.t('modes.stale_warning', { count: stale.length }) }),
      h('button', { class: 'mini', text: i18n.t('modes.sync_one'), onclick: () => {
        const api = apiCfg();
        modes.forEach(m => { m.model = ''; m.effort = api.default_effort || 'medium'; });
        touch('modes'); renderMain();
      } })));
  }
  if (!models.length) {
    main.appendChild(h('div', { class: 'notice warn',
      text: i18n.t('modes.no_models') }));
  }

  const row = h('div', { class: 'row' });
  const left = h('div', { class: 'col', style: { flex: '0 0 300px' } });
  const right = h('div', { class: 'col' });
  row.appendChild(left); row.appendChild(right);
  main.appendChild(row);

  const drawList = () => {
    clear(left);
    const visible = listModes();
    const card = h('div', { class: 'card' },
      h('h2', null, i18n.t('modes.list_title', { kind: modeKindLabel(ui.kind) }), h('span', { class: 'hint', text: i18n.t('modes.count', { count: visible.length }) })));
    if (!visible.length) {
      card.appendChild(h('div', { class: 'muted small', style: { marginBottom: '10px' } },
        i18n.t('modes.group_empty')));
      card.appendChild(h('button', {
        class: 'primary', text: i18n.t('modes.add_kind', { kind: modeKindLabel(ui.kind) }),
        onclick: () => addModeDialog(ui.kind)
      }));
    } else {
      const list = h('div', { class: 'list' });
      visible.forEach(mode => {
        list.appendChild(h('div', {
          class: 'list-item' + (mode.id === ui.sel ? ' active' : ''),
          onclick: () => { ui.sel = mode.id; drawList(); drawEditor(); }
        },
          h('div', { class: 'name', text: mode.label || mode.id }),
          h('div', { class: 'meta', text: (mode.model || i18n.t('settings.default_model_label')) + ' · ' + (mode.effort || 'medium') })));
      });
      card.appendChild(list);
    }
    left.appendChild(card);
  };

  const drawEditor = () => {
    clear(right);
    const mode = modes.find(m => m.id === ui.sel);
    if (!mode) {
      right.appendChild(h('div', { class: 'card muted', text: i18n.t('modes.pick_hint') }));
      return;
    }
    const card = h('div', { class: 'card' });
    card.appendChild(h('h2', null, mode.label || mode.id,
      h('span', { class: 'hint', text: i18n.t('modes.autosave_hint') })));

    // 模型与推理强度：放在模式编辑器顶部
    const modelRow = h('div', { class: 'mode-settings-top' });
    modelRow.appendChild(h('div', { class: 'field' },
      h('label', { text: i18n.t('modes.model_label') }),
      h('select', {
        onchange: e => { mode.model = e.target.value; touch('modes'); drawList(); }
      }, modeModelOptions(mode).map(opt => h('option', {
        value: opt.value, text: opt.label, selected: opt.value === (mode.model || '')
      })))));
    modelRow.appendChild(h('div', { class: 'field' },
      h('label', { text: i18n.t('modes.effort_label') }),
      h('select', {
        onchange: e => { mode.effort = e.target.value; touch('modes'); drawList(); }
      }, effortChoices().map(value => h('option', {
        value, text: value, selected: value === (mode.effort || 'medium')
      })))));
    card.appendChild(modelRow);
    card.appendChild(h('div', { class: 'small muted', style: { marginBottom: '10px' } },
      i18n.t('modes.model_hint')));

    card.appendChild(h('div', { class: 'field' },
      h('label', { text: i18n.t('modes.name_label') }),
      h('input', { type: 'text', value: mode.label || '', oninput: e => { mode.label = e.target.value; touch('modes'); drawList(); } })));
    card.appendChild(h('div', { class: 'field' },
      h('label', { text: i18n.t('modes.kind_label') }),
      h('select', {
        onchange: e => {
          mode.kind = e.target.value === 'process' ? 'process' : 'write';
          if (mode.kind === 'process') mode.use_target_chars = false;
          ui.kind = mode.kind;
          ui.sel = mode.id;
          touch('modes');
          renderMain();
        }
      }, MODE_KINDS.map(kind => h('option', {
        value: kind.id, text: kind.label + '（' + kind.desc + '）',
        selected: modeKind(mode) === kind.id
      })))));
    card.appendChild(h('div', { class: 'small muted', style: { marginBottom: '10px' } },
      i18n.t('modes.kind_hint')));
    card.appendChild(h('div', { class: 'field' },
      h('label', { text: i18n.t('common.one_line_desc') }),
      h('input', { type: 'text', value: mode.desc || '', oninput: e => { mode.desc = e.target.value; touch('modes'); } })));

    const advanced = h('details', { class: 'input-details' });
    advanced.appendChild(h('summary', null, i18n.t('modes.advanced')));
    advanced.appendChild(h('div', { class: 'inline' },
      h('div', { class: 'field' }, h('label', { text: 'max_tokens' }),
        h('input', { type: 'number', value: mode.max_tokens || 32768, oninput: e => { mode.max_tokens = Number(e.target.value) || 32768; touch('modes'); } })),
      h('div', { class: 'field' }, h('label', { text: 'top_p' }),
        h('input', { type: 'number', step: '0.05', value: mode.top_p == null ? 0.95 : mode.top_p, oninput: e => { mode.top_p = Number(e.target.value) || 0.95; touch('modes'); } })),
      h('div', { class: 'field' }, h('label', { text: i18n.t('modes.temp_label') }),
        h('input', {
          type: 'number', step: '0.05', value: mode.temperature == null ? '' : mode.temperature,
          placeholder: i18n.t('modes.api_default'),
          oninput: e => {
            const v = e.target.value.trim();
            const n = Number(v);
            mode.temperature = v === '' || !Number.isFinite(n) ? null : n;
            touch('modes');
          }
        })),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: !!mode.thinking, onchange: e => { mode.thinking = e.target.checked; touch('modes'); } }),
        i18n.t('modes.thinking_option')),
      modeKind(mode) === 'write' ? h('label', { class: 'check' },
        h('input', {
          type: 'checkbox', checked: mode.use_target_chars !== false,
          onchange: e => { mode.use_target_chars = e.target.checked; touch('modes'); }
        }),
        i18n.t('modes.target_chars_option')) : null));
    card.appendChild(advanced);
    card.appendChild(h('div', { class: 'small muted', style: { marginBottom: '10px' } },
      modeKind(mode) === 'process'
        ? i18n.t('modes.target_chars_process_hint')
        : i18n.t('modes.target_chars_write_hint')));

    card.appendChild(h('div', { class: 'field', style: { marginTop: '10px' } },
      h('label', { text: i18n.t('modes.system_prompt_label') }),
      h('div', {class: 'small muted', text: i18n.t('common.default_content')}),
      h('textarea', {
        rows: 22, value: mode.system_prompt || '',
        oninput: e => { mode.system_prompt = e.target.value; touch('modes'); autoGrow(e.target); }
      })));
    card.appendChild(h('div', { class: 'small muted', text: i18n.t('modes.prompt_saved_hint') }));

    card.appendChild(h('div', { class: 'inline', style: { marginTop: '10px' } },
      h('button', {
        text: i18n.t('modes.restore_builtin'),
        onclick: () => {
          const def = defaultModeFor(mode.id);
          if (!def) { toast(i18n.t('modes.no_builtin'), 'err'); return; }
          if (!confirm(i18n.t('modes.restore_confirm', { label: def.label || def.id }))) return;
          mode.kind = modeKind(def);
          mode.system_prompt = def.system_prompt;
          mode.effort = def.effort;
          mode.max_tokens = def.max_tokens;
          mode.top_p = def.top_p;
          mode.temperature = def.temperature;
          mode.thinking = def.thinking;
          mode.use_target_chars = def.use_target_chars;
          ui.kind = mode.kind;
          ui.sel = mode.id;
          touch('modes'); renderMain(); toast(i18n.t('modes.restored'), 'ok');
        }
      }),
      h('button', {
        text: '↑', title: i18n.t('common.move_up'),
        onclick: () => {
          const i = modes.indexOf(mode);
          if (i > 0) { [modes[i - 1], modes[i]] = [modes[i], modes[i - 1]]; touch('modes'); renderMain(); }
        }
      }),
      h('button', {
        text: '↓', title: i18n.t('common.move_down'),
        onclick: () => {
          const i = modes.indexOf(mode);
          if (i >= 0 && i < modes.length - 1) { [modes[i + 1], modes[i]] = [modes[i], modes[i + 1]]; touch('modes'); renderMain(); }
        }
      }),
      h('span', { style: { flex: '1' } }),
      h('button', {
        class: 'danger', text: i18n.t('modes.delete'),
        onclick: () => {
          if (modes.length <= 1) { toast(i18n.t('modes.keep_one'), 'err'); return; }
          if (!confirm(i18n.t('modes.delete_confirm', { label: mode.label || mode.id }))) return;
          modes.splice(modes.indexOf(mode), 1);
          const remaining = listModes();
          ui.sel = remaining.length ? remaining[0].id : '';
          touch('modes'); renderMain(); toast(i18n.t('modes.deleted'), 'ok');
        }
      })));
    right.appendChild(card);
  };

  drawList(); drawEditor();
}

function addModeDialog(kind) {
  const kindId = kind === 'process' ? 'process' : 'write';
  const defaultLabel = kindId === 'process'
    ? i18n.t('defaults.mode.new_process')
    : i18n.t('defaults.mode.new_write');
  const prompt = kindId === 'process'
    ? i18n.t('defaults.mode.new_process_prompt')
    : i18n.t('defaults.mode.new_write_prompt');
  askDialog(i18n.t('modes.add_kind_title', { kind: modeKindLabel(kindId) }), i18n.t('modes.name_label'), defaultLabel, name => {
    const label = (name || '').trim() || defaultLabel;
    const modes = dbModes();
    const api = apiCfg();
    const id = 'mode_' + Math.random().toString(36).slice(2, 8);
    modes.push({
      id, label, kind: kindId, desc: '',
      system_prompt: prompt,
      model: '', effort: api.default_effort || 'medium',
      max_tokens: 32768, top_p: 0.95, temperature: null, thinking: false,
      use_target_chars: false, builtin: false
    });
    state.ui.modes = { kind: kindId, sel: id };
    touch('modes'); renderMain();
    toast(i18n.t('modes.added', { kind: modeKindLabel(kindId) }), 'ok');
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
  const isGlobal = state.level === 'home';
  const cfg = state.db.config = state.db.config || {};
  ensureApiProfiles(cfg);
  const api = cfg.api;
  const preset = providerById(api.provider) || { label: i18n.t('settings.custom_preset'), base_url: '', models: [], key_env: 'CUSTOM_API_KEY' };
  const customUrl = !preset || preset.id === 'custom' ||
    (api.base_url && preset.base_url && !sameProviderUrl(api.base_url, preset.base_url));
  const host = (() => {
    try { return new URL(api.base_url || preset.base_url || '').hostname.toLowerCase(); }
    catch (e) { return ''; }
  })();
  const keyOptional = preset.generic || preset.id === 'custom' ||
    ['127.0.0.1', 'localhost', '::1'].includes(host);
  const models = currentModels();

  const restoreBtn = h('button', {
    text: i18n.t('settings.restore_global'),
    disabled: !novelHasOverrides(),
    onclick: restoreNovelConfig
  });
  if (!isGlobal) state.ui.restoreButton = restoreBtn;
  main.appendChild(pageHead(isGlobal ? i18n.t('settings.global_settings') : i18n.t('nav.settings'),
    i18n.t('settings.page_desc'),
    h('div', { class: 'inline' },
      !isGlobal ? restoreBtn : null,
      h('button', {
        text: i18n.t('settings.wizard'),
        onclick: () => showOnboarding(true)
      }),
      h('button', {
        text: i18n.t('settings.backup_all'),
        onclick: async () => {
          try { const r = await apiCall('/api/backup', { method: 'POST' }); toast(i18n.t('settings.backed_up_to', { path: r.path }), 'ok'); }
          catch (e) { toast(i18n.t('settings.backup_failed_reason', { reason: e.message }), 'err'); }
        }
      }))));

  if (!isGlobal) {
    apiCardNotice(main, i18n.t('settings.novel_scope_hint'));
  }

  const apiCard = h('div', { class: 'card' });
  apiCard.appendChild(h('h2', null, i18n.t('settings.api_section')));
  apiCard.appendChild(h('div', { class: 'field' },
    h('label', { text: i18n.t('settings.provider_label') }),
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
      text: i18n.t('settings.no_key_hint', { env: preset.key_env || 'OPENAI_API_KEY' }) }));
  } else if (!(api.api_key || '').trim() && keyOptional) {
    apiCard.appendChild(h('div', { class: 'notice',
      text: i18n.t('settings.key_optional_hint') }));
  }
  apiCard.appendChild(h('div', { class: 'field' },
    h('label', { text: i18n.t('settings.url_label') }),
    h('input', {
      type: 'text', value: api.base_url || '', placeholder: preset.base_url || 'https://example.com/v1',
      oninput: e => { api.base_url = e.target.value; touch('config'); }
    })));
  apiCard.appendChild(h('div', { class: 'field' },
    h('label', { text: 'API Key' }),
    h('input', {
      type: 'password', value: api.api_key || '',
      placeholder: i18n.t('settings.key_placeholder', { env: preset.key_env || 'CUSTOM_API_KEY' }),
      oninput: e => { api.api_key = e.target.value; touch('config'); }
    })));
  apiCard.appendChild(h('div', { class: 'field' },
    h('label', { text: i18n.t('settings.timeout_label') }),
    h('input', {
      type: 'number', value: api.timeout || 899,
      oninput: e => { api.timeout = Number(e.target.value) || 899; touch('config'); }
    })));
  apiCard.appendChild(h('div', { class: customUrl ? 'notice warn' : 'notice' },
    h('span', { text: customUrl
      ? i18n.t('settings.custom_url_hint')
      : i18n.t('settings.preset_hint', { label: preset.label }) }),
    h('span', { class: 'small', text: customUrl ? i18n.t('settings.generic_prompt') : preset.label })));
  apiCard.appendChild(h('div', { class: 'small muted',
    text: customUrl
      ? i18n.t('settings.generic_prompt_hint')
      : (preset.prompt_note || i18n.t('settings.openai_compat_note')) }));
  const adv = h('details', { class: 'input-details' });
  adv.appendChild(h('summary', null, i18n.t('settings.advanced')));
  adv.appendChild(h('div', { class: 'inline' },
    h('div', { class: 'field' },
      h('label', { text: i18n.t('settings.max_tokens_label') }),
      h('select', {
        onchange: e => { api.max_tokens_field = e.target.value; touch('config'); }
      }, ['max_tokens', 'max_completion_tokens'].map(value => h('option', {
        value, text: value, selected: value === (api.max_tokens_field || 'max_tokens')
      })))),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', checked: !!api.send_reasoning_effort,
        onchange: e => { api.send_reasoning_effort = e.target.checked; touch('config'); }
      }), i18n.t('settings.force_reasoning')),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', checked: !!api.send_thinking,
        onchange: e => { api.send_thinking = e.target.checked; touch('config'); }
      }), i18n.t('settings.force_thinking'))));
  apiCard.appendChild(adv);
  main.appendChild(apiCard);

  const modelCard = h('div', { class: 'card' });
  modelCard.appendChild(h('h2', null, i18n.t('settings.models_section'),
    h('span', { class: 'hint', text: i18n.t('settings.models_hint') })));
  modelCard.appendChild(h('div', { class: 'inline', style: { marginBottom: '8px' } },
    h('button', {
      text: i18n.t('settings.fetch_models'),
      onclick: async ev => {
        const btn = ev.target;
        btn.disabled = true;
        status(i18n.t('common.fetching'), 'busy');
        try {
          const res = await apiCall('/api/models', { method: 'POST', body: { config: cfg } });
          api.models = res.models || [];
          if (!api.models.includes(api.default_model)) api.default_model = api.models[0] || '';
          touch('config'); renderMain();
          toast(i18n.t('settings.fetched_models', { count: api.models.length }), 'ok');
          status(i18n.t('settings.models_updated'), 'ok');
        } catch (e) {
          toast(i18n.t('settings.fetch_failed_reason', { reason: e.message }), 'err');
          status(i18n.t('settings.fetch_failed'), 'err');
        } finally { btn.disabled = false; }
      }
    }),
    h('span', { class: 'small muted', text: i18n.t('settings.models_endpoint_hint') })));
  modelCard.appendChild(h('div', { class: 'field' },
    h('label', { text: i18n.t('settings.models_label') }),
    h('textarea', {
      rows: 6, value: (api.models || []).join('\n'),
      oninput: e => {
        api.models = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
        if (!api.models.includes(api.default_model)) api.default_model = api.models[0] || '';
        touch('config');
      }
    }),
    h('button', {
      class: 'mini', text: i18n.t('settings.refresh_models'),
      onclick: () => renderMain()
    })));
  modelCard.appendChild(h('div', { class: 'inline' },
    h('div', { class: 'field', style: { flex: '1' } },
      h('label', { text: i18n.t('settings.default_model_label') }),
      h('select', {
        onchange: e => { api.default_model = e.target.value; touch('config'); }
      }, (models.length ? models : [api.default_model || '']).map(m => h('option', {
        value: m, text: m || i18n.t('settings.no_model_option'), selected: m === api.default_model
      })))),
    h('div', { class: 'field' },
      h('label', { text: i18n.t('settings.default_effort_label') }),
      h('select', {
        onchange: e => { api.default_effort = e.target.value; touch('config'); }
      }, effortChoices().map(value => h('option', {
        value, text: value, selected: value === (api.default_effort || 'medium')
      }))))));
  modelCard.appendChild(h('div', { class: 'inline' },
    h('button', {
      class: 'primary', text: i18n.t('settings.save'),
      onclick: async () => {
        try {
          cfg.onboarding = cfg.onboarding || {};
          cfg.onboarding.done = true;
          saveProviderProfile(cfg, api.provider);
          await saveNow('config');
          await refreshConfigMeta();
          renderMain();
          toast(i18n.t('settings.saved'), 'ok');
        } catch (e) { toast(i18n.t('common.save_failed_reason', { reason: e.message }), 'err'); }
      }
    }),
    h('button', {
      text: i18n.t('settings.test'),
      onclick: async ev => {
        const btn = ev.target;
        btn.disabled = true;
        status(i18n.t('common.testing'), 'busy');
        try {
          const res = await apiCall('/api/ai/ping', {
            method: 'POST',
            body: { config: cfg, model: api.default_model || (api.models || [])[0] || '' }
          });
          toast(i18n.t('settings.test_ok', { model: res.result.model, elapsed: res.result.elapsed }), 'ok');
          status(i18n.t('settings.test_ok_short'), 'ok');
        } catch (e) {
          toast(i18n.t('settings.test_failed_reason', { reason: e.message }), 'err');
          status(i18n.t('settings.test_failed'), 'err');
        } finally { btn.disabled = false; }
      }
    })));
  main.appendChild(modelCard);

  const wCard = h('div', { class: 'card' });
  wCard.appendChild(h('h2', null, i18n.t('settings.writing_section')));
  wCard.appendChild(h('div', { class: 'inline' },
    h('div', { class: 'field' }, h('label', { text: i18n.t('settings.target_chars_label') }),
      h('input', { type: 'number', value: cfg.writing.target_chars || 8000, oninput: e => { cfg.writing.target_chars = Number(e.target.value) || 8000; touch('config'); } })),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: cfg.writing.strict_length !== false, onchange: e => { cfg.writing.strict_length = e.target.checked; touch('config'); } }),
      i18n.t('settings.target_strict'))));
  wCard.appendChild(h('div', { class: 'small muted', style: { marginTop: '6px' },
    text: i18n.t('settings.target_chars_hint') }));
  main.appendChild(wCard);

  const sCard = h('div', { class: 'card' });
  sCard.appendChild(h('h2', null, i18n.t('settings.app_section'),
    h('span', { class: 'hint', text: i18n.t('settings.port_hint') })));
  sCard.appendChild(h('div', { class: 'inline' },
    h('div', { class: 'field' },
      h('label', { text: i18n.t('settings.port_label') }),
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
      text: i18n.t('settings.port_desc') })));
  // 语言切换（任务 3.2）：选项来自后端语言清单，不硬编码；切换后刷新页面立即生效。
  sCard.appendChild(h('div', { class: 'inline' },
    h('div', { class: 'field' },
      h('label', { text: i18n.t('settings.language') }),
      h('select', {
        value: i18n.defaults.current || 'zh-CN',
        onchange: async e => {
          const select = e.target;
          select.disabled = true;
          try {
            await apiCall('/api/settings/language', { method: 'POST', body: { language: select.value } });
            location.reload();
          } catch (err) {
            select.disabled = false;
            select.value = i18n.defaults.current || 'zh-CN';
            toast(i18n.t('language.switch_failed_reason', { reason: err.message }), 'err');
          }
        },
      }, (i18n.defaults.languages || []).map(l => h('option', {
        value: l.id, text: l.name, selected: l.id === (i18n.defaults.current || 'zh-CN')
      })))),
    h('span', { class: 'small muted',
      text: i18n.t('settings.language_hint') })));
  main.appendChild(sCard);

  const pCard = h('div', { class: 'card' });
  pCard.appendChild(h('h2', null, i18n.t('settings.dirs_section'),
    h('span', { class: 'hint', text: i18n.t('settings.dirs_hint', { root: state.paths.root || '' }) })));
  [['import_dir', i18n.t('settings.dir_import')], ['export_dir', i18n.t('settings.dir_export')],
   ['output_dir', i18n.t('settings.dir_output')], ['text_dir', i18n.t('settings.dir_text')],
   ['log_dir', i18n.t('settings.dir_log')]].forEach(([key, label]) => {
    pCard.appendChild(h('div', { class: 'field' }, h('label', { text: label + '（' + key + '）' }),
      h('input', { type: 'text', value: cfg.paths[key] || '', oninput: e => { cfg.paths[key] = e.target.value; touch('config'); } })));
  });
  pCard.appendChild(h('div', { class: 'small muted' },
    i18n.t('settings.data_dir_hint')));
  main.appendChild(pCard);

  const about = h('div', { class: 'card about-card' });
  about.appendChild(h('h2', null, i18n.t('settings.about')));
  about.appendChild(h('div', { class: 'about-links' },
    h('span', { text: i18n.t('settings.about_oss') }),
    h('a', {
      href: 'https://github.com/DreamInsight24/Novel-Helper',
      target: '_blank', rel: 'noopener noreferrer',
      text: 'https://github.com/DreamInsight24/Novel-Helper'
    }),
    h('span', { text: i18n.t('settings.about_author') }),
    h('a', {
      href: 'https://github.com/DreamInsight24',
      target: '_blank', rel: 'noopener noreferrer',
      text: 'https://github.com/DreamInsight24'
    })));
  // GPL-3.0 §5(d)：交互式界面需展示版权、免责声明与许可信息。
  about.appendChild(h('div', { class: 'license-note' },
    h('div', { class: 'license-title', text: i18n.t('settings.license_title') }),
    h('div', { text: i18n.t('settings.license_copyright') }),
    h('div', { text: i18n.t('settings.license_body') }),
    h('div', { text: i18n.t('settings.license_warranty') }),
    h('div', null,
      h('span', { text: i18n.t('settings.license_view') }),
      h('a', {
        href: 'https://github.com/DreamInsight24/Novel-Helper/blob/main/LICENSE',
        target: '_blank', rel: 'noopener noreferrer', text: 'LICENSE'
      }))));
  main.appendChild(about);
}

function novelHasOverrides() {
  const meta = state.configMeta;
  if (!meta) return false;
  const novel = meta.novel;
  if (novel && novel.use_global && Object.keys(novel.use_global).some(key => novel.use_global[key] === false)) return true;
  const current = state.db && state.db.config ? JSON.stringify(state.db.config) : '{}';
  const initial = meta.initialEffective != null ? JSON.stringify(meta.initialEffective) : current;
  return current !== initial;
}

function refreshRestoreButton() {
  const btn = state.ui && state.ui.restoreButton;
  if (btn) btn.disabled = !novelHasOverrides();
}

async function refreshConfigMeta() {
  try {
    const result = await apiCall('/api/settings/config');
    const isGlobal = state.level === 'home';
    state.db = state.db || {};
    state.db.config = isGlobal ? (result.global || {}) : (result.effective || result.global || {});
    ensureApiProfiles(state.db.config);
    state.configMeta = {
      novel: result.novel || null,
      global: result.global || null,
      initialEffective: JSON.parse(JSON.stringify(state.db.config))
    };
  } catch (e) { /* 拉取失败时保留当前页面状态 */ }
}

async function restoreNovelConfig() {
  if (!novelHasOverrides()) return;
  confirmDialog(i18n.t('settings.restore_global'), i18n.t('settings.restore_global_confirm'), async () => {
    try {
      const result = await apiCall('/api/settings/config');
      const useGlobal = {};
      Object.keys(result.global || {}).forEach(key => { useGlobal[key] = true; });
      await apiCall('/api/settings/config', { method: 'POST', body: {
        scope: 'novel', config: { version: 1, use_global: useGlobal, values: {} }
      } });
      await refreshConfigMeta();
      renderMain();
      toast(i18n.t('settings.restored'), 'ok');
    } catch (error) { toast(error.message, 'err'); }
  });
}

function apiCardNotice(main, text) {
  main.appendChild(h('div', { class: 'notice', text }));
}

// ═══════════════════════════════════════════
// 首次使用引导：1/2 语言 → 2/2 接口设置
// ═══════════════════════════════════════════
function maybeShowOnboarding() {
  if (new URLSearchParams(location.search).has('lang')) return; // ?lang= 预览不弹窗
  const cfg = state.db.config || {};
  ensureApiProfiles(cfg);
  if (!(cfg.onboarding || {}).done || !cfg.language) showOnboarding(false);
}

function showOnboarding(force) {
  const cfg = state.db.config = state.db.config || {};
  ensureApiProfiles(cfg);
  if (!force && (cfg.onboarding || {}).done && cfg.language) return;

  const body = h('div');
  const foot = h('div', { class: 'dlg-foot' });
  let dialog = null;
  let step = 1;
  let lang = cfg.language || i18n.defaults.current || 'zh-CN';
  let finishing = false;

  const finish = async configured => {
    if (finishing) return;
    finishing = true;
    cfg.onboarding = cfg.onboarding || {};
    cfg.onboarding.done = true;
    cfg.onboarding.version = 1;
    try {
      // 这里才把最终语言写入后端：首次写入会同时记录 initial_language，并用最终
      // 语言生成一次内置预设。第 1 步的点击只做预览，避免用户先点 English 再点
      // 简体中文时，预设被中途的 English 抢先固化。
      const res = await apiCall('/api/settings/language', { method: 'POST', body: { language: lang } });
      const applied = res.language || lang;
      lang = applied;
      i18n.defaults.current = applied;
      // 语言由后端写入，必须同步回本地配置，否则随后保存 config 会覆盖掉它，
      // 刷新后首次引导会再次弹出。
      cfg.language = applied;
      if (!cfg.initial_language) cfg.initial_language = applied;
      if (configured) saveProviderProfile(cfg, cfg.api.provider);
      await saveNow('config');
      if (dialog) dialog.close();
      // 语言与内置预设按整页刷新统一生效。
      location.reload();
    } catch (e) {
      finishing = false;
      toast(i18n.t('common.save_failed_reason', { reason: e.message }), 'err');
    }
  };

  // 选中即即时预览；持久化留到 finish，确保最终语言与首次预设一致。
  const selectLanguage = async id => {
    if (id === lang) return;
    const previous = lang;
    lang = id;
    try {
      const applied = await i18n.load(id);
      lang = applied;
      i18n.defaults.current = applied;
    } catch (err) {
      lang = previous;
      toast(i18n.t('language.switch_failed_reason', { reason: err.message }), 'err');
    }
    draw();
  };

  const drawLanguageStep = () => {
    const list = h('div', { class: 'list' });
    (i18n.defaults.languages || []).forEach(item => {
      list.appendChild(h('div', {
        class: 'list-item' + (item.id === lang ? ' active' : ''),
        onclick: () => selectLanguage(item.id)
      }, h('div', { class: 'name', text: item.name })));
    });
    body.appendChild(list);
    body.appendChild(h('div', { class: 'small muted', style: { marginTop: '10px' } },
      i18n.t('language.initial_presets_hint')));
  };

  const drawApiStep = () => {
    const api = cfg.api;
    const preset = providerById(api.provider) ||
      { label: i18n.t('settings.custom_preset'), base_url: '', models: [], key_env: 'CUSTOM_API_KEY' };
    const models = currentModels();
    if (models.length && !models.includes(api.default_model)) {
      api.default_model = models[0];
    }
    const customUrl = preset.id === 'custom' ||
      (api.base_url && preset.base_url && !sameProviderUrl(api.base_url, preset.base_url));

    body.appendChild(h('div', { class: 'notice',
      text: i18n.t('welcome.desc') }));
    body.appendChild(h('div', { class: 'field' },
      h('label', { text: i18n.t('settings.provider_short') }),
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
      h('label', { text: i18n.t('settings.url_label') }),
      h('input', {
        type: 'text', value: api.base_url || '',
        placeholder: preset.base_url || 'https://example.com/v1',
        oninput: e => { api.base_url = e.target.value; touch('config'); }
      })));
    body.appendChild(h('div', { class: 'field' },
      h('label', { text: 'API Key' }),
      h('input', {
        type: 'password', value: api.api_key || '',
        placeholder: i18n.t('welcome.key_placeholder', {env: preset.key_env || 'CUSTOM_API_KEY'}),
        oninput: e => { api.api_key = e.target.value; touch('config'); }
      })));
    body.appendChild(h('div', { class: 'inline', style: { marginBottom: '8px' } },
      h('button', {
        text: i18n.t('settings.fetch_models'),
        onclick: async ev => {
          const btn = ev.target;
          btn.disabled = true;
          try {
            const res = await apiCall('/api/models', { method: 'POST', body: { config: cfg } });
            api.models = res.models || [];
            if (!api.models.includes(api.default_model)) api.default_model = api.models[0] || '';
            touch('config'); draw();
            toast(i18n.t('settings.fetched_models', { count: api.models.length }), 'ok');
          } catch (e) {
            toast(i18n.t('settings.fetch_failed_reason', { reason: e.message }), 'err');
          } finally { btn.disabled = false; }
        }
      }),
      h('button', {
        text: i18n.t('settings.test'),
        onclick: async ev => {
          const btn = ev.target;
          btn.disabled = true;
          try {
            const res = await apiCall('/api/ai/ping', {
              method: 'POST',
              body: { config: cfg, model: api.default_model || api.models[0] || '' }
            });
            toast(i18n.t('settings.test_ok', { model: res.result.model, elapsed: res.result.elapsed }), 'ok');
          } catch (e) {
            toast(i18n.t('settings.test_failed_reason', { reason: e.message }), 'err');
          } finally { btn.disabled = false; }
        }
      })));
    if (models.length) {
      body.appendChild(h('div', { class: 'field' },
        h('label', { text: i18n.t('settings.default_model_label') }),
        h('select', {
          onchange: e => { api.default_model = e.target.value; touch('config'); }
        }, models.map(m => h('option', {
          value: m, text: m, selected: m === api.default_model
        })))));
    } else {
      body.appendChild(h('div', { class: 'field' },
        h('label', { text: i18n.t('settings.model_name_label') }),
        h('input', {
          type: 'text', value: api.default_model || '',
          placeholder: i18n.t('settings.model_name_placeholder'),
          oninput: e => { api.default_model = e.target.value; touch('config'); }
        })));
    }
    body.appendChild(h('div', { class: 'field' },
      h('label', { text: i18n.t('settings.default_effort_label') }),
      h('select', {
        onchange: e => { api.default_effort = e.target.value; touch('config'); }
      }, effortChoices().map(value => h('option', {
        value, text: value, selected: value === (api.default_effort || 'medium')
      })))));
    body.appendChild(h('div', { class: 'notice' + (customUrl ? ' warn' : ''),
      text: customUrl
        ? i18n.t('welcome.custom_url_note')
        : i18n.t('welcome.preset_note', {name: preset.label}) }));
    body.appendChild(h('div', { class: 'small muted',
      text: i18n.t('welcome.key_note') }));
  };

  const draw = () => {
    clear(body);
    body.appendChild(h('div', { class: 'small muted', style: { marginBottom: '10px' } },
      i18n.t('language.step_of', { step, total: 2 })));
    if (step === 1) drawLanguageStep();
    else drawApiStep();
    const title = dialog && dialog.dlg.querySelector(':scope > h3');
    if (title) {
      title.textContent = i18n.t(step === 1 ? 'language.first_run_title' : 'welcome.title',
        { version: i18n.defaults.version });
    }
    clear(foot);
    const buttons = step === 1
      ? [
          h('button', {
            text: i18n.t('welcome.skip'), dataset: { noclose: '1' },
            onclick: () => finish(false)
          }),
          h('button', {
            class: 'primary', text: i18n.t('language.next'), dataset: { noclose: '1' },
            onclick: () => { step = 2; draw(); }
          })
        ]
      : [
          h('button', {
            text: i18n.t('language.back'), dataset: { noclose: '1' },
            onclick: () => { step = 1; draw(); }
          }),
          h('button', {
            text: i18n.t('welcome.skip'), dataset: { noclose: '1' },
            onclick: () => finish(false)
          }),
          h('button', {
            class: 'primary', text: i18n.t('welcome.start'), dataset: { noclose: '1' },
            onclick: () => finish(true)
          })
        ];
    buttons.forEach(btn => foot.appendChild(btn));
  };

  dialog = modal(i18n.t('welcome.title', { version: i18n.defaults.version }),
    h('div', null, body, foot), null);
  draw();
}
