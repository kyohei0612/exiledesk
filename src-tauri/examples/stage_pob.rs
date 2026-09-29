//! stage_pob — クラフトステージの手ごとのアイテムで PoB を計算する (2026-09-29、POE2Tube 要望 ⑰-3 / ⑰-4)
//!
//!   cargo run -q --example stage_pob -- in.json out.json      (scripts/craft-stage-run.mjs が呼ぶ。通信しない)
//!   cargo run -q --example stage_pob -- --dump                (空のビルドの XML を出す。確かめ用)
//!
//! kyohei「スキルの DPS やダメージ表記がないと分かりづらい、複雑な計算だから PoB の計算機で」。
//! 同梱のヘッドレス PoB (PobWorker) に、パッシブ無し・他の装備無しの素のキャラ (クラス・レベル・スキル 1 つ + サポート) を作り、
//! 手ごとにアイテムを装備させて output を読む。敵やアクトの設定 (PoB の Configuration) は in.json の config をそのまま
//! `<Input name=… number|string=…/>` で入れる (既定の Guardian/Pinnacle Boss・Endgame -60% はアクトの話と合わないため)。
//!
//! in.json:  { class, level, gem_id (Metadata/Items/Gems/…), gem_level, supports: [gem_id], config: { name: 数値 | 文字 },
//!             steps: [ [ { slot, text } ] ] }   … steps[i] はその時点で装備するアイテム (PoB のアイテムの文面)
//! out.json: { pob_version, config: 実際に使った設定, steps: [ { 出力のキー: 数値 } ] }
use exiledesk_lib::pob::PobWorker;
use serde::Deserialize;
use std::collections::HashMap;
use std::env;
use std::path::PathBuf;

