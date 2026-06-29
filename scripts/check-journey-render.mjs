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
  navigator: { onLine: true },
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

const duties = [
  {
    date: "2026-06-29",
    type: "Voo",
    reportTime: "06:00",
    start: "07:00",
    end: "08:30",
    dutyEnd: "09:00",
    from: "CGH",
    to: "BSB",
    flight: "LA1000",
  },
  {
    date: "2026-06-29",
    type: "Voo",
    reportTime: "18:00",
    start: "19:00",
    end: "21:00",
    dutyEnd: "21:30",
    from: "BSB",
    to: "RBR",
    flight: "LA2000",
  },
  {
    date: "2026-06-29",
    type: "Voo",
    reportTime: "22:00",
    start: "23:10",
    end: "00:40",
    dutyEnd: "01:10",
    from: "RBR",
    to: "BSB",
    flight: "LA2001",
  },
].map((duty) => sandbox.normalizeDuty(duty));

const blocks = sandbox.splitDayDutiesIntoJourneyBlocks(duties);
const routesByBlock = blocks.map((block) => block.duties.map((duty) => `${duty.from}-${duty.to}`));
const expected = [["CGH-BSB"], ["BSB-RBR", "RBR-BSB"]];

if (JSON.stringify(routesByBlock) !== JSON.stringify(expected)) {
  console.error("Agrupamento de jornadas incorreto:");
  console.error(JSON.stringify(routesByBlock, null, 2));
  process.exit(1);
}

const html = blocks.map(sandbox.renderJourneyBlock).join("");
const checks = [
  [html.includes("Apresentação: 06:00"), "faltou apresentação da primeira jornada"],
  [html.includes("Apresentação: 18:00"), "faltou apresentação da segunda jornada"],
  [html.includes("CGH"), "faltou CGH-BSB"],
  [html.includes("RBR"), "faltou BSB-RBR/RBR-BSB"],
  [html.includes("00:40 (+1)"), "faltou indicação de chegada no dia seguinte"],
  [html.includes("Fim da jornada: 01:10 (+1)"), "faltou fim da jornada no dia seguinte"],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error("Falhas na renderização de jornadas:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Check de jornadas aprovado.");
