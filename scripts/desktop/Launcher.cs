using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading;
using System.Windows.Forms;

#if TAEHWA_V3
[assembly: AssemblyTitle("태화기업 업무자동화 3차")]
[assembly: AssemblyProduct("태화기업 업무자동화 3차")]
[assembly: AssemblyVersion("3.0.0.0")]
#else
[assembly: AssemblyTitle("태화기업 문서작업실")]
[assembly: AssemblyProduct("태화기업 문서작업실")]
[assembly: AssemblyVersion("1.1.0.0")]
#endif

internal static class Launcher
{
#if TAEHWA_V3
    private const string Title = "태화기업 업무자동화 3차";
    private const string Site = "http://127.0.0.1:8893/";
    private const string Mode = " --v3";
    private const string DirectoryName = "TaehwaDocumentWorkspaceV3";
#else
    private const string Title = "태화기업 문서작업실";
    private const string Site = "http://127.0.0.1:8888/";
    private const string Mode = "";
    private const string DirectoryName = "TaehwaDocumentWorkspace";
#endif
    private static readonly string DataDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        DirectoryName);

    [STAThread]
    private static int Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Process server = null;

        try
        {
            using (var startup = new Mutex(false, @"Local\" + DirectoryName + "Startup"))
            {
                TakeStartupLock(startup);
                try
                {
                    if (!ServerReady())
                    {
                        server = StartLocalServer();
                        WaitForServer(server);
                    }
                    OpenWorkspace(false);
                }
                finally
                {
                    startup.ReleaseMutex();
                }
            }

            if (server != null)
            {
                using (var desktop = CreateDesktopMenu())
                    Application.Run(desktop);
            }
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            if (server != null)
            {
                try { server.StandardInput.Close(); }
                catch (IOException) { }
                finally { server.Dispose(); }
            }
        }
    }

    private static void TakeStartupLock(Mutex startup)
    {
        try
        {
            if (!startup.WaitOne(TimeSpan.FromSeconds(40)))
                throw new InvalidOperationException("문서작업실이 시작 중입니다. 잠시 후 다시 열어 주세요.");
        }
        catch (AbandonedMutexException)
        {
            // Windows transfers ownership when a previous launcher stopped during startup.
        }
    }

    private static bool ServerReady()
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(Site + "api/health");
            request.Proxy = null;
            request.Timeout = 500;
            request.ReadWriteTimeout = 500;
            using (var response = request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
            {
                string health = reader.ReadToEnd();
                return health.Contains("\"service\":\"taehwa-document-workspace\"") &&
                    (Mode.Length == 0 || health.Contains("\"edition\":3"));
            }
        }
        catch (WebException)
        {
            return false;
        }
    }

    private static void WaitForServer(Process server)
    {
        for (int attempt = 0; attempt < 70 && !server.HasExited; attempt++)
        {
            if (ServerReady()) return;
            Thread.Sleep(100);
        }
        throw new InvalidOperationException("로컬 서버를 시작하지 못했습니다. 다른 프로그램이 포트 " + new Uri(Site).Port + "을 사용하고 있는지 확인해 주세요.");
    }

    private static Process StartLocalServer()
    {
        string runtime = PrepareRuntime();
        var settings = new ProcessStartInfo
        {
            FileName = Path.Combine(runtime, "node.exe"),
            WorkingDirectory = runtime,
            Arguments = "\"--env-file-if-exists=" + ConfigPath() + "\" scripts\\serve.mjs --desktop" + Mode,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true
        };
        settings.EnvironmentVariables.Remove("NODE_OPTIONS");
        settings.EnvironmentVariables.Remove("NODE_PATH");
        return Process.Start(settings);
    }

    private static string PrepareRuntime()
    {
        using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("WorkspacePayload.zip"))
        using (var hash = SHA256.Create())
        {
            string fingerprint = BitConverter.ToString(hash.ComputeHash(payload), 0, 12).Replace("-", "");
            payload.Position = 0;
            string runtime = Path.Combine(DataDirectory, "runtime-" + fingerprint);
            if (Directory.Exists(runtime)) return runtime;

            string staging = Path.Combine(DataDirectory, "staging-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(staging);
            try
            {
                using (var archive = new ZipArchive(payload, ZipArchiveMode.Read))
                    archive.ExtractToDirectory(staging);
                Directory.Move(staging, runtime);
            }
            finally
            {
                if (Directory.Exists(staging)) Directory.Delete(staging, true);
            }
            return runtime;
        }
    }

    private static void OpenWorkspace(bool inBrowser)
    {
        string[] directories = {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
        };
        foreach (string directory in directories)
        {
            if (String.IsNullOrEmpty(directory)) continue;
            string edge = Path.Combine(directory, @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edge)) continue;
            Process.Start(new ProcessStartInfo(edge, (inBrowser ? "" : "--app=") + Site) {
                WorkingDirectory = Path.GetDirectoryName(edge),
                UseShellExecute = false
            });
            return;
        }
        Process.Start(new ProcessStartInfo(Site) { UseShellExecute = true });
    }

    private static string ConfigPath()
    {
        string adjacent = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".env");
        return File.Exists(adjacent) ? adjacent : Path.Combine(DataDirectory, ".env");
    }

    private static void OpenSettings()
    {
        string path = ConfigPath();
        if (!File.Exists(path))
            File.WriteAllText(path, "OPENAI_API_KEY=\r\nOPENAI_MODEL=gpt-4o-mini\r\n");
        string notepad = Path.Combine(Environment.SystemDirectory, "notepad.exe");
        Process.Start(new ProcessStartInfo(notepad, "\"" + path + "\"") { UseShellExecute = false });
        MessageBox.Show("API 키를 저장한 뒤 알림 영역에서 문서작업실을 종료하고 다시 실행해 주세요.", Title);
    }

    private static ApplicationContext CreateDesktopMenu()
    {
        var context = new ApplicationContext();
        var menu = new ContextMenuStrip();
        var icon = new NotifyIcon
        {
            Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location) ?? SystemIcons.Application,
            Text = Title,
            ContextMenuStrip = menu,
            Visible = true
        };
        menu.Items.Add("앱 창 열기", null, delegate { RunMenuAction(() => OpenWorkspace(false)); });
        menu.Items.Add("웹으로 열기", null, delegate { RunMenuAction(() => OpenWorkspace(true)); });
        menu.Items.Add("OpenAI 설정 파일 열기", null, delegate { RunMenuAction(OpenSettings); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("종료", null, delegate { context.ExitThread(); });
        icon.DoubleClick += delegate { RunMenuAction(() => OpenWorkspace(false)); };
        context.ThreadExit += delegate
        {
            icon.Visible = false;
            icon.Dispose();
            menu.Dispose();
        };
        return context;
    }

    private static void RunMenuAction(Action action)
    {
        try { action(); }
        catch (Exception error) { MessageBox.Show(error.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}
