import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.join(repoRoot, "frontend");

const requiredFiles = [
  "index.html",
  "piloto/index.html",
  "app.js",
  "styles.css",
  "config.js",
  "vercel.json",
];

for (const file of requiredFiles) {
  await access(path.join(frontendRoot, file));
}

const appCheck = spawnSync("node", ["--check", path.join(frontendRoot, "app.js")], {
  encoding: "utf8",
});
if (appCheck.status !== 0) {
  process.stderr.write(appCheck.stderr || appCheck.stdout);
  process.exit(appCheck.status || 1);
}

const rootHtml = await readFile(path.join(frontendRoot, "index.html"), "utf8");
const pilotHtml = await readFile(path.join(frontendRoot, "piloto/index.html"), "utf8");
const css = await readFile(path.join(frontendRoot, "styles.css"), "utf8");

const checks = [
  [rootHtml.includes('id="pilotLogin"'), "index.html precisa conter a tela de login"],
  [pilotHtml.includes('id="pilotLogin"'), "piloto/index.html precisa conter a tela de login"],
  [rootHtml.includes('href="/piloto/"'), "index.html precisa apontar para /piloto/"],
  [pilotHtml.includes("../app.js"), "piloto/index.html precisa carregar ../app.js"],
  [css.includes(".today-fab"), "styles.css precisa conter o botao Hoje"],
  [css.includes(".login-screen"), "styles.css precisa conter estilos do login"],
  [css.includes("grid-template-columns: 42px minmax(0, 1fr) 42px"), "seletor de mes precisa manter tres colunas no mobile"],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error("Falhas no check estatico:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Check estatico aprovado.");
