# Copyright (C) 2026 DreamInsight24 and NovelHelper contributors
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""润色修订 Agent 验收测试（离线，不访问网络、不写用户数据）。

运行：python -B scripts/test_revision.py
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))

# 会话写入系统临时目录：运行验收测试时需要 danger-full-access，
# 因为原子 rename 会被工作区删除保护拦截（详见 AGENTS/测试说明）。
_TEMP = tempfile.mkdtemp(prefix="novelhelper_revision_")
os.environ["NOVELHELPER_HOME"] = _TEMP
os.environ["NOVELHELPER_DATA"] = str(Path(_TEMP) / "data")

from novelhelper import localization  # noqa: E402

localization.initialize()

from novelhelper.agent import Document, SessionStore  # noqa: E402
from novelhelper.agent import rounds  # noqa: E402
from novelhelper.revision import card as card_mod  # noqa: E402
from novelhelper.revision import engine as engine_mod  # noqa: E402
from novelhelper.revision import merge, plan as plan_mod, revise, review, summary  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, ok: bool, extra: str = "") -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"PASS {name}")
    else:
        FAIL += 1
        print(f"FAIL {name} {extra}")


SAMPLE_TEXT = (
    "雨落在码头上，林昭把信收进衣袋里，慢慢沿着铁轨往前走。\n"
    "她想起三年前那个晚上，也是这样一场雨。\n"
    "“你终于来了。”沈砚站在灯下，声音很轻。\n"
    "远处传来汽笛声，像有人在黑暗里叹气。\n"
)


def default_plan(user: str) -> dict:
    ids = re.findall(r'<target paragraph_id="([^"]+)"', user)
    targets = [{"paragraph_id": pid, "direction": "增强紧张感，缩短句子",
                "priority": "high" if index == 0 else "medium"}
               for index, pid in enumerate(ids[:2])]
    return {
        "need_revision": True,
        "goal": "把开头改得更紧张",
        "style": "短句为主",
        "style_guide": "短句、少形容词、动作推进",
        "preserve": ["人物称呼", "剧情事实"],
        "forbidden": ["改变剧情事实", "新增人物"],
        "priority": "high",
        "targets": targets,
        "no_change_ids": ids[2:],
        "summary": [{"kind": "style", "text": "短句推进，少形容词"}],
        "question": None,
    }


def pass_review() -> dict:
    return {"pass": True, "issues": [], "next_instruction": "", "needs_user_confirm": True}


def failing_review(paragraph_id: str = "", problem: str = "语气仍偏书面",
                   issue_type: str = "style", instruction: str = "") -> dict:
    return {
        "pass": False,
        "issues": [{
            "paragraph_id": paragraph_id,
            "type": issue_type,
            "problem": problem,
            "suggestion": "改成更短的口语句子",
        }],
        "next_instruction": instruction or f"重改 {paragraph_id}，保持前后段衔接",
        "needs_user_confirm": True,
    }


class FakeChat:
    """按提示词角色返回固定 JSON，替代真实模型。"""

    def __init__(self):
        self.plan = default_plan
        self.revise_transform = lambda text, pid: text + "（改）"
        self.review_queue: list[dict] = []
        self.current_review: dict | None = None
        self.calls: list[dict] = []
        self.revise_calls: list[dict] = []

    def __call__(self, config, settings, messages):
        system = messages[0]["content"]
        user = messages[-1]["content"]
        self.calls.append({"system": system, "user": user})
        if "策划模块" in system:
            data = self.plan(user) if callable(self.plan) else self.plan
            return {"text": json.dumps(data, ensure_ascii=False),
                    "usage": {"total_tokens": 10}, "model": "fake", "elapsed": 0.01}
        if "局部改写" in system:
            ids = re.findall(r'<target paragraph_id="([^"]+)"', user)
            self.revise_calls.append({"ids": ids, "user": user})
            entries = []
            for pid in ids:
                match = re.search(
                    rf'<target paragraph_id="{re.escape(pid)}"[^>]*>(.*?)</target>',
                    user, re.S)
                text = match.group(1) if match else ""
                entries.append({
                    "paragraph_id": pid,
                    "original_hash": "",
                    "revised": self.revise_transform(text, pid),
                    "change_reason": "测试改写",
                    "confidence": 0.9,
                })
            return {"text": json.dumps(entries, ensure_ascii=False),
                    "usage": {"total_tokens": 20}, "model": "fake", "elapsed": 0.01}
        if "修订审核" in system:
            if "局部审核" in user:
                self.current_review = (self.review_queue.pop(0)
                                       if self.review_queue else pass_review())
            layer = ("local" if "局部审核" in user else
                     "consistency" if "一致性审核" in user else "global")
            data = (self.current_review or pass_review()).get(layer) or pass_review()
            return {"text": json.dumps(data, ensure_ascii=False),
                    "usage": {"total_tokens": 30}, "model": "fake", "elapsed": 0.01}
        raise AssertionError("unexpected prompt: " + system[:40])


