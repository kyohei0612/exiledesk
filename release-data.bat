@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ============================================================
rem  ExileDesk release-data.bat  (2026-09-20)
rem  ------------------------------------------------------------
rem  「測った捌き速度を配る」を 1 コマンドで (オーナー指示 2026-09-20)。
rem
rem    1. %APPDATA%\com.kyohei.exiledesk\market_flow.json を
rem       src\data\flow-seed.json に書き出す (出品者名は 4 文字目から伏字)
rem    2. 変わっていれば release.bat (版を上げて commit + tag + push)
rem    3. CI がビルド → サブ機が起動時に自動で入れて取り込む
rem
rem  Usage:
rem    release-data.bat          -> patch bump (X.Y.Z+1)
rem    release-data.bat minor    -> minor bump
rem ============================================================

echo.
echo ============================================================
echo  [1/2] 記録を書き出しています...
echo ============================================================
node scripts\export-flow-seed.mjs
if errorlevel 1 (
    echo ERROR: 書き出しに失敗しました
    pause
    exit /b 1
)

rem 配るものがあるか (データも含めて何も変わっていないなら止める)
for /f "delims=" %%S in ('git status --porcelain') do set "DIRTY=1"
if not defined DIRTY (
    echo.
    echo 配るものがありません。記録も前回から変わっていないので、ここで終わります。
    echo 一括取得を回してからもう一度どうぞ。
    pause
    exit /b 0
)

echo.
echo ============================================================
echo  [2/2] リリースします...
echo ============================================================
call release.bat %1
