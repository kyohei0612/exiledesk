"""ExileDesk 要望 ⑰ (PoB の DPS・ルーン・解呪・耐性の画面・登場の動き) の受け渡しと画面の指定."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from poe2tube.capture.anim import anim_query
from poe2tube.capture.views import view_query
from poe2tube.contracts.craft_stage import CraftStagePlan, CraftStageResult, PlanStep
from poe2tube.contracts.pob import ResistsBlock
from poe2tube.script.brief import Brief
from poe2tube.script.model import Scene, VideoScript
from poe2tube.script.pob_digest import item_extras, pob_digest, resists_block, resists_files
from poe2tube.video.results import ResultSet

EX = Path(__file__).resolve().parents[1] / "contracts" / "examples"


def _load(name: str) -> dict[str, object]:
    data: dict[str, object] = json.loads((EX / name).read_text(encoding="utf-8"))
    return data


@pytest.fixture(scope="module")
def result() -> CraftStageResult:
    return CraftStageResult.model_validate(_load("result-quarterstaff-pob.json"))


@pytest.fixture(scope="module")
def resists() -> ResistsBlock:
    return ResistsBlock.model_validate(_load("resists-quarterstaff-ring.json"))


@pytest.fixture(scope="module")
def rs(result: CraftStageResult, resists: ResistsBlock) -> ResultSet:
    return ResultSet(result, {"other": result}, {"gear": resists})


def test_plan_pob_round_trip() -> None:
    plan = CraftStagePlan.model_validate(_load("plan-quarterstaff-pob.json"))
    assert plan.pob is not None and plan.pob.class_ == "Monk"
    assert plan.pob.config.resistancePenalty == -20 and plan.pob.config.enemyIsBoss == "None"
    dumped = json.loads(plan.model_dump_json(by_alias=True, exclude_none=True))
    assert dumped["pob"]["class"] == "Monk" and "enemyLevel" not in dumped["pob"]["config"]


def test_rune_and_disposal_keys() -> None:
    for key in ("rune:Lesser Iron Rune", "disenchant", "salvage"):
        assert PlanStep(currency=key).currency == key
    with pytest.raises(ValueError):
        PlanStep(currency="rune:<script>")


def test_result_pob_and_properties(result: CraftStageResult) -> None:
    assert result.pob is not None
    assert len(result.pob.steps) == len(result.steps) + 1  # 手 0 = 白
    assert result.pob.steps[-1].dps > result.pob.steps[0].dps
    assert result.pob.character.skill_ja and "アクト 3" in result.pob.config_ja
    assert result.steps[-1].pob is not None
    extras = item_extras(result.final)
    assert any("(青)" in p for p in extras["properties"]) and extras["runes"]
    digest = pob_digest(result)
    assert digest is not None and digest["steps"][0]["step"] == 0
    assert "Monk Lv20" in digest["前提"]


def test_scene_rules() -> None:
    Scene(kind="resists", resists="gear", act=-20, reveal=False)
    Scene(kind="hit", step=0, elem="fire", res=[50, 75])
    Scene(kind="ttk", step=0, b_step=3, labels=["白", "レア"])
    Scene(kind="ttk", step=0, compare_with="other")
    for bad in (
        {"kind": "resists", "resists": "gear"},  # act が無い
        {"kind": "hit", "step": 0},  # elem が無い
        {"kind": "dps"},  # step が無い
        {"kind": "stage", "step": 1, "labels": ["a"]},
        {"kind": "item", "step": 1, "res": [50]},
    ):
        with pytest.raises(ValueError):
            Scene.model_validate(bad)


def test_view_queries(rs: ResultSet) -> None:
    q = view_query(Scene(kind="dps", step=3), rs)
    assert q is not None and "view=dps" in q and "&pob=" in q and "&step=3" in q
    q = view_query(Scene(kind="hit", step=0, elem="cold", dmg=500), rs)
    assert q is not None and "elem=cold" in q and "res=50,75" in q and "dmg=500" in q
    q = view_query(Scene(kind="ttk", step=0, b_step=3, labels=["白", "レア"], reveal=False), rs)
    assert q is not None and "a_pob=" in q and "b_pob=" in q and "b_step=3" in q
    assert q.endswith("&hl=0")
    q = view_query(Scene(kind="resists", resists="gear", act=-20, reveal=False), rs)
    assert q is not None and "view=resists" in q and "act=-20" in q and q.endswith("&penalty=0")
    q = view_query(Scene(kind="compare", step=3, compare_with="other", show_dps=False), rs)
    assert q is not None and "a_pob=" in q and q.endswith("&dps=0")
    q = view_query(Scene(kind="stage", step=2, show_dps=False), rs)
    assert q is not None and "stage-pob=" in q and q.endswith("&dps=0")
    assert view_query(Scene(kind="stage", step=2), rs) is None  # 普通の手は capture_plan で撮る
    assert view_query(Scene(kind="resists", resists="nope", act=0), rs) is None


def test_anim_queries(rs: ResultSet) -> None:
    hidden = Scene(kind="resists", resists="gear", act=-20, reveal=False)
    shown = Scene(kind="resists", resists="gear", act=-20)
    q = anim_query(hidden, Scene(kind="talk"), rs)
    assert q is not None and q.endswith("&penalty=0&play=1")
    q = anim_query(shown, hidden, rs)
    assert q is not None and q.endswith("&penalty=0&play=1&reveal=1")  # 隠した所から答え
    assert anim_query(shown, shown, rs) is None  # 同じ画面が続く
    assert anim_query(Scene(kind="tiers", mod="FireResistance"), None, rs) is None  # 動きなし


def test_check_against_pob_and_resists(result: CraftStageResult) -> None:
    plain = result.model_copy(update={"pob": None})
    line = {"speaker": "metan", "text": "DPS を見てみるわ。", "scene": {"kind": "dps", "step": 1}}
    res_line = {
        "speaker": "metan",
        "text": "耐性を見るわ。",
        "scene": {"kind": "resists", "resists": "gear", "act": 0},
    }
    script = VideoScript.model_validate(
        {
            "title": "t",
            "target_seconds": 10,
            "result_file": "x.json",
            "sections": [{"name": "s", "target_seconds": 10, "lines": [line, res_line]}],
        }
    )
    problems = script.check_against(plain)
    assert any("PoB" in p for p in problems) and any("耐性の組" in p for p in problems)
    assert not [p for p in script.check_against(result) if "PoB" in p]


def test_brief_resists(tmp_path: Path, resists: ResistsBlock) -> None:
    plan = _load("plan-quarterstaff-pob.json")
    brief = Brief.model_validate(
        {
            "name": "qs",
            "title_hint": "t",
            "goal": "g",
            "target_seconds": 60,
            "plan": plan,
            "resists": {"gear": {"class": "Monk", "items": [{"step": 5}, {"demo": "ring"}]}},
        }
    )
    assert any("ring" in p for p in brief.problems())
    assert resists_files(brief) == {"gear": "data/results/qs__resists_gear.json"}
    out = tmp_path / "data" / "results"
    out.mkdir(parents=True)
    (out / "qs__resists_gear.json").write_text(resists.model_dump_json(), encoding="utf-8")
    block = resists_block(brief, tmp_path)
    assert len(block) == 1 and "アクト 3" in block[0] and '"gear"' in block[0]


def test_hit_label_rune_and_disenchant(result: CraftStageResult) -> None:
    from poe2tube.render.overlay_fx import hit_label
    from poe2tube.video.animate import hit_sound

    rune = result.steps[-1]
    assert hit_label(rune)[0].startswith("+ ") and hit_sound(rune) == "hit_added"
    junk = CraftStageResult.model_validate(
        json.loads(
            (EX.parents[1] / "data" / "results" / "act_offense_defense_8min__junk.json").read_text(
                encoding="utf-8"
            )
        )
    )
    assert hit_label(junk.steps[0])[0] == "解呪!"


def test_hidden_dps_on_hit_line() -> None:
    from poe2tube.script.lint import hidden_dps_on_hit

    def line(step: int, show: bool) -> dict[str, object]:
        return {
            "speaker": "metan",
            "text": "見てみるわ。",
            "scene": {"kind": "stage", "step": step, "show_dps": show},
        }

    script = VideoScript.model_validate(
        {
            "title": "t",
            "target_seconds": 10,
            "result_file": "x.json",
            "sections": [
                {"name": "s", "target_seconds": 10, "lines": [line(1, False), line(1, False)]}
            ],
        }
    )
    assert [p[:6] for p in hidden_dps_on_hit(script)] == ["line 1"]


def test_ttk_question_holds_first_frame() -> None:
    from poe2tube.capture.anim import holds_first

    assert holds_first(Scene(kind="ttk", step=0, b_step=3, reveal=False))
    assert not holds_first(Scene(kind="ttk", step=0, b_step=3))
    assert not holds_first(Scene(kind="resists", resists="gear", act=0, reveal=False))


def test_quiz_answer_by_name() -> None:
    sc = Scene.model_validate(
        {"kind": "quiz", "choices": ["transmute", "augment"], "answer": "augment"}
    )
    assert sc.answer == 1


def test_pick_and_start_round_trip() -> None:
    """⑱: 付く MOD の指名・始めの状態・要求レベル・敵のアーマー (v0.1.336 の本物)."""
    plan = CraftStagePlan.model_validate(_load("plan-pick-start.json"))
    assert plan.start is not None and len(plan.start.mods) == 6
    step = plan.steps[0]
    assert step.remove == "ManaGainedFromEnemyDeath" and not isinstance(step.pick, list)
    assert plan.pob is not None and plan.pob.quests_act == 2
    res = CraftStageResult.model_validate(_load("result-pick-start.json"))
    first = res.steps[0]
    assert first.picked and 0 < first.pick_chance[0]["chance"] < 1
    assert res.final.requirements is not None and res.final.requirements["level"] == 28
    assert res.pob is not None and res.pob.enemy is not None and res.pob.enemy.armour == 237
    with pytest.raises(ValueError):
        PlanStep(currency="exalt", pick={"mod": "X", "tier": "6"})  # 段は T から


def test_info_screen_time() -> None:
    """情報の画面は出したまま話す (比べる等は 8 秒以上、隠す / 出すは同じ画面として足す)."""
    from poe2tube.script.lint import info_screen_time, lint_lines
    from poe2tube.script.model import Line

    cmp_ = {"kind": "compare", "step": 0, "compare_with": "other"}

    def ln(text: str, sc: dict[str, object]) -> Line:
        return Line.model_validate({"speaker": "metan", "text": text, "scene": sc})

    short = [ln("比べるわ。", cmp_), ln("次ね。", {"kind": "talk"})]
    assert any("compare の画面" in p for p in info_screen_time(short))
    long_ = [
        ln("上が同じで、下だけ違う 2 本を並べてみたわ。", {**cmp_, "show_dps": False}),
        ln("左がずんだもんの武器、右がおすすめの武器ね。", cmp_),
        ln("サフィックスだけで、DPS がこれだけ違うのよ。", cmp_),
        ln("アタックスピードと近接スキルのレベルが効いてるわ。", cmp_),
    ]
    assert info_screen_time(long_) == []
    assert not any("同じ画面" in p for p in lint_lines(long_))  # 情報の画面は連続の対象外


def test_info_screen_same_image_counts_once() -> None:
    """同じ画像のまま答えを出す (クイズの秒読み → 正解、防御の hl) は 1 枚として足す."""
    from poe2tube.script.lint import INFO_MIN_SECONDS, info_screen_time
    from poe2tube.script.model import Line

    def ln(text: str, sc: dict[str, object]) -> Line:
        return Line.model_validate({"speaker": "metan", "text": text, "scene": sc})

    q = {"kind": "quiz", "choices": ["回避力", "受け流し"]}
    quiz = [
        ln("ここでクイズ。赤い技に効くのはどれ？", q),
        ln("3 秒で考えてね。", {**q, "countdown": 3}),
        ln("正解は受け流し。回避は赤い技に効かないの。", {**q, "answer": 1}),
    ]
    assert info_screen_time(quiz) == []
    b = {"kind": "bases", "def_params": {"slot": "body"}}
    hidden = {"kind": "bases", "def_params": {"slot": "body", "hl": "0"}}
    assert info_screen_time([ln("防具のベースよ。", hidden), ln("何倍かしら。", b)]) != []
    assert INFO_MIN_SECONDS["bases"] > INFO_MIN_SECONDS["compare"] > INFO_MIN_SECONDS["quiz"]


def test_reading_kaiju() -> None:
    from poe2tube.script.reading import normalize_speech

    assert normalize_speech("青を解呪するわ") == "青をかいじゅするわ"


def test_tier_is_not_dan() -> None:
    """「段」は使わない (ティアと紛らわしい)。段階・手段などの別の言葉はよい (kyohei 2026-09-30)."""
    from poe2tube.script.lint import lint_lines
    from poe2tube.script.model import Line

    def ln(text: str, kind: str = "item") -> Line:
        sc: dict[str, object] = {"kind": kind, "step": 0}
        if kind == "tiers":
            sc = {"kind": "tiers", "mod": "FireResistance"}
        return Line.model_validate({"speaker": "metan", "text": text, "scene": sc})

    bad = [ln("T5 の段まで付くわ。"), ln("金の段が一番上よ。"), ln("ここから 1 段ずつ見ていくわ。")]
    ok = [ln("段階を踏むの。"), ln("防御の手段が多いわ。"), ln("値段の話はしないわ。")]
    assert all(any("「段」" in p for p in lint_lines([x])) for x in bad)
    assert not any("「段」" in p for p in lint_lines(ok))


def test_defence_scene_query() -> None:
    from poe2tube.capture.views import view_query
    from poe2tube.contracts.craft_stage import CraftStageResult

    res = CraftStageResult.model_validate(_load("result-quarterstaff-pob.json"))
    sc = Scene(kind="layers", def_params={"life": 500, "outcome": "evade", "red": "1"})
    q = view_query(sc, ResultSet(res))
    assert q is not None and "view=layers" in q and "life=500" in q and "outcome=evade" in q
    assert "&pob=" not in q  # life を指定した時は PoB のキャラを使わない
    with pytest.raises(ValueError):
        Scene(kind="item", step=0, def_params={"life": 1})