def make_engine(chat: FakeChat, store: SessionStore, options: dict | None = None,
                model: str = "fake-model") -> engine_mod.RevisionEngine:
    config = {"api": {"models": ["fake-model"], "default_model": "fake-model"}}
    if options:
        config["revision"] = options
    return engine_mod.RevisionEngine(config, {}, chat_fn=chat, session_store=store,
                                     model=model, effort="low")


def start(engine, chat, text=SAMPLE_TEXT, body_extra=None, wish="把开头改得紧张一点"):
    body = {"prompt": wish, "source_text": text, "chapter": "第三章",
            "path": "text/ch003.md"}
    body.update(body_extra or {})
    view = engine.execute("plan", body)
    return view


# ─────────────────────────────────────────────
# 1. 分段与索引
# ─────────────────────────────────────────────
def test_segments():
    doc = Document(SAMPLE_TEXT, chapter_id="ch_003")
    check("自然段切分：4 段", len(doc) == 4, str(len(doc)))
    first = doc.paragraphs[0]
    check("段落带 ID / 哈希 / 前后指针",
          first.paragraph_id == "p_001" and first.hash.startswith("sha256:")
          and first.prev_id == "" and first.next_id == "p_002")
    check("哈希随文本变化", doc.get("p_001").hash != Document("另一段。").paragraphs[0].hash)
    check("对话段识别", doc.get("p_003").type == "dialogue", doc.get("p_003").type)
    check("场景段识别",
          Document("***\n之后。").paragraphs[0].type == "scene")
    blank_separated = Document("第一段。\n\n第二段。")
    check("空行分隔仍按两段处理", len(blank_separated) == 2
          and blank_separated.paragraphs[1].text == "第二段。")
    check("单换行即分段", len(Document("第一段。\n第二段。")) == 2)
    check("连续空行不产生空段",
          [p.text for p in Document("第一段。\n\n\n第二段。").paragraphs]
          == ["第一段。", "第二段。"])
    selected = doc.ids_in_range(doc.get("p_002").start, doc.get("p_002").end + 1)
    check("按选区取段", selected == ["p_002"], str(selected))
    long_text = "这是一句很长的话。" * 200
    split = Document(long_text, max_chars=200)
    check("超长自然段按句末继续拆分", len(split) > 1, str(len(split)))
    check("分隔符原样保留", doc.current_text() == SAMPLE_TEXT)
    doc.replace("p_001", "改写后的第一段。")
    check("替换后仍能还原整篇",
          doc.current_text().startswith("改写后的第一段。") and doc.paragraphs[3].text in doc.current_text())
    check("相邻目标段可分组", doc.groups(["p_001", "p_002", "p_004"]) == [["p_001", "p_002"], ["p_004"]])


