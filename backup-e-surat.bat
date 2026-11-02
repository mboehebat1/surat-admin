@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
rem =====================================================================
rem  E-SURAT - Backup otomatis
rem  Jadwalkan lewat Task Scheduler:
rem    Program/script : C:\path\ke\proyek\backup-e-surat.bat
rem    Trigger        : harian, mis. 23:30
rem  Hasil backup     : folder backups\ + log backups\backup.log
rem  Retensi          : 30 hari
rem =====================================================================
cd /d "%~dp0"

set "DB_HOST=127.0.0.1"
set "DB_PORT=5432"
set "DB_NAME=app_db"
set "DB_USER=postgres"
set "DB_PASSWORD=postgres"
set "BACKUP_DIR=%~dp0backups"
set "STORAGE_DIR=%~dp0storage"
set "RETENSI_HARI=30"

if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="DATABASE_URL" set "DATABASE_URL=%%b"
  )
)
if not defined DATABASE_URL set "DATABASE_URL=postgresql://%DB_USER%:%DB_PASSWORD%@%DB_HOST%:%DB_PORT%/%DB_NAME%"
set "PGPASSWORD=%DB_PASSWORD%"

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
set "LOG=%BACKUP_DIR%\backup.log"

for /f "delims=" %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%t"
for /f "delims=" %%d in ('powershell -NoProfile -Command "Get-Date -Format 'dd MMMM yyyy HH:mm:ss'"') do set "TGL=%%d"

>>"%LOG%" echo ======================================================
>>"%LOG%" echo [!TGL!] Backup E-SURAT dimulai
>>"%LOG%" echo   Sumber : %DATABASE_URL%

where pg_dump >nul 2>nul
if errorlevel 1 (
  >>"%LOG%" echo   [GAGAL] pg_dump tidak ditemukan di PATH.
  goto :DOKUMEN
)
pg_dump "%DATABASE_URL%" -F c -f "%BACKUP_DIR%\esurat_db_!TS!.dump" 2>>"%LOG%"
if errorlevel 1 (
  >>"%LOG%" echo   [GAGAL] Backup basis data gagal.
) else (
  for %%F in ("%BACKUP_DIR%\esurat_db_!TS!.dump") do >>"%LOG%" echo   [OK] Basis data : esurat_db_!TS!.dump - %%~zF byte
)

:DOKUMEN
if exist "%STORAGE_DIR%" (
  powershell -NoProfile -Command "Compress-Archive -Path '%STORAGE_DIR%\*' -DestinationPath '%BACKUP_DIR%\esurat_storage_!TS!.zip' -Force" >>"%LOG%" 2>&1
  if exist "%BACKUP_DIR%\esurat_storage_!TS!.zip" (
    for %%F in ("%BACKUP_DIR%\esurat_storage_!TS!.zip") do >>"%LOG%" echo   [OK] Dokumen    : esurat_storage_!TS!.zip - %%~zF byte
  ) else (
    >>"%LOG%" echo   [PERINGATAN] Arsip dokumen gagal dibuat.
  )
) else (
  >>"%LOG%" echo   [INFO] Folder storage tidak ditemukan, dilewati.
)

rem ---- hapus backup lebih tua dari retensi ------------------------------
powershell -NoProfile -Command "$batas=(Get-Date).AddDays(-%RETENSI_HARI%); Get-ChildItem -Path '%BACKUP_DIR%' -File -Include 'esurat_db_*.dump','esurat_storage_*.zip' -Recurse | Where-Object { $_.LastWriteTime -lt $batas } | ForEach-Object { Remove-Item $_.FullName -Force; Write-Output ('   [RETENSI] dihapus: ' + $_.Name) }" >>"%LOG%" 2>&1

>>"%LOG%" echo [!TGL!] Backup selesai
>>"%LOG%" echo ======================================================
endlocal
exit /b 0
