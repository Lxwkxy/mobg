# Dot-source this file in the terminal that will run seed-demo.ts.
$ErrorActionPreference = 'Stop'
$seedSelectedId = Read-Host 'Existing MobG user_id to keep as Owner (demo is usually 1)'
if ($seedSelectedId -notmatch '^[1-9][0-9]*$') { throw 'Enter the exact positive domain user_id.' }
$env:SEED_DOMAIN_USER_ID = $seedSelectedId
foreach ($seedRole in @('OWNER', 'MEMBER', 'OUTSIDER')) {
    $seedSecurePassword = Read-Host "Choose password for $seedRole (8-128 characters)" -AsSecureString
    $seedPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seedSecurePassword)
    try {
        $seedPasswordValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($seedPasswordPointer)
        if ($seedPasswordValue.Length -lt 8 -or $seedPasswordValue.Length -gt 128) { throw 'Password must contain 8-128 characters.' }
        [Environment]::SetEnvironmentVariable("SEED_${seedRole}_PASSWORD", $seedPasswordValue, 'Process')
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($seedPasswordPointer)
        $seedPasswordValue = $null
        $seedSecurePassword.Dispose()
    }
}
Write-Host 'Seed inputs set in this terminal only. No passwords displayed or saved to files.'
