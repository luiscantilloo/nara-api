import fs from "fs";
import path from "path";

const srcPath = path.resolve("../nara-web/.env.local");
const map = {};
if (fs.existsSync(srcPath)) {
  for (const line of fs.readFileSync(srcPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map[m[1]] = m[2];
  }
}
const out = [
  "PORT=4000",
  "NARA_GATEWAY_PORT=4000",
  "NARA_AUTH_PORT=4001",
  "NARA_PEOPLE_PORT=4002",
  "NARA_OPS_PORT=4003",
  "NARA_AI_PORT=4004",
  "NARA_MS_HOST=127.0.0.1",
  "CORS_ORIGIN=http://localhost:3002,http://127.0.0.1:3002",
  `MONGODB_URI=${map.MONGODB_URI || ""}`,
  `MONGODB_DB=${map.MONGODB_DB || "nara"}`,
  `AUTH_SECRET=${map.AUTH_SECRET || ""}`,
  `GEMINI_API_KEY=${map.GEMINI_API_KEY || ""}`,
  `GEMINI_MODEL=${map.GEMINI_MODEL || "gemini-2.5-flash"}`,
  "",
].join("\n");
fs.writeFileSync(".env", out);
console.log("wrote .env (gitignored)");
