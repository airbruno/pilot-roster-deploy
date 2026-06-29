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
  "manifest.webmanifest",
  "service-worker.js",
  "icons/app-icon.svg",
  "icons/app-icon-maskable.svg",
  "config.js",
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

const serviceWorkerCheck = spawnSync("node", ["--check", path.join(frontendRoot, "service-worker.js")], {
  encoding: "utf8",
});
if (serviceWorkerCheck.status !== 0) {
  process.stderr.write(serviceWorkerCheck.stderr || serviceWorkerCheck.stdout);
  process.exit(serviceWorkerCheck.status || 1);
}

const rootHtml = await readFile(path.join(frontendRoot, "index.html"), "utf8");
const pilotHtml = await readFile(path.join(frontendRoot, "piloto/index.html"), "utf8");
const css = await readFile(path.join(frontendRoot, "styles.css"), "utf8");
const serviceWorker = await readFile(path.join(frontendRoot, "service-worker.js"), "utf8");

const checks = [
  [rootHtml.includes('id="pilotLogin"'), "index.html precisa conter a tela de login"],
  [pilotHtml.includes('id="pilotLogin"'), "piloto/index.html precisa conter a tela de login"],
  [rootHtml.includes('id="googleLoginButton"'), "index.html precisa conter login com Google"],
  [pilotHtml.includes('id="googleLoginButton"'), "piloto/index.html precisa conter login com Google"],
  [rootHtml.includes('id="passwordAccessButton"'), "index.html precisa conter acesso sem Google"],
  [pilotHtml.includes('id="passwordAccessButton"'), "piloto/index.html precisa conter acesso sem Google"],
  [rootHtml.includes('id="familyCreatedModal"'), "index.html precisa conter modal de conta familiar criada"],
  [pilotHtml.includes('id="familyCreatedModal"'), "piloto/index.html precisa conter modal de conta familiar criada"],
  [!rootHtml.includes('id="upcomingDays"'), "index.html nao deve conter visão de próximos dias"],
  [!pilotHtml.includes('id="upcomingDays"'), "piloto/index.html nao deve conter visão de próximos dias"],
  [rootHtml.includes('src="config.js"'), "index.html precisa carregar config.js"],
  [pilotHtml.includes('src="../config.js"'), "piloto/index.html precisa carregar ../config.js"],
  [rootHtml.includes('rel="manifest"'), "index.html precisa carregar o manifest"],
  [pilotHtml.includes('rel="manifest"'), "piloto/index.html precisa carregar o manifest"],
  [rootHtml.includes('href="/piloto/"'), "index.html precisa apontar para /piloto/"],
  [pilotHtml.includes('href="/"'), "piloto/index.html precisa apontar para o portal da família"],
  [pilotHtml.includes("../app.js"), "piloto/index.html precisa carregar ../app.js"],
  [css.includes(".today-fab"), "styles.css precisa conter o botao Hoje"],
  [css.includes(".google-login"), "styles.css precisa conter estilo do login Google"],
  [css.includes(".password-login-panel"), "styles.css precisa conter painel de acesso sem Google"],
  [css.includes(".modal-overlay"), "styles.css precisa conter modal"],
  [css.includes(".login-screen"), "styles.css precisa conter estilos do login"],
  [css.includes("grid-template-columns: 42px minmax(0, 1fr) 42px"), "seletor de mes precisa manter tres colunas no mobile"],
  [serviceWorker.includes("escala-familiar-v22"), "service-worker.js precisa estar na versão de cache atual"],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error("Falhas no check estatico:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Check estatico aprovado.");
