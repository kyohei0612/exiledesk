//! ビルド (メインスキル) の決め方 (2026-09-29)
//!
//! オーナーの決め方 (2026-09-29「見るのは DPS の上位 10 人」):
//!   1. スキルを決める: DPS 上位 10 人の一番のスキルを DPS 順に拾う。3 つに満たなければ、拾ったスキルを外した
//!      (poe.ninja の `skills=!スキル`) DPS 上位 10 人から足す。10 人ともオイルなら、オイルを外すとまた次のスキルが出てくる
//!   2. ビルド = そのスキルで絞り、前のビルドのスキルを外した (`skills=スキル,!前のスキル`) DPS 上位 10 人
//!      (同じビルドの人が 2 度出ない)。一番のスキルがそれの人だけ数える (絞り込みは「使う人」なので混ざる)
//!   3. BUILD_MIN 人に届かないスキルは外し (drop)、1. からやり直して次のスキルを拾う
//! 書き方 (2026-09-29 Chrome で確認): 外す = `!` を前に。**API は条件ごとに `skills=` を並べる** (`&skills=Arc&skills=!Dark%20Consequences`、
//! かつ)。画面の URL の `,` 区切り (`skills=Arc,!Dark+Consequences`) を API に渡すと別の結果になる (アークの 1 位 PangDa が消えた)。
//! 決まりはここだけ (取得の順番は ascendancy_fetch.rs、TS は結果を読むだけ)。

use super::*;
use std::collections::HashSet;

/// ビルドの数
pub(crate) const BUILD_COUNT: usize = 3;
/// 1 ビルドの人数 (スキルを拾う「DPS 上位 N 人」の N も同じ)
pub(crate) const BUILD_SIZE: usize = 10;
/// これより少ないビルドは外して、次のスキルに譲る (2026-09-29 実機: ジェムリングの上位 10 人に 1 人だけ居た
/// ファイヤーボール / デトネートリビングは、絞った一覧を足しても 4 人 / 1 人だった)
pub(crate) const BUILD_MIN: usize = 5;

/// その人の DPS の付いたスキル (DPS の高い順、名前は重ねない。先頭 = 一番のスキル)。
/// 名前は poe.ninja の dps[].name **そのまま** (search の `skills=` で絞る・外す鍵なので、poe.ninja と同じ名前でないと外れない)。
/// 値は当たり (dps) と継続 (dotDps) の大きい方 (to_cached.rs)。名前の無い古いキャッシュはグループのジェム (メタジェム以外)。
/// 2026-09-29 実機: ① 当たりの dps だけ見ていて継続ダメージのコンテイジョン (dotDps 239,910) を 0 にしていた
/// ② 2.1B の人の名前「Dark Consequences」を Detonate Dead に言い換えたら `!Detonate Dead` で外れず、次の 10 人が変わらなかった
pub(crate) fn main_skills(c: &CachedCharacter, meta: &HashSet<String>) -> Vec<(String, f64)> {
    let mut v: Vec<(String, f64)> = c
        .skills
        .iter()
        .filter(|g| g.dps > 0.0)
        .filter_map(|g| {
            let name = g.dps_skill.clone().or_else(|| group_gem(g, meta))?;
            Some((name, g.dps))
        })
        .collect();
    v.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let mut seen = HashSet::new();
    v.retain(|(n, _)| seen.insert(n.clone()));
    v
}

/// グループのスキルジェムの名前 (トリガーのメタジェム以外)
fn group_gem(g: &CachedSkillGroup, meta: &HashSet<String>) -> Option<String> {
    g.mains.iter().map(|m| &m.name).find(|n| !meta.contains(*n)).or_else(|| g.mains.first().map(|m| &m.name)).cloned()
}

/// 画面に出す名前。poe.ninja の名前がグループのスキルジェムに無い時 (2.1B の「Dark Consequences」= Cast on Block + Detonate Dead)
/// はグループのジェムの名前 (Detonate Dead)。それ以外は poe.ninja の名前のまま
pub(crate) fn skill_label(c: &CachedCharacter, skill: &str, meta: &HashSet<String>) -> String {
    c.skills
        .iter()
        .find(|g| g.dps_skill.as_deref() == Some(skill))
        .filter(|g| !g.mains.iter().any(|m| m.name == skill))
        .and_then(|g| group_gem(g, meta))
        .unwrap_or_else(|| skill.to_string())
}

/// poe.ninja の search の `skills=` の条件 (絞るスキル + 外すスキル)。1 つずつ `&skills=` にする (search.rs)
pub(crate) fn skills_param(include: Option<&str>, exclude: &[String]) -> Vec<String> {
    include.map(str::to_string).into_iter().chain(exclude.iter().map(|s| format!("!{s}"))).collect()
}

