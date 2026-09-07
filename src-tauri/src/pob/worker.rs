//! PobWorker: mpsc job queue と LuaJIT を閉じ込めた worker thread
//!
//! __tmp_src.rs (812 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ---------------------------------------------------------------------------
// Worker thread
// ---------------------------------------------------------------------------

pub(crate) type Reply<T> = mpsc::Sender<Result<T, String>>;

pub enum PobJob {
    LoadBuildXml { xml: String, reply: Reply<()> },
    GetStat { key: String, reply: Reply<f64> },
    GetStatsAll { reply: Reply<HashMap<String, f64>> },
    SetItemInSlot { slot: Option<String>, raw: String, reply: Reply<String> },
    ClearSlot { slot: String, reply: Reply<()> },
    Snapshot { reply: Reply<String> },
    RestoreSnapshot { xml: String, reply: Reply<()> },
    GetEquippedItems { reply: Reply<Vec<EquippedItemInfo>> },
    GetSkillGroups { reply: Reply<Vec<SkillGroupInfo>> },
    SetMainSocketGroup { index: u32, reply: Reply<()> },
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EquippedItemInfo {
    pub slot_name: String,
    pub has_item: bool,
    pub base_name: String,
    pub title: String,
    pub rarity: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SkillGroupInfo {
    pub index: u32,            // 1-based、PoB の build.mainSocketGroup と同じ
    pub label: String,         // socketGroup.label or "Group N"
    pub main_skill_name: String, // 最初の有効な gem の name
    pub gem_count: u32,
    pub is_main: bool,         // build.mainSocketGroup == index か
}

pub struct PobWorker {
    tx: mpsc::Sender<PobJob>,
}

impl PobWorker {
    pub fn spawn(pob_src: PathBuf) -> Self {
        let (tx, rx) = mpsc::channel::<PobJob>();
        thread::Builder::new()
            .name("pob-worker".into())
            .spawn(move || worker_loop(pob_src, rx))
            .expect("spawn pob worker thread");
        Self { tx }
    }

    pub fn load_build_xml(&self, xml: String) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::LoadBuildXml { xml, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn get_stat(&self, key: String) -> Result<f64, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::GetStat { key, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn get_stats_all(&self) -> Result<HashMap<String, f64>, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::GetStatsAll { reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    /// 装備テキストを slot にセット。slot=None なら item:GetPrimarySlot() で自動推定。
    /// 戻り値は実際にセットされた slot 名（"Helmet" 等）。
    pub fn set_item_in_slot(
        &self,
        slot: Option<String>,
        raw: String,
    ) -> Result<String, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::SetItemInSlot { slot, raw, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn clear_slot(&self, slot: String) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::ClearSlot { slot, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    /// build を XML で snapshot。装備差替え前に呼んで、後で restore できるように。
    pub fn snapshot(&self) -> Result<String, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::Snapshot { reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn restore_snapshot(&self, xml: String) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::RestoreSnapshot { xml, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    /// 現在 build の各 slot に何が装備されているかを取得。
    /// 空 slot も has_item=false で返す。Vue 側で slot プルダウン構築用。
    pub fn get_equipped_items(&self) -> Result<Vec<EquippedItemInfo>, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::GetEquippedItems { reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn get_skill_groups(&self) -> Result<Vec<SkillGroupInfo>, String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::GetSkillGroups { reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }

    pub fn set_main_socket_group(&self, index: u32) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.tx
            .send(PobJob::SetMainSocketGroup { index, reply: tx })
            .map_err(|_| "pob worker disconnected".to_string())?;
        rx.recv()
            .map_err(|_| "pob worker reply lost".to_string())?
    }
}

pub(crate) fn worker_loop(pob_src: PathBuf, rx: mpsc::Receiver<PobJob>) {
    let lua = match boot_pob(&pob_src) {
        Ok(lua) => lua,
        Err(e) => {
            // 起動失敗。以降の job はすべて失敗で返す。
            eprintln!("[pob worker] boot_pob failed: {:#}", e);
            for job in rx {
                let msg = format!("PoB boot failed: {:#}", e);
                match job {
                    PobJob::LoadBuildXml { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::GetStat { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::GetStatsAll { reply } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::SetItemInSlot { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::ClearSlot { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::Snapshot { reply } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::RestoreSnapshot { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::GetEquippedItems { reply } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::GetSkillGroups { reply } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                    PobJob::SetMainSocketGroup { reply, .. } => {
                        let _ = reply.send(Err(msg.clone()));
                    }
                }
            }
            return;
        }
    };

    for job in rx {
        match job {
            PobJob::LoadBuildXml { xml, reply } => {
                let r = call_load_build_xml(&lua, &xml).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::GetStat { key, reply } => {
                let r = call_get_stat(&lua, &key).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::GetStatsAll { reply } => {
                let r = call_get_stats_all(&lua).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::SetItemInSlot { slot, raw, reply } => {
                let r =
                    call_set_item_in_slot(&lua, slot.as_deref(), &raw).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::ClearSlot { slot, reply } => {
                let r = call_clear_slot(&lua, &slot).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::Snapshot { reply } => {
                let r = call_snapshot(&lua).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::RestoreSnapshot { xml, reply } => {
                let r = call_load_build_xml(&lua, &xml).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::GetEquippedItems { reply } => {
                let r = call_get_equipped_items(&lua).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::GetSkillGroups { reply } => {
                let r = call_get_skill_groups(&lua).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
            PobJob::SetMainSocketGroup { index, reply } => {
                let r = call_set_main_socket_group(&lua, index).map_err(|e| e.to_string());
                let _ = reply.send(r);
            }
        }
    }
}
