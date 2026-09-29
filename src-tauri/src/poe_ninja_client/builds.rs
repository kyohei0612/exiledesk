//! ビルド (メインスキル) の決め方と、DPS 順のキャラからの組み分け (2026-09-29)
//!
//! オーナーの決め方 (2026-09-29):
//!   1. スキルを決める: DPS 上位 10 人のメインスキルを DPS 順に拾う。3 つに満たなければ、拾ったスキルの人を外した
//!      次の DPS 上位 10 人から足す (10 人ともオイルなら、オイルを外すとまた次のスキルが出てくる)。これを 3 つになるまで
//!   2. ビルド = そのスキルだけで DPS 順に並べた上位 10 人。3 ビルドで合計 30 人
//!   3. 探しても BUILD_MIN 人に届かないスキルは外し (drop)、1. をやり直して次のスキルを拾う
//! キャラは DPS 順に offer する (search の一覧)。一覧で足りないスキルは、スキルで絞った一覧から add_extra する。
//! 組み分けの決まりはここだけ (TS は結果を読むだけ)。

use super::*;
use std::collections::HashSet;

/// ビルドの数
pub(crate) const BUILD_COUNT: usize = 3;
/// 1 ビルドの人数 (スキルを拾う「DPS 上位 N 人」の N も同じ)
pub(crate) const BUILD_SIZE: usize = 10;
/// これより少ないビルドは外して、次のスキルに譲る (2026-09-29 実機: ジェムリングの上位 10 人に 1 人だけ居た
/// ファイヤーボール / デトネートリビングは、絞った一覧を足しても 4 人 / 1 人だった)
pub(crate) const BUILD_MIN: usize = 5;

/// メインスキル = DPS が一番大きいスキルグループのスキル。
/// トリガーのメタジェム (Cast on Block / Spellslinger / Spell Totem …、meta に入っている名前) は中のスキルを採る
/// (キャッシュの実物: Cast on Block + Detonate Dead のグループが DPS 2147483647 で一番上に来る)。
pub(crate) fn main_skill(c: &CachedCharacter, meta: &HashSet<String>) -> Option<(String, f64)> {
    let best = c
        .skills
        .iter()
        .filter(|g| g.dps > 0.0)
        .max_by(|a, b| a.dps.partial_cmp(&b.dps).unwrap_or(std::cmp::Ordering::Equal))?;
    let name = best
        .mains
        .iter()
        .map(|g| &g.name)
        .find(|n| !meta.contains(*n))
        .or_else(|| best.mains.first().map(|g| &g.name))?;
    Some((name.clone(), best.dps))
}

#[derive(Debug, Clone)]
struct Seen {
    key: String,
    skill: String,
    dps: f64,
}

/// 組み分けの途中経過
#[derive(Default, Debug)]
pub(crate) struct BuildPicker {
    /// DPS 順の一覧で見た人 (見た順 = DPS 順)
    seen: Vec<Seen>,
    /// スキルで絞った一覧で見た人 (スキルごとに DPS 順)
    extra: Vec<Seen>,
    /// 人が足りなくて外したスキル (スキル選びで居ない人として扱う)
    dropped: HashSet<String>,
}

