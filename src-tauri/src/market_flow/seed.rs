//! market_flow/seed.rs — 記録の書き出し / 取り込み (同梱データ) と出品者名の伏せ字
//!
//! market_flow.rs から分割 (2026-09-26)。
use super::*;

/// 出品者名を 4 文字目から伏せる ("KyoheiPoE" → "Kyo******")。
///
/// 同じ人は同じ文字列になるので、並べ直しの判定はそのまま効く。
/// 3 文字以下は全部伏せる (頭 3 文字だけだと元の名前がほぼ残ってしまうため)。
pub fn mask_account(name: &str) -> String {
    let chars: Vec<char> = name.chars().collect();
    if chars.len() <= 3 {
        return "*".repeat(chars.len());
    }
    let head: String = chars[..3].iter().collect();
    format!("{head}{}", "*".repeat(chars.len() - 3))
}

/// 記録をまるごと書き出す (オーナー指示 2026-09-20:「これ別に人に配るわけじゃないから
/// 俺のデータそのまま使って OK。出品者情報とかフルで渡してあげて、要約せずに」)。
///
/// 一括取得で測った記録を丸ごとリポジトリに置き、ビルドに同梱して自分のサブ機に配る。
/// **公開リリースにも入る**ので、他人に配る形に変える時は要約に切り替えること
/// (生の記録には出品者のアカウント名が入る)。
///
/// `path` は書き出し先のフルパス (例: リポジトリの src/data/flow-seed.json)。
/// 親フォルダが無ければ作る。返り値は (実際に書いたパス, バイト数)。
#[tauri::command]
pub fn market_flow_export_seed(app: tauri::AppHandle, path: String) -> Result<(String, usize), String> {
    let src = store_path(&app)?;
    let raw = std::fs::read_to_string(&src).map_err(|e| format!("記録を読めません ({}): {e}", src.display()))?;
    // 出品者のアカウント名は 4 文字目から伏せる (オーナー指示 2026-09-20:
    // 「アカウント名だけまずいなら 4 文字目以降から伏字でいいんじゃね」)。
    // リポジトリと GitHub のリリースは公開なので、他人の名前をそのまま置かないため。
    // 伏せても**同じ人は同じ文字列**になるので、「同じ出品者がすぐ並べ直した」の判定は効いたまま。
    let mut store: FlowStore = serde_json::from_str(&raw).map_err(|e| format!("記録を読めません: {e}"))?;
    for st in store.states.values_mut() {
        // **まだ並んでいる出品は配らない** (オーナー 2026-09-20「次からアプリ起動して
        // 一括取得や手動取得したらどうなる?」への対処)。
        // 追跡中の出品をそのまま渡すと、受け取った機体が次に回した時「一覧に無い = 売れた」と
        // 数えてしまい、消えた時刻がその機体の取得時刻になる。母機が測ってから時間が空くほど
        // 寿命が伸び、何でも「遅い」に寄る。**測り終わった分 (売れた / 打ち切った) だけ**配れば
        // 判定はそのまま引き継げて、並んでいる物は受け取った側が自分で追い直す。
        st.tracked.retain(|t| t.gone_at.is_some());
        for t in st.tracked.iter_mut() {
            t.account = t.account.as_deref().map(mask_account);
        }
    }
    // 監視リストは機体ごとの設定なので配らない
    store.watches.clear();
    let json = serde_json::to_string(&store).map_err(|e| format!("書き出せません: {e}"))?;
    let p = std::path::PathBuf::from(&path);
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("フォルダを作れません ({}): {e}", dir.display()))?;
    }
    let n = json.len();
    std::fs::write(&p, json).map_err(|e| format!("書き出せません ({}): {e}", p.display()))?;
    Ok((p.display().to_string(), n))
}

/// 同梱の記録を取り込む (サブ機の初期データ)。
///
/// **こちらに無い銘柄と、こちらより新しい銘柄だけ**入れる。サブ機で自分が測った分は消さない。
/// 監視リストは触らない (どのジェムを追うかはその機体の設定のまま)。
/// 返り値は入れた銘柄数。
#[tauri::command]
pub fn market_flow_import_seed(app: tauri::AppHandle, json: String) -> Result<usize, String> {
    let seed: FlowStore = serde_json::from_str(&json).map_err(|e| format!("同梱データを読めません: {e}"))?;
    let _guard = store_lock();
    let mut store = load_store(&app);
    let mut n = 0usize;
    for (key, mut st) in seed.states {
        // 念のためこちら側でも落とす (古い同梱データには追跡中の分が入っている)
        st.tracked.retain(|t| t.gone_at.is_some());
        let newer = store.states.get(&key).map(|cur| st.sampled_at > cur.sampled_at).unwrap_or(true);
        if newer {
            // こちらで追いかけている最中の出品は残す (配られた分は測り終わったデータだけ)
            if let Some(cur) = store.states.get(&key) {
                let alive: Vec<Tracked> = cur.tracked.iter().filter(|t| t.gone_at.is_none()).cloned().collect();
                st.tracked.extend(alive);
            }
            store.states.insert(key, st);
            n += 1;
        }
    }
    if n > 0 {
        save_store(&app, &store)?;
    }
    // 「この機体は配られた側」の印。書き出し (release-data.bat) がこれを見て、
    // 受け取った側から配り直してしまうのを止める (2026-09-20 オーナー
    // 「サブ PC でそれやったらそっちのデータはどうなんだ」)
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::write(
            dir.join("flow-seed-imported.json"),
            format!("{{\"imported_at\":{},\"states\":{}}}", now_secs(), n),
        );
    }
    Ok(n)
}

#[cfg(test)]
mod seed_tests {
    use super::mask_account;

    /// 出品者名は 4 文字目から伏せる。同じ人は同じ文字列になる (並べ直しの判定に要る)
    #[test]
    fn account_is_masked_from_the_fourth_character() {
        assert_eq!(mask_account("KyoheiPoE"), "Kyo******");
        assert_eq!(mask_account("abcd"), "abc*");
        assert_eq!(mask_account("abc"), "***", "3 文字以下は全部伏せる");
        assert_eq!(mask_account(""), "");
        assert_eq!(mask_account("あいうえお"), "あいう**", "日本語でも文字数で数える");
        assert_eq!(mask_account("Seller#1"), mask_account("Seller#1"), "同じ人は同じ文字列");
        assert_ne!(mask_account("SellerA"), mask_account("Bidder"), "別人は別の文字列");
    }
}