fn pob_src_dir() -> PathBuf {
    if let Ok(p) = env::var("POB_SRC") {
        return PathBuf::from(p);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("vendor").join("PathOfBuilding-PoE2").join("src")
}

#[derive(Deserialize)]
struct ItemIn {
    slot: String,
    text: String,
}
#[derive(Deserialize)]
struct Input {
    class: String,
    level: u32,
    /// 無ければスキル無し (耐性だけ見る時)
    #[serde(default)]
    gem_id: Option<String>,
    #[serde(default)]
    gem_level: u32,
    /// スキルの段 (1 から、PoB の parts)。無ければ PoB の既定 (1 つ目)
    #[serde(default)]
    skill_part: Option<u32>,
    /// ステータスの組 (1 から、PoE2 の PoB の statSets。アイスストライクの Normal Strikes / Third Strike など)。granted_effect と組で
    #[serde(default)]
    stat_set: Option<u32>,
    #[serde(default)]
    granted_effect: Option<String>,
    #[serde(default)]
    supports: Vec<String>,
    #[serde(default)]
    config: serde_json::Map<String, serde_json::Value>,
    steps: Vec<Vec<ItemIn>>,
}

/// 出すキー (PoB の calcsEnv.player.output)。DPS・1 発・速さ・クリティカル・防御・耐性 (上限後 / 上限前の合計 / 上限)
const KEYS: &[&str] = &[
    "TotalDPS", "CombinedDPS", "AverageHit", "AverageDamage", "Speed", "CritChance", "HitChance",
    "Life", "Mana", "EnergyShield", "Armour", "Evasion", "Spirit",
    "FireResist", "ColdResist", "LightningResist", "ChaosResist",
    "FireResistTotal", "ColdResistTotal", "LightningResistTotal", "ChaosResistTotal",
    "FireResistOverCap", "ColdResistOverCap", "LightningResistOverCap", "ChaosResistOverCap",
    // DPS の種類 (要望 ⑲-7): TotalDPS = 当たりの DPS (命中率・クリティカル込み)、CombinedDPS = 状態異常のダメージ込み、FullDPS = 全部のスキル
    "FullDPS", "TotalDot", "MainHand.HitChance", "MainHand.CritChance",
    // 1 発の種類ごとの平均 (DPS の内訳、要望 ⑰-2 の breakdown)
    "MainHand.PhysicalHitAverage", "MainHand.FireHitAverage", "MainHand.ColdHitAverage", "MainHand.LightningHitAverage", "MainHand.ChaosHitAverage",
    // 敵の一撃 (種類ごと、PoB の設定の既定値。受けるダメージの画面)
    "PhysicalEnemyDamage", "FireEnemyDamage", "ColdEnemyDamage", "LightningEnemyDamage", "ChaosEnemyDamage",
];

/**
 * PoB が実際に読んだ物を JSON の文字列で返す Lua (要望 ⑲ の点検)。
 *   skill: メインのスキルの名前・段の名前・効いているサポート (effectList の 2 つ目から)
 *   gems: 読み込んだジェム (gemData が引けたか = PoB が知っているジェムか)
 *   unparsed: 装備したアイテムの読めなかった行 (modLine.extra = PoB の「unsupported」)
 *   enemy: 敵のレベル・ライフ・アーマー・回避・耐性 (enemy.output / enemyDB)
 */
const INSPECT: &str = r#"
local function q(s) return '"' .. tostring(s or ""):gsub('\\', '\\\\'):gsub('"', '\\"') .. '"' end
local parts = {}
local env = build.calcsTab and build.calcsTab.mainEnv
local ms = env and env.player and env.player.mainSkill
if ms and ms.activeEffect then
  local sup = {}
  for i, e in ipairs(ms.effectList or {}) do
    if i > 1 and e.grantedEffect then table.insert(sup, q(e.grantedEffect.name) .. ":" .. tostring(e.level or 0)) end
  end
  local ae = ms.activeEffect
  local ssi = (ae.statSet and ae.statSet.index) or (ae.statSetCalcs and ae.statSetCalcs.index) or 1
  local ss = ae.grantedEffect.statSets and ae.grantedEffect.statSets[ssi]
  table.insert(parts, '"skill":{"name":' .. q(ae.grantedEffect.name) .. ',"stat_set":' .. q(ss and ss.label) .. ',"stat_set_index":' .. tostring(ssi) .. ',"part":' .. q(ms.skillPartName) .. ',"part_index":' .. tostring(ms.skillPart or 0) .. ',"level":' .. tostring(ms.activeEffect.level or 0) .. ',"disabled":' .. q(ms.disableReason) .. ',"supports":{' .. table.concat(sup, ",") .. '}}')
end
local gems = {}
for _, sg in ipairs(build.skillsTab.socketGroupList or {}) do
  for _, g in ipairs(sg.gemList or {}) do
    table.insert(gems, '{"spec":' .. q(g.nameSpec) .. ',"known":' .. tostring(g.gemData ~= nil) .. ',"support":' .. tostring(g.gemData and g.gemData.tags and g.gemData.tags.support or false) .. ',"level":' .. tostring(g.level or 0) .. ',"enabled":' .. tostring(g.enabled ~= false) .. '}')
  end
end
table.insert(parts, '"gems":[' .. table.concat(gems, ",") .. ']')
local un = {}
for _, slot in pairs(build.itemsTab.slots or {}) do
  local item = slot.selItemId and slot.selItemId > 0 and build.itemsTab.items[slot.selItemId]
  if item then
    for _, list in ipairs({ item.runeModLines or {}, item.implicitModLines or {}, item.explicitModLines or {} }) do
      for _, ml in ipairs(list) do
        if ml.extra then table.insert(un, q(ml.line)) end
      end
    end
  end
end
table.insert(parts, '"unparsed":[' .. table.concat(un, ",") .. ']')
local en = env and env.enemy
if en then
  local o = en.output or {}
  local db = en.modDB
  local function b(n) return db and db:Sum("BASE", nil, n) or 0 end
  table.insert(parts, '"enemy":{"level":' .. tostring(env.enemyLevel or 0) .. ',"armour":' .. tostring(o.Armour or b("Armour")) .. ',"evasion":' .. tostring(o.Evasion or b("Evasion")) .. ',"fire":' .. tostring(b("FireResist")) .. ',"cold":' .. tostring(b("ColdResist")) .. ',"lightning":' .. tostring(b("LightningResist")) .. ',"chaos":' .. tostring(b("ChaosResist")) .. '}')
end
return "{" .. table.concat(parts, ",") .. "}"
"#;

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('"', "&quot;").replace('<', "&lt;").replace('>', "&gt;")
}

/// 空のビルドの XML にキャラ・スキル・設定を入れる
fn build_xml(empty: &str, inp: &Input) -> String {
    let mut xml = empty.to_string();
    // キャラ: レベルは自動にしない
    if let (Some(a), Some(b)) = (xml.find("<Build "), xml.find("<Build ").and_then(|a| xml[a..].find('>').map(|b| a + b))) {
        let head = format!(
            "<Build targetVersion=\"0_1\" characterLevelAutoMode=\"false\" viewMode=\"TREE\" level=\"{}\" ascendClassName=\"None\" className=\"{}\" mainSocketGroup=\"1\"",
            inp.level,
            esc(&inp.class)
        );
        xml.replace_range(a..b, &head);
    }
    // スキル: 1 つのグループ (メインのジェム + サポート)
    let Some(gem_id) = inp.gem_id.as_deref() else {
        return with_config(xml, inp);
    };
    let part = inp.skill_part.map(|p| format!(" skillPart=\"{p}\" skillPartCalcs=\"{p}\"")).unwrap_or_default();
    // ステータスの組は Gem の子の StatSetIndex / StatSetCalcsIndex (Classes/SkillsTab.lua の LoadSkill と同じ形)
    let set = match (inp.stat_set, inp.granted_effect.as_deref()) {
        (Some(n), Some(ge)) => format!("<StatSetIndex grantedEffect=\"{0}\" index=\"{n}\"/><StatSetCalcsIndex grantedEffect=\"{0}\" index=\"{n}\"/>", esc(ge)),
        _ => String::new(),
    };
    let mut gems = format!("<Gem gemId=\"{}\" level=\"{}\" quality=\"0\" enabled=\"true\"{part}>{set}</Gem>", esc(gem_id), inp.gem_level.max(1));
    for s in &inp.supports {
        gems.push_str(&format!("<Gem gemId=\"{}\" level=\"1\" quality=\"0\" enabled=\"true\"/>", esc(s)));
    }
    xml = xml.replacen(
        "<SkillSet id=\"1\"/>",
        &format!("<SkillSet id=\"1\"><Skill enabled=\"true\" includeInFullDPS=\"true\" mainActiveSkill=\"1\" mainActiveSkillCalcs=\"1\">{gems}</Skill></SkillSet>"),
        1,
    );
    with_config(xml, inp)
}