impl BuildPicker {
    /// DPS 順の一覧の次の 1 人
    pub fn offer(&mut self, key: &str, skill: &str, dps: f64) {
        if !self.seen.iter().any(|s| s.key == key) {
            self.seen.push(Seen { key: key.to_string(), skill: skill.to_string(), dps });
        }
    }
    /// スキルで絞った一覧の 1 人 (そのスキルのビルドの補充)
    pub fn add_extra(&mut self, key: &str, skill: &str, dps: f64) {
        if !self.seen.iter().chain(&self.extra).any(|s| s.key == key) {
            self.extra.push(Seen { key: key.to_string(), skill: skill.to_string(), dps });
        }
    }
    /// 決まったスキル (最大 3 つ、DPS 順)
    pub fn skills(&self) -> Vec<String> {
        let mut chosen: Vec<String> = Vec::new();
        let mut i = 0;
        while chosen.len() < BUILD_COUNT && i < self.seen.len() {
            // 1 回分 = 今までに拾ったスキルの人を外した、次の DPS 上位 10 人
            let excluded = chosen.clone();
            let mut n = 0;
            while i < self.seen.len() && n < BUILD_SIZE && chosen.len() < BUILD_COUNT {
                let s = &self.seen[i].skill;
                i += 1;
                if excluded.contains(s) || self.dropped.contains(s) {
                    continue;
                }
                n += 1;
                if !chosen.contains(s) {
                    chosen.push(s.clone());
                }
            }
        }
        chosen
    }
    /// ビルド (スキルごとの DPS 上位 10 人)
    pub fn builds(&self) -> Vec<CachedBuild> {
        self.skills()
            .into_iter()
            .map(|skill| {
                let members: Vec<&Seen> = self.seen.iter().chain(&self.extra).filter(|s| s.skill == skill).take(BUILD_SIZE).collect();
                CachedBuild {
                    top_dps: members.first().map(|m| m.dps).unwrap_or(0.0),
                    members: members.iter().map(|m| m.key.clone()).collect(),
                    member_skills: members.iter().map(|m| m.skill.clone()).collect(),
                    skill,
                }
            })
            .collect()
    }
    /// 探しても人が足りなかったスキルを外す (次のスキルを拾い直す)
    pub fn drop_skill(&mut self, skill: &str) {
        self.dropped.insert(skill.to_string());
    }
    /// BUILD_MIN 人に届かないビルドのスキル
    pub fn weak_skills(&self) -> Vec<String> {
        self.builds().into_iter().filter(|b| b.members.len() < BUILD_MIN).map(|b| b.skill).collect()
    }
    /// 人が足りないビルドのスキル
    pub fn short_skills(&self) -> Vec<String> {
        self.builds().into_iter().filter(|b| b.members.len() < BUILD_SIZE).map(|b| b.skill).collect()
    }
    /// スキルが 3 つ決まって、どれも 10 人
    pub fn full(&self) -> bool {
        let b = self.builds();
        b.len() >= BUILD_COUNT && b.iter().all(|x| x.members.len() >= BUILD_SIZE)
    }
    /// そのスキルのビルドがまだ足りない
    pub fn is_short(&self, skill: &str) -> bool {
        self.short_skills().iter().any(|s| s == skill)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ch(skills: &[(&[&str], f64)]) -> CachedCharacter {
        CachedCharacter {
            account: "a".into(),
            name: "n".into(),
            rare_items: vec![],
            unique_items: vec![],
            fetched_at: 0,
            skills: skills
                .iter()
                .map(|(mains, dps)| CachedSkillGroup {
                    mains: mains.iter().map(|n| CachedGem { name: n.to_string(), level: None, quality: None }).collect(),
                    supports: vec![],
                    dps: *dps,
                })
                .collect(),
        }
    }
    fn feed(order: &[&str]) -> BuildPicker {
        let mut p = BuildPicker::default();
        for (i, s) in order.iter().enumerate() {
            p.offer(&format!("k{i}"), s, 1000.0 - i as f64);
        }
        p
    }
    fn shape(p: &BuildPicker) -> Vec<(String, usize)> {
        p.builds().into_iter().map(|b| (b.skill, b.members.len())).collect()
    }

    #[test]
    fn main_skill_takes_the_highest_dps_and_skips_meta_gems() {
        let meta: HashSet<String> = ["Cast on Block".to_string()].into_iter().collect();
        let c = ch(&[(&["Herald of Blood"], 59.0), (&["Cast on Block", "Detonate Dead"], 2147483647.0), (&["Raise Shield"], 1917.0)]);
        assert_eq!(main_skill(&c, &meta).map(|x| x.0), Some("Detonate Dead".to_string()));
        assert_eq!(main_skill(&ch(&[(&["Arc"], 0.0)]), &meta), None);
    }

    #[test]
    fn several_skills_in_the_top_ten_become_the_builds() {
        // 上位 10 人にオイル・スパーク・フリッカーが居る → その 3 つ、それぞれのスキルだけの DPS 上位 10 人
        let mut order = vec!["Oil", "Spark", "Oil", "Flicker", "Oil", "Arc", "Oil", "Oil", "Spark", "Oil"];
        for _ in 0..12 {
            order.extend(["Oil", "Spark", "Flicker"]);
        }
        let p = feed(&order);
        assert_eq!(p.skills(), vec!["Oil", "Spark", "Flicker"], "Arc は 4 つ目なので入らない");
        assert_eq!(shape(&p), vec![("Oil".into(), 10), ("Spark".into(), 10), ("Flicker".into(), 10)]);
        assert!(p.builds().iter().all(|b| b.member_skills.iter().all(|s| *s == b.skill)), "ビルドは 1 つのスキルだけ");
        assert!(p.full());
    }

    #[test]
    fn a_single_skill_top_ten_is_excluded_to_find_the_next_skill() {
        // 上位 10 人ともオイル → オイルを外した次の 10 人の先頭はスパーク … 最後にフリッカー
        let mut order = vec!["Oil"; 14];
        order.extend(["Spark"; 12]);
        order.extend(["Oil", "Flicker", "Spark"]);
        let p = feed(&order);
        assert_eq!(p.skills(), vec!["Oil", "Spark", "Flicker"]);
        assert_eq!(shape(&p), vec![("Oil".into(), 10), ("Spark".into(), 10), ("Flicker".into(), 1)]);
        assert_eq!(p.short_skills(), vec!["Flicker".to_string()]);
        // スキルで絞った一覧から補充 (同じ人は 2 回入らない)
        let mut p = p;
        p.add_extra("k27", "Flicker", 1.0);
        for i in 0..12 {
            p.add_extra(&format!("f{i}"), "Flicker", 500.0 - i as f64);
        }
        assert_eq!(shape(&p)[2], ("Flicker".into(), 10));
        assert_eq!(p.builds()[2].members[0], "k27");
        assert!(p.full());
    }

    #[test]
    fn a_skill_with_too_few_players_is_dropped_for_the_next_one() {
        // 上位 10 人に 1 人だけのファイヤーボール → 探しても 1 人なので外し、次の DPS 上位からスキルを拾い直す
        let mut order = vec!["DD", "DD", "Fireball", "DD", "DD", "DD", "DD", "DD", "DD", "DD"];
        order.extend(["DD"; 5]);
        order.extend(["Contagion"; 10]);
        order.extend(["Arc"; 10]);
        let mut p = feed(&order);
        assert_eq!(p.skills(), vec!["DD", "Fireball", "Contagion"]);
        assert_eq!(p.weak_skills(), vec!["Fireball".to_string()]);
        p.drop_skill("Fireball");
        assert_eq!(shape(&p), vec![("DD".into(), 10), ("Contagion".into(), 10), ("Arc".into(), 10)]);
        assert!(p.full());
    }
}
