@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title E-SURAT - Menjalankan Aplikasi
cd /d "%~dp0"

rem =====================================================================
rem  E-SURAT - SEKALI KLIK
rem  Cukup dobel-klik file ini. Semua tahap dijalankan otomatis:
rem    cek Node.js -> buat .env -> npm install -> cek/buat database
rem    -> terapkan skema -> build -> start server -> buka browser
rem  Data awal (pengguna, template, alur, contoh surat) dibuat otomatis
rem  oleh aplikasi saat server pertama kali menyala.
rem
rem  Cara pakai alternatif:
rem    jalankan.bat            mode produksi (build bila perlu, lalu start)
rem    jalankan.bat dev        mode pengembangan (next dev, hot reload)
rem    jalankan.bat rebuild    paksa build ulang lalu start
rem =====================================================================

set "APP_PORT=3000"
set "DB_HOST=127.0.0.1"
set "DB_PORT=5432"
set "DB_NAME=app_db"
set "DB_USER=postgres"
set "DB_PASSWORD=postgres"

set "MODE=start"
if /i "%~1"=="dev" set "MODE=dev"
if /i "%~1"=="rebuild" set "MODE=rebuild"

echo ======================================================================
echo   E-SURAT - Sistem Informasi Manajemen Persuratan Digital
echo   Mode: %MODE%   Port: %APP_PORT%
echo ======================================================================
echo.

rem ---- 1. Node.js ------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto :TIDAK_ADA_NODE
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo [1/7] Node.js %NODE_VER% ditemukan.

rem ---- 2. file .env ----------------------------------------------------
if exist ".env" (
  echo [2/7] File .env ditemukan, membaca konfigurasi.
  for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="DATABASE_URL" set "DATABASE_URL=%%b"
    if /i "%%a"=="PORT" set "APP_PORT=%%b"
  )
) else (
  echo [2/7] File .env belum ada, membuat konfigurasi baru.
  for /f "delims=" %%s in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')"') do set "SECRET=%%s"
  > ".env" echo DATABASE_URL=postgresql://%DB_USER%:%DB_PASSWORD%@%DB_HOST%:%DB_PORT%/%DB_NAME%
  >>".env" echo AUTH_SECRET=!SECRET!
  >>".env" echo PORT=%APP_PORT%
)
if not defined DATABASE_URL set "DATABASE_URL=postgresql://%DB_USER%:%DB_PASSWORD%@%DB_HOST%:%DB_PORT%/%DB_NAME%"

rem ---- 3. dependensi ---------------------------------------------------
if exist "node_modules\next" (
  echo [3/7] Dependensi sudah terpasang.
) else (
  echo [3/7] Instal dependensi - npm install, mohon tunggu...
  call npm install
  if errorlevel 1 goto :GAGAL_INSTALL
)

rem ---- 4. koneksi database --------------------------------------------
echo [4/7] Memeriksa koneksi PostgreSQL...
call :CEK_DB
if "%DB_OK%"=="1" goto :DB_SIAP
echo       Tidak terhubung. Mencoba membuat database %DB_NAME% secara otomatis...
call :BUAT_DATABASE
call :CEK_DB
if "%DB_OK%"=="1" goto :DB_SIAP
goto :DB_MASALAH

:DB_SIAP
echo       PostgreSQL aktif - %DATABASE_URL%

rem ---- 5. skema basis data --------------------------------------------
call :CEK_SKEMA
if "%SKEMA_OK%"=="1" (
  echo [5/7] Skema basis data sudah sesuai.
) else (
  echo [5/7] Menerapkan skema basis data - drizzle-kit push...
  call :SINKRON_DRIZZLE
  call npx drizzle-kit push --force
  if errorlevel 1 goto :GAGAL_SKEMA
)

rem ---- 6. build --------------------------------------------------------
if "%MODE%"=="dev" (
  echo [6/7] Mode pengembangan - build dilewati.
  goto :SIAP_JALAN
)
if "%MODE%"=="rebuild" (
  echo [6/7] Build produksi dipaksa ulang...
  call :BUILD_APP
  if errorlevel 1 goto :GAGAL_BUILD
  goto :SIAP_JALAN
)
if exist ".next\BUILD_ID" (
  echo [6/7] Hasil build ditemukan - build dilewati.
  echo       Butuh build ulang? jalankan: jalankan.bat rebuild
) else (
  echo [6/7] Build produksi pertama kali, mohon tunggu...
  call :BUILD_APP
  if errorlevel 1 goto :GAGAL_BUILD
)

:SIAP_JALAN
rem ---- 7. jalankan server + buka browser -------------------------------
echo [7/7] Menyalakan server E-SURAT...
echo.
echo ----------------------------------------------------------------------
echo   Aplikasi : http://localhost:%APP_PORT%
echo   Akun demo: superadmin@esurat.local  / surat123
echo              admin@esurat.local       / surat123
echo              pembuat@esurat.local     / surat123
echo              pemeriksa@esurat.local   / surat123
echo              pejabat@esurat.local     / surat123
echo   Hentikan server dengan menekan CTRL+C
echo ----------------------------------------------------------------------
echo.
call :PANTAU_BROWSER
if "%MODE%"=="dev" goto :JALAN_DEV
goto :JALAN_PROD

