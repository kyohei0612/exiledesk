# 同梱データ (自動ジェム監視まわり)

オーナー指示 2026-09-18:「サブ PC でしか使わないから、自動ジェム周りのデータだけ内蔵してビルドに食い込んで」。

ここに置いた JSON はインストーラに同梱され、**その PC にまだ同じ名前のファイルが無い時だけ**
`app_data_dir` にコピーされる (`src-tauri/src/seed_data.rs`)。既にある物は上書きしない。

| ファイル | 中身 | 無い時の困りごと |
| --- | --- | --- |
| `market_flow.json` | 捌き速度の記録 (追跡中の出品 ID・売れた記録・日次集計) | 判定が出るまで数日かかる |
| `gem_break_result.json` | 使用率ランキングの集計結果 (どのジェムを監視するかの元) | poe.ninja に 100 リクエスト必要 (レート制限で 10 分〜1 時間) |

## 更新のしかた

母艦で貯めた物をそのままコピーするだけ。

```bash
cp "$APPDATA/com.kyohei.exiledesk/market_flow.json" src-tauri/seed/market_flow.json
cp "$APPDATA/com.kyohei.exiledesk/gem_break_result.json" src-tauri/seed/gem_break_result.json
```

`gem_break_result.json` は使用率ランキングを 1 回取得すると書かれる (v0.1.167 以降)。
