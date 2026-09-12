<#
  Pasang ekstensi ke Firefox Android lewat Wi-Fi (tanpa kabel).

  Prasyarat di HP (Android 11+):
    - Firefox Nightly terpasang
    - Developer options -> Wireless debugging: ON
    - Firefox Nightly -> Settings -> Remote debugging via USB: ON
      (namanya "via USB", tapi ini yang mengaktifkan remote debugging untuk
       transport apa pun, termasuk Wi-Fi)
    - HP dan PC di jaringan Wi-Fi yang sama

  Pairing sekali per HP:
      pnpm android:qr      <- QR di terminal, tinggal scan
      pnpm android:pair    <- alur kode 6 digit
  Sesudah itu, tiap mau install:
      pnpm android
#>

param(
  # Alamat "Wireless debugging" di HP, mis. 192.168.1.7:37219.
  # Kosongkan kalau HP sudah pernah connect (tersimpan di $env:CMR_ANDROID_ADDR).
  [string]$Address,

  # Jalankan mode pairing dulu (butuh alamat + kode dari layar "Pair device with pairing code").
  [switch]$Pair,

  # Pairing lewat QR: kodenya dirender di terminal ini, HP tinggal scan.
  [switch]$Qr
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$port = 8787   # DEFAULT_PORT di packages/shared/src/protocol.ts

# adb sering tidak ada di PATH; cari di lokasi standar Android SDK.
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) {
  $candidate = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
  if (Test-Path $candidate) { $adb = $candidate }
}
if (-not $adb) { throw "adb tidak ditemukan. Pasang Android platform-tools dulu." }

function Get-WirelessDevices {
  # Device wireless selalu tampil sebagai host:port, jadi bisa dibedakan dari serial USB.
  & $adb devices | Select-Object -Skip 1 |
    Where-Object { $_ -match '\sdevice$' } |
    ForEach-Object { ($_ -split '\s+')[0] } |
    Where-Object { $_ -match ':\d+$' }
}

function Find-MdnsService {
  <#
    Alamat ip:port sebuah servis mDNS, atau $null kalau belum diumumkan.

    Dipakai supaya port tidak perlu dihafal: port connect berubah tiap kali Wireless
    debugging dimatikan-nyalakan atau HP restart, jadi menanyakannya tiap kali jauh lebih
    tahan lama daripada menyimpan angka yang sudah basi.
  #>
  param([string]$Type)

  $lines = & $adb mdns services 2>$null
  foreach ($line in $lines) {
    $parts = $line -split '\s+'
    if ($parts.Count -ge 3 -and $parts[1] -eq $Type) { return $parts[2] }
  }
  return $null
}

function Wait-MdnsService {
  <#
    Tunggu sampai servisnya muncul.

    Servis pairing hanya diumumkan SELAMA dialog QR terbuka di HP — beberapa puluh detik.
    Karena itu di-polling, bukan dibaca sekali: sekali baca hampir pasti meleset, entah
    karena HP belum sempat mengumumkan diri atau dialognya sudah telanjur ditutup.
  #>
  param([string]$Type, [string]$Label, [int]$Seconds = 60)

  for ($i = 0; $i -lt $Seconds; $i++) {
    $found = Find-MdnsService -Type $Type
    if ($found) { Write-Host ""; return $found }
    Write-Host -NoNewline "`r  menunggu $Label... $i detik "
    Start-Sleep -Seconds 1
  }
  Write-Host ""
  return $null
}

