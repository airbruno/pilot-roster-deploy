import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(repoRoot, "backend/server.py");
const serverSource = await readFile(serverPath, "utf8");

const requiredSnippets = [
  "PILOT_TOKEN",
  "/api/health",
  "/api/extract-pdf",
  "/api/roster",
  "/api/roster/public",
  "X-Pilot-Token",
  "Access-Control-Allow-Origin",
];

const missing = requiredSnippets.filter((snippet) => !serverSource.includes(snippet));
if (missing.length) {
  console.error("Backend sem trechos esperados:");
  missing.forEach((snippet) => console.error(`- ${snippet}`));
  process.exit(1);
}

const compile = spawnSync("python3", ["-m", "py_compile", serverPath], {
  encoding: "utf8",
});
if (compile.status !== 0) {
  process.stderr.write(compile.stderr || compile.stdout);
  process.exit(compile.status || 1);
}

const healthUrl = process.env.API_HEALTH_URL;
if (healthUrl) {
  const health = spawnSync("curl", ["-fsS", healthUrl], { encoding: "utf8" });
  if (health.status !== 0) {
    process.stderr.write(health.stderr || health.stdout);
    process.exit(health.status || 1);
  }
  console.log(`Health remoto aprovado: ${healthUrl}`);
}

console.log("Check backend aprovado.");
