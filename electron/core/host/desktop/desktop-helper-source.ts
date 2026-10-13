// The Windows half of host Computer Use: window discovery, capture, accessibility and input.
// It is C# compiled by the Windows PowerShell 5.1 already on every machine (Add-Type), so it stays within C# 5 and
// needs no native module. desktop-helper.ts sends this source over stdin and then one JSON request per line.
export const DESKTOP_HELPER_SOURCE = String.raw`// Compiled by Windows PowerShell 5.1 (Add-Type), so this file stays within C# 5.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Automation;

namespace Aelion {
  public class HelperError : Exception {
    public string Code;
    public HelperError(string code, string message) : base(message) { Code = code; }
  }

  public static class DesktopHelper {
    delegate bool EnumProc(IntPtr window, IntPtr data);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION u; }

    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr data);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder text, int size);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder text, int size);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out RECT rect);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out RECT value, int size);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out int value, int size);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern uint GetDpiForSystem();
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref uint size);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr token, int kind, out int value, int size, out int returned);

    static readonly IntPtr PerMonitorV2 = new IntPtr(-4);
    static readonly HashSet<string> ShellClasses = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
      "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Progman", "WorkerW", "NotifyIconOverflowWindow",
      "TopLevelWindowForOverflowXamlIsland", "XamlExplorerHostIslandWindow"
    };
    static readonly Dictionary<string, string> Names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    static readonly Dictionary<long, List<AutomationElement>> Elements = new Dictionary<long, List<AutomationElement>>();
    static Dictionary<uint, string> exeCache = new Dictionary<uint, string>();
    static bool processAware;

    static void Dpi() {
      if (!processAware) SetThreadDpiAwarenessContext(PerMonitorV2);
    }

    // ---------- windows and the apps behind them ----------
    static string Text(IntPtr window) {
      StringBuilder text = new StringBuilder(512);
      GetWindowText(window, text, text.Capacity);
      return text.ToString();
    }
    static string ClassOf(IntPtr window) {
      StringBuilder text = new StringBuilder(256);
      GetClassName(window, text, text.Capacity);
      return text.ToString();
    }
    static uint PidOf(IntPtr window) {
      uint pid;
      GetWindowThreadProcessId(window, out pid);
      return pid;
    }
    static string ExePath(uint pid) {
      string cached;
      if (exeCache.TryGetValue(pid, out cached)) return cached;
      string path = "";
      IntPtr process = OpenProcess(0x1000, false, pid);
      if (process != IntPtr.Zero) {
        try {
          StringBuilder name = new StringBuilder(1024);
          uint size = (uint)name.Capacity;
          if (QueryFullProcessImageName(process, 0, name, ref size)) path = name.ToString();
        } finally { CloseHandle(process); }
      }
      exeCache[pid] = path;
      return path;
    }
    // A process this one cannot inspect is treated as elevated: input sent to it would be dropped anyway.
    static bool Elevated(uint pid) {
      IntPtr process = OpenProcess(0x1000, false, pid);
      if (process == IntPtr.Zero) return true;
      try {
        IntPtr token;
        if (!OpenProcessToken(process, 0x8, out token)) return true;
        try {
          int value, returned;
          if (!GetTokenInformation(token, 20, out value, 4, out returned)) return true;
          return value != 0;
        } finally { CloseHandle(token); }
      } finally { CloseHandle(process); }
    }
    // Store apps draw inside a frame owned by ApplicationFrameHost; the app is the process of the content inside it.
    static uint AppPid(IntPtr window) {
      uint pid = PidOf(window);
      if (!ExePath(pid).EndsWith("\\ApplicationFrameHost.exe", StringComparison.OrdinalIgnoreCase)) return pid;
      uint found = 0;
      EnumChildWindows(window, delegate(IntPtr child, IntPtr data) {
        uint other = PidOf(child);
        if (other == pid) return true;
        found = other;
        return false;
      }, IntPtr.Zero);
      return found == 0 ? pid : found;
    }
    static string AppName(string exe) {
      if (exe.Length == 0) return "";
      string name;
      if (Names.TryGetValue(exe, out name)) return name;
      name = Path.GetFileNameWithoutExtension(exe);
      try {
        FileVersionInfo info = FileVersionInfo.GetVersionInfo(exe);
        string described = (info.FileDescription ?? "").Trim();
        if (described.Length > 0 && described.Length <= 80) name = described;
      } catch { }
      Names[exe] = name;
      return name;
    }
    static HashSet<uint> AppPids(IntPtr window) {
      uint app = AppPid(window);
      string exe = ExePath(app);
      HashSet<uint> pids = new HashSet<uint>();
      pids.Add(app);
      pids.Add(PidOf(window));
      if (exe.Length == 0) return pids;
      foreach (Process process in Process.GetProcesses()) {
        try {
          if (string.Equals(ExePath((uint)process.Id), exe, StringComparison.OrdinalIgnoreCase)) pids.Add((uint)process.Id);
        } catch { } finally { process.Dispose(); }
      }
      return pids;
    }
    static bool Cloaked(IntPtr window) {
      int cloaked;
      return DwmGetWindowAttribute(window, 14, out cloaked, 4) == 0 && cloaked != 0;
    }
    static Rectangle Bounds(IntPtr window) {
      RECT rect;
      if (DwmGetWindowAttribute(window, 9, out rect, Marshal.SizeOf(typeof(RECT))) != 0 || rect.Right <= rect.Left)
        if (!GetWindowRect(window, out rect)) return Rectangle.Empty;
      return Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);
    }
    static Rectangle Screen() {
      return new Rectangle(GetSystemMetrics(76), GetSystemMetrics(77), GetSystemMetrics(78), GetSystemMetrics(79));
    }
    static IntPtr RootOwner(IntPtr window) { return GetAncestor(window, 3); }
    static bool Listed(IntPtr window) {
      if (!IsWindowVisible(window) || Cloaked(window)) return false;
      long style = GetWindowLongPtr(window, -20).ToInt64();
      if ((style & 0x80) != 0) return false;
      if (GetWindow(window, 4) != IntPtr.Zero && (style & 0x40000) == 0) return false;
      if (Text(window).Length == 0 || ShellClasses.Contains(ClassOf(window))) return false;
      Rectangle bounds = Bounds(window);
      return IsIconic(window) || (bounds.Width > 1 && bounds.Height > 1);
    }
    static Dictionary<string, object> Describe(IntPtr window) {
      uint pid = AppPid(window);
      string exe = ExePath(pid);
      Rectangle bounds = Bounds(window);
      Dictionary<string, object> info = new Dictionary<string, object>();
      info["id"] = window.ToInt64();
      info["title"] = Text(window);
      info["className"] = ClassOf(window);
      info["pid"] = pid;
      info["exe"] = exe;
      info["name"] = AppName(exe);
      info["minimized"] = IsIconic(window);
      info["foreground"] = Fronted(window);
      info["elevated"] = Elevated(pid);
      info["x"] = bounds.Left; info["y"] = bounds.Top; info["width"] = bounds.Width; info["height"] = bounds.Height;
      return info;
    }
    static bool Fronted(IntPtr window) {
      IntPtr front = GetForegroundWindow();
      if (front == IntPtr.Zero) return false;
      IntPtr root = GetAncestor(front, 2);
      return root == window || RootOwner(root == IntPtr.Zero ? front : root) == RootOwner(window);
    }
    static IntPtr Handle(Dictionary<string, object> request) {
      IntPtr window = new IntPtr(Convert.ToInt64(request["window"]));
      if (!IsWindow(window)) throw new HelperError("window_gone", "window no longer exists");
      return window;
    }
    // Whether the other window is the target itself, something it owns (a dialog, a menu), or a popup of the same app.
    static bool Owns(IntPtr target, IntPtr other, HashSet<uint> pids) {
      if (other == IntPtr.Zero) return false;
      IntPtr root = GetAncestor(other, 2);
      if (root == IntPtr.Zero) root = other;
      if (root == target || RootOwner(root) == RootOwner(target)) return true;
      if (pids == null) pids = AppPids(target);
      return pids.Contains(PidOf(root)) && !ShellClasses.Contains(ClassOf(root));
    }

    // ---------- operations ----------
    static object ListWindows() {
      List<object> result = new List<object>();
      EnumWindows(delegate(IntPtr window, IntPtr data) {
        if (Listed(window)) result.Add(Describe(window));
        return true;
      }, IntPtr.Zero);
      return result;
    }

    static object ListApps() {
      List<object> result = new List<object>();
      Exception failure = null;
      Thread thread = new Thread(delegate() {
        try {
          Type type = Type.GetTypeFromProgID("Shell.Application");
          object shell = Activator.CreateInstance(type);
          object folder = type.InvokeMember("NameSpace", BindingFlags.InvokeMethod, null, shell, new object[] { "shell:AppsFolder" });
          object items = folder.GetType().InvokeMember("Items", BindingFlags.InvokeMethod, null, folder, null);
          int count = Convert.ToInt32(items.GetType().InvokeMember("Count", BindingFlags.GetProperty, null, items, null));
          for (int i = 0; i < count; i++) {
            object item = items.GetType().InvokeMember("Item", BindingFlags.InvokeMethod, null, items, new object[] { i });
            Dictionary<string, object> app = new Dictionary<string, object>();
            app["name"] = Convert.ToString(item.GetType().InvokeMember("Name", BindingFlags.GetProperty, null, item, null));
            app["id"] = Convert.ToString(item.GetType().InvokeMember("Path", BindingFlags.GetProperty, null, item, null));
            result.Add(app);
          }
        } catch (Exception error) { failure = error; }
      });
      thread.SetApartmentState(ApartmentState.STA);
      thread.IsBackground = true;
      thread.Start();
      if (!thread.Join(20000)) throw new HelperError("timeout", "listing installed apps timed out");
      if (failure != null) throw failure;
      return result;
    }

    static object Launch(Dictionary<string, object> request) {
      string id = Convert.ToString(request["id"]);
      if (id.Length == 0 || id.IndexOf('"') >= 0) throw new HelperError("invalid", "invalid app id");
      ProcessStartInfo start = new ProcessStartInfo("explorer.exe", "\"shell:AppsFolder\\" + id + "\"");
      start.UseShellExecute = false;
      Process process = Process.Start(start);
      if (process != null) process.Dispose();
      return new Dictionary<string, object>();
    }

    static bool Activate(IntPtr window) {
      if (IsIconic(window)) { ShowWindow(window, 9); Thread.Sleep(250); }
      HashSet<uint> pids = AppPids(window);
      if (Owns(window, GetForegroundWindow(), pids)) return true;
      IntPtr foreground = GetForegroundWindow();
      uint unused, me = GetCurrentThreadId(), other = foreground == IntPtr.Zero ? 0 : GetWindowThreadProcessId(foreground, out unused);
      bool attached = other != 0 && other != me && AttachThreadInput(me, other, true);
      try {
        BringWindowToTop(window);
        SetForegroundWindow(window);
      } finally { if (attached) AttachThreadInput(me, other, false); }
      for (int i = 0; i < 2; i++) {
        for (int wait = 0; wait < 10; wait++) {
          if (Owns(window, GetForegroundWindow(), pids)) return true;
          Thread.Sleep(30);
        }
        // Windows refuses a background process the foreground unless it was the last to send input.
        Key(0x12, false); SetForegroundWindow(window); Key(0x12, true);
      }
      return Owns(window, GetForegroundWindow(), pids);
    }

    static void Send(INPUT input) {
      if (SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT))) != 1)
        throw new HelperError("input_blocked", "Windows rejected the input");
    }
    static void Key(int vk, bool up) {
      INPUT input = new INPUT();
      input.type = 1;
      input.u.ki.wVk = (ushort)vk;
      bool extended = (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0x5B;
      input.u.ki.dwFlags = (up ? 2u : 0u) | (extended ? 1u : 0u);
      Send(input);
    }
    static void Character(char value) {
      for (int i = 0; i < 2; i++) {
        INPUT input = new INPUT();
        input.type = 1;
        input.u.ki.wScan = value;
        input.u.ki.dwFlags = 4u | (i == 1 ? 2u : 0u);
        Send(input);
      }
    }
    static void Mouse(uint flags, int data) {
      INPUT input = new INPUT();
      input.type = 0;
      input.u.mi.dwFlags = flags;
      input.u.mi.mouseData = unchecked((uint)data);
      Send(input);
    }
    static readonly uint[] ButtonDown = { 0x2, 0x20, 0x8 }, ButtonUp = { 0x4, 0x40, 0x10 };

    static object Input(Dictionary<string, object> request) {
      IntPtr window = Handle(request);
      HashSet<uint> pids = AppPids(window);
      List<int> buttons = new List<int>(), keys = new List<int>();
      int done = 0;
      try {
        foreach (object raw in (System.Collections.IEnumerable)request["steps"]) {
          Dictionary<string, object> step = (Dictionary<string, object>)raw;
          string kind = Convert.ToString(step["t"]);
          if (kind == "move" || kind == "check") {
            int x = Convert.ToInt32(step["x"]), y = Convert.ToInt32(step["y"]);
            POINT point; point.X = x; point.Y = y;
            if (!step.ContainsKey("free") && !Owns(window, WindowFromPoint(point), pids))
              throw new HelperError("obscured", "another window covers that point");
            if (kind == "move") { SetCursorPos(x, y); Thread.Sleep(15); }
          } else if (kind == "down" || kind == "up") {
            int button = Convert.ToInt32(step["button"]);
            if (kind == "down") { Mouse(ButtonDown[button], 0); buttons.Add(button); }
            else { Mouse(ButtonUp[button], 0); buttons.Remove(button); }
          } else if (kind == "wheel") {
            int dy = Convert.ToInt32(step["dy"]), dx = Convert.ToInt32(step["dx"]);
            if (dy != 0) Mouse(0x800, dy * 120);
            if (dx != 0) Mouse(0x1000, dx * 120);
          } else if (kind == "key" || kind == "text") {
            if (!Owns(window, GetForegroundWindow(), pids)) throw new HelperError("not_foreground", "the app is no longer in front");
            if (kind == "key") {
              foreach (object vk in (System.Collections.IEnumerable)step["keys"]) { int code = Convert.ToInt32(vk); Key(code, false); keys.Add(code); }
              Thread.Sleep(20);
              for (int i = keys.Count - 1; i >= 0; i--) Key(keys[i], true);
              keys.Clear();
            } else {
              string text = Convert.ToString(step["text"]);
              for (int i = 0; i < text.Length; i++) {
                char value = text[i];
                if (value == '\r') continue;
                if (value == '\n') { Key(0x0D, false); Key(0x0D, true); }
                else if (value == '\t') { Key(0x09, false); Key(0x09, true); }
                else Character(value);
                if (i % 16 == 15) {
                  Thread.Sleep(8);
                  if (!Owns(window, GetForegroundWindow(), pids)) throw new HelperError("not_foreground", "the app is no longer in front");
                }
              }
            }
          } else if (kind == "sleep") {
            Thread.Sleep(Math.Min(2000, Math.Max(0, Convert.ToInt32(step["ms"]))));
          } else throw new HelperError("invalid", "unknown input step");
          done++;
        }
      } catch (HelperError error) {
        throw new HelperError(error.Code, error.Message + " (step " + done + ")");
      } finally {
        foreach (int button in buttons) { try { Mouse(ButtonUp[button], 0); } catch { } }
        for (int i = keys.Count - 1; i >= 0; i--) { try { Key(keys[i], true); } catch { } }
      }
      return new Dictionary<string, object>();
    }

    // The app's own windows as the screen shows them: the target plus what it has opened above itself.
    static List<IntPtr> Layers(IntPtr target, HashSet<uint> pids) {
      List<IntPtr> layers = new List<IntPtr>();
      Rectangle near = Rectangle.Inflate(Bounds(target), 400, 400);
      EnumWindows(delegate(IntPtr window, IntPtr data) {
        if (window == target) { layers.Add(window); return false; }
        if (!IsWindowVisible(window) || Cloaked(window) || IsIconic(window) || !Owns(target, window, pids)) return true;
        Rectangle bounds = Bounds(window);
        long style = GetWindowLongPtr(window, -20).ToInt64();
        // Another main window of the same app is a separate window to observe, not part of this one.
        bool popup = GetWindow(window, 4) != IntPtr.Zero || (style & 0x80) != 0 || Text(window).Length == 0;
        if (popup && bounds.Width > 0 && bounds.Height > 0 && bounds.IntersectsWith(near)) layers.Add(window);
        return true;
      }, IntPtr.Zero);
      if (layers.Count == 0 || layers[layers.Count - 1] != target) layers.Add(target);
      return layers;
    }

    static object Capture(Dictionary<string, object> request) {
      IntPtr target = Handle(request);
      string file = Convert.ToString(request["file"]);
      int maxEdge = Convert.ToInt32(request["maxEdge"]);
      bool text = request.ContainsKey("text") && Convert.ToBoolean(request["text"]);
      if (!Activate(target)) throw new HelperError("not_foreground", "the window could not be brought to the front");
      Thread.Sleep(60);
      HashSet<uint> pids = AppPids(target);
      List<IntPtr> layers = Layers(target, pids);
      Rectangle area = Rectangle.Empty;
      foreach (IntPtr layer in layers) area = area.IsEmpty ? Bounds(layer) : Rectangle.Union(area, Bounds(layer));
      area.Intersect(Screen());
      if (area.Width < 2 || area.Height < 2) throw new HelperError("not_visible", "the window is not on screen");
      double scale = Math.Min(1.0, (double)maxEdge / Math.Max(area.Width, area.Height));
      int width = Math.Max(1, (int)Math.Round(area.Width * scale)), height = Math.Max(1, (int)Math.Round(area.Height * scale));
      using (Bitmap full = new Bitmap(area.Width, area.Height, PixelFormat.Format24bppRgb)) {
        using (Graphics graphics = Graphics.FromImage(full)) {
          graphics.Clear(Color.Black);
          for (int i = layers.Count - 1; i >= 0; i--) {
            Rectangle part = Bounds(layers[i]);
            part.Intersect(area);
            if (part.Width > 0 && part.Height > 0)
              graphics.CopyFromScreen(part.Left, part.Top, part.Left - area.Left, part.Top - area.Top, part.Size);
          }
        }
        if (scale < 1.0) {
          using (Bitmap small = new Bitmap(width, height, PixelFormat.Format24bppRgb)) {
            using (Graphics graphics = Graphics.FromImage(small)) {
              graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
              graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
              using (ImageAttributes wrap = new ImageAttributes()) {
                wrap.SetWrapMode(WrapMode.TileFlipXY);
                graphics.DrawImage(full, new Rectangle(0, 0, width, height), 0, 0, full.Width, full.Height, GraphicsUnit.Pixel, wrap);
              }
            }
            small.Save(file, ImageFormat.Png);
          }
        } else full.Save(file, ImageFormat.Png);
      }
      Dictionary<string, object> result = Describe(target);
      result["originX"] = area.Left; result["originY"] = area.Top; result["scale"] = scale;
      result["imageWidth"] = width; result["imageHeight"] = height;
      if (text) {
        List<object> rects = new List<object>();
        List<AutomationElement> elements = new List<AutomationElement>();
        result["text"] = OnMta(delegate() { return Tree(layers, area, scale, rects, elements); }, 6000);
        result["elements"] = rects;
        Elements[target.ToInt64()] = elements;
      }
      return result;
    }

    // ---------- accessibility ----------
    delegate T Work<T>();
    static T OnMta<T>(Work<T> work, int timeout) {
      T value = default(T);
      Exception failure = null;
      Thread thread = new Thread(delegate() {
        try { Dpi(); value = work(); } catch (Exception error) { failure = error; }
      });
      thread.SetApartmentState(ApartmentState.MTA);
      thread.IsBackground = true;
      thread.Start();
      if (!thread.Join(timeout)) throw new HelperError("timeout", "the app did not answer the accessibility request in time");
      if (failure != null) throw failure;
      return value;
    }
    static readonly HashSet<string> Interactive = new HashSet<string> {
      "Button", "CheckBox", "ComboBox", "Edit", "Hyperlink", "ListItem", "MenuItem", "RadioButton", "Slider", "Spinner",
      "SplitButton", "TabItem", "TreeItem", "DataItem", "Document"
    };
    static string Short(string value, int limit) {
      value = (value ?? "").Replace('\r', ' ').Replace('\n', ' ').Replace('"', '\'').Trim();
      return value.Length > limit ? value.Substring(0, limit) + "..." : value;
    }
    static string Tree(List<IntPtr> layers, Rectangle area, double scale, List<object> rects, List<AutomationElement> elements) {
      CacheRequest cache = new CacheRequest();
      cache.TreeFilter = Automation.ControlViewCondition;
      cache.Add(AutomationElement.ControlTypeProperty);
      cache.Add(AutomationElement.NameProperty);
      cache.Add(AutomationElement.BoundingRectangleProperty);
      cache.Add(AutomationElement.IsEnabledProperty);
      cache.Add(AutomationElement.IsOffscreenProperty);
      cache.Add(AutomationElement.HasKeyboardFocusProperty);
      cache.Add(ValuePattern.ValueProperty);
      TreeWalker walker = new TreeWalker(Automation.ControlViewCondition);
      StringBuilder output = new StringBuilder();
      Stopwatch clock = Stopwatch.StartNew();
      bool cut = false;
      foreach (IntPtr layer in layers) {
        try {
          AutomationElement root;
          using (cache.Activate()) root = AutomationElement.FromHandle(layer);
          cut |= Visit(root, 0, walker, cache, area, scale, rects, elements, output, clock);
        } catch (Exception) { }
      }
      if (cut) output.Append("(more elements were not listed)\n");
      return output.ToString();
    }
    static bool Visit(AutomationElement element, int depth, TreeWalker walker, CacheRequest cache, Rectangle area, double scale,
      List<object> rects, List<AutomationElement> elements, StringBuilder output, Stopwatch clock) {
      if (elements.Count >= 400 || clock.ElapsedMilliseconds > 4500) return true;
      bool cut = false;
      try {
        if (depth > 0 && element.Cached.IsOffscreen) return false;
        string type = element.Cached.ControlType.ProgrammaticName.Replace("ControlType.", "");
        string name = Short(element.Cached.Name, 80);
        object raw = element.GetCachedPropertyValue(ValuePattern.ValueProperty, true);
        string value = raw == AutomationElement.NotSupported ? "" : Short(Convert.ToString(raw), 80);
        System.Windows.Rect box = element.Cached.BoundingRectangle;
        bool placed = !box.IsEmpty && box.Width >= 1 && box.Height >= 1 &&
          box.Right > area.Left && box.Left < area.Right && box.Bottom > area.Top && box.Top < area.Bottom;
        if (placed && (name.Length > 0 || value.Length > 0 || Interactive.Contains(type))) {
          int x = (int)Math.Round((box.Left - area.Left) * scale), y = (int)Math.Round((box.Top - area.Top) * scale);
          int w = Math.Max(1, (int)Math.Round(box.Width * scale)), h = Math.Max(1, (int)Math.Round(box.Height * scale));
          output.Append(' ', Math.Min(depth, 12)).Append(elements.Count).Append(' ').Append(type);
          if (name.Length > 0) output.Append(" \"").Append(name).Append('"');
          if (value.Length > 0 && value != name) output.Append(" = \"").Append(value).Append('"');
          if (!element.Cached.IsEnabled) output.Append(" (disabled)");
          if (element.Cached.HasKeyboardFocus) output.Append(" (focused)");
          output.Append(" [").Append(x).Append(',').Append(y).Append(' ').Append(w).Append('x').Append(h).Append("]\n");
          rects.Add(new int[] { x, y, w, h });
          elements.Add(element);
        }
        AutomationElement child = walker.GetFirstChild(element, cache);
        while (child != null) {
          cut |= Visit(child, depth + 1, walker, cache, area, scale, rects, elements, output, clock);
          if (elements.Count >= 400 || clock.ElapsedMilliseconds > 4500) return true;
          child = walker.GetNextSibling(child, cache);
        }
      } catch (ElementNotAvailableException) { } catch (InvalidOperationException) { }
      return cut;
    }
    static object SetValue(Dictionary<string, object> request) {
      IntPtr window = Handle(request);
      int index = Convert.ToInt32(request["element"]);
      string value = Convert.ToString(request["value"]);
      List<AutomationElement> elements;
      if (!Elements.TryGetValue(window.ToInt64(), out elements) || index < 0 || index >= elements.Count)
        throw new HelperError("element_stale", "element is not part of the latest observation");
      AutomationElement element = elements[index];
      return OnMta<object>(delegate() {
        object pattern;
        if (!element.TryGetCurrentPattern(ValuePattern.Pattern, out pattern))
          throw new HelperError("unsupported", "this element does not accept a value");
        ValuePattern target = (ValuePattern)pattern;
        if (target.Current.IsReadOnly) throw new HelperError("unsupported", "this element is read-only");
        target.SetValue(value);
        return new Dictionary<string, object>();
      }, 6000);
    }

    // ---------- protocol: one JSON object per line, ASCII only ----------
    static string Ascii(string json) {
      StringBuilder text = new StringBuilder(json.Length + 16);
      foreach (char value in json) {
        if (value < 0x20 || value > 0x7E) text.Append("\\u").Append(((int)value).ToString("x4"));
        else text.Append(value);
      }
      return text.ToString();
    }
    static object Dispatch(string op, Dictionary<string, object> request) {
      if (op == "ping") {
        Dictionary<string, object> info = new Dictionary<string, object>();
        Rectangle screen = Screen();
        info["pid"] = Process.GetCurrentProcess().Id;
        info["elevated"] = Elevated((uint)Process.GetCurrentProcess().Id);
        info["dpi"] = GetDpiForSystem();
        info["processAware"] = processAware;
        info["screen"] = new int[] { screen.Left, screen.Top, screen.Width, screen.Height };
        return info;
      }
      if (op == "list_windows") return ListWindows();
      if (op == "list_apps") return ListApps();
      if (op == "launch") return Launch(request);
      if (op == "window") return Describe(Handle(request));
      if (op == "foreground") {
        IntPtr window = GetForegroundWindow();
        return window == IntPtr.Zero ? null : Describe(GetAncestor(window, 3));
      }
      if (op == "activate") {
        Dictionary<string, object> result = new Dictionary<string, object>();
        result["foreground"] = Activate(Handle(request));
        return result;
      }
      if (op == "capture") return Capture(request);
      if (op == "input") return Input(request);
      if (op == "set_value") return SetValue(request);
      throw new HelperError("invalid", "unknown operation");
    }
    public static void Run(TextReader reader) {
      processAware = SetProcessDpiAwarenessContext(PerMonitorV2);
      Dpi();
      JavaScriptSerializer json = new JavaScriptSerializer();
      json.MaxJsonLength = 64 * 1024 * 1024;
      StreamWriter writer = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
      writer.AutoFlush = true;
      writer.WriteLine("{\"ready\":true}");
      string line;
      while ((line = reader.ReadLine()) != null) {
        if (line.Length == 0) continue;
        Dictionary<string, object> reply = new Dictionary<string, object>();
        try {
          Dictionary<string, object> request = json.Deserialize<Dictionary<string, object>>(line);
          reply["id"] = request["id"];
          exeCache = new Dictionary<uint, string>();
          reply["result"] = Dispatch(Convert.ToString(request["op"]), request);
          reply["ok"] = true;
        } catch (HelperError error) {
          reply["ok"] = false; reply["code"] = error.Code; reply["error"] = error.Message;
        } catch (Exception error) {
          reply["ok"] = false; reply["code"] = "failed"; reply["error"] = error.Message;
        }
        writer.WriteLine(Ascii(json.Serialize(reply)));
      }
    }
  }
}
`;