if ($Qr) {
  # QR-nya bukan sesuatu yang diberikan adb: isinya cuma nama servis dan password yang
  # dikarang di sini. HP membacanya, lalu mengumumkan diri lewat mDNS, dan pairing
  # diselesaikan dari sisi ini memakai password yang sama. Di Android Studio, bagian
  # terakhir itu yang dikerjakan diam-diam olehnya.
  $name = "ADB_WIFI_$(Get-Random -Maximum 99999)"
  $bytes = New-Object byte[] 9
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $pass = [Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', ''

  $payload = "WIFI:T:ADB;S:$name;P:$pass;;"
  & node -e "require('qrcode-terminal').generate(process.argv[1], { small: true })" $payload
  if ($LASTEXITCODE -ne 0) { throw "Gagal merender QR (butuh paket qrcode-terminal di root)." }

  Write-Host ""
  Write-Host "  HP: Developer options -> Wireless debugging -> Pair device with QR code"
  Write-Host "  Scan kode di atas, dan JANGAN tutup dialognya sampai pairing selesai."
  Write-Host ""

  $pairAddr = Wait-MdnsService -Type '_adb-tls-pairing._tcp' -Label 'HP mengumumkan diri'
  if (-not $pairAddr) {
    throw @"
Tidak ada servis pairing yang muncul.
Biasanya: HP dan PC beda Wi-Fi, AP isolation di router, atau mDNS (UDP 5353)
diblokir Windows Firewall untuk adb.exe.
"@
  }

  Write-Host "  pairing ke $pairAddr"
  & $adb pair $pairAddr $pass
  if ($LASTEXITCODE -ne 0) { throw "Pairing gagal." }

  # Port connect berbeda dari port pairing, jadi dicari lagi — bukan dipakai ulang.
  $connAddr = Wait-MdnsService -Type '_adb-tls-connect._tcp' -Label 'perangkat siap disambung'
  if (-not $connAddr) { throw "Pairing berhasil, tapi perangkatnya tidak muncul untuk disambung." }

  & $adb connect $connAddr
  if ($LASTEXITCODE -ne 0) { throw "Connect gagal." }

  Write-Host ""
  Write-Host "Pairing tersimpan di HP. Lain kali cukup: pnpm android"
  $Address = $connAddr
}

if ($Pair) {
  # Alamat + kode pairing muncul di HP: Wireless debugging -> Pair device with pairing code.
  # Perhatikan: port pairing BERBEDA dari port connect.
  $pairAddr = Read-Host "Alamat pairing dari HP (mis. 192.168.1.7:41234)"
  $code     = Read-Host "Kode pairing 6 digit"
  & $adb pair $pairAddr $code
  if ($LASTEXITCODE -ne 0) { throw "Pairing gagal. Kode pairing hanya berlaku sebentar - coba lagi." }

  # Alamat connect dicari sendiri lewat mDNS; bertanya hanya kalau tidak ketemu, karena
  # mengetik ulang ip:port yang sudah diumumkan HP itu kerja yang tidak perlu.
  $connAddr = Find-MdnsService -Type '_adb-tls-connect._tcp'
  if ($connAddr) {
    Write-Host "Alamat connect ditemukan lewat mDNS: $connAddr"
  } else {
    $connAddr = Read-Host "Sekarang alamat connect dari layar Wireless debugging (mis. 192.168.1.7:37219)"
  }
  & $adb connect $connAddr
  if ($LASTEXITCODE -ne 0) { throw "Connect gagal." }

  Write-Host ""
  Write-Host "Pairing tersimpan di HP. Lain kali cukup: pnpm android -Address $connAddr"
  Write-Host "(port-nya berubah tiap Wireless debugging dimatikan/dinyalakan)"
  $Address = $connAddr
}

if ($Address) {
  & $adb connect $Address | Out-Null
}

$devices = @(Get-WirelessDevices)
if ($devices.Count -eq 0) {
  # Sudah pernah pairing tapi portnya berganti — kasus paling sering. HP yang sudah
  # dipasangkan tetap mengumumkan diri lewat mDNS, jadi alamat barunya bisa dicari
  # sendiri alih-alih menyuruh membaca layar HP.
  $auto = Find-MdnsService -Type '_adb-tls-connect._tcp'
  if ($auto) {
    Write-Host "Menyambung lewat mDNS: $auto"
    & $adb connect $auto | Out-Null
    $devices = @(Get-WirelessDevices)
  }
}
if ($devices.Count -eq 0) {
  throw @"
Tidak ada HP wireless terdeteksi.
  - Belum pernah pairing?           -> pnpm android:pair
  - Sudah pairing tapi port berubah -> pnpm android -Address <ip:port dari layar Wireless debugging>
"@
}
if ($devices.Count -gt 1) {
  throw "Terdeteksi lebih dari satu device: $($devices -join ', '). Pakai -Address untuk memilih."
}
$device = $devices[0]
Write-Host "Device: $device"

Write-Host "Build ekstensi (firefox-mv2)..."
& pnpm --filter @cmr/extension exec wxt build -b firefox
if ($LASTEXITCODE -ne 0) { throw "Build gagal." }

# Teruskan 127.0.0.1:$port di HP ke bridge di PC ini. Jalan di atas transport Wi-Fi
# juga, jadi bridge tetap boleh listen di 127.0.0.1 saja - tidak perlu dibuka ke LAN.
Write-Host "adb reverse tcp:$port -> PC"
& $adb -s $device reverse "tcp:$port" "tcp:$port"
if ($LASTEXITCODE -ne 0) { throw "adb reverse gagal." }

$source = Join-Path $root 'packages\extension\.output\firefox-mv2'
Write-Host "Install ke Firefox Nightly... (biarkan jendela ini terbuka)"
& npx --yes web-ext run `
  --source-dir $source `
  --target firefox-android `
  --android-device $device `
  --firefox-apk org.mozilla.fenix
