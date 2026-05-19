@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

rem ============================================================
rem  ExileDesk release.bat
rem  ------------------------------------------------------------
rem  Usage:
rem    release.bat              -> patch bump (X.Y.Z+1)
rem    release.bat minor        -> minor bump
rem    release.bat major        -> major bump
rem    release.bat 1.2.3        -> 直接バージョン指定
rem
rem  Flow:
rem    1. (optional) pnpm tauri 上流データ refresh
rem    2. scripts/bump-version.mjs で tauri.conf / Cargo.toml / package.json 同期
rem    3. git add -A && commit && push
rem    4. git tag vX.Y.Z && push --tags
rem    5. GitHub Actions が tag を拾って Windows build → Release upload
rem ============================================================

rem ---- pnpm 存在確認 ----
where pnpm >nul 2>&1
if errorlevel 1 (
    echo ERROR: pnpm not found on PATH.
    pause
    exit /b 1
)

rem ---- bump mode ----
set "MODE=patch"
if not "%~1"=="" set "MODE=%~1"

echo.
echo ============================================================
echo  [1/4] Bumping version (mode: %MODE%)...
echo ============================================================
for /f "delims=" %%V in ('node scripts/bump-version.mjs %MODE%') do set "NEW_VERSION=%%V"
if "%NEW_VERSION%"=="" (
    echo ERROR: bump-version.mjs failed
    pause
    exit /b 1
)
echo   -> new version: v%NEW_VERSION%

echo.
echo ============================================================
echo  [2/4] git commit + push (main)
echo ============================================================
git add -A
git commit -m "chore(release): v%NEW_VERSION%"
if errorlevel 1 (
    echo ERROR: git commit failed
    pause
    exit /b 1
)
git push origin main
if errorlevel 1 (
    echo ERROR: git push origin main failed
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  [3/4] git tag v%NEW_VERSION% + push --tags
echo ============================================================
git tag "v%NEW_VERSION%"
if errorlevel 1 (
    echo ERROR: git tag failed
    pause
    exit /b 1
)
git push origin "v%NEW_VERSION%"
if errorlevel 1 (
    echo ERROR: git push tag failed
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  [4/4] DONE -- watch GitHub Actions:
echo    https://github.com/kyohei0612/exiledesk/actions
echo ============================================================
echo.
echo CI builds Windows installer, signs with minisign, uploads to:
echo   https://github.com/kyohei0612/exiledesk/releases/tag/v%NEW_VERSION%
echo.
endlocal
