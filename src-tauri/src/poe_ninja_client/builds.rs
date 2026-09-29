//! ビルド (メインスキル) の決め方と、DPS 順のキャラからの組み分け (2026-09-29)
//!
//! オーナー「アセンダンシーを DPS 順に並べて上位 10 人 → そのスキルを外してまた DPS 順 → 次のスキルの上位 10 人。
//! これを 3 回、30 人で上位 MOD 一覧に」。poe.ninja の画面で「スキルを外す」をするのと同じ結果を、
//! DPS 順の一覧 (search) とスキルで絞った search で作る。組み分けの決まりはここだけ (TS は結果を読むだけ)。

use super::*;
use std::collections::HashSet;

/// ビルドの数 (DPS 上位のスキルを 3 つ)
pub(crate) const BUILD_COUNT: usize = 3;
/// 1 ビルドの人数
pub(crate) const BUILD_SIZE: usize = 10;

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

/// 組み分けの途中経過。キャラは DPS 順に offer する
#[derive(Default, Debug)]
pub(crate) struct BuildPicker {
    pub builds: Vec<CachedBuild>,
}

impl BuildPicker {
    /// 1 人足す。新しいスキルは BUILD_COUNT 個まで、各ビルド BUILD_SIZE 人まで。足せたら true
    pub fn offer(&mut self, key: &str, skill: &str, dps: f64) -> bool {
        if self.builds.iter().any(|b| b.members.iter().any(|m| m == key)) {
            return false;
        }
        if let Some(b) = self.builds.iter_mut().find(|b| b.skill == skill) {
            if b.members.len() >= BUILD_SIZE {
                return false;
            }
            b.members.push(key.to_string());
            return true;
        }
        if self.builds.len() >= BUILD_COUNT {
            return false;
        }
        self.builds.push(CachedBuild { skill: skill.to_string(), members: vec![key.to_string()], top_dps: dps });
        true
    }
    /// スキルが 3 つ見つかった
    pub fn skills_found(&self) -> bool {
        self.builds.len() >= BUILD_COUNT
    }
    /// 全部のビルドが 10 人
    pub fn full(&self) -> bool {
        self.skills_found() && self.builds.iter().all(|b| b.members.len() >= BUILD_SIZE)
    }
    /// まだ人が足りないビルドのスキル (DPS 順)
    pub fn short_skills(&self) -> Vec<String> {
        self.builds.iter().filter(|b| b.members.len() < BUILD_SIZE).map(|b| b.skill.clone()).collect()
    }
    pub fn is_short(&self, skill: &str) -> bool {
        self.builds.iter().any(|b| b.skill == skill && b.members.len() < BUILD_SIZE)
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

    #[test]
    fn main_skill_takes_the_highest_dps_and_skips_meta_gems() {
        let meta: HashSet<String> = ["Cast on Block".to_string()].into_iter().collect();
        let c = ch(&[(&["Herald of Blood"], 59.0), (&["Cast on Block", "Detonate Dead"], 2147483647.0), (&["Raise Shield"], 1917.0)]);
        assert_eq!(main_skill(&c, &meta).map(|x| x.0), Some("Detonate Dead".to_string()));
        assert_eq!(main_skill(&ch(&[(&["Arc"], 0.0)]), &meta), None);
    }

    #[test]
    fn picker_makes_three_builds_of_ten_in_dps_order() {
        let mut p = BuildPicker::default();
        // A が 12 人、B が 1 人、C が 1 人、D は 4 つ目なので入らない
        for i in 0..12 {
            p.offer(&format!("a{i}"), "A", 100.0 - i as f64);
        }
        assert!(p.offer("b0", "B", 50.0));
        assert!(p.offer("c0", "C", 40.0));
        assert!(!p.offer("d0", "D", 30.0));
        assert_eq!(p.builds.iter().map(|b| (b.skill.as_str(), b.members.len())).collect::<Vec<_>>(), vec![("A", 10), ("B", 1), ("C", 1)]);
        assert_eq!(p.builds[0].top_dps, 100.0);
        assert!(p.skills_found() && !p.full());
        assert_eq!(p.short_skills(), vec!["B".to_string(), "C".to_string()]);
        assert!(!p.offer("a0", "A", 1.0), "同じ人は 2 回入らない");
    }
}
