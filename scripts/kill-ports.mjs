import { execSync } from "node:child_process";

const PORTS = [4000, 4001, 4002, 4003, 4004];
const isWindows = process.platform === "win32";

function listeningPids() {
  const pids = new Set();

  if (isWindows) {
    const out = execSync("netstat -ano", { encoding: "utf8" });
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      for (const port of PORTS) {
        if (new RegExp(`:${port}\\s`).test(line)) {
          const parts = line.trim().split(/\s+/);
          const pid = Number(parts[parts.length - 1]);
          if (pid > 0) pids.add(pid);
        }
      }
    }
    return [...pids];
  }

  for (const port of PORTS) {
    let out = "";
    try {
      out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
        encoding: "utf8",
      });
    } catch {
      // lsof sale con código 1 cuando nadie escucha ese puerto
    }
    for (const line of out.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (pid > 0) pids.add(pid);
    }
  }
  return [...pids];
}

function sleep(ms) {
  if (isWindows) {
    execSync(
      `powershell -NoProfile -Command "Start-Sleep -Milliseconds ${ms}"`,
    );
    return;
  }
  execSync(`sleep ${ms / 1000}`);
}

const pids = listeningPids();
if (!pids.length) {
  console.log("[kill-ports] 4000-4004 ya libres");
  process.exit(0);
}

console.log(`[kill-ports] matando PID: ${pids.join(", ")}`);
for (const pid of pids) {
  try {
    if (isWindows) {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "inherit" });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: "inherit" });
    }
  } catch {
    // proceso ya muerto
  }
}

sleep(1200);

const left = listeningPids();
if (left.length) {
  console.error(`[kill-ports] aún ocupados por: ${left.join(", ")}`);
  process.exit(1);
}
console.log("[kill-ports] listo");