# ─────────────────────────────────────────────
# 2. 需求卡 / 追问 / 直接接受
# ─────────────────────────────────────────────
def test_card():
    wish = "把这一章开头改得紧张一点"
    card, question = card_mod.normalize_card({}, wish=wish, scope_ids=["p_001", "p_002"],
                                             scope_kind="selection")
    check("默认保守风格：保留剧情事实与人物称呼",
          "保留" in card["style"] and "剧情事实" in card["style"])
    check("默认保留项与禁止项", "剧情事实" in card["preserve"]
          and "改变剧情事实" in card["forbidden"])
    check("需求卡带范围", card["scope"]["paragraph_ids"] == ["p_001", "p_002"])
    check("没有问题时 question 为空", question is None)
    _card, question = card_mod.normalize_card({
        "goal": "增强紧张感",
        "question": {"text": "想要哪种紧张？",
                     "options": [{"id": "tight", "label": "更压迫"},
                                 {"id": "light", "label": "更克制"}]},
    }, wish=wish, scope_ids=["p_001"], scope_kind="chapter")
    check("最多 1 个带选项的问题", question is not None and len(question["options"]) == 2)
    _bad, no_question = card_mod.normalize_card({
        "question": {"text": "开放式问题？", "options": ["唯一选项"]},
    }, wish=wish, scope_ids=["p_001"], scope_kind="chapter")
    check("选项不足 2 个的问题被丢弃", no_question is None)
    check("检测「直接改」", card_mod.wants_direct_accept("直接改，不用确认"))
    check("普通许愿不跳过样例", not card_mod.wants_direct_accept("改得紧张一点"))
    preview = card_mod.preview(card, scope_label="选区 2 段", scope_count=2)
    check("一句话需求卡预览", "选区 2 段" in preview and "紧张" in preview, preview)


# ─────────────────────────────────────────────
# 3. 计划校验
# ─────────────────────────────────────────────
def test_plan():
    doc = Document(SAMPLE_TEXT)
    scope = [p.paragraph_id for p in doc.paragraphs]
    plan, warnings = plan_mod.normalize_plan({
        "targets": [
            {"paragraph_id": "p_001", "direction": "短句", "priority": "high"},
            {"paragraph_id": "p_999", "direction": "越界", "priority": "high"},
            {"paragraph_id": "p_002", "direction": "加强动作", "priority": "medium"},
        ],
        "no_change_ids": ["p_003"],
    }, doc, scope)
    ids = plan_mod.target_ids(plan)
    check("计划丢弃未知段落", ids == ["p_001", "p_002"], str(ids))
    check("越界丢弃会告警", any(item["code"] == "plan_dropped" for item in warnings))
    check("无需改动段落保留", plan["no_change_ids"] == ["p_003"])
    check("样例优先高优先级", plan_mod.select_sample(plan, doc) == "p_001")
    budget, budget_warnings = plan_mod.normalize_plan({
        "targets": [{"paragraph_id": pid, "direction": "改"} for pid in scope],
    }, doc, scope, max_targets=2)
    check("超出预算会裁剪", len(plan_mod.target_ids(budget)) == 2
          and any(item["code"] == "plan_truncated" for item in budget_warnings))
    empty, fallback = plan_mod.normalize_plan({"targets": []}, doc, scope)
    check("计划为空时按范围兜底", plan_mod.target_ids(empty) and
          any(item["code"] == "plan_fallback" for item in fallback))


