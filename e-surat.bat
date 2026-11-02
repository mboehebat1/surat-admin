@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title E-SURAT - Sistem Informasi Manajemen Persuratan Digital
cd /d "%~dp0"

rem =====================================================================
rem  E-SURAT - Launcher Windows
rem  Konfigurasi basis data default. Ubah bila instalasi Anda berbeda.
rem =====================================================================
set "DB_HOST=127.0.0.1"
set "DB_PORT=5432"
set "DB_NAME=app_db"
set "DB_USER=postgres"
set "DB_PASSWORD=postgres"
set "APP_PORT=3000"
set "BACKUP_DIR=%~dp0backups"
set "STORAGE_DIR=%~dp0storage"

rem ---- baca DATABASE_URL dari .env bila sudah ada ----------------------
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="DATABASE_URL" set "DATABASE_URL=%%b"
  )
)
if not defined DATABASE_URL set "DATABASE_URL=postgresql://%DB_USER%:%DB_PASSWORD%@%DB_HOST%:%DB_PORT%/%DB_NAME%"
set "PGPASSWORD=%DB_PASSWORD%"

:MENU
cls
echo ======================================================================
echo   E-SURAT - Sistem Informasi Manajemen Persuratan Digital
echo ======================================================================
echo   Basis data : %DATABASE_URL%
echo   Port app   : %APP_PORT%
echo ----------------------------------------------------------------------
echo    1. Periksa lingkungan - Node, npm, PostgreSQL
echo    2. Buat file .env - bila belum ada
echo    3. Instal dependensi - npm install
echo    4. Siapkan basis data - drizzle-kit push
echo    5. Jalankan mode pengembangan - next dev
echo    6. Build produksi - next build
echo    7. Jalankan server produksi - next start
echo    8. Build lalu jalankan server produksi
echo    9. Reset basis data - HAPUS SEMUA DATA
echo   10. Backup basis data dan dokumen
echo   11. Restore basis data dari file backup
echo   12. Buka aplikasi di browser
echo    0. Keluar
echo ======================================================================
set "PILIH="
set /p "PILIH=Pilih menu [0-12]: "

if "%PILIH%"=="1"  call :CEK_ENV
if "%PILIH%"=="2"  call :BUAT_ENV
if "%PILIH%"=="3"  call :INSTALL
if "%PILIH%"=="4"  call :DB_PUSH
if "%PILIH%"=="5"  call :DEV
if "%PILIH%"=="6"  call :BUILD
if "%PILIH%"=="7"  call :START
if "%PILIH%"=="8"  call :BUILD_START
if "%PILIH%"=="9"  call :DB_RESET
if "%PILIH%"=="10" call :BACKUP
if "%PILIH%"=="11" call :RESTORE
if "%PILIH%"=="12" call :BUKA_BROWSER
if "%PILIH%"=="0"  goto :SELESAI
goto :MENU

rem =====================================================================
rem                              SUBRUTIN
rem =====================================================================

:CEK_ENV
echo.
echo ---- Memeriksa lingkungan kerja --------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo [GAGAL] Node.js tidak ditemukan. Instal dari https://nodejs.org
) else (
  for /f "delims=" %%v in ('node -v') do echo [OK] Node.js %%v
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [GAGAL] npm tidak ditemukan.
) else (
  for /f "delims=" %%v in ('npm -v') do echo [OK] npm %%v
)
where psql >nul 2>nul
if errorlevel 1 (
  echo [PERINGATAN] psql tidak ada di PATH. Fitur backup/restore manual tidak
  echo              tersedia, namun aplikasi tetap dapat berjalan selama
  echo              server PostgreSQL aktif.
) else (
  psql "%DATABASE_URL%" -c "select version();" >nul 2>nul
  if errorlevel 1 (
    echo [GAGAL] PostgreSQL tidak dapat dihubungi pada %DATABASE_URL%
  ) else (
    echo [OK] PostgreSQL terhubung pada %DB_HOST%:%DB_PORT%/%DB_NAME%
  )
)
if exist "node_modules" (echo [OK] node_modules tersedia) else (echo [PERINGATAN] node_modules belum ada - jalankan menu 3)
if exist ".env" (echo [OK] file .env tersedia) else (echo [PERINGATAN] file .env belum ada - jalankan menu 2)
echo ----------------------------------------------------------------------
pause
goto :eof

:BUAT_ENV
if exist ".env" (
  echo.
  echo File .env sudah ada. Isi saat ini:
  type ".env"
  echo.
  set "TIMPA="
  set /p "TIMPA=Timpa file .env? [y/N]: "
  if /i not "!TIMPA!"=="y" goto :eof
)
echo.
for /f "delims=" %%s in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')"') do set "SECRET=%%s"
> ".env" echo DATABASE_URL=%DATABASE_URL%
>>".env" echo AUTH_SECRET=%SECRET%
>>".env" echo PORT=%APP_PORT%
echo [OK] File .env dibuat dengan AUTH_SECRET acak.
pause
goto :eof

:INSTALL
echo.
echo ---- Instal dependensi ------------------------------------------------
call npm install
if errorlevel 1 (echo [GAGAL] npm install gagal.) else (echo [OK] Dependensi terpasang.)
pause
goto :eof

:DB_PUSH
echo.
echo ---- Siapkan skema basis data ----------------------------------------
call :SINKRON_DRIZZLE
call npx drizzle-kit push --force
if errorlevel 1 (
  echo [GAGAL] drizzle-kit push gagal. Periksa koneksi PostgreSQL.
) else (
  echo [OK] Skema diterapkan.
  echo      Data awal - pengguna, template, alur, contoh surat - dibuat otomatis
  echo      saat server pertama kali dijalankan.
)
pause
goto :eof

