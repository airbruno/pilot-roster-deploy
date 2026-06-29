import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPath = path.join(repoRoot, "frontend", "app.js");
const noop = () => {};
const fakeElement = {
  value: "",
  textContent: "",
  hidden: false,
  className: "",
  classList: { add: noop, remove: noop, toggle: noop },
  addEventListener: noop,
  closest: () => null,
  focus: noop,
};

const sandbox = {
  console,
  crypto: { randomUUID: () => "test-id" },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  window: {
    APP_CONFIG: {},
    location: { search: "", pathname: "/", hostname: "localhost", origin: "http://localhost" },
    addEventListener: noop,
    firebase: null,
  },
  document: {
    querySelector: () => fakeElement,
    body: { classList: { toggle: noop } },
  },
  navigator: { onLine: true, serviceWorker: { addEventListener: noop } },
  requestAnimationFrame: (fn) => fn(),
  Intl,
  Date,
  TextEncoder,
  TextDecoder,
  atob: (value) => Buffer.from(value, "base64").toString("binary"),
  btoa: (value) => Buffer.from(value, "binary").toString("base64"),
};

vm.createContext(sandbox);
const source = (await readFile(appPath, "utf8")).replace(/\ninit\(\);\s*$/, "\n");
vm.runInContext(source, sandbox);

const fixture = `
Escala 2026
11-Jul-2026 DR GRU 00:00 23:59
12-Jul-2026 VC GRU 00:00 23:59
13-Jul-2026 SICK GRU 00:00 23:59
14-Jul-2026 WEB4 09:00 10:00
15-Jul-2026 HSBE-1 GRU 18:00 23:00
16-Jul-2026 HSB GRU 08:00 14:00
17-Jul-2026 ASB1 GRU 09:00 17:00
`;

const duties = sandbox.parseScheduleText(fixture);
const byDate = Object.fromEntries(duties.map((duty) => [duty.date, duty]));

const expectations = [
  ["2026-07-11", "Folga pedida", "off"],
  ["2026-07-12", "Férias", "off"],
  ["2026-07-13", "Dispensa médica", "off"],
  ["2026-07-14", "Treinamento online", "training"],
  ["2026-07-15", "Sobreaviso", "standby"],
  ["2026-07-16", "Sobreaviso", "standby"],
  ["2026-07-17", "Reserva", "reserve"],
];

const failures = [];
for (const [date, type, typeClass] of expectations) {
  const duty = byDate[date];
  if (!duty) {
    failures.push(`${date}: item nao encontrado`);
    continue;
  }
  if (duty.type !== type) failures.push(`${date}: esperado tipo ${type}, recebido ${duty.type}`);
  if (sandbox.typeToClass(duty.type) !== typeClass) {
    failures.push(`${date}: esperado classe ${typeClass}, recebida ${sandbox.typeToClass(duty.type)}`);
  }
}

if (!sandbox.badgeLabel(byDate["2026-07-15"]).includes("(extra)")) {
  failures.push("HSBE nao exibiu marcador extra no badge");
}

if (failures.length) {
  console.error("Falhas nas fixtures do parser:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Check de parser aprovado.");