# ─────────────────────────────────────────────
# 4. 第二轮：越界丢弃 / 哈希 / 重试 / 全文
# ─────────────────────────────────────────────
def test_revision_postprocess():
    doc = Document(SAMPLE_TEXT)
    results, warnings, missing = revise.normalize_results([
        {"paragraph_id": "p_001", "revised": "新的一段。"},
        {"paragraph_id": "p_002", "revised": "不在目标里。"},
    ], doc, ["p_001"])
    check("只保留目标段", [item["paragraph_id"] for item in results] == ["p_001"])
    check("非目标段丢弃并告警",
          any(item["code"] == "out_of_scope" for item in warnings))
    check("漏段可识别", missing == [])
    _r, warnings, missing = revise.normalize_results([
        {"paragraph_id": "p_001", "revised": "改了。"},
    ], doc, ["p_001", "p_002"])
    check("漏段进入待补清单", missing == ["p_002"])
    _r, warnings, _m = revise.normalize_results([
        {"paragraph_id": "p_001", "revised": "改了。", "original_hash": "sha256:bad"},
    ], doc, ["p_001"])
    check("模型哈希不匹配拒绝合并",
          any(item["code"] == "hash_mismatch" for item in warnings) and not _r)
    full_text = SAMPLE_TEXT
    _r, warnings, _m = revise.normalize_results([
        {"paragraph_id": "p_001", "revised": full_text},
    ], doc, ["p_001"])
    check("返回全文被丢弃并告警",
          any(item["code"] == "full_text" for item in warnings) and not _r)
    _r, warnings, _m = revise.normalize_results([
        {"paragraph_id": "p_001", "revised": ""},
    ], doc, ["p_001"])
    check("空改写标记待补", any(item["code"] == "empty_revision" for item in warnings))
    check("合并时再次校验哈希",
          merge.apply_results(doc, [{"paragraph_id": "p_001", "revised": "x",
                                     "original_hash": "sha256:bad"}])[0] == [])


# ─────────────────────────────────────────────
# 5. 审核结构化
# ─────────────────────────────────────────────
def test_review_normalize():
    doc = Document(SAMPLE_TEXT)
    result = review.normalize_review({
        "pass": False,
        "issues": [
            {"paragraph_id": "p_001", "type": "style", "problem": "偏书面",
             "suggestion": "改口语"},
            {"paragraph_id": "p_001", "type": "style", "problem": "偏书面",
             "suggestion": "改口语"},
            {"paragraph_id": "p_999", "type": "nonsense", "problem": "越界段"},
        ],
        "next_instruction": "只重改 p_001",
    }, doc)
    check("审核去重并保留结构化问题", len(result["issues"]) == 2, str(result["issues"]))
    check("越界段问题不绑定段落", result["issues"][1]["paragraph_id"] == "")
    check("非法类型归为 quality", result["issues"][1]["type"] == "quality")
    check("未通过状态", not result["pass"] and result["next_instruction"] == "只重改 p_001")
    passed = review.normalize_review({"pass": True, "issues": []})
    check("没有问题时通过", passed["pass"])


# ─────────────────────────────────────────────
# 6. 轮次控制
# ─────────────────────────────────────────────
def test_rounds():
    def entry(round_no, issues, hashes=None, ratio=0.1):
        return {"round": round_no, "issues": issues, "text_hashes": hashes or {},
                "change_ratio": ratio}
    issue_a = [{"paragraph_id": "p_001", "type": "style", "problem": "偏书面"}]
    issue_b = [{"paragraph_id": "p_001", "type": "style", "problem": "句子还长"}]
    same = rounds.evaluate([entry(1, issue_a), entry(2, issue_a)])
    check("连续两轮相同问题 → 无进展停止", same and same["reason"] == "no_progress")
    tiny = rounds.evaluate([entry(1, issue_a), entry(2, issue_b, ratio=0.0001)])
    check("diff 极小 → 无进展停止", tiny and tiny["reason"] == "no_progress")
    history = [
        entry(1, issue_a, {"p_001": "A"}),
        entry(2, issue_b, {"p_001": "B"}),
        entry(3, [{"paragraph_id": "p_001", "type": "style", "problem": "又变了"}],
              {"p_001": "A"}),
    ]
    check("A→B→A 震荡检测", rounds.detect_oscillation(history))
    oscillation = rounds.evaluate(history)
    check("震荡给出停止选项", oscillation and oscillation["reason"] == "oscillation"
          and set(oscillation["options"]) == {"accept_current", "change_strategy", "manual_issues"})
    hard = rounds.evaluate([entry(index, issue_a if index % 2 else issue_b)
                            for index in range(1, 6)])
    check("硬上限 5 轮", hard and hard["reason"] == "hard_limit")
    soft = rounds.evaluate([
        entry(1, issue_a),
        entry(2, issue_b),
        entry(3, [{"paragraph_id": "p_002", "type": "quality", "problem": "x"}]),
    ])
    check("软上限后无明确进展即停止", soft and soft["reason"] == "soft_limit")
    progressed = rounds.evaluate([
        entry(1, issue_a + issue_b),
        entry(2, issue_a),
        entry(3, []),
    ])
    check("有进展时可继续", progressed is None)
    repeated = rounds.evaluate([
        entry(1, [{"paragraph_id": "p_001", "type": "style", "problem": "问题一"}]),
        entry(2, [{"paragraph_id": "p_001", "type": "style", "problem": "问题二"}]),
        entry(3, [{"paragraph_id": "p_001", "type": "style", "problem": "问题三"}]),
    ])
    check("同一段连续多轮不通过 → 停止", repeated
          and repeated["detail"] == "repeated_paragraph")