:SINKRON_DRIZZLE
if not exist "drizzle.config.json" goto :eof
powershell -NoProfile -Command "$c = Get-Content 'drizzle.config.json' -Raw | ConvertFrom-Json; $c.dbCredentials.url = $env:DATABASE_URL; $c | ConvertTo-Json -Depth 5 | Set-Content 'drizzle.config.json' -Encoding utf8" >nul 2>nul
goto :eof

:DEV
echo.
echo ---- Mode pengembangan - http://localhost:%APP_PORT% -----------------
echo Tekan CTRL+C untuk menghentikan.
set "NODE_ENV=development"
call npm run dev
pause
goto :eof

:BUILD
echo.
echo ---- Build produksi --------------------------------------------------
set "NODE_ENV=production"
call npm run build
if errorlevel 1 (echo [GAGAL] Build gagal.) else (echo [OK] Build selesai.)
pause
goto :eof

:START
if not exist ".next" (
  echo [PERINGATAN] Folder .next belum ada. Menjalankan build terlebih dahulu.
  call :BUILD_ONLY
)
echo.
echo ---- Server produksi - http://localhost:%APP_PORT% -------------------
echo Tekan CTRL+C untuk menghentikan.
set "NODE_ENV=production"
set "PORT=%APP_PORT%"
call npm run start
pause
goto :eof

:BUILD_ONLY
call npm run build
goto :eof

:BUILD_START
echo.
echo ---- Build lalu jalankan server produksi ------------------------------
call :BUILD_ONLY
if errorlevel 1 (
  echo [GAGAL] Build gagal, server tidak dijalankan.
  pause
  goto :eof
)
set "NODE_ENV=production"
set "PORT=%APP_PORT%"
start "E-SURAT Server" http://localhost:%APP_PORT%
call npm run start
pause
goto :eof

:DB_RESET
echo.
echo !!! PERINGATAN: seluruh data E-SURAT akan DIHAPUS permanen !!!
set "YAKIN="
set /p "YAKIN=Ketik RESET untuk melanjutkan: "
if /i not "!YAKIN!"=="RESET" (
  echo Dibatalkan.
  pause
  goto :eof
)
where psql >nul 2>nul
if errorlevel 1 (
  echo [GAGAL] psql tidak ditemukan di PATH.
  pause
  goto :eof
)
psql "%DATABASE_URL%" -c "drop schema public cascade; create schema public;"
if errorlevel 1 (
  echo [GAGAL] Reset basis data gagal.
  pause
  goto :eof
)
if exist "%STORAGE_DIR%" (
  rmdir /s /q "%STORAGE_DIR%"
  echo [OK] Folder storage dibersihkan.
)
call :SINKRON_DRIZZLE
call npx drizzle-kit push --force
echo [OK] Basis data dikosongkan dan skema dibuat ulang.
echo      Jalankan menu 7 - data awal akan dibuat otomatis saat server start.
pause
goto :eof

:BACKUP
echo.
echo ---- Backup basis data dan dokumen ------------------------------------
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
for /f "delims=" %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "TS=%%t"
set "FILE_DB=%BACKUP_DIR%\esurat_db_!TS!.dump"
set "FILE_DOC=%BACKUP_DIR%\esurat_storage_!TS!.zip"
where pg_dump >nul 2>nul
if errorlevel 1 (
  echo [GAGAL] pg_dump tidak ditemukan di PATH PostgreSQL.
  pause
  goto :eof
)
pg_dump "%DATABASE_URL%" -F c -f "!FILE_DB!"
if errorlevel 1 (echo [GAGAL] Backup basis data gagal.) else (echo [OK] Basis data  : !FILE_DB!)
if exist "%STORAGE_DIR%" (
  powershell -NoProfile -Command "Compress-Archive -Path '%STORAGE_DIR%\*' -DestinationPath '!FILE_DOC!' -Force" >nul 2>nul
  echo [OK] Dokumen     : !FILE_DOC!
) else (
  echo [INFO] Folder storage belum ada, backup dokumen dilewati.
)
call :HAPUS_BACKUP_LAMA
pause
goto :eof

:HAPUS_BACKUP_LAMA
powershell -NoProfile -Command "Get-ChildItem -Path '%BACKUP_DIR%' -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force" >nul 2>nul
goto :eof

:RESTORE
echo.
echo ---- Restore basis data ------------------------------------------------
if not exist "%BACKUP_DIR%" (
  echo [GAGAL] Folder backups belum ada.
  pause
  goto :eof
)
echo File backup yang tersedia:
dir /b /o-n "%BACKUP_DIR%\esurat_db_*.dump" 2>nul
echo.
set "FILE_RESTORE="
set /p "FILE_RESTORE=Nama file .dump yang dipulihkan: "
if not defined FILE_RESTORE (
  echo Dibatalkan.
  pause
  goto :eof
)
where pg_restore >nul 2>nul
if errorlevel 1 (
  echo [GAGAL] pg_restore tidak ditemukan di PATH.
  pause
  goto :eof
)
set "YAKIN2="
set /p "YAKIN2=Data saat ini akan ditimpa. Lanjutkan? [y/N]: "
if /i not "!YAKIN2!"=="y" (
  echo Dibatalkan.
  pause
  goto :eof
)
psql "%DATABASE_URL%" -c "drop schema public cascade; create schema public;" >nul 2>nul
pg_restore -d "%DATABASE_URL%" --no-owner --no-acl "%BACKUP_DIR%\!FILE_RESTORE!"
if errorlevel 1 (
  echo [PERINGATAN] Restore selesai dengan catatan - periksa log di atas.
) else (
  echo [OK] Restore berhasil.
)
pause
goto :eof

:BUKA_BROWSER
start "" http://localhost:%APP_PORT%
goto :eof

:SELESAI
endlocal
exit /b 0