/// どのスキルをビルドにするか (選んだ順 = DPS 順)
#[derive(Default, Debug)]
pub(crate) struct SkillPlan {
    pub chosen: Vec<String>,
    pub dropped: HashSet<String>,
}

impl SkillPlan {
    /// DPS 上位 10 人の一番のスキルを DPS 順に拾う (選んだ・外したスキルは拾わない)
    pub fn pick(&mut self, top_skill: &str) {
        if self.chosen.len() < BUILD_COUNT && !self.chosen.iter().any(|s| s == top_skill) && !self.dropped.contains(top_skill) {
            self.chosen.push(top_skill.to_string());
        }
    }
    /// 次の 10 人を探す時に外すスキル (選んだ物 + 外した物)
    pub fn excluded(&self) -> Vec<String> {
        let mut v = self.chosen.clone();
        let mut d: Vec<String> = self.dropped.iter().cloned().collect();
        d.sort();
        v.extend(d);
        v
    }
    /// k 番目のビルドの `skills=` (そのスキル + 前のビルドのスキルを外す)
    pub fn build_param(&self, k: usize) -> Vec<String> {
        skills_param(self.chosen.get(k).map(String::as_str), &self.chosen[..k.min(self.chosen.len())])
    }
    /// 人が足りないスキルを外す (後ろのビルドは組み直し)
    pub fn drop_skill(&mut self, skill: &str) {
        self.chosen.retain(|s| s != skill);
        self.dropped.insert(skill.to_string());
    }
    pub fn full(&self) -> bool {
        self.chosen.len() >= BUILD_COUNT
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ch(groups: &[(&[&str], f64, Option<&str>)]) -> CachedCharacter {
        CachedCharacter {
            account: "a".into(),
            name: "n".into(),
            rare_items: vec![],
            unique_items: vec![],
            fetched_at: 0,
            skills: groups
                .iter()
                .map(|(mains, dps, named)| CachedSkillGroup {
                    mains: mains.iter().map(|n| CachedGem { name: n.to_string(), level: None, quality: None }).collect(),
                    supports: vec![],
                    dps: *dps,
                    dps_skill: named.map(str::to_string),
                })
                .collect(),
        }
    }

    #[test]
    fn main_skills_use_the_named_dps_and_dot() {
        let meta: HashSet<String> = ["Cast on Block".to_string()].into_iter().collect();
        let old = ch(&[(&["Herald of Blood"], 59.0, None), (&["Cast on Block", "Detonate Dead"], 2147483647.0, None)]);
        assert_eq!(main_skills(&old, &meta)[0].0, "Detonate Dead");
        let dot = ch(&[(&["Essence Drain"], 647378.0, Some("Essence Drain")), (&["Contagion"], 239910.0, Some("Contagion")), (&["Arc"], 0.0, None)]);
        let names: Vec<String> = main_skills(&dot, &meta).into_iter().map(|x| x.0).collect();
        assert_eq!(names, vec!["Essence Drain", "Contagion"]);
        // 鍵は poe.ninja の名前のまま (外す時に効くように)、画面の名前はグループのジェム
        let dc = ch(&[(&["Cast on Block", "Detonate Dead"], 2147483647.0, Some("Dark Consequences"))]);
        assert_eq!(main_skills(&dc, &meta)[0].0, "Dark Consequences");
        assert_eq!(skill_label(&dc, "Dark Consequences", &meta), "Detonate Dead");
        assert_eq!(skill_label(&dot, "Contagion", &meta), "Contagion");
    }

    #[test]
    fn skills_param_matches_the_poe_ninja_page() {
        assert!(skills_param(None, &[]).is_empty());
        assert_eq!(skills_param(None, &["Oil Grenade".into()]), vec!["!Oil Grenade"]);
        assert_eq!(skills_param(Some("Comet"), &["Detonate Dead".into(), "Arc".into()]), vec!["Comet", "!Detonate Dead", "!Arc"]);
    }

    #[test]
    fn plan_picks_three_skills_in_dps_order_and_drops_weak_ones() {
        let mut p = SkillPlan::default();
        for s in ["DD", "DD", "Fireball", "DD", "Living Bomb", "Arc"] {
            p.pick(s);
        }
        assert_eq!(p.chosen, vec!["DD", "Fireball", "Living Bomb"], "Arc は 4 つ目");
        assert_eq!(p.build_param(0), vec!["DD"]);
        assert_eq!(p.build_param(2), vec!["Living Bomb", "!DD", "!Fireball"]);
        p.drop_skill("Fireball");
        assert!(!p.full());
        assert_eq!(p.excluded(), vec!["DD", "Living Bomb", "Fireball"], "外したスキルも次の 10 人から外す");
        p.pick("Fireball");
        p.pick("Arc");
        assert_eq!(p.chosen, vec!["DD", "Living Bomb", "Arc"]);
    }
}
