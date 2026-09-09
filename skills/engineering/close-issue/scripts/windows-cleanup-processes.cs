using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

// The x64 process-parameter layout is probed against this process before use.
// Unsupported layouts fail closed. No remote handle is forcibly closed.
public sealed class CleanupProcess : IDisposable {
    public int Pid, ParentPid;
    public string Started, Executable, CommandHash, Cwd, Kind;
    internal IntPtr Handle;
    internal string Command;
    public void Dispose() { if (Handle != IntPtr.Zero) { CleanupProcesses.CloseHandle(Handle); Handle = IntPtr.Zero; } }
}
public sealed class CleanupChild { public int Pid, ParentPid; public string Started; }
public sealed class CleanupRelease { public int Pid; public string Started, State, Reason; public bool TerminationRequested; }

public static class CleanupProcesses {
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] internal static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] bytes, int count, out IntPtr read);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool IsWow64Process(IntPtr process, out bool wow64);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process, out long created, out long exited, out long kernel, out long user);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder text, ref int size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool DuplicateHandle(IntPtr source, IntPtr handle, IntPtr target, out IntPtr copy, uint access, bool inherit, uint options);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetFinalPathNameByHandle(IntPtr handle, StringBuilder text, uint size, uint flags);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
    [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process, int type, byte[] info, int size, out int written);
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CommandLineToArgvW(string command, out int argc);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);

    static byte[] Read(IntPtr process, int pid, string phase, string field, long address, int count) {
        var bytes = new byte[count]; IntPtr actual = IntPtr.Zero;
        bool success = address > 0 && ReadProcessMemory(process, new IntPtr(address), bytes, count, out actual);
        int error = success ? 0 : address > 0 ? Marshal.GetLastWin32Error() : 0;
        if (!success || actual.ToInt64() != count)
            throw new InvalidOperationException("Process parameters unreadable (pid=" + pid + ", phase=" + phase + ", field=" + field
                + ", win32=" + error + ", requested=" + count + ", read=" + actual.ToInt64() + ")");
        return bytes;
    }
    static string Unicode(IntPtr process, int pid, string field, long address) {
        var value = Read(process, pid, "identity", field + "-descriptor", address, 16); int count = BitConverter.ToUInt16(value, 0);
        if (count == 0 || count > 32766 || count % 2 != 0) throw new InvalidOperationException("Process string layout unsupported");
        return Encoding.Unicode.GetString(Read(process, pid, "identity", field + "-buffer", BitConverter.ToInt64(value, 8), count));
    }
    static string Normalize(string path) => Path.GetFullPath(path.StartsWith(@"\\?\") ? path.Substring(4) : path).TrimEnd('\\', '/');
    static bool Same(string left, string right) => String.Equals(left, right, StringComparison.OrdinalIgnoreCase);
    static string Digest(string text) { using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(text))).Replace("-", "").ToLowerInvariant(); }
    static string[] Args(string command) {
        int count; var pointer = CommandLineToArgvW(command, out count);
        if (pointer == IntPtr.Zero) throw new InvalidOperationException("Command arguments unreadable");
        try { return Enumerable.Range(0, count).Select(i => Marshal.PtrToStringUni(Marshal.ReadIntPtr(pointer, i * IntPtr.Size))).ToArray(); }
        finally { LocalFree(pointer); }
    }
    static bool Match(string path, string root, string suffix) {
        if (String.IsNullOrEmpty(root)) return false;
        return System.Text.RegularExpressions.Regex.IsMatch(path, "^" + System.Text.RegularExpressions.Regex.Escape(Normalize(root) + "\\") + suffix + "$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    }
    static string Classify(CleanupProcess item) {
        var local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
        var codex = Environment.GetEnvironmentVariable("CODEX_HOME") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".codex");
        var args = Args(item.Command);
        if (Match(item.Executable, local, @"OpenAI\\Codex\\bin\\[^\\]+\\codex\.exe")) return "host";
        if (Match(item.Executable, local, @"OpenAI\\Codex\\runtimes\\cua_node\\[^\\]+\\bin\\node_repl\.exe")) return "node-repl";
        if (Same(item.Executable, Path.Combine(local ?? "", "codebase-memory-mcp", "codebase-memory-mcp.exe"))) return "codebase-memory";
        if (Match(item.Executable, local, @"OpenAI\\Codex\\runtimes\\cua_node\\[^\\]+\\bin\\node\.exe") && args.Length >= 2) {
            // Require the actual entrypoint, not a matching path buried in user arguments.
            if (Match(args[1], codex, @"plugins\\cache\\openai-bundled\\unified-computer-use\\[^\\]+\\scripts\\launch\.mjs")) return "computer-use";
            if (Match(args[1], Environment.GetEnvironmentVariable("ProgramFiles"), @"WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\resources\\artifact-template-picker\\server\.mjs")) return "template-picker";
        }
        return "unknown";
    }
    static bool CandidateImage(int pid) {
        var handle = OpenProcess(0x1000, false, pid);
        if (handle == IntPtr.Zero) return false;
        try {
            var text = new StringBuilder(32768); int size = text.Capacity;
            if (!QueryFullProcessImageName(handle, 0, text, ref size)) return false;
            var path = Normalize(text.ToString()); var local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
            return Match(path, local, @"OpenAI\\Codex\\(?:bin\\[^\\]+\\codex\.exe|runtimes\\cua_node\\[^\\]+\\bin\\(?:node|node_repl)\.exe)")
                || Same(path, Path.Combine(local ?? "", "codebase-memory-mcp", "codebase-memory-mcp.exe"));
        } finally { CloseHandle(handle); }
    }
    static CleanupProcess ReadProcess(int pid, bool retain) {
        var handle = OpenProcess(0x1000 | 0x10 | 0x40 | 0x100000 | (retain ? 1u : 0u), false, pid);
        if (handle == IntPtr.Zero) throw new InvalidOperationException("Process unavailable");
        try {
            bool wow64; if (!IsWow64Process(handle, out wow64) || wow64) throw new InvalidOperationException("Only native x64 helpers are supported");
            var basic = new byte[48]; int written;
            if (NtQueryInformationProcess(handle, 0, basic, basic.Length, out written) != 0) throw new InvalidOperationException("Process identity unreadable");
            var parameters = BitConverter.ToInt64(Read(handle, pid, "identity", "peb-parameters", BitConverter.ToInt64(basic, 8) + 0x20, 8), 0);
            var cwd = Normalize(Unicode(handle, pid, "current-directory", parameters + 0x38));
            var command = Unicode(handle, pid, "command-line", parameters + 0x70);
            var image = new StringBuilder(32768); int size = image.Capacity;
            long created, exited, kernel, user;
            if (!QueryFullProcessImageName(handle, 0, image, ref size) || !GetProcessTimes(handle, out created, out exited, out kernel, out user) || exited != 0)
                throw new InvalidOperationException("Process identity changed");
            var result = new CleanupProcess { Pid = pid, ParentPid = checked((int)BitConverter.ToInt64(basic, 40)), Started = created.ToString(),
                Executable = Normalize(image.ToString()), Cwd = cwd, Command = command, CommandHash = Digest(command), Handle = handle };
            result.Kind = Classify(result);
            return result;
        } catch { CloseHandle(handle); throw; }
    }
    public static void Probe() {
        if (IntPtr.Size != 8 || !Environment.Is64BitOperatingSystem) throw new InvalidOperationException("Only x64 Windows is supported");
        using (var self = ReadProcess(Process.GetCurrentProcess().Id, false)) {
            if (!Same(self.Cwd, Normalize(Environment.CurrentDirectory))) throw new InvalidOperationException("Current-directory layout probe failed");
        }
    }
    public static CleanupProcess[] Scan(string target) {
        target = Normalize(target); var found = new List<CleanupProcess>();
        try {
            foreach (var process in Process.GetProcesses()) {
                using (process) {
                    // Query image identity before reading remote memory. Unrelated processes are not scanned.
                    if (!CandidateImage(process.Id)) continue;
                    CleanupProcess item = null;
                    try { item = ReadProcess(process.Id, false); }
                    catch (Exception error) { if (process.HasExited) continue; throw new InvalidOperationException("Supported helper parameters unreadable (pid=" + process.Id + "): " + error.Message); }
                    if (Same(item.Cwd, target)) {
                        item.Dispose(); item = ReadProcess(process.Id, true);
                        if (!Same(item.Cwd, target)) { item.Dispose(); throw new InvalidOperationException("Directory owner changed during discovery"); }
                        try { VerifyDirectoryHandle(item, target); found.Add(item); }
                        catch { item.Dispose(); throw; }
                    } else item.Dispose();
                }
            }
            if (found.Count > 64) throw new InvalidOperationException("Helper set exceeds recovery bound");
            return found.ToArray();
        } catch { foreach (var item in found) item.Dispose(); throw; }
    }
    static void VerifyDirectoryHandle(CleanupProcess item, string target) {
        var basic = new byte[48]; int written;
        if (NtQueryInformationProcess(item.Handle, 0, basic, basic.Length, out written) != 0) throw new InvalidOperationException("Directory owner unreadable");
        var parameters = BitConverter.ToInt64(Read(item.Handle, item.Pid, "directory-handle", "peb-parameters", BitConverter.ToInt64(basic, 8) + 0x20, 8), 0);
        var directory = new IntPtr(BitConverter.ToInt64(Read(item.Handle, item.Pid, "directory-handle", "current-directory-handle", parameters + 0x48, 8), 0)); IntPtr copy;
        if (!DuplicateHandle(item.Handle, directory, GetCurrentProcess(), out copy, 0, false, 2)) throw new InvalidOperationException("Directory handle unreadable");
        try {
            var path = new StringBuilder(32768); uint length = GetFinalPathNameByHandle(copy, path, (uint)path.Capacity, 8);
            if (length == 0 || length >= path.Capacity || !Same(Normalize(path.ToString()), target)) throw new InvalidOperationException("Directory handle differs");
        } finally { CloseHandle(copy); }
    }
    static bool HasExited(CleanupProcess item) {
        uint state = WaitForSingleObject(item.Handle, 0);
        if (state == 0) return true;
        if (state == 258) return false;
        throw new InvalidOperationException("Retained process state unreadable (pid=" + item.Pid + ")");
    }
    public static void Validate(CleanupProcess[] frozen, string target, CleanupChild[] children) {
        target = Normalize(target); var byId = frozen.ToDictionary(p => p.Pid);
        if (frozen.Length == 0) throw new InvalidOperationException("No supported helper holds the directory");
        foreach (var item in frozen) {
            if (item.Kind == "host" || item.Kind == "unknown") throw new InvalidOperationException("Unknown or host process owns the directory");
            // A launcher may exit naturally when its released child exits. Only
            // the retained kernel object proves this; an unreadable PID does not.
            if (HasExited(item)) continue;
            try {
                using (var now = ReadProcess(item.Pid, false)) {
                    if (now.Started != item.Started || now.ParentPid != item.ParentPid || now.CommandHash != item.CommandHash || !Same(now.Executable, item.Executable) || !Same(now.Cwd, target))
                        throw new InvalidOperationException("Frozen process identity changed");
                }
                VerifyDirectoryHandle(item, target);
                var parent = item.ParentPid; var childStarted = Int64.Parse(item.Started); var seen = new HashSet<int> { item.Pid };
                while (byId.ContainsKey(parent)) {
                    if (!seen.Add(parent)) throw new InvalidOperationException("Process ancestry cycle");
                    if (HasExited(byId[parent])) throw new InvalidOperationException("Frozen helper ancestor exited (pid=" + parent + ")");
                    if (Int64.Parse(byId[parent].Started) > childStarted) throw new InvalidOperationException("Intermediate parent PID was reused");
                    childStarted = Int64.Parse(byId[parent].Started); parent = byId[parent].ParentPid;
                }
                using (var host = ReadProcess(parent, false)) {
                    if (host.Kind != "host" || Int64.Parse(host.Started) > childStarted) throw new InvalidOperationException("Helper host ownership unproved");
                }
            } catch { if (!HasExited(item)) throw; }
        }
        // CIM supplies parent IDs even when a child's process DACL denies OpenProcess.
        // A failed/incomplete relevant identity is a blocker, never silently skipped.
        if (children == null || children.Length == 0) throw new InvalidOperationException("Child inventory unavailable");
        foreach (var child in children) {
            if (byId.ContainsKey(child.ParentPid) && !byId.ContainsKey(child.Pid)) {
                long created;
                if (!Int64.TryParse(child.Started, out created)) throw new InvalidOperationException("Relevant child creation time unreadable");
                // Windows retains the numeric parent PID after exit; older children predate its reuse.
                if (created >= Int64.Parse(byId[child.ParentPid].Started)) throw new InvalidOperationException("Foreign child " + child.Pid + " of frozen helper " + child.ParentPid);
            }
        }
        var current = Scan(target);
        try {
            var live = frozen.Where(item => !HasExited(item)).ToDictionary(item => item.Pid);
            if (current.Length != live.Count || current.Any(now => !live.ContainsKey(now.Pid) || live[now.Pid].Started != now.Started)) throw new InvalidOperationException("New or missing directory holder");
        } finally { foreach (var item in current) item.Dispose(); }
    }
    public static CleanupProcess[] ReleaseOrder(CleanupProcess[] frozen) {
        return frozen.OrderByDescending(item => {
            var current = item; int depth = 0;
            while (frozen.Any(parent => parent.Pid == current.ParentPid)) { current = frozen.Single(parent => parent.Pid == current.ParentPid); if (++depth > frozen.Length) throw new InvalidOperationException("Process ancestry cycle"); }
            return depth;
        }).ToArray();
    }
    public static CleanupRelease ReleaseOne(CleanupProcess item, CleanupProcess[] remaining, string target, CleanupChild[] children) {
        var outcome = new CleanupRelease { Pid = item.Pid, Started = item.Started, State = "NOT_RELEASED" };
        try {
            Validate(remaining, target, children);
            // Retained process handles bind kernel objects; PID reuse cannot select another process.
            if (HasExited(item)) { outcome.State = "EXITED"; return outcome; }
            using (var now = ReadProcess(item.Pid, false)) {
                if (now.Started != item.Started || now.ParentPid != item.ParentPid || now.CommandHash != item.CommandHash || !Same(now.Executable, item.Executable) || !Same(now.Cwd, Normalize(target)))
                    throw new InvalidOperationException("Frozen process changed before termination");
            }
            VerifyDirectoryHandle(item, Normalize(target));
            if (!TerminateProcess(item.Handle, 0)) throw new InvalidOperationException("Exact helper termination failed");
            outcome.TerminationRequested = true; outcome.State = "EXIT_UNPROVEN";
            if (WaitForSingleObject(item.Handle, 1000) != 0) throw new InvalidOperationException("Exact helper exit is unproved");
            outcome.State = "EXITED";
        } catch (Exception error) { outcome.Reason = error.Message; }
        return outcome;
    }
}