# ─────────────────────────────────────────────
# 7. 引擎主流程
# ─────────────────────────────────────────────
def test_engine_flow(store: SessionStore):
    chat = FakeChat()
    engine = make_engine(chat, store)
    view = start(engine, chat)
    check("计划后进入定位状态", view["state"] == "LOCATE", view["state"])
    check("需求卡预览返回前端", bool(view["preview"]) and view["card"]["goal"])
    check("计划目标段数量", len(view["plan"]["targets"]) == 2,
          str(view["plan"]["targets"]))
    check("auto_step 建议先改样例", view["auto_step"] == "sample", view["auto_step"])

    view = engine.execute("sample", {"session_id": view["id"]})
    check("样例改写等待确认", view["state"] == "USER_CONFIRM_SAMPLE"
          and view["sample"]["status"] == "pending")
    check("样例未确认时不改正文", view["doc"]["text"] == SAMPLE_TEXT)
    check("样例 diff 已生成", bool(view["sample"]["diff"]))

    view = engine.execute("sample_choice", {"session_id": view["id"],
                                           "choice": "more_oral"})
    check("样例反馈会重写样例",
          "口语" in chat.revise_calls[-1]["user"] and view["sample"]["status"] == "pending")

    view = engine.execute("sample_choice", {"session_id": view["id"], "choice": "accept"})
    check("样例确认后直接批量并审核", view["state"] == "USER_CONFIRM_FINAL", view["state"])
    check("批量后正文已替换", "（改）" in view["doc"]["text"])
    check("审核通过", view["review"]["pass"] is True)
    check("样例改动进入最终 diff", view["changes"]
          and view["changes"][0]["paragraph_id"] == "p_001")
    check("改动保存为版本", len(view["versions"]) >= 2)
    check("序列化视图可 JSON 化", isinstance(json.dumps(view, ensure_ascii=False), str))

    accepted = engine.execute("accept", {"session_id": view["id"]})
    check("用户确认后结束", accepted["state"] == "DONE" and accepted["accepted"])
    check("已保留版本入栈", any(item["label"] == "已保留" or item["source"] == "accept"
                                for item in accepted["versions"]))
    check("会话文件落盘", (store.root / f"{view['id']}.json").exists())
    reloaded = make_engine(chat, store).execute("resume", {"session_id": view["id"]})
    check("会话可恢复", reloaded["doc"]["text"] == accepted["doc"]["text"]
          and reloaded["accepted"] and reloaded["state"] == "DONE")

    # 增量需求：沿用旧卡，不重新开始
    plan_before = len(chat.calls)
    chat.review_queue = []
    increment = engine.execute("increment", {"session_id": view["id"],
                                             "prompt": "再把最后一句改得冷静一点"})
    check("增量需求回到待确认", increment["state"] in ("USER_CONFIRM_FINAL", "LOCATE"),
          increment["state"])
    check("增量需求复用同一会话", increment["id"] == view["id"]
          and increment["stats"]["rounds"] > 0)
    check("增量需求调用计划提示词", len(chat.calls) > plan_before)
    stored = engine.load(view["id"])
    check("稳定摘要只追加", any("短句推进" in item.get("text", "")
                               for item in stored["stable_summary"]))
    duplicate = sum(1 for item in stored["stable_summary"]
                    if item.get("text") == "短句推进，少形容词")
    check("稳定摘要不重复", duplicate == 1, str(duplicate))


