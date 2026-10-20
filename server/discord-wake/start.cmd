@echo off
rem Entry for Task Scheduler (see README.md)
cd /d "%~dp0"
node --env-file-if-exists=.env wake.mjs