:JALAN_DEV
set "NODE_ENV=development"
call npm run dev
goto :SERVER_BERHENTI

:JALAN_PROD
set "NODE_ENV=production"
set "PORT=%APP_PORT%"
call npm run start
goto :SERVER_BERHENTI

rem =====================================================================
rem                              SUBRUTIN
rem =====================================================================

:CEK_DB
set "DB_OK=0"
node -e "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});p.query('select 1').then(()=>{p.end();process.exit(0)}).catch(()=>{try{p.end()}catch(e){};process.exit(1)})" >nul 2>nul
if not errorlevel 1 set "DB_OK=1"
goto :eof

:CEK_SKEMA
set "SKEMA_OK=0"
node -e "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});p.query('select to_regclass($$public.letters$$) as t').then(r=>{p.end();process.exit(r.rows[0]&&r.rows[0].t?0:1)}).catch(()=>{try{p.end()}catch(e){};process.exit(1)})" >nul 2>nul
if not errorlevel 1 set "SKEMA_OK=1"
goto :eof

:BUAT_DATABASE
node -e "const{Client}=require('pg');const c=new Client({connectionString:'postgresql://%DB_USER%:%DB_PASSWORD%@%DB_HOST%:%DB_PORT%/postgres',connectionTimeoutMillis:5000});c.connect().then(()=>c.query('CREATE DATABASE %DB_NAME%')).then(()=>{c.end();process.exit(0)}).catch(e=>{try{c.end()}catch(x){};process.exit(String(e.message).indexOf('already exists')>=0?0:1)})" >nul 2>nul
if errorlevel 1 (
  echo       Pembuatan database otomatis gagal - mungkin server PostgreSQL mati
  echo       atau kredensial pada .env tidak sesuai.
) else (
  echo       Database %DB_NAME% tersedia.
)
goto :eof

:SINKRON_DRIZZLE
if not exist "drizzle.config.json" goto :eof
powershell -NoProfile -Command "$c = Get-Content 'drizzle.config.json' -Raw | ConvertFrom-Json; $c.dbCredentials.url = $env:DATABASE_URL; $c | ConvertTo-Json -Depth 5 | Set-Content 'drizzle.config.json' -Encoding utf8" >nul 2>nul
goto :eof

:BUILD_APP
set "NODE_ENV=production"
call npm run build
goto :eof

:PANTAU_BROWSER
start "" /min powershell -NoProfile -Command "for($i=0;$i -lt 90;$i++){try{$r=Invoke-WebRequest -Uri 'http://localhost:%APP_PORT%/api/health' -UseBasicParsing -TimeoutSec 2;if($r.StatusCode -eq 200){Start-Process 'http://localhost:%APP_PORT%';break}}catch{};Start-Sleep -Seconds 2}"
goto :eof

:SERVER_BERHENTI
echo.
echo ======================================================================
echo   Server E-SURAT berhenti.
echo ======================================================================
pause
endlocal
exit /b 0

:TIDAK_ADA_NODE
echo.
echo [GAGAL] Node.js tidak ditemukan di komputer ini.
echo         1. Unduh dan instal Node.js LTS dari https://nodejs.org
echo         2. Tutup jendela ini, buka kembali file jalankan.bat
echo.
set "BUKA_NODE="
set /p "BUKA_NODE=Buka halaman unduhan Node.js sekarang? [Y/n]: "
if /i "!BUKA_NODE!"=="n" goto :AKHIR
start "" https://nodejs.org/en/download
goto :AKHIR

:GAGAL_INSTALL
echo.
echo [GAGAL] npm install tidak berhasil. Periksa koneksi internet Anda,
echo         lalu jalankan ulang file ini.
goto :AKHIR

:DB_MASALAH
echo.
echo [GAGAL] PostgreSQL tidak dapat dihubungi.
echo         Yang perlu diperiksa:
echo           1. Layanan PostgreSQL sudah berjalan?
echo              services.msc - postgresql-x64-NN - Start
echo           2. Kredensial pada file .env sudah benar?
echo              DATABASE_URL=%DATABASE_URL%
echo           3. Port %DB_PORT% tidak diblokir firewall?
echo         Setelah diperbaiki, jalankan ulang file ini.
goto :AKHIR

:GAGAL_SKEMA
echo.
echo [GAGAL] Penerapan skema basis data gagal. Lihat pesan kesalahan di atas.
goto :AKHIR

:GAGAL_BUILD
echo.
echo [GAGAL] Build produksi gagal. Lihat pesan kesalahan di atas.
echo         Coba jalankan: jalankan.bat dev   - untuk mode pengembangan.
goto :AKHIR

:AKHIR
echo.
pause
endlocal
exit /b 1
