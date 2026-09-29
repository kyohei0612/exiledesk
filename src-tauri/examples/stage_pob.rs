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
];

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
    let mut gems = format!("<Gem gemId=\"{}\" level=\"{}\" quality=\"0\" enabled=\"true\"/>", esc(gem_id), inp.gem_level.max(1));
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
        let row: serde_json::Map<String, serde_json::Value> =
            KEYS.iter().filter_map(|k| all.get(*k).map(|v| (k.to_string(), serde_json::json!(v)))).collect();
        steps.push(serde_json::Value::Object(row));
    }
    let out = serde_json::json!({ "pob_version": pob_version(), "config": inp.config, "steps": steps });
    std::fs::write(out_path, serde_json::to_string_pretty(&out).unwrap()).expect("out.json を書けない");
    eprintln!("[stage_pob] {} 手を計算 -> {out_path}", inp.steps.len());
}
