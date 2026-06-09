import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, stat } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.join(repoRoot, "frontend");
const requestedPort = Number(process.env.VISUAL_PORT || 0);
const providedUrl = process.env.VISUAL_URL || "";
const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputDir = process.env.VISUAL_OUTPUT_DIR || path.join(repoRoot, "artifacts");
const output = path.join(outputDir, "family-mobile.png");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function serveFile(requestPath, response) {
  const cleanPath = decodeURIComponent(requestPath.split("?")[0]).replace(/^\/+/, "");
  const relativePath = cleanPath === "" ? "index.html" : cleanPath;
  const filePath = path.resolve(frontendRoot, relativePath);

  if (!filePath.startsWith(frontendRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  let targetPath = filePath;
  try {
    const info = await stat(targetPath);
    if (info.isDirectory()) targetPath = path.join(targetPath, "index.html");
  } catch {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes[path.extname(targetPath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(targetPath).pipe(response);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", () => resolve(server.address().port));
  });
}

const server = createServer((request, response) => {
  serveFile(request.url || "/", response).catch((error) => {
    response.writeHead(500);
    response.end(error.message);
  });
});

try {
  let url = providedUrl;
  if (!url) {
    let port;
    try {
      port = await listen(server);
    } catch (error) {
      throw new Error(`Nao foi possivel abrir servidor local (${error.code || error.message}). Rode com VISUAL_URL=http://localhost:4173/ npm run check:visual se o app ja estiver aberto.`);
    }
    url = `http://127.0.0.1:${port}/?visual-check=${Date.now()}`;
  }
  await mkdir(outputDir, { recursive: true });
  const tmpProfile = await mkdtemp(path.join(os.tmpdir(), "pilot-roster-chrome-"));
  const shot = spawnSync(chrome, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    `--user-data-dir=${tmpProfile}`,
    "--window-size=390,900",
    `--screenshot=${output}`,
    url,
  ], { encoding: "utf8" });

  if (shot.error) {
    throw shot.error;
  }
  if (shot.status !== 0) {
    process.stderr.write(shot.stderr || shot.stdout || `Chrome saiu com status ${shot.status}; signal ${shot.signal || "desconhecido"}.\n`);
    process.exit(shot.status || 1);
  }

  const info = await stat(output);
  if (info.size < 10000) {
    throw new Error(`Screenshot pequeno demais (${info.size} bytes): ${output}`);
  }

  console.log(`Screenshot mobile gerado: ${output}`);
} finally {
  server.close();
}
