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

/* NovelHelper —— 润色修订 Agent：流式调用与会话视图渲染 */
'use strict';

/**
 * 调用 /api/revision/stream，逐帧回调 stage / warn，返回最终会话视图。
 * 与 streamWorkstation 保持同样的 ndjson 协议，错误按最后一帧处理。
 */
async function streamRevision(body, signal, onFrame) {
  const res = await fetch('/api/revision/stream', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-NovelHelper-Language': document.documentElement.lang },
    body: JSON.stringify(body)
  });
  const type = res.headers.get('Content-Type') || '';
  if (!res.ok || !res.body || type.indexOf('ndjson') < 0) {
    const raw = await res.text().catch(() => '');
    let message = 'HTTP ' + res.status;
    try {
      const data = JSON.parse(raw);
      if (data && data.error) message = data.error;
    } catch (e) { /* 非 JSON 时用状态码 */ }
    throw new Error(message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', result = null, failure = '', cancelled = false;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (!line) continue;
      let frame;
      try { frame = JSON.parse(line); } catch (e) { continue; }
      if (frame.type === 'done') result = frame.session;
      else if (frame.type === 'error') {
        failure = frame.error || i18n.t('revision.failed');
        cancelled = !!frame.cancelled;
      } else if (onFrame) onFrame(frame);
    }
  }
  if (result) return result;
  const error = new Error(failure || i18n.t('workstation.stream_broken'));
  error.cancelled = cancelled;
  throw error;
}

function revisionStateLabel(state) {
  const key = 'revision.state.' + String(state || '').toLowerCase();
  const text = i18n.t(key);
  return text === key ? String(state || '') : text;
}

function revisionStageText(stage) {
  const frame = stage || {};
  const key = 'revision.stage.' + (frame.stage || 'plan');
  const detail = frame.detail || {};
  const text = i18n.t(key, { round: detail.round || 1 });
  return text === key ? i18n.t('revision.running') : text;
}

function revisionWarnNodes(view) {
  const nodes = [];
  (view && view.warnings || []).forEach(warning => {
    const key = 'revision.warn.' + warning.code;
    const text = i18n.t(key, { count: warning.count || 1 });
    if (text === key) return;
    nodes.push(h('div', { class: 'small muted revision-warn', text }));
  });
  return nodes;
}

function revisionDiffNode(segments) {
  const box = h('div', { class: 'revision-diff' });
  (segments || []).forEach(part => {
    if (part.op === 'equal') box.appendChild(h('span', { class: 'revision-diff-equal', text: part.text }));
    else if (part.op === 'delete') box.appendChild(h('del', { class: 'revision-diff-del', text: part.text }));
    else box.appendChild(h('ins', { class: 'revision-diff-ins', text: part.text }));
  });
  return box;
}

function revisionStatsText(stats) {
  const value = stats || {};
  return '+' + (value.added || 0) + ' / -' + (value.removed || 0);
}

function revisionScopeText(view) {
  const scope = view.scope || {};
  const key = scope.kind === 'selection' ? 'revision.scope_selection' : 'revision.scope_chapter';
  return i18n.t(key, { count: scope.count || 0 });
}

function revisionCardNode(view, handlers) {
  const card = view.card;
  if (!card) return null;
  const box = h('section', { class: 'revision-card' });
  box.appendChild(h('div', { class: 'revision-card-head' },
    h('span', { class: 'tag mode-tag', text: i18n.t('revision.card.title') }),
    h('span', { class: 'small muted', text: revisionScopeText(view) })));
  box.appendChild(h('div', { class: 'revision-card-preview', text: view.preview || '' }));
  const rows = [
    ['goal', card.goal],
    ['style', card.style],
    ['preserve', (card.preserve || []).join('、')],
    ['forbidden', (card.forbidden || []).join('、')]
  ];
  const grid = h('div', { class: 'revision-card-grid' });
  rows.forEach(([key, value]) => {
    if (!value) return;
    grid.appendChild(h('span', { class: 'revision-card-key', text: i18n.t('revision.card.' + key) }));
    grid.appendChild(h('span', { class: 'revision-card-value', text: String(value) }));
  });
  box.appendChild(grid);
  return box;
}

