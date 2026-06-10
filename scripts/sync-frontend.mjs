import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(repoRoot, "../..");
const sourceRoot = path.join(workspaceRoot, "outputs/pilot-schedule-app");
const targetRoot = path.join(repoRoot, "frontend");

const files = [
  ["app.js", "app.js"],
  ["styles.css", "styles.css"],
  ["manifest.webmanifest", "manifest.webmanifest"],
  ["service-worker.js", "service-worker.js"],
  ["index.html", "index.html"],
  ["piloto/index.html", "piloto/index.html"],
  ["icons/app-icon.svg", "icons/app-icon.svg"],
  ["icons/app-icon-maskable.svg", "icons/app-icon-maskable.svg"],
];

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

for (const [source, target] of files) {
  const sourcePath = path.join(sourceRoot, source);
  const targetPath = path.join(targetRoot, target);
  if (!(await exists(sourcePath))) {
    throw new Error(`Arquivo fonte nao encontrado: ${sourcePath}`);
  }
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
  console.log(`sincronizado: ${source} -> frontend/${target}`);
}

console.log("Frontend sincronizado com o prototipo local.");
