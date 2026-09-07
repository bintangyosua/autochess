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
      pnpm android:pair
  Sesudah itu, tiap mau install:
      pnpm android
#>

param(
  # Alamat "Wireless debugging" di HP, mis. 192.168.1.7:37219.
  # Kosongkan kalau HP sudah pernah connect (tersimpan di $env:CMR_ANDROID_ADDR).
  [string]$Address,

  # Jalankan mode pairing dulu (butuh alamat + kode dari layar "Pair device with pairing code").
  [switch]$Pair
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

if ($Pair) {
  # Alamat + kode pairing muncul di HP: Wireless debugging -> Pair device with pairing code.
  # Perhatikan: port pairing BERBEDA dari port connect.
  $pairAddr = Read-Host "Alamat pairing dari HP (mis. 192.168.1.7:41234)"
  $code     = Read-Host "Kode pairing 6 digit"
  & $adb pair $pairAddr $code
  if ($LASTEXITCODE -ne 0) { throw "Pairing gagal. Kode pairing hanya berlaku sebentar - coba lagi." }

  $connAddr = Read-Host "Sekarang alamat connect dari layar Wireless debugging (mis. 192.168.1.7:37219)"
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
