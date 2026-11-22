import { spawn } from "node:child_process";
import { mkdir, mkdtemp, open, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const INSTALLER = "https://ollama.com/download/OllamaSetup.exe";
const MAX_INSTALLER = 8 * 1024 ** 3;
const DOWNLOAD_HOSTS = new Set([
  "ollama.com", "github.com", "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
]);
const failure = (code, status = 502) => Object.assign(new Error(code), { status });

export function createAssistantRuntime({
  directory,
  platform = process.platform,
  env = process.env,
  fetchImpl = fetch,
  spawnImpl = spawn,
  statImpl = stat,
  downloadLimit = MAX_INSTALLER,
} = {}) {
  const powershell = path.join(env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  async function executable() {
    const directories = [
      path.join(env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"), "Programs", "Ollama"),
      ...(env.PATH || env.Path || "").split(path.delimiter),
    ];
    for (const folder of new Set(directories.filter(Boolean))) {
      const file = path.resolve(folder, platform === "win32" ? "ollama.exe" : "ollama");
      if (await statImpl(file).then(item => item.isFile(), () => false)) return file;
    }
    return null;
  }
  async function run(file, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawnImpl(file, args, {
        shell: false, windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
        ...options,
      });
      let output = "";
      child.stdout?.on("data", chunk => {
        output += chunk.toString();
        if (output.length > 8192) child.kill();
      });
      child.once("error", reject);
      child.once("close", code => code === 0 && output.length <= 8192
        ? resolve(output) : reject(failure("ai_setup_install")));
    });
  }
  async function download(file, signal, onProgress) {
    let url = INSTALLER;
    let response;
    for (let redirects = 0; redirects <= 5; redirects++) {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password ||
        !DOWNLOAD_HOSTS.has(parsed.hostname)) throw failure("ai_setup_download");
      response = await fetchImpl(url, { signal, redirect: "manual" });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === 5) throw failure("ai_setup_download");
      url = new URL(location, url).href;
    }
    if (!response.ok || !response.body) throw failure("ai_setup_download");
    const total = Number(response.headers.get("content-length")) || 0;
    if (total < 0 || total > downloadLimit) throw failure("ai_setup_download");
    const output = await open(file, "wx", 0o600);
    let completed = 0;
    try {
      onProgress({ phase: "downloading_runtime", completed, total, cancellable: true });
      for await (const chunk of response.body) {
        signal.throwIfAborted();
        completed += chunk.length;
        if (completed > downloadLimit) throw failure("ai_setup_download");
        await output.writeFile(chunk);
        onProgress({ phase: "downloading_runtime", completed, total, cancellable: true });
      }
      signal.throwIfAborted();
      if (!completed || total && completed !== total) throw failure("ai_setup_download");
    } finally {
      await output.close();
    }
  }
  return {
    async inspect() {
      return { installed: !!await executable(), canInstall: platform === "win32" };
    },
    async ensure({ signal, onProgress }) {
      if (platform !== "win32") throw failure("ai_setup_unavailable", 503);
      signal.throwIfAborted();
      let cli = await executable();
      if (!cli) {
        await mkdir(directory, { recursive: true });
        const temporary = await mkdtemp(path.join(directory, "ollama-"));
        try {
          const installer = path.join(temporary, "OllamaSetup.exe");
          const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(60 * 60 * 1000)]);
          await download(installer, downloadSignal, onProgress);
          onProgress({ phase: "verifying", completed: 0, total: 0, cancellable: true });
          const script = "$s=Get-AuthenticodeSignature -LiteralPath $env:PROJISPACE_INSTALLER_PATH; @{Status=[string]$s.Status;Subject=[string]$s.SignerCertificate.Subject}|ConvertTo-Json -Compress";
          let signature;
          try {
            signature = JSON.parse(await run(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], {
              env: { ...env, PROJISPACE_INSTALLER_PATH: installer }, signal: downloadSignal,
            }));
          } catch { throw failure("ai_setup_signature"); }
          if (signature.Status !== "Valid" || !/(?:^|,)\s*CN=Ollama Inc\.(?:,|$)/i.test(signature.Subject || ""))
            throw failure("ai_setup_signature");
          signal.throwIfAborted();
          // Do not terminate an installer after it starts writing the installation.
          onProgress({ phase: "installing", completed: 0, total: 0, cancellable: false });
          await run(installer, ["/VERYSILENT", "/NORESTART", "/SP-"]);
          cli = await executable();
          if (!cli) throw failure("ai_setup_install");
        } finally {
          await rm(temporary, { recursive: true, force: true });
        }
      }
      signal.throwIfAborted();
      onProgress({ phase: "starting", completed: 0, total: 0, cancellable: true });
      // A hidden console is inherited by Ollama's hardware probes; a detached
      // console-less server lets those children create flashing console windows.
      // Start-Process also keeps the service independent of ProjiSpace's lifetime.
      try {
        await run(powershell, ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command",
          "Start-Process -FilePath $env:PROJISPACE_OLLAMA_PATH -ArgumentList 'serve' -WindowStyle Hidden -ErrorAction Stop | Out-Null"], {
          signal,
          env: { ...env, OLLAMA_HOST: "127.0.0.1:11434", PROJISPACE_OLLAMA_PATH: cli },
        });
      } catch { throw failure("ai_setup_install"); }
    },
  };
}
