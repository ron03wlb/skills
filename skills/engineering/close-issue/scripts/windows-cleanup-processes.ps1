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