def test_question_and_direct(store: SessionStore):
    chat = FakeChat()

    def plan_with_question(user):
        data = default_plan(user)
        data["question"] = {"text": "想要哪种紧张？",
                            "options": [{"id": "tight", "label": "更压迫"},
                                        {"id": "light", "label": "更克制"}]}
        return data

    chat.plan = plan_with_question
    engine = make_engine(chat, store)
    view = start(engine, chat, wish="把开头改好一点")
    check("模糊需求只追问 1 个问题", view["question"] is not None
          and len(view["question"]["options"]) == 2)
    check("追问时 auto_step 不自动继续", view["auto_step"] == "")
    view = engine.execute("answer", {"session_id": view["id"], "option_id": "tight"})
    check("回答后进入样例", view["state"] == "USER_CONFIRM_SAMPLE" and view["question"] is None)
    check("回答作为反馈进入提示词", any("用户选择：更压迫" in call["user"] for call in chat.calls))

    chat2 = FakeChat()
    chat2.plan = plan_with_question
    engine2 = make_engine(chat2, store)
    direct = start(engine2, chat2, wish="直接改，不用确认")
    check("直接接受跳过追问", direct["question"] is None)
    check("直接接受跳过样例", direct["auto_step"] == "batch"
          and direct["card"]["sample_first"] is False)
    direct = engine2.execute("batch", {"session_id": direct["id"]})
    check("直接接受仍保留最终 diff 与回滚",
          direct["state"] == "USER_CONFIRM_FINAL" and direct["changes"]
          and direct["versions"])


def test_review_loop(store: SessionStore):
    chat = FakeChat()
    chat.review_queue = [
        {"local": failing_review("p_001", "语气仍偏书面", instruction="把 p_001 改得更短，保持衔接")},
        {"local": pass_review()},
    ]
    engine = make_engine(chat, store)
    view = start(engine, chat)
    view = engine.execute("batch", {"session_id": view["id"]})
    check("审核不通过会定向重改", view["state"] == "USER_CONFIRM_FINAL"
          and len(view["rounds"]) == 2, str(len(view["rounds"])))
    second_round = [call for call in chat.revise_calls if "把 p_001 改得更短" in call["user"]]
    check("next_instruction 驱动下一轮提示词", bool(second_round), str(len(chat.revise_calls)))
    check("第二轮只改问题段", second_round and second_round[-1]["ids"] == ["p_001"],
          str(second_round[-1]["ids"] if second_round else []))

    chat = FakeChat()
    chat.review_queue = [{"local": failing_review("p_001")},
                         {"local": failing_review("p_001")}]
    engine = make_engine(chat, store)
    view = start(engine, chat)
    view = engine.execute("batch", {"session_id": view["id"]})
    check("相同问题两轮后停止", view["stop"] and view["stop"]["reason"] == "no_progress",
          str(view.get("stop")))
    check("停止后仍展示当前差异", bool(view["changes"]))

    chat = FakeChat()
    chat.review_queue = []
    for round_index, issue_count in enumerate((5, 4, 3, 2, 1)):
        pid = f"p_{round_index + 1:03d}"
        chat.review_queue.append({"local": {
            "pass": False,
            "issues": [{"paragraph_id": pid, "type": "style",
                        "problem": f"问题{round_index}-{index}",
                        "suggestion": "继续改"} for index in range(issue_count)],
            "next_instruction": f"继续修改 {pid}（第 {round_index + 1} 轮）",
        }})
    engine = make_engine(chat, store)
    view = start(engine, chat)
    view = engine.execute("batch", {"session_id": view["id"]})
    check("默认最多 5 轮", len(view["rounds"]) == 5 and view["stop"]
          and view["stop"]["reason"] == "hard_limit", str(len(view["rounds"])))