/// 設定 (Configuration) を入れる
fn with_config(xml: String, inp: &Input) -> String {
    let mut inputs = String::new();
    for (k, v) in &inp.config {
        match v {
            serde_json::Value::Number(n) => inputs.push_str(&format!("<Input name=\"{}\" number=\"{}\"/>", esc(k), n)),
            serde_json::Value::String(s) => inputs.push_str(&format!("<Input name=\"{}\" string=\"{}\"/>", esc(k), esc(s))),
            serde_json::Value::Bool(b) => inputs.push_str(&format!("<Input name=\"{}\" boolean=\"{}\"/>", esc(k), b)),
            _ => {}
        }
    }
    xml.replacen("<ConfigSet id=\"1\">", &format!("<ConfigSet id=\"1\">{inputs}"), 1)
}

/// PoB のバージョン (manifest.xml の <Version number="…"/>)
fn pob_version() -> String {
    let m = pob_src_dir().parent().map(|p| p.join("manifest.xml"));
    let t = m.and_then(|p| std::fs::read_to_string(p).ok()).unwrap_or_default();
    t.split("<Version number=\"").nth(1).and_then(|s| s.split('"').next()).unwrap_or("?").to_string()
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let worker = PobWorker::spawn(pob_src_dir());
    let empty = worker.snapshot().expect("PoB の空のビルドを読めない");
    if args.iter().any(|a| a == "--dump") {
        println!("{empty}");
        return;
    }
    let (inp_path, out_path) = (args.first().expect("in.json"), args.get(1).expect("out.json"));
    let inp: Input = serde_json::from_str(&std::fs::read_to_string(inp_path).expect("in.json を読めない")).expect("in.json の形が変");
    let xml = build_xml(&empty, &inp);
    worker.load_build_xml(xml.clone()).expect("ビルドを読めない");
    let mut steps = Vec::new();
    for items in &inp.steps {
        // 手ごとに作り直す (前の手のアイテムが残らないように)
        worker.load_build_xml(xml.clone()).expect("ビルドを読めない");
        for it in items {
            if let Err(e) = worker.set_item_in_slot(Some(it.slot.clone()), it.text.clone()) {
                eprintln!("装備できない ({}): {e}", it.slot);
            }
        }
        let _ = worker.set_main_socket_group(1);
        let all: HashMap<String, f64> = worker.get_stats_all().unwrap_or_default();
        // 確かめ用: STAGE_POB_KEYS=<部分文字列> で、その文字を含む出力のキーを全部出す
        if let Ok(f) = env::var("STAGE_POB_KEYS") {
            let mut ks: Vec<_> = all.iter().filter(|(k, _)| k.contains(&f)).collect();
            ks.sort_by(|a, b| a.0.cmp(b.0));
            for (k, v) in ks {
                eprintln!("{k} = {v}");
            }
        }
        let mut row: serde_json::Map<String, serde_json::Value> =
            KEYS.iter().filter_map(|k| all.get(*k).map(|v| (k.to_string(), serde_json::json!(v)))).collect();
        // 確かめ用: STAGE_POB_LUA=<Lua の塊 (文字列を return)> を手ごとに実行して標準エラーに出す (要望 ⑲ の点検)
        if let Ok(script) = env::var("STAGE_POB_LUA") {
            eprintln!("[lua] {}", worker.eval_string(script).unwrap_or_else(|e| format!("ERR {e}")));
        }
        // PoB が実際に読んだ物 (要望 ⑲ の点検): メインのスキルと段・効いているサポート・読めなかったアイテムの行・敵の値
        if let Ok(s) = worker.eval_string(INSPECT.to_string()) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                row.insert("inspect".into(), v);
            } else {
                eprintln!("点検の読み取りに失敗: {s}");
            }
        }
        steps.push(serde_json::Value::Object(row));
    }
    let out = serde_json::json!({ "pob_version": pob_version(), "config": inp.config, "steps": steps });
    std::fs::write(out_path, serde_json::to_string_pretty(&out).unwrap()).expect("out.json を書けない");
    eprintln!("[stage_pob] {} 手を計算 -> {out_path}", inp.steps.len());
}