function revisionQuestionNode(view, handlers) {
  const question = view.question;
  if (!question) return null;
  const box = h('section', { class: 'revision-question' },
    h('div', { class: 'revision-question-title', text: i18n.t('revision.question.title') }),
    h('div', { class: 'revision-question-text', text: question.text || '' }));
  const actions = h('div', { class: 'revision-actions' });
  (question.options || []).forEach(option => actions.appendChild(h('button', {
    class: 'mini', text: option.label,
    onclick: () => handlers.answer(option.id)
  })));
  box.appendChild(actions);
  return box;
}

function revisionSampleNode(view, handlers) {
  const sample = view.sample;
  if (!sample || sample.status !== 'pending') return null;
  const box = h('section', { class: 'revision-sample' });
  box.appendChild(h('div', { class: 'revision-sample-head' },
    h('span', { class: 'tag', text: i18n.t('revision.sample.title', { id: sample.paragraph_id }) }),
    h('span', { class: 'small muted', text: revisionStatsText(sample.stats) })));
  box.appendChild(h('details', { class: 'revision-diff-box', open: true },
    h('summary', { text: i18n.t('revision.changes.view') }),
    revisionDiffNode(sample.diff)));
  const feedback = h('input', {
    type: 'text', class: 'revision-sample-feedback',
    placeholder: i18n.t('revision.sample.feedback'),
    onkeydown: e => {
      if (e.key === 'Enter' && !e.isComposing && feedback.value.trim()) {
        e.preventDefault();
        handlers.sampleChoice('feedback', feedback.value.trim());
      }
    }
  });
  box.appendChild(feedback);
  box.appendChild(h('div', { class: 'revision-actions' },
    h('button', { class: 'primary mini', text: i18n.t('revision.sample.accept'),
      onclick: () => handlers.sampleChoice('accept') }),
    h('button', { class: 'mini', text: i18n.t('revision.sample.more_oral'),
      onclick: () => handlers.sampleChoice('more_oral') }),
    h('button', { class: 'mini', text: i18n.t('revision.sample.new_direction'),
      onclick: () => handlers.sampleChoice('new_direction') }),
    h('button', { class: 'mini', text: i18n.t('revision.sample.skip'),
      onclick: () => handlers.sampleChoice('skip') })));
  return box;
}

function revisionReviewNode(view) {
  const review = view.review;
  if (!review) return null;
  const issues = review.issues || [];
  if (!issues.length && !review.pass) return null;
  const box = h('section', { class: 'revision-review' + (review.pass ? ' pass' : '') });
  box.appendChild(h('div', { class: 'revision-review-head' },
    h('span', { class: 'tag' + (review.pass ? ' ok' : ''), text: i18n.t('revision.review.title') }),
    h('span', { class: 'small muted', text: review.pass
      ? i18n.t('revision.review.pass')
      : i18n.t('revision.review.fail', { count: issues.length }) })));
  const layers = h('div', { class: 'revision-layers' });
  Object.keys(review.layers || {}).forEach(name => {
    const layer = review.layers[name] || {};
    layers.appendChild(h('span', {
      class: 'revision-layer ' + (layer.pass ? 'ok' : 'bad'),
      text: i18n.t('revision.review.layer.' + name) + (layer.pass ? ' ✓' : ' !')
    }));
  });
  if (layers.children.length) box.appendChild(layers);
  if (issues.length) {
    const list = h('ul', { class: 'revision-issues' });
    issues.forEach(issue => {
      list.appendChild(h('li', null,
        h('span', { class: 'revision-issue-type', text: i18n.t('revision.review.type.' + (issue.type || 'quality')) }),
        h('span', { class: 'revision-issue-pid', text: issue.paragraph_id || '' }),
        h('span', { class: 'revision-issue-text', text: issue.problem }),
        issue.suggestion ? h('span', { class: 'revision-issue-suggestion small muted',
          text: '→ ' + issue.suggestion }) : null));
    });
    box.appendChild(list);
    if (review.next_instruction) {
      box.appendChild(h('div', { class: 'revision-next small muted',
        text: i18n.t('revision.review.next') + '：' + review.next_instruction }));
    }
  }
  return box;
}

