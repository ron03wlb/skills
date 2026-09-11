$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$frozenHelpers = @()
$releasedHelpers = [Collections.Generic.List[object]]::new()
function Get-CleanupChildren {
    @(Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object {
        $child = [CleanupChild]::new()
        $child.Pid = $_.ProcessId
        $child.ParentPid = $_.ParentProcessId
        if ($null -ne $_.CreationDate) { $child.Started = $_.CreationDate.ToUniversalTime().ToFileTimeUtc().ToString() }
        $child
    })
}
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'windows-cleanup-processes.cs')
    [CleanupProcesses]::Probe()
    $request = [Console]::ReadLine() | ConvertFrom-Json
    $target = [string]$request.target
    if (-not [IO.Path]::IsPathFullyQualified($target)) { throw 'Absolute cleanup directory required' }
    $frozenHelpers = @([CleanupProcesses]::Scan($target))
    if ($null -ne $request.expectedProcesses) {
        $expected = @($request.expectedProcesses)
        if ($expected.Count -eq 0) { throw 'Interrupted recovery expected process set is empty' }
        $expectedKeys = [Collections.Generic.HashSet[string]]::new()
        foreach ($item in $expected) {
            if ([int]$item.Pid -lt 1 -or [int]$item.ParentPid -lt 1 -or [string]$item.Started -notmatch '^\d+$' -or
                -not [IO.Path]::IsPathFullyQualified([string]$item.Executable) -or
                [string]$item.CommandHash -notmatch '^[a-f0-9]{64}$' -or
                -not [IO.Path]::IsPathFullyQualified([string]$item.Cwd) -or
                -not [string]::Equals([IO.Path]::GetFullPath([string]$item.Cwd).TrimEnd('\', '/'), [IO.Path]::GetFullPath($target).TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase) -or
                [string]$item.Kind -notin @('node-repl', 'computer-use', 'template-picker', 'codebase-memory')) {
                throw 'Interrupted recovery expected process identity is invalid'
            }
            if (-not $expectedKeys.Add("$([int]$item.Pid):$([string]$item.Started)")) { throw 'Interrupted recovery expected process identity is duplicated' }
        }
        foreach ($helper in $frozenHelpers) {
            $matches = @($expected | Where-Object {
                [int]$_.Pid -eq $helper.Pid -and
                [int]$_.ParentPid -eq $helper.ParentPid -and
                [string]$_.Started -eq $helper.Started -and
                [string]$_.Executable -eq $helper.Executable -and
                [string]$_.CommandHash -eq $helper.CommandHash -and
                [string]$_.Cwd -eq $helper.Cwd -and
                [string]$_.Kind -eq $helper.Kind
            })
            if ($matches.Count -ne 1) { throw "Current helper $($helper.Pid) is not an exact member of the interrupted reservation" }
        }
    }
    [CleanupProcesses]::Validate($frozenHelpers, $target, [CleanupChild[]](Get-CleanupChildren))
    # Public fields contain hashes, never raw commands or the retained process handles.
    [Console]::WriteLine((@{ state = 'READY'; processes = @($frozenHelpers | Select-Object Pid, ParentPid, Started, Executable, CommandHash, Cwd, Kind) } | ConvertTo-Json -Depth 4 -Compress))
    $decision = [Console]::ReadLine() | ConvertFrom-Json
    if ($decision.action -ne 'release') { exit 0 }
    foreach ($helper in [CleanupProcesses]::ReleaseOrder($frozenHelpers)) {
        [Console]::WriteLine((@{ state = 'BEFORE_RELEASE'; processId = $helper.Pid } | ConvertTo-Json -Compress))
        [Console]::Out.Flush()
        if (([Console]::ReadLine() | ConvertFrom-Json).action -ne 'proceed') { throw 'Owner cancelled the next helper release' }
        $remainingFrozen = @($frozenHelpers | Where-Object Pid -notin @($releasedHelpers.Pid))
        $outcome = [CleanupProcesses]::ReleaseOne($helper, $remainingFrozen, $target, [CleanupChild[]](Get-CleanupChildren))
        $releasedHelpers.Add($outcome)
        [Console]::WriteLine((@{ state = 'PROGRESS'; outcome = $outcome } | ConvertTo-Json -Depth 4 -Compress))
        [Console]::Out.Flush()
        if (([Console]::ReadLine() | ConvertFrom-Json).action -ne 'recorded') { throw 'Owner did not confirm durable release observation' }
        if ($outcome.State -ne 'EXITED') { throw $outcome.Reason }
        $helper.Dispose()
    }
    $remaining = @([CleanupProcesses]::Scan($target))
    try {
        [Console]::WriteLine((@{ state = $(if ($remaining.Count) { 'RESPAWNED' } else { 'RELEASED' }); outcomes = @($releasedHelpers.ToArray()); remaining = @($remaining | Select-Object Pid, Started, Kind) } | ConvertTo-Json -Depth 4 -Compress))
    } finally { foreach ($item in $remaining) { $item.Dispose() } }
} catch {
    [Console]::WriteLine((@{ state = 'BLOCKED'; outcomes = @($releasedHelpers.ToArray()); reason = $_.Exception.Message } | ConvertTo-Json -Depth 4 -Compress))
    exit 1
} finally { foreach ($item in $frozenHelpers) { $item.Dispose() } }
