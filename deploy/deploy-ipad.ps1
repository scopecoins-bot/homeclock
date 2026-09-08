# HomeClock jailbreak deploy (Windows)
#
# Deploys a built HomeClock rootless .deb to the jailbroken iPad over SSH.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File deploy-ipad.ps1 [-Ip 192.168.137.222] [-Deb path\to\nl.krimson.homeclock.deb]
#
# Password-less prerequisites: an SSH key for mobile@<ip> (or you will be
# prompted for the password by ssh/scp interactively; the sudo password is
# only requested on the device itself).
param(
    [string]$Ip = "",
    [string]$Deb = ""
)

$ErrorActionPreference = "Stop"

# 1. Resolve iPad IP: explicit > hotspot default > ARP scan on known subnets
if (-not $Ip) {
    $candidates = @("192.168.137.222")
    foreach ($c in $candidates) {
        if (Test-Connection -ComputerName $c -Count 1 -Quiet -TimeoutSeconds 2) { $Ip = $c; break }
    }
}
if (-not $Ip) {
    Write-Host "[!] iPad not reachable. Connect the iPad to the hotspot/home Wi-Fi, unlock it, ensure Dopamine is active, then retry with -Ip <address>."
    exit 1
}
Write-Host "[1/6] iPad at $Ip"

# 2. Ping
if (-not (Test-Connection -ComputerName $Ip -Count 2 -Quiet -TimeoutSeconds 2)) {
    Write-Host "[!] No ping response from $Ip"; exit 1
}
Write-Host "[2/6] Ping OK"

# 3. SSH check
ssh -o BatchMode=yes -o ConnectTimeout=6 "mobile@$Ip" "uname -s" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] SSH failed. Ensure OpenSSH (jailbreak) is running and your key/password works."
    exit 1
}
Write-Host "[3/6] SSH OK"

# 4. Locate .deb
if (-not $Deb) {
    $found = Get-ChildItem -Path "$PSScriptRoot\..\artifacts", "$PSScriptRoot\..\dist" -Recurse -Filter "nl.krimson.homeclock.deb" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $found) { Write-Host "[!] No .deb found; pass -Deb <path>"; exit 1 }
    $Deb = $found.FullName
}
Write-Host "[4/6] Package: $Deb"

# 5. Copy + install
Write-Host "[5/6] Uploading + installing (dpkg, uicache)..."
scp "$Deb" "mobile@${Ip}:/var/mobile/HomeClock.deb"
if ($LASTEXITCODE -ne 0) { Write-Host "[!] scp failed"; exit 1 }
ssh "mobile@$Ip" "sudo dpkg -i /var/mobile/HomeClock.deb && sudo uicache -a && dpkg -l | grep -i krimson"
if ($LASTEXITCODE -ne 0) { Write-Host "[!] install failed"; exit 1 }

# 6. Verify app bundle present
ssh "mobile@$Ip" "ls -d /var/jb/Applications/HomeClock.app 2>/dev/null || find /var/jb -maxdepth 3 -name 'HomeClock.app' 2>/dev/null"
Write-Host "[6/6] Install done. HomeClock should now appear on the home screen (possibly after a respring)."
Write-Host "Next: launch HomeClock, pair with bossp (npm run pair on bossp -> code in Instellingen > Server)."
