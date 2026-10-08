import { execSync } from "node:child_process";

const PORTS = [4000, 4001, 4002, 4003, 4004];

function listeningPids() {
  const out = execSync("netstat -ano", { encoding: "utf8" });
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    for (const port of PORTS) {
      // match ":4000 " in the local address column
      if (new RegExp(`:${port}\\s`).test(line)) {
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (pid > 0) pids.add(pid);
      }
    }
  }
  return [...pids];
}

const pids = listeningPids();
if (!pids.length) {
  console.log("[kill-ports] 4000-4004 ya libres");
  process.exit(0);
}

console.log(`[kill-ports] matando PID: ${pids.join(", ")}`);
for (const pid of pids) {
  try {
    execSync(`taskkill /F /PID ${pid}`, { stdio: "inherit" });
  } catch {
    // proceso ya muerto
  }
}

execSync("powershell -NoProfile -Command \"Start-Sleep -Milliseconds 1200\"");

const left = listeningPids();
if (left.length) {
  console.error(`[kill-ports] aún ocupados por: ${left.join(", ")}`);
  process.exit(1);
}
console.log("[kill-ports] listo");