function revisionChangesNode(view, handlers) {
  const changes = view.changes || [];
  if (!changes.length) return null;
  const box = h('section', { class: 'revision-changes' });
  box.appendChild(h('div', { class: 'revision-changes-head' },
    h('span', { class: 'tag', text: i18n.t('revision.changes.title') }),
    h('span', { class: 'small muted', text: i18n.t('revision.changes.count', { count: changes.length }) })));
  changes.forEach(change => {
    const row = h('details', { class: 'revision-change' },
      h('summary', null,
        h('span', { class: 'revision-change-pid', text: change.paragraph_id }),
        h('span', { class: 'small muted', text: revisionStatsText(change.stats) })));
    row.appendChild(revisionDiffNode(change.diff));
    if (handlers.rollbackParagraph) {
      row.appendChild(h('div', { class: 'revision-actions' },
        h('button', { class: 'mini', text: i18n.t('revision.changes.rollback'),
          onclick: () => handlers.rollbackParagraph(change.paragraph_id) })));
    }
    box.appendChild(row);
  });
  return box;
}

function revisionStopNode(view, handlers) {
  const stop = view.stop;
  if (!stop) return null;
  const key = 'revision.stop.' + (stop.reason || 'soft_limit');
  const text = i18n.t(key);
  const box = h('section', { class: 'revision-stop' },
    h('div', { class: 'revision-stop-title', text: i18n.t('revision.stop.title') }),
    h('div', { class: 'small muted', text: text === key ? String(stop.reason || '') : text }));
  const actions = h('div', { class: 'revision-actions' });
  (stop.options || []).forEach(option => {
    if (option === 'accept_current') {
      actions.appendChild(h('button', { class: 'primary mini', text: i18n.t('revision.stop.accept_current'),
        onclick: () => handlers.accept() }));
    } else if (option === 'change_strategy') {
      actions.appendChild(h('button', { class: 'mini', text: i18n.t('revision.stop.change_strategy'),
        onclick: () => handlers.rerun() }));
    } else if (option === 'manual_issues') {
      actions.appendChild(h('button', { class: 'mini', text: i18n.t('revision.manual'),
        onclick: () => handlers.manual() }));
    }
  });
  box.appendChild(actions);
  return box;
}

function revisionHistoryNode(view) {
  const rounds = view.rounds || [];
  const versions = view.versions || [];
  const box = h('details', { class: 'revision-history' },
    h('summary', { text: i18n.t('revision.history.title') }));
  if (!rounds.length && versions.length <= 1) {
    box.appendChild(h('div', { class: 'small muted', text: i18n.t('revision.history.none') }));
    return box;
  }
  rounds.forEach(entry => {
    const stopText = entry.stop_reason
      ? i18n.t('revision.stop.' + entry.stop_reason) : '';
    box.appendChild(h('div', { class: 'revision-history-row small' },
      h('span', { text: i18n.t('revision.history.round', { round: entry.round }) }),
      h('span', { class: 'muted', text: ' · ' + i18n.t('revision.changes.count',
        { count: (entry.changes || []).length }) }),
      h('span', { class: 'muted', text: stopText === 'revision.stop.' + entry.stop_reason
        ? '' : ' · ' + stopText })));
  });
  versions.forEach(version => {
    box.appendChild(h('div', { class: 'revision-history-row small muted' },
      h('span', { text: i18n.t('revision.history.version', { index: version.index }) }),
      h('span', { text: ' · ' + (version.label || '') }),
      h('span', { text: ' · ' + i18n.t('workstation.char_count', { count: version.chars || 0 }) })));
  });
  return box;
}