def test_rollback(store: SessionStore):
    chat = FakeChat()
    engine = make_engine(chat, store)
    view = start(engine, chat)
    view = engine.execute("batch", {"session_id": view["id"]})
    before = view["doc"]["text"]
    view = engine.execute("rollback", {"session_id": view["id"], "version": 0})
    check("整版回滚回到原文", view["doc"]["text"] == SAMPLE_TEXT
          and view["changes"] == [] and not view["accepted"])
    check("回滚后记录版本", view["versions"][-1]["source"] == "rollback")

    view = engine.execute("batch", {"session_id": view["id"]})
    changed = view["doc"]["text"]
    pid = view["changes"][0]["paragraph_id"]
    view = engine.execute("rollback", {"session_id": view["id"],
                                       "paragraph_ids": [pid], "to_version": 0})
    check("按段回滚只还原目标段",
          view["doc"]["text"] != changed and pid not in
          [item["paragraph_id"] for item in view["changes"]],
          str([item["paragraph_id"] for item in view["changes"]]))


def test_context_budget(store: SessionStore):
    chat = FakeChat()
    engine = make_engine(chat, store)
    view = start(engine, chat)
    engine.execute("sample", {"session_id": view["id"]})
    engine.execute("sample_choice", {"session_id": view["id"], "choice": "accept"})
    check("中短篇首次注入全文", any("<document>" in call["user"] for call in chat.revise_calls))
    check("全文只注入一次", sum(1 for call in chat.revise_calls
                              if "<document>" in call["user"]) == 1)

    chat = FakeChat()
    chat.review_queue = [{"local": failing_review("p_001")}, {"local": pass_review()}]
    engine = make_engine(chat, store)
    view = start(engine, chat)
    engine.execute("sample", {"session_id": view["id"]})
    view = engine.execute("sample_choice", {"session_id": view["id"], "choice": "accept"})
    document_calls = sum(1 for call in chat.revise_calls if "<document>" in call["user"])
    check("多轮之间不重复发送全文", document_calls == 1, str(document_calls))

    long_text = "\n".join(f"第 {index} 段，" + "很长的叙述。" * 40 for index in range(60))
    chat = FakeChat()
    engine = make_engine(chat, store)
    view = start(engine, chat, text=long_text,
                 body_extra={"options": {"full_text_limit": 500}})
    view = engine.execute("batch", {"session_id": view["id"]})
    check("长篇不发送全文", all("<document>" not in call["user"]
                             for call in chat.revise_calls))
    check("长篇使用摘要与前后文", any("稳定摘要" in call["user"] or "前后文" in call["user"]
                                for call in chat.revise_calls))


def test_summary():
    items, added = summary.append([], [{"kind": "style", "text": "短句"}, "偏好冷色"])
    check("稳定摘要追加条目", added == 2 and len(items) == 2)
    again, added_again = summary.append(items, [{"kind": "style", "text": "短句"}])
    check("稳定摘要不重复追加", added_again == 0 and len(again) == 2)
    check("稳定摘要渲染", "文风：短句" in summary.render(items))
    check("未知类别归为用户偏好",
          summary.append([], [{"kind": "weird", "text": "x"}])[0][0]["kind"] == "preference")


def main() -> int:
    print("== 润色修订 Agent 验收 ==")
    test_segments()
    test_card()
    test_plan()
    test_revision_postprocess()
    test_review_normalize()
    test_rounds()
    with tempfile.TemporaryDirectory(prefix="nh_rev_store_") as temp:
        test_engine_flow(SessionStore(Path(temp) / "a"))
        test_question_and_direct(SessionStore(Path(temp) / "b"))
        test_review_loop(SessionStore(Path(temp) / "c"))
        test_rollback(SessionStore(Path(temp) / "d"))
        test_context_budget(SessionStore(Path(temp) / "e"))
    test_summary()
    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