function revisionActionsNode(view, handlers, opts) {
  const options = opts || {};
  const actions = h('div', { class: 'revision-actions revision-final-actions' });
  if (view.state === 'DONE') {
    actions.appendChild(h('button', { class: 'primary', text: i18n.t('revision.increment_send'),
      onclick: () => handlers.focusIncrement() }));
    actions.appendChild(h('button', { text: i18n.t('revision.rerun'), onclick: () => handlers.rerun() }));
    actions.appendChild(h('button', { text: i18n.t('revision.rollback'), onclick: () => handlers.rollbackVersion() }));
    actions.appendChild(h('button', { text: i18n.t('revision.reset'), onclick: () => handlers.restart() }));
    return actions;
  }
  if (options.preview) {
    if (view.card && view.card.sample_first) {
      actions.appendChild(h('button', { class: 'primary', text: i18n.t('revision.card.start_sample'),
        onclick: () => handlers.startSample() }));
    }
    actions.appendChild(h('button', { class: view.card && view.card.sample_first ? '' : 'primary',
      text: i18n.t('revision.card.start_batch'), onclick: () => handlers.startBatch() }));
    actions.appendChild(h('button', { text: i18n.t('revision.card.adjust'),
      onclick: () => handlers.focusIncrement() }));
    return actions;
  }
  actions.appendChild(h('button', { class: 'primary', text: i18n.t('revision.apply'),
    onclick: () => handlers.accept() }));
  actions.appendChild(h('button', { text: i18n.t('revision.rerun'), onclick: () => handlers.rerun() }));
  actions.appendChild(h('button', { text: i18n.t('revision.rollback'), onclick: () => handlers.rollbackVersion() }));
  actions.appendChild(h('button', { text: i18n.t('revision.increment_send'),
    onclick: () => handlers.focusIncrement() }));
  return actions;
}

/**
 * 根据会话状态渲染整个修订流程。
 * state = {running, stage, manual}
 */
function revisionFlowNode(view, state, handlers) {
  const live = state || {};
  const box = h('div', { class: 'revision-flow-body' });
  if (!view) {
    box.appendChild(h('div', { class: 'revision-empty small muted', text: i18n.t('revision.empty') }));
    return box;
  }
  box.appendChild(h('div', { class: 'revision-headline' },
    h('span', { class: 'revision-state', text: revisionStateLabel(view.state) }),
    h('span', { class: 'small muted', text: view.title || '' })));
  if (live.running) {
    box.appendChild(h('div', { class: 'revision-progress', role: 'status' },
      h('span', { class: 'agent-dot', 'aria-hidden': 'true' }),
      h('span', { text: revisionStageText(live.stage) })));
  }
  revisionWarnNodes(view).forEach(node => box.appendChild(node));
  if (view.state === 'LOCATE') {
    const card = revisionCardNode(view, handlers);
    if (card) box.appendChild(card);
    if (view.question) box.appendChild(revisionQuestionNode(view, handlers));
    else box.appendChild(revisionActionsNode(view, handlers, { preview: true }));
  } else if (view.state === 'USER_CONFIRM_SAMPLE') {
    const sample = revisionSampleNode(view, handlers);
    if (sample) box.appendChild(sample);
    else if (!live.running) {
      box.appendChild(h('div', { class: 'small muted', text: i18n.t('revision.sample_failed') }));
      box.appendChild(revisionActionsNode(view, handlers, { preview: true }));
    }
  } else if (view.state === 'USER_CONFIRM_FINAL' || view.state === 'DONE') {
    if (view.accepted) {
      box.appendChild(h('div', { class: 'revision-accepted' },
        h('span', { class: 'tag ok', text: i18n.t('revision.accepted') }),
        h('span', { class: 'small muted', text: i18n.t('revision.accepted_hint') })));
    }
    const stop = revisionStopNode(view, handlers);
    if (stop && !view.accepted) box.appendChild(stop);
    const review = revisionReviewNode(view);
    if (review) box.appendChild(review);
    const changes = revisionChangesNode(view, handlers);
    if (changes) box.appendChild(changes);
    box.appendChild(revisionActionsNode(view, handlers, {}));
  } else if (live.running) {
    /* 运行中只显示进度。 */
  } else {
    box.appendChild(h('div', { class: 'revision-empty small muted', text: i18n.t('revision.empty') }));
  }
  if ((view.rounds || []).length || (view.versions || []).length > 1) {
    box.appendChild(revisionHistoryNode(view));
  }
  return box;
}
