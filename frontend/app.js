const state = {
  meta: {
    pilotName: "Bruno",
    familyNote: "Horarios sujeitos a alteracao operacional. Use esta pagina como referencia familiar.",
    updatedAt: new Date().toISOString(),
  },
  duties: [],
  visibleMonth: new Date(2026, 5, 1),
  mode: "admin",
};

const els = {
  adminTab: document.querySelector("#adminTab"),
  familyTab: document.querySelector("#familyTab"),
  offDays: document.querySelector("#offDays"),
  reserveDays: document.querySelector("#reserveDays"),
  standbyDays: document.querySelector("#standbyDays"),
  inactiveDays: document.querySelector("#inactiveDays"),
  updatedAt: document.querySelector("#updatedAt"),
  pilotName: document.querySelector("#pilotName"),
  familyNote: document.querySelector("#familyNote"),
  fileInput: document.querySelector("#fileInput"),
  importStatus: document.querySelector("#importStatus"),
  publishButton: document.querySelector("#publishButton"),
  portalLabel: document.querySelector("#portalLabel"),
  monthTitle: document.querySelector("#monthTitle"),
  monthLabel: document.querySelector("#monthLabel"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  calendar: document.querySelector("#calendar"),
  familyNoteDisplay: document.querySelector("#familyNoteDisplay"),
  scheduleFooter: document.querySelector("#scheduleFooter"),
  todayButton: document.querySelector("#todayButton"),
  pilotLogin: document.querySelector("#pilotLogin"),
  pilotLoginForm: document.querySelector("#pilotLoginForm"),
  pilotToken: document.querySelector("#pilotToken"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  createAccountButton: document.querySelector("#createAccountButton"),
  loginError: document.querySelector("#loginError"),
  logoutButton: document.querySelector("#logoutButton"),
  familyLogoutButton: document.querySelector("#familyLogoutButton"),
  familyAccessEmail: document.querySelector("#familyAccessEmail"),
  grantFamilyButton: document.querySelector("#grantFamilyButton"),
  familyAccessList: document.querySelector("#familyAccessList"),
};

const STORAGE_KEY = "pilot-family-schedule-v1";
const PUBLISHED_ROSTER_KEY = "pilot-family-published-v1";
const PILOT_TOKEN_KEY = "pilot-roster-token";
const PILOT_SESSION_KEY = "pilot-roster-session";
const LOCAL_PILOT_TOKEN = "test-token";
const LOCAL_API_URL = "http://localhost:4174";
const CONFIGURED_API_URL = window.APP_CONFIG?.API_URL ? String(window.APP_CONFIG.API_URL).replace(/\/+$/, "") : "";
const FIREBASE_CONFIG = window.APP_CONFIG?.FIREBASE || {};
const FUNCTIONS_REGION = window.APP_CONFIG?.FUNCTIONS_REGION || "us-central1";
const syncState = {
  mode: "idle",
  source: "",
  message: "",
};
const firebaseState = {
  app: null,
  auth: null,
  db: null,
  functions: null,
  user: null,
  profile: null,
  pilotProfile: null,
  targetPilotId: "",
  familyAccess: [],
};
const monthNames = {
  jan: 1,
  janeiro: 1,
  feb: 2,
  fev: 2,
  fevereiro: 2,
  mar: 3,
  marco: 3,
  março: 3,
  apr: 4,
  abr: 4,
  abril: 4,
  may: 5,
  mai: 5,
  maio: 5,
  jun: 6,
  junho: 6,
  jul: 7,
  julho: 7,
  aug: 8,
  ago: 8,
  agosto: 8,
  sep: 9,
  set: 9,
  setembro: 9,
  oct: 10,
  out: 10,
  outubro: 10,
  nov: 11,
  novembro: 11,
  dec: 12,
  dez: 12,
  dezembro: 12,
};
const typeClass = {
  voo: "flight",
  flight: "flight",
  reserva: "reserve",
  standby: "standby",
  treinamento: "training",
  training: "training",
  folga: "off",
  off: "off",
  sobreaviso: "standby",
  "stand by": "standby",
};

function firebaseConfigReady() {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && window.firebase);
}

function firebaseEnabled() {
  return Boolean(firebaseState.app);
}

function initFirebase() {
  if (!firebaseConfigReady()) {
    configureLegacyAuthUi();
    return false;
  }
  firebaseState.app = window.firebase.apps.length
    ? window.firebase.app()
    : window.firebase.initializeApp(FIREBASE_CONFIG);
  firebaseState.auth = window.firebase.auth();
  firebaseState.db = window.firebase.firestore();
  firebaseState.functions = window.firebase.app().functions(FUNCTIONS_REGION);
  return true;
}

function configureLegacyAuthUi() {
  const emailLabel = els.authEmail?.closest("label");
  const passwordLabel = els.authPassword?.closest("label");
  if (emailLabel) emailLabel.hidden = true;
  if (passwordLabel?.firstChild) passwordLabel.firstChild.textContent = "Token do piloto";
  if (els.authPassword) {
    els.authPassword.placeholder = "Digite seu token";
    els.authPassword.autocomplete = "current-password";
  }
  if (els.createAccountButton) els.createAccountButton.hidden = true;
}

function currentAuthRole() {
  return isPilotPath() ? "pilot" : "family";
}

function currentUserName(user) {
  return user?.displayName || user?.email?.split("@")[0] || "Usuário";
}

function firebaseErrorMessage(error) {
  const code = error?.code || "";
  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) return "Email ou senha invalidos.";
  if (code.includes("auth/user-not-found")) return "Usuario nao encontrado.";
  if (code.includes("auth/email-already-in-use")) return "Este email ja tem uma conta.";
  if (code.includes("auth/weak-password")) return "Use uma senha com pelo menos 6 caracteres.";
  if (code.includes("auth/invalid-email")) return "Email invalido.";
  if (code.includes("permission-denied")) return "Voce nao tem permissao para acessar estes dados.";
  return error?.message || "Nao foi possivel concluir a acao.";
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function typeToClass(type) {
  return typeClass[normalizeText(type)] || "flight";
}

function isBaseOnlyType(type) {
  return ["reserve", "standby", "off"].includes(typeToClass(type));
}

function dutyPlaceLabel(duty, separator = "-") {
  if (isBaseOnlyType(duty.type)) return duty.from || duty.to || duty.type;
  if (duty.from && duty.to) return `${duty.from}${separator}${duty.to}`;
  return duty.flight || duty.from || duty.to || duty.type;
}

function flightRadarUrl(flight) {
  const slug = normalizeText(flight).replace(/[^a-z0-9]/g, "");
  return slug ? `https://www.flightradar24.com/data/flights/${slug}` : "";
}

function flightLink(duty) {
  if (typeToClass(duty.type) !== "flight" || !duty.flight) return "";
  const url = flightRadarUrl(duty.flight);
  if (!url) return "";
  const label = escapeHtml(duty.flight.toUpperCase());
  return `<a class="flight-link" href="${url}" target="_blank" rel="noopener noreferrer" title="Abrir ${label} no FlightRadar24">${label}</a>`;
}

function flightRouteLabel(duty) {
  if (duty.from && duty.to) return `${escapeHtml(duty.from)} <span class="route-arrow">&rarr;</span> ${escapeHtml(duty.to)}`;
  return escapeHtml(dutyPlaceLabel(duty));
}

function badgeLabel(duty) {
  if (typeToClass(duty.type) === "standby" && /\bHSBE(?:-\d+)?\b/i.test(`${duty.flight || ""} ${duty.notes || ""}`)) {
    return "Sobreaviso (extra)";
  }
  return duty.type;
}

function renderActivityBlock(duty, dutyClass, time) {
  const base = duty.from || duty.to || "";
  const timeLine = time ? `<div class="activity-duty-time">${escapeHtml(time)}</div>` : "";
  const baseLine = base ? `<div class="activity-duty-base">${escapeHtml(base)}</div>` : "";
  return `
    <div class="mini-duty ${dutyClass} activity-duty">
      ${baseLine}
      ${timeLine}
    </div>
  `;
}

function renderDutyLine(duty) {
  const dutyClass = typeToClass(duty.type);
  const time = [duty.start, duty.end].filter(Boolean).join("-");
  if (dutyClass === "flight") {
    const flightNumber = flightLink(duty) || `<span class="flight-code">${escapeHtml(duty.flight || "Voo")}</span>`;
    const timeLine = time ? `<div class="flight-duty-time">${escapeHtml(time)}</div>` : "";
    return `
      <div class="mini-duty flight flight-duty">
        <div class="flight-duty-number">${flightNumber}</div>
        <div class="flight-duty-route">${flightRouteLabel(duty)}</div>
        ${timeLine}
      </div>
    `;
  }
  if (["reserve", "standby", "off", "training"].includes(dutyClass)) {
    return renderActivityBlock(duty, dutyClass, time);
  }
  return `<div class="mini-duty ${dutyClass}">${escapeHtml(time)} ${escapeHtml(dutyPlaceLabel(duty))}</div>`;
}

function inferReportTime(input) {
  if (input.reportTime || input.apresentacao || input.report) return input.reportTime || input.apresentacao || input.report;
  const typeClassName = typeToClass(input.type || input.tipo || "Voo");
  if (typeClassName === "off") return "";

  const notes = String(input.notes || input.observacoes || input.obs || "");
  const times = [...notes.matchAll(/\b(?:[01]?\d|2[0-3])(?::|h)[0-5]\d\b/g)]
    .map((match) => normalizeTime(match[0].replace("h", ":")))
    .filter(Boolean);
  if (!times.length) return "";

  const start = normalizeTime(input.start || input.inicio || "");
  if (typeClassName === "flight") return times[0] && times[0] !== start ? times[0] : "";
  if (["reserve", "standby"].includes(typeClassName)) return times[0] || "";
  return "";
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function formatDate(dateString, options = { day: "2-digit", month: "short", weekday: "short" }) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", options).format(new Date(year, month - 1, day));
}

function formatWeekdayName(date) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
    .format(date)
    .toLocaleLowerCase("pt-BR");
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayKey() {
  return dateKey(new Date());
}

function parseCSV(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return "";
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function parseFlexibleDate(value, fallbackYear) {
  const raw = String(value || "").trim();
  const compactRosterDate = raw.match(/^(\d{1,2})-([A-Za-zçÇ]{3,9})-(\d{2,4})/);
  if (compactRosterDate) {
    const month = monthNames[normalizeText(compactRosterDate[2])];
    const year = compactRosterDate[3].length === 2 ? `20${compactRosterDate[3]}` : compactRosterDate[3];
    if (month) return `${year}-${String(month).padStart(2, "0")}-${compactRosterDate[1].padStart(2, "0")}`;
  }

  const rosterDate = raw.match(/\b(\d{1,2})[-\s]([A-Za-zçÇ]{3,9})[-\s](\d{2,4})\b/);
  if (rosterDate) {
    const month = monthNames[normalizeText(rosterDate[2])];
    const year = rosterDate[3].length === 2 ? `20${rosterDate[3]}` : rosterDate[3];
    if (month) return `${year}-${String(month).padStart(2, "0")}-${rosterDate[1].padStart(2, "0")}`;
  }

  const numeric = raw.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const day = numeric[1].padStart(2, "0");
    const month = numeric[2].padStart(2, "0");
    const year = numeric[3]
      ? (numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : String(fallbackYear);
    return `${year}-${month}-${day}`;
  }

  const named = normalizeText(raw).match(/\b(\d{1,2})\s*([a-zç]{3,9})\b/);
  if (named && monthNames[named[2]]) {
    return `${fallbackYear}-${String(monthNames[named[2]]).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  return "";
}

function normalizeTime(value) {
  const raw = String(value || "").trim();
  const colon = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) return `${colon[1].padStart(2, "0")}:${colon[2]}`;
  const compact = raw.match(/^(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}:${compact[2]}`;
  return "";
}

function minutesFromTime(value) {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  return (hours * 60) + minutes;
}

function findNextDutyEnd(timeMatches, departure, arrival) {
  const departureIndex = timeMatches.indexOf(departure);
  const arrivalIndex = timeMatches.indexOf(arrival, Math.max(departureIndex + 1, 0));
  const candidate = timeMatches[arrivalIndex + 1];
  if (!candidate) return "";

  const departureMinutes = minutesFromTime(departure);
  const arrivalMinutes = minutesFromTime(arrival);
  const candidateMinutes = minutesFromTime(candidate);
  if (departureMinutes === null || arrivalMinutes === null || candidateMinutes === null) return "";

  const overnight = arrivalMinutes < departureMinutes;
  if (overnight) return candidateMinutes >= arrivalMinutes ? candidate : "";
  return candidateMinutes >= arrivalMinutes ? candidate : "";
}

function findActivityEnd(timeMatches) {
  if (!timeMatches.length) return "";
  if (timeMatches.length >= 5) return timeMatches[timeMatches.length - 3];
  if (timeMatches.length >= 2) return timeMatches[1];
  return timeMatches[timeMatches.length - 1];
}

function compactRosterBody(line) {
  return String(line || "")
    .replace(/^\d{1,2}-[A-Za-zçÇ]{3,9}-\d{2,4}/, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function parseCompactFlightLine(line, date, timeMatches) {
  const body = compactRosterBody(line);
  const compactFlight = body.match(/^(?:(\d{1,2}:\d{2}))?([A-Z]{2}\d{3,5})(?:FDT|FO|CA|CAPT|SEN)(?:OP|DH|PS)?([A-Z]{3})(\d{1,2}:\d{2})([A-Z]{3})(\d{1,2}:\d{2})/);
  if (!compactFlight) return null;

  return normalizeDuty({
    date,
    reportTime: compactFlight[1] || "",
    start: compactFlight[4],
    end: compactFlight[6],
    dutyEnd: findNextDutyEnd(timeMatches, compactFlight[4], compactFlight[6]),
    type: "Voo",
    from: compactFlight[3],
    to: compactFlight[5],
    flight: compactFlight[2],
    notes: line,
  });
}

function compactActivityBase(line) {
  const body = compactRosterBody(line);
  const activity = body.match(/(?:ASB|HSBE?|DO)(?:-\d+)?(?:\/\d{6}\/[A-Z0-9-]+)?(?:-?P)?(?:FDT|FO|CA|CAPT|SEN)?(?:OP|DH|PS)?(?:(?:\d{1,2}:\d{2}))*([A-Z]{3})/);
  return activity ? activity[1] : "";
}

function compactActivityCode(line) {
  const body = compactRosterBody(line);
  const activity = body.match(/^(?:\d{1,2}:\d{2})?(ASB|HSBE?|DO)(?=-|\d|FDT|FO|CA|CAPT|SEN|[A-Z]{3}|$)/);
  return activity ? activity[1] : "";
}

function inferType(line, hasRouteOrFlight) {
  const compactCode = compactActivityCode(line);
  if (compactCode === "ASB") return "Reserva";
  if (compactCode === "HSB" || compactCode === "HSBE") return "Sobreaviso";
  if (compactCode === "DO") return "Folga";

  const normalized = normalizeText(line);
  if (/(^|[^a-z])(folga|day off|off|do)(?=[^a-z]|\d|$)/.test(normalized)) return "Folga";
  if (/(^|[^a-z])(sobreaviso|standby|hsb|hsbe)(?=[^a-z]|\d|$)/.test(normalized)) return "Sobreaviso";
  if (/(^|[^a-z])(reserva|sb|asb)(?=[^a-z]|\d|$)/.test(normalized)) return "Reserva";
  if (/\b(treinamento|simulador|simulator|curso|ground school|reciclagem)\b/.test(normalized)) return "Treinamento";
  if (/\b(posicionamento|deadhead|dh|deslocamento)\b/.test(normalized)) return "Voo";
  return hasRouteOrFlight ? "Voo" : "Programação";
}

function extractScheduleYear(text) {
  const yearMatch = String(text).match(/\b(20\d{2})\b/);
  return yearMatch ? Number(yearMatch[1]) : state.visibleMonth.getFullYear();
}

function parsePlainScheduleText(text) {
  const fallbackYear = extractScheduleYear(text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 3);
  const duties = [];
  let activeDate = "";

  for (const line of lines) {
    const lineDate = parseFlexibleDate(line, fallbackYear);
    const date = lineDate || activeDate;
    if (!date) continue;
    if (lineDate) activeDate = date;

    const normalized = normalizeText(line);
    if (/^(data|date|pagina|page|emitido|impresso|trip|escala|roster report)\b/.test(normalized)) continue;
    if (/\/\d{6}\//.test(line) && !/\b(?:[01]?\d|2[0-3])(?::|h)[0-5]\d\b/.test(line)) continue;

    const timeMatches = [...line.matchAll(/(?:[01]?\d|2[0-3])(?::|h)[0-5]\d/g)]
      .map((match) => normalizeTime(match[0].replace("h", ":")))
      .filter(Boolean);
    const compactFlightDuty = parseCompactFlightLine(line, date, timeMatches);
    if (compactFlightDuty) {
      duties.push(compactFlightDuty);
      continue;
    }

    const rosterFlight = line.toUpperCase().match(/\b([A-Z]{2}\s?\d{3,5})\s+(?:(?:FDT|FO|CA|CAPT|SEN)\s+)?(?:(?:OP|DH)\s+)?([A-Z]{3})\s+((?:[01]?\d|2[0-3]):[0-5]\d)\s+([A-Z]{3})\s+((?:[01]?\d|2[0-3]):[0-5]\d)\b/);
    if (rosterFlight) {
      const dutyEnd = findNextDutyEnd(timeMatches, rosterFlight[3], rosterFlight[5]);
      const reportTime = timeMatches[0] && timeMatches[0] !== rosterFlight[3] ? timeMatches[0] : "";
      duties.push(normalizeDuty({
        date,
        reportTime,
        start: rosterFlight[3],
        end: rosterFlight[5],
        dutyEnd,
        type: "Voo",
        from: rosterFlight[2],
        to: rosterFlight[4],
        flight: rosterFlight[1].replace(/\s+/, ""),
        notes: line,
      }));
      continue;
    }

    const airportMatches = [...line.toUpperCase().matchAll(/\b[A-Z]{3}\b/g)]
      .map((match) => match[0])
      .filter((code) => !["PDF", "UTC", "DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB", "JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ", "ASB", "HSB"].includes(code));
    if (!airportMatches.length) {
      const base = compactActivityBase(line);
      if (base) airportMatches.push(base);
    }
    const flightMatch = line.toUpperCase().match(/\b[A-Z]{2}\s?\d{3,5}\b/);
    const hasKeyword = /(^|[^A-Z])(voo|flight|folga|reserva|standby|treinamento|simulador|curso|posicionamento|deadhead|pernoite|DO|ASB|HSB|HSBE)(?=[^A-Z]|\d|$)/i.test(line) || Boolean(compactActivityCode(line));
    const hasRouteOrFlight = airportMatches.length >= 2 || Boolean(flightMatch);

    if (!lineDate && !hasKeyword && !hasRouteOrFlight) continue;
    if (!timeMatches.length && !hasRouteOrFlight) continue;
    if (!hasKeyword && !hasRouteOrFlight && timeMatches.length < 2) continue;

    const type = inferType(line, hasRouteOrFlight);
    const timedActivity = ["Reserva", "Sobreaviso", "Folga"].includes(type);
    const hasReport = ["Reserva", "Sobreaviso"].includes(type);
    const activityEnd = timedActivity ? findActivityEnd(timeMatches) : "";
    duties.push(normalizeDuty({
      date,
      reportTime: hasReport ? (timeMatches[0] || "") : "",
      start: timeMatches[0] || "",
      end: activityEnd || timeMatches[1] || "",
      dutyEnd: activityEnd,
      type,
      from: airportMatches[0] || "",
      to: airportMatches[1] || "",
      flight: flightMatch ? flightMatch[0].replace(/\s+/, "") : "",
      hotel: /\b(hotel|pernoite|layover)\b/i.test(line) ? line.replace(/^.*?\b(hotel|pernoite|layover)\b[:\s-]*/i, "").slice(0, 80) : "",
      notes: line,
    }));
  }

  const seen = new Set();
  return duties.filter((duty) => {
    if (!duty) return false;
    const key = [duty.date, duty.start, duty.end, duty.type, duty.from, duty.to, duty.flight].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseScheduleText(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(normalizeDuty).filter(Boolean);
    if (Array.isArray(parsed.duties)) return parsed.duties.map(normalizeDuty).filter(Boolean);
  } catch {
    // CSV fallback below.
  }

  const rows = parseCSV(trimmed);
  if (!rows.length) return [];

  const first = rows[0].map(normalizeText);
  const hasHeader = first.some((header) => ["data", "date", "inicio", "start", "tipo", "type"].includes(header));
  const headers = hasHeader ? first : ["data", "inicio", "fim", "tipo", "origem", "destino", "voo", "hotel", "observacoes"];
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const csvDuties = dataRows.map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] || "";
    });
    return normalizeDuty({
      date: record.data || record.date,
      start: record.inicio || record.start,
      reportTime: record.apresentacao || record.report || record.reporttime,
      end: record.fim || record.end,
      dutyEnd: record.fim_jornada || record.fimjornada || record.dutyend || record.debrief,
      type: record.tipo || record.type || "Voo",
      from: record.origem || record.from,
      to: record.destino || record.to,
      flight: record.voo || record.flight,
      hotel: record.hotel,
      notes: record.observacoes || record.notes || record.obs,
    });
  }).filter(Boolean);
  return csvDuties.length ? csvDuties : parsePlainScheduleText(trimmed);
}

function normalizeDuty(input) {
  const date = parseDate(input.date || input.data);
  if (!date) return null;
  return {
    id: input.id || crypto.randomUUID(),
    date,
    reportTime: inferReportTime(input),
    start: input.start || input.inicio || "",
    end: input.end || input.fim || "",
    dutyEnd: input.dutyEnd || input.fimJornada || input.fim_jornada || input.debrief || "",
    type: input.type || input.tipo || "Voo",
    from: String(input.from || input.origem || "").trim().toUpperCase(),
    to: String(input.to || input.destino || "").trim().toUpperCase(),
    flight: String(input.flight || input.voo || "").trim(),
    hotel: String(input.hotel || "").trim(),
    notes: String(input.notes || input.observacoes || input.obs || "").trim(),
  };
}

function sortDuties() {
  state.duties.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
}

function setSyncState(mode, message = "", source = "") {
  syncState.mode = mode;
  syncState.message = message;
  syncState.source = source;
}

function applyRosterPayload(payload, source = "") {
  state.meta = { ...state.meta, ...(payload.meta || {}) };
  state.duties = Array.isArray(payload.duties) ? payload.duties.map(normalizeDuty).filter(Boolean) : [];
  sortDuties();
  if (state.duties[0]) {
    const [year, month] = state.duties[0].date.split("-").map(Number);
    state.visibleMonth = new Date(year, month - 1, 1);
  }
  if (source) syncState.source = source;
}

function savePublishedRosterCache(payload) {
  try {
    localStorage.setItem(publishedRosterCacheKey(), JSON.stringify(payload));
  } catch (error) {
    console.error(error);
  }
}

function loadPublishedRosterCache() {
  const stored = localStorage.getItem(publishedRosterCacheKey());
  if (!stored) return false;
  try {
    const payload = JSON.parse(stored);
    applyRosterPayload(payload, "cache");
    return true;
  } catch {
    localStorage.removeItem(PUBLISHED_ROSTER_KEY);
    return false;
  }
}

function publishedRosterCacheKey() {
  return firebaseState.targetPilotId
    ? `${PUBLISHED_ROSTER_KEY}-${firebaseState.targetPilotId}`
    : PUBLISHED_ROSTER_KEY;
}

function saveLocal() {
  if (state.mode === "family") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ meta: state.meta, duties: state.duties }));
}

function loadLocal() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    state.meta = { ...state.meta, ...parsed.meta };
    state.duties = Array.isArray(parsed.duties) ? parsed.duties.map(normalizeDuty).filter(Boolean) : [];
    sortDuties();
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function encodeSharePayload() {
  const payload = {
    meta: {
      pilotName: state.meta.pilotName,
      familyNote: state.meta.familyNote,
      updatedAt: new Date().toISOString(),
    },
    duties: state.duties,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeSharePayload(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function readShareFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const share = params.get("share");
  if (!share) return false;
  try {
    const payload = decodeSharePayload(share);
    state.meta = { ...state.meta, ...payload.meta };
    state.duties = Array.isArray(payload.duties) ? payload.duties.map(normalizeDuty).filter(Boolean) : [];
    state.mode = "family";
    sortDuties();
    return true;
  } catch {
    return false;
  }
}

function isPilotPath() {
  return window.location.pathname.replace(/\/+$/, "") === "/piloto";
}

function isLocalHost() {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function hasPilotAccess() {
  if (firebaseEnabled()) return Boolean(firebaseState.user && firebaseState.profile?.role === "pilot");
  const saved = localStorage.getItem(PILOT_TOKEN_KEY) || "";
  const activeSession = sessionStorage.getItem(PILOT_SESSION_KEY) === "active";
  if (!activeSession) return false;
  if (isLocalHost()) return saved === LOCAL_PILOT_TOKEN;
  return Boolean(saved);
}

function setPilotLocked(locked) {
  document.body.classList.toggle("pilot-locked", locked);
  if (els.pilotLogin) els.pilotLogin.hidden = !locked;
  if (locked) {
    if (els.loginError) els.loginError.classList.remove("visible");
    requestAnimationFrame(() => (els.authEmail || els.pilotToken)?.focus());
  }
}

async function validatePilotToken(token) {
  if (firebaseEnabled()) return Boolean(firebaseState.user && firebaseState.profile?.role === "pilot");
  const normalized = String(token || "").trim();
  if (!normalized) return false;
  if (isLocalHost()) return normalized === LOCAL_PILOT_TOKEN;

  try {
    const response = await fetch(`${apiBaseUrl()}/api/auth/pilot`, {
      method: "POST",
      headers: {
        "X-Pilot-Token": normalized,
      },
    });
    return response.ok;
  } catch (error) {
    console.error(error);
    throw new Error("Nao foi possivel validar o token agora.");
  }
}

async function unlockPilot(token) {
  if (firebaseEnabled()) return Boolean(firebaseState.user);
  const normalized = String(token || "").trim();
  if (!normalized) {
    if (els.loginError) {
      els.loginError.textContent = "Informe o token do piloto.";
      els.loginError.classList.add("visible");
    }
    return false;
  }

  let valid = false;
  try {
    valid = await validatePilotToken(normalized);
  } catch (error) {
    if (els.loginError) {
      els.loginError.textContent = error.message || "Nao foi possivel validar o token agora.";
      els.loginError.classList.add("visible");
    }
    return false;
  }

  if (!valid) {
    if (els.loginError) {
      els.loginError.textContent = "Token invalido.";
      els.loginError.classList.add("visible");
    }
    return false;
  }

  localStorage.setItem(PILOT_TOKEN_KEY, normalized);
  sessionStorage.setItem(PILOT_SESSION_KEY, "active");
  setPilotLocked(false);
  setMode("admin");
  return true;
}

function logoutPilot() {
  if (firebaseEnabled()) {
    firebaseState.auth.signOut();
    return;
  }
  localStorage.removeItem(PILOT_TOKEN_KEY);
  sessionStorage.removeItem(PILOT_SESSION_KEY);
  if (els.pilotToken) els.pilotToken.value = "";
  setPilotLocked(true);
}

async function authenticateFirebase(createAccount = false) {
  const email = String(els.authEmail?.value || "").trim();
  const password = String(els.authPassword?.value || "");
  if (!email || !password) {
    if (els.loginError) {
      els.loginError.textContent = "Informe email e senha.";
      els.loginError.classList.add("visible");
    }
    return false;
  }

  try {
    if (els.loginError) els.loginError.classList.remove("visible");
    if (createAccount) {
      const credential = await firebaseState.auth.createUserWithEmailAndPassword(email, password);
      await ensureFirebaseUserProfile(credential.user, currentAuthRole());
    } else {
      await firebaseState.auth.signInWithEmailAndPassword(email, password);
    }
    if (els.authPassword) els.authPassword.value = "";
    return true;
  } catch (error) {
    if (els.loginError) {
      els.loginError.textContent = firebaseErrorMessage(error);
      els.loginError.classList.add("visible");
    }
    return false;
  }
}

async function ensureFirebaseUserProfile(user, fallbackRole) {
  const userRef = firebaseState.db.collection("users").doc(user.uid);
  const snapshot = await userRef.get();
  if (snapshot.exists) return snapshot.data();

  const profile = {
    role: fallbackRole,
    name: currentUserName(user),
    email: user.email || "",
    pilotIds: [],
    createdAt: new Date().toISOString(),
  };
  await userRef.set(profile, { merge: true });

  if (profile.role === "pilot") {
    await firebaseState.db.collection("pilots").doc(user.uid).set({
      displayName: profile.name,
      familyNote: state.meta.familyNote,
      createdAt: new Date().toISOString(),
    }, { merge: true });
  }

  return profile;
}

async function loadFirebaseSession(user) {
  firebaseState.user = user;
  firebaseState.profile = null;
  firebaseState.pilotProfile = null;
  firebaseState.targetPilotId = "";

  if (!user) {
    setPilotLocked(true);
    return;
  }

  const isPilotRoute = isPilotPath();
  const profile = await ensureFirebaseUserProfile(user, currentAuthRole());
  firebaseState.profile = profile;

  if (isPilotRoute && profile.role !== "pilot") {
    if (els.loginError) {
      els.loginError.textContent = "Esta conta nao tem perfil de piloto.";
      els.loginError.classList.add("visible");
    }
    await firebaseState.auth.signOut();
    return;
  }

  firebaseState.targetPilotId = profile.role === "pilot"
    ? user.uid
    : (Array.isArray(profile.pilotIds) ? profile.pilotIds[0] : "");

  setPilotLocked(false);

  if (isPilotRoute && profile.role === "pilot") {
    setMode("admin");
    await loadFirebasePilotProfile(user.uid);
    await loadFamilyAccessList();
    loadLocal();
    render();
    return;
  }

  await claimPendingFamilyAccess();
  setMode("family");
  await loadPublishedRoster();
}

async function loadFirebasePilotProfile(pilotId) {
  if (!pilotId) return null;
  const snapshot = await firebaseState.db.collection("pilots").doc(pilotId).get();
  const profile = snapshot.exists ? snapshot.data() : {};
  firebaseState.pilotProfile = profile;
  state.meta.pilotName = profile.displayName || firebaseState.profile?.name || state.meta.pilotName;
  state.meta.familyNote = profile.familyNote || state.meta.familyNote;
  if (profile.activeRosterMonth) {
    const [year, month] = profile.activeRosterMonth.split("-").map(Number);
    state.visibleMonth = new Date(year, month - 1, 1);
  }
  return profile;
}

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle("family-mode", mode === "family");
  els.adminTab?.classList.toggle("active", mode === "admin");
  els.familyTab?.classList.toggle("active", mode === "family");
  if (els.adminTab) els.adminTab.hidden = firebaseEnabled() && firebaseState.profile?.role !== "pilot";
  els.portalLabel.textContent = mode === "family" ? `Portal da família de ${state.meta.pilotName || "piloto"}` : "Área do piloto";
  render();
}

async function claimPendingFamilyAccess() {
  if (!firebaseEnabled() || !firebaseState.user || firebaseState.profile?.role !== "family") return;
  try {
    const callable = firebaseState.functions.httpsCallable("claimFamilyAccess");
    const result = await callable({});
    if (result.data?.claimed) {
      const snapshot = await firebaseState.db.collection("users").doc(firebaseState.user.uid).get();
      firebaseState.profile = snapshot.exists ? snapshot.data() : firebaseState.profile;
      firebaseState.targetPilotId = Array.isArray(firebaseState.profile?.pilotIds) ? firebaseState.profile.pilotIds[0] : "";
    }
  } catch (error) {
    console.error(error);
  }
}

async function loadFamilyAccessList() {
  if (!firebaseEnabled() || !firebaseState.user || firebaseState.profile?.role !== "pilot") return [];
  const pilotRef = firebaseState.db.collection("pilots").doc(firebaseState.user.uid);
  if (els.familyAccessList) {
    els.familyAccessList.innerHTML = `<div class="access-empty">Carregando familiares...</div>`;
  }
  let accessSnapshot;
  let inviteSnapshot;
  try {
    [accessSnapshot, inviteSnapshot] = await Promise.all([
      pilotRef.collection("familyAccess").get(),
      pilotRef.collection("familyInvites").get(),
    ]);
  } catch (error) {
    console.error(error);
    firebaseState.familyAccess = [];
    if (els.familyAccessList) {
      els.familyAccessList.innerHTML = `<div class="access-empty error">Nao foi possivel carregar a lista de familiares.</div>`;
    }
    return [];
  }
  const accessByEmail = new Map();
  accessSnapshot.forEach((doc) => {
    const data = doc.data();
    const email = String(data.email || "").toLowerCase();
    if (!email) return;
    accessByEmail.set(email, {
      id: doc.id,
      email,
      familyUid: doc.id,
      familyName: data.familyName || email,
      status: "active",
    });
  });
  inviteSnapshot.forEach((doc) => {
    const data = doc.data();
    const email = String(data.email || "").toLowerCase();
    if (!email || accessByEmail.has(email)) return;
    accessByEmail.set(email, {
      id: doc.id,
      email,
      familyUid: data.familyUid || "",
      familyName: data.familyName || email,
      status: data.status || "pending",
    });
  });
  firebaseState.familyAccess = [...accessByEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
  renderFamilyAccessList();
  return firebaseState.familyAccess;
}

function renderFamilyAccessList() {
  if (!els.familyAccessList) return;
  if (state.mode !== "admin") return;
  if (!firebaseEnabled()) {
    els.familyAccessList.innerHTML = `<div class="access-empty">Configure Firebase para gerenciar familiares.</div>`;
    return;
  }
  if (!firebaseState.familyAccess.length) {
    els.familyAccessList.innerHTML = `<div class="access-empty">Nenhum familiar autorizado.</div>`;
    return;
  }
  els.familyAccessList.innerHTML = firebaseState.familyAccess.map((item) => {
    const status = item.status === "active" ? "Ativo" : "Pendente";
    return `
      <div class="access-row">
        <div class="access-person">
          <strong>${escapeHtml(item.email)}</strong>
          <span>${escapeHtml(status)}</span>
        </div>
        <button class="access-remove" type="button" data-family-uid="${escapeHtml(item.familyUid)}" data-email="${escapeHtml(item.email)}">Remover</button>
      </div>
    `;
  }).join("");
}

function syncMetaFromInputs() {
  state.meta.pilotName = els.pilotName.value.trim() || "Piloto";
  state.meta.familyNote = els.familyNote.value.trim();
  state.meta.updatedAt = new Date().toISOString();
  saveLocal();
  render();
}

function renderSummary() {
  els.offDays.textContent = String(state.duties.filter((duty) => typeToClass(duty.type) === "off").length);
  els.reserveDays.textContent = String(state.duties.filter((duty) => typeToClass(duty.type) === "reserve").length);
  els.standbyDays.textContent = String(state.duties.filter((duty) => typeToClass(duty.type) === "standby").length);
  els.inactiveDays.textContent = String(inactiveDatesForMonth().length);
  els.updatedAt.textContent = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(state.meta.updatedAt || Date.now()));
}

function formatUpdatedAt() {
  const base = !state.duties.length
    ? (state.mode === "family" ? "Aguardando publicação" : "Nenhuma escala importada")
    : `Atualizado em ${new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(state.meta.updatedAt || Date.now()))}`;
  if (state.mode !== "family" || !syncState.message) return base;
  return `${base} • ${syncState.message}`;
}

function emptyStateMarkup() {
  const isOfflineFamily = state.mode === "family" && !navigator.onLine;
  const message = isOfflineFamily
    ? "Sem internet e sem escala salva neste aparelho."
    : state.mode === "family"
      ? "Nenhuma escala publicada ainda."
      : "Importe um PDF ou carregue dados para visualizar a escala.";
  const detail = isOfflineFamily
    ? "Abra esta página online pelo menos uma vez para manter a última escala disponível offline."
    : state.mode === "family"
      ? "Assim que o piloto publicar uma escala, os dias aparecem aqui."
      : "Use o painel do piloto para importar uma escala mensal.";
  return `
    <div class="empty-state">
      <strong>${escapeHtml(message)}</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
  `;
}

function updateConnectivityStatus() {
  if (state.mode !== "family") return;
  if (!navigator.onLine) {
    setSyncState("offline", "Offline. Exibindo a última escala salva neste aparelho.", syncState.source || "cache");
  } else if (syncState.source === "cache" || syncState.mode === "offline") {
    setSyncState("syncing", "Sincronizando escala...", syncState.source || "cache");
  } else if (syncState.source === "network") {
    setSyncState("ready", "Escala atualizada neste aparelho.", "network");
  } else {
    setSyncState("idle");
  }
  render();
}

function dutiesForMonth() {
  const key = monthKey(state.visibleMonth);
  return state.duties.filter((duty) => duty.date.startsWith(key));
}

function datesForVisibleMonth() {
  const year = state.visibleMonth.getFullYear();
  const month = state.visibleMonth.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: lastDay }, (_, index) => {
    const date = new Date(year, month, index + 1);
    return { date, key: dateKey(date) };
  });
}

function isBetweenFlightDays(key, monthDuties) {
  const before = [...monthDuties].reverse().find((duty) => duty.date < key && typeToClass(duty.type) === "flight");
  const after = monthDuties.find((duty) => duty.date > key && typeToClass(duty.type) === "flight");
  return Boolean(before && after && typeToClass(before.type) === "flight" && typeToClass(after.type) === "flight");
}

function inactiveDatesForMonth() {
  const monthDuties = dutiesForMonth();
  return datesForVisibleMonth()
    .filter(({ key }) => !monthDuties.some((duty) => duty.date === key) && isBetweenFlightDays(key, monthDuties))
    .map(({ key }) => key);
}

function bedIcon() {
  return `
    <svg class="bed-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 11V5.5A1.5 1.5 0 0 1 4.5 4h2A2.5 2.5 0 0 1 9 6.5V11" />
      <path d="M3 18v-7h14.5A3.5 3.5 0 0 1 21 14.5V18" />
      <path d="M3 18v2" />
      <path d="M21 18v2" />
      <path d="M3 14h18" />
    </svg>
  `;
}

function renderCalendar() {
  els.monthTitle.textContent = formatMonth(state.visibleMonth);
  els.monthLabel.textContent = formatMonth(state.visibleMonth);
  els.calendar.innerHTML = "";

  if (!state.duties.length) {
    els.calendar.innerHTML = emptyStateMarkup();
    return;
  }

  const currentToday = todayKey();
  const monthDuties = dutiesForMonth();
  const monthDates = datesForVisibleMonth();

  monthDates.forEach(({ date, key }) => {
    const dayDuties = monthDuties.filter((duty) => duty.date === key);
    const primary = dayDuties[0];
    const inactive = !dayDuties.length && isBetweenFlightDays(key, monthDuties);
    const badge = primary
      ? `<span class="badge ${typeToClass(primary.type)}">${escapeHtml(badgeLabel(primary))}</span>`
      : inactive
        ? `<span class="badge flight">Voo</span>`
        : "";
    const reportDuty = dayDuties.find((duty) => typeToClass(duty.type) === "flight" && duty.reportTime);
    const report = reportDuty ? `<div class="mini-report">Apresentação: ${escapeHtml(reportDuty.reportTime)}</div>` : "";
    const dutyEndDuty = [...dayDuties].reverse().find((duty) => typeToClass(duty.type) === "flight" && (duty.dutyEnd || duty.end));
    const dutyEnd = dutyEndDuty ? dutyEndDuty.dutyEnd || dutyEndDuty.end : "";
    const dutyEndLine = dutyEnd ? `<div class="mini-report">Fim da jornada: ${escapeHtml(dutyEnd)}</div>` : "";
    const duties = dayDuties.length ? dayDuties.map(renderDutyLine).join("") : inactive
      ? `<div class="mini-duty flight inactive-duty">${bedIcon()}<span>Inativo</span></div>`
      : `<div class="no-data">Sem dados</div>`;
    const weekdayName = formatWeekdayName(date);
    els.calendar.insertAdjacentHTML("beforeend", `
      <article class="day ${key === currentToday ? "today" : ""}" data-date="${key}">
        <div class="day-number">
          <span class="day-title"><span class="day-date">${date.getDate()}</span><span class="day-weekday">${escapeHtml(weekdayName)}</span></span>
          ${badge}
        </div>
        ${report}
        ${duties}
        ${dutyEndLine}
      </article>
    `);
  });
}

function render() {
  els.pilotName.value = state.meta.pilotName || "";
  els.familyNote.value = state.meta.familyNote || "";
  els.familyNoteDisplay.textContent = state.meta.familyNote || "Sem observacoes adicionais.";
  els.scheduleFooter.textContent = formatUpdatedAt();
  renderSummary();
  renderCalendar();
  if (state.mode === "admin") renderFamilyAccessList();
}

function setImportStatus(message, tone = "busy") {
  els.importStatus.textContent = message;
  els.importStatus.className = `import-status visible ${tone}`;
}

function clearImportStatus() {
  els.importStatus.textContent = "";
  els.importStatus.className = "import-status";
}

function importDuties(text, source = "texto") {
  const imported = parseScheduleText(text);
  if (!imported.length) {
    setImportStatus("Nao encontrei itens validos. O PDF precisa conter texto selecionavel com datas, horarios, aeroportos ou tipo de programação.", "error");
    return;
  }
  state.duties = imported;
  state.meta.updatedAt = new Date().toISOString();
  const [year, month] = imported[0].date.split("-").map(Number);
  state.visibleMonth = new Date(year, month - 1, 1);
  sortDuties();
  saveLocal();
  render();
  setImportStatus(`${imported.length} item(ns) importado(s) de ${source}. Revise a lista antes de compartilhar.`, "ok");
}

function addDuty(duty) {
  state.duties.push(duty);
  state.meta.updatedAt = new Date().toISOString();
  sortDuties();
  saveLocal();
  render();
}

function shiftMonth(amount) {
  state.visibleMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() + amount, 1);
  render();
}

function goToToday() {
  const today = new Date();
  state.visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  render();
  requestAnimationFrame(() => {
    const todayCard = document.querySelector(`.day[data-date="${todayKey()}"]`);
    if (todayCard) todayCard.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function apiBaseUrl() {
  if (isLocalHost()) {
    return window.location.origin;
  }
  return CONFIGURED_API_URL || LOCAL_API_URL;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Ignore registration failures on unsupported local environments.
    });
  });
}

async function loadPublishedRoster() {
  if (firebaseEnabled()) return loadFirebaseRoster();
  if (!CONFIGURED_API_URL && !(window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return false;
  }
  try {
    if (state.mode === "family") {
      setSyncState("syncing", "Sincronizando escala...", syncState.source || "");
      render();
    }
    const response = await fetch(`${apiBaseUrl()}/api/roster/public`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (state.mode === "family") {
        setSyncState("idle", "Nenhuma escala publicada ainda.", syncState.source || "");
        render();
      }
      return false;
    }
    const previousUpdatedAt = state.meta.updatedAt || "";
    applyRosterPayload(payload, "network");
    savePublishedRosterCache({
      meta: state.meta,
      duties: state.duties,
    });
    if (state.mode === "family") {
      setSyncState(
        "ready",
        previousUpdatedAt && previousUpdatedAt === state.meta.updatedAt
          ? "Escala já estava atualizada neste aparelho."
          : "Nova escala sincronizada neste aparelho.",
        "network",
      );
    }
    render();
    return true;
  } catch {
    if (state.mode === "family") {
      setSyncState(
        navigator.onLine ? "error" : "offline",
        navigator.onLine
          ? "Nao foi possivel atualizar agora. Exibindo a última escala salva neste aparelho."
          : "Offline. Exibindo a última escala salva neste aparelho.",
        syncState.source || "cache",
      );
      render();
    }
    return false;
  }
}

async function loadFirebaseRoster() {
  if (!firebaseState.user) return false;
  const pilotId = firebaseState.targetPilotId;
  if (!pilotId) {
    setSyncState("idle", "Nenhum piloto vinculado a esta conta.", "");
    state.duties = [];
    render();
    return false;
  }

  try {
    if (state.mode === "family") {
      setSyncState("syncing", "Sincronizando escala...", syncState.source || "");
      render();
    }
    const pilotProfile = await loadFirebasePilotProfile(pilotId);
    const rosterMonth = pilotProfile?.activeRosterMonth || monthKey(state.visibleMonth);
    const snapshot = await firebaseState.db
      .collection("pilots")
      .doc(pilotId)
      .collection("rosters")
      .doc(rosterMonth)
      .get();

    if (!snapshot.exists) {
      state.duties = [];
      setSyncState("idle", "Nenhuma escala publicada para este piloto.", "");
      render();
      return false;
    }

    const previousUpdatedAt = state.meta.updatedAt || "";
    applyRosterPayload(snapshot.data(), "network");
    savePublishedRosterCache({
      meta: state.meta,
      duties: state.duties,
    });
    if (state.mode === "family") {
      setSyncState(
        "ready",
        previousUpdatedAt && previousUpdatedAt === state.meta.updatedAt
          ? "Escala já estava atualizada neste aparelho."
          : "Nova escala sincronizada neste aparelho.",
        "network",
      );
    }
    render();
    return true;
  } catch (error) {
    console.error(error);
    setSyncState(
      navigator.onLine ? "error" : "offline",
      navigator.onLine
        ? "Nao foi possivel atualizar agora. Exibindo a última escala salva neste aparelho."
        : "Offline. Exibindo a última escala salva neste aparelho.",
      syncState.source || "cache",
    );
    render();
    return false;
  }
}

async function publishRoster() {
  if (firebaseEnabled()) return publishFirebaseRoster();
  const token = localStorage.getItem(PILOT_TOKEN_KEY) || "";
  if (!token) {
    throw new Error("Token do piloto nao informado.");
  }
  syncMetaFromInputs();
  const response = await fetch(`${apiBaseUrl()}/api/roster`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pilot-Token": token,
    },
    body: JSON.stringify({
      meta: state.meta,
      duties: state.duties,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Nao foi possivel publicar a escala.");
  }
  state.meta.updatedAt = payload.updatedAt || new Date().toISOString();
  saveLocal();
  render();
  return payload;
}

async function publishFirebaseRoster() {
  if (!firebaseState.user || firebaseState.profile?.role !== "pilot") {
    throw new Error("Entre com uma conta de piloto para publicar.");
  }

  syncMetaFromInputs();
  const rosterMonth = state.duties[0]?.date?.slice(0, 7) || monthKey(state.visibleMonth);
  state.meta.updatedAt = new Date().toISOString();
  const payload = {
    meta: {
      ...state.meta,
      pilotName: els.pilotName.value.trim() || firebaseState.profile.name || "Piloto",
      familyNote: els.familyNote.value.trim(),
      updatedAt: state.meta.updatedAt,
    },
    duties: state.duties,
    publishedBy: firebaseState.user.uid,
    updatedAt: state.meta.updatedAt,
  };

  const pilotRef = firebaseState.db.collection("pilots").doc(firebaseState.user.uid);
  await pilotRef.set({
    displayName: payload.meta.pilotName,
    familyNote: payload.meta.familyNote,
    activeRosterMonth: rosterMonth,
    updatedAt: payload.meta.updatedAt,
  }, { merge: true });
  await pilotRef.collection("rosters").doc(rosterMonth).set(payload);

  firebaseState.targetPilotId = firebaseState.user.uid;
  savePublishedRosterCache({
    meta: payload.meta,
    duties: payload.duties,
  });
  saveLocal();
  render();
  return { ok: true, count: state.duties.length, updatedAt: state.meta.updatedAt };
}

async function extractPdfText(file) {
  if (firebaseEnabled()) return extractPdfTextWithFirebase(file);
  const endpoint = `${apiBaseUrl()}/api/extract-pdf?filename=${encodeURIComponent(file.name || "escala.pdf")}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: file,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Nao foi possivel extrair texto do PDF.");
    }
    return payload;
  } catch (error) {
    if (!String(error.message || error).toLowerCase().includes("fetch")) throw error;
    return extractPdfTextWithXHR(endpoint, file);
  }
}

async function extractPdfTextWithFirebase(file) {
  if (!firebaseState.user) throw new Error("Entre para importar PDF.");
  const callable = firebaseState.functions.httpsCallable("extractRosterPdf");
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > 20 * 1024 * 1024) {
    throw new Error("PDF muito grande. Limite atual: 20 MB.");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  const result = await callable({
    filename: file.name || "escala.pdf",
    pdfBase64: btoa(binary),
  });
  return result.data;
}

async function grantFamilyAccess() {
  if (!firebaseEnabled()) {
    throw new Error("Configure Firebase para liberar familiares.");
  }
  if (!firebaseState.user || firebaseState.profile?.role !== "pilot") {
    throw new Error("Entre com uma conta de piloto.");
  }
  const email = String(els.familyAccessEmail?.value || "").trim();
  if (!email) throw new Error("Informe o email do familiar.");
  const callable = firebaseState.functions.httpsCallable("grantFamilyAccess");
  const result = await callable({ email });
  if (els.familyAccessEmail) els.familyAccessEmail.value = "";
  await loadFamilyAccessList();
  return result.data || { ok: true };
}

async function revokeFamilyAccess({ email, familyUid }) {
  if (!firebaseEnabled()) {
    throw new Error("Configure Firebase para remover familiares.");
  }
  if (!firebaseState.user || firebaseState.profile?.role !== "pilot") {
    throw new Error("Entre com uma conta de piloto.");
  }
  const callable = firebaseState.functions.httpsCallable("revokeFamilyAccess");
  await callable({ email, familyUid });
  await loadFamilyAccessList();
  return true;
}

function extractPdfTextWithXHR(endpoint, file) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", endpoint);
    request.setRequestHeader("Content-Type", "application/pdf");
    request.onload = () => {
      let payload = {};
      try {
        payload = JSON.parse(request.responseText || "{}");
      } catch {
        payload = {};
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(payload);
      } else {
        reject(new Error(payload.error || "Nao foi possivel extrair texto do PDF."));
      }
    };
    request.onerror = () => reject(new Error("Falha de rede ao enviar o PDF. Confirme que o servidor local esta rodando em http://localhost:4173."));
    request.send(file);
  });
}

function bindEvents() {
  els.pilotLoginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (firebaseEnabled()) {
      await authenticateFirebase(false);
    } else {
      await unlockPilot(els.pilotToken?.value || els.authPassword?.value || "");
    }
  });
  els.createAccountButton?.addEventListener("click", () => {
    if (firebaseEnabled()) {
      authenticateFirebase(true);
    } else if (els.loginError) {
      els.loginError.textContent = "Firebase ainda nao foi configurado neste ambiente.";
      els.loginError.classList.add("visible");
    }
  });
  els.logoutButton?.addEventListener("click", logoutPilot);
  els.familyLogoutButton?.addEventListener("click", logoutPilot);
  els.pilotName.addEventListener("change", syncMetaFromInputs);
  els.familyNote.addEventListener("change", syncMetaFromInputs);
  els.fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      clearImportStatus();
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        setImportStatus("Extraindo texto do PDF...", "busy");
        const payload = await extractPdfText(file);
        importDuties(payload.text, `PDF (${payload.pages} pagina(s))`);
      } else {
        importDuties(await file.text(), file.name);
      }
    } catch (error) {
      setImportStatus(error.message || "Falha ao importar arquivo.", "error");
    } finally {
      event.target.value = "";
    }
  });
  els.publishButton?.addEventListener("click", async () => {
    try {
      setImportStatus("Publicando escala...", "busy");
      const payload = await publishRoster();
      setImportStatus(`${payload.count || state.duties.length} item(ns) publicado(s).`, "ok");
    } catch (error) {
      setImportStatus(error.message || "Falha ao publicar escala.", "error");
    }
  });
  els.grantFamilyButton?.addEventListener("click", async () => {
    try {
      setImportStatus("Liberando acesso...", "busy");
      const result = await grantFamilyAccess();
      const message = result.status === "pending"
        ? "Email liberado. O acesso sera ativado quando o familiar criar conta com esse email."
        : "Acesso liberado para o familiar.";
      setImportStatus(message, "ok");
    } catch (error) {
      setImportStatus(firebaseErrorMessage(error), "error");
    }
  });
  els.familyAccessList?.addEventListener("click", async (event) => {
    const button = event.target.closest(".access-remove");
    if (!button) return;
    try {
      setImportStatus("Removendo acesso...", "busy");
      await revokeFamilyAccess({
        email: button.dataset.email || "",
        familyUid: button.dataset.familyUid || "",
      });
      setImportStatus("Acesso removido.", "ok");
    } catch (error) {
      setImportStatus(firebaseErrorMessage(error), "error");
    }
  });
  els.prevMonth.addEventListener("click", () => shiftMonth(-1));
  els.nextMonth.addEventListener("click", () => shiftMonth(1));
  els.todayButton.addEventListener("click", goToToday);
  window.addEventListener("online", () => {
    updateConnectivityStatus();
    if (state.mode === "family") loadPublishedRoster();
  });
  window.addEventListener("offline", updateConnectivityStatus);
}

function init() {
  registerServiceWorker();
  initFirebase();
  const isPilotRoute = isPilotPath();
  const shared = readShareFromUrl();
  bindEvents();

  if (firebaseEnabled() && !shared) {
    setPilotLocked(true);
    firebaseState.auth.onAuthStateChanged((user) => {
      loadFirebaseSession(user).catch((error) => {
        console.error(error);
        if (els.loginError) {
          els.loginError.textContent = firebaseErrorMessage(error);
          els.loginError.classList.add("visible");
        }
        setPilotLocked(true);
      });
    });
    return;
  }

  if (isPilotRoute && !shared) {
    loadLocal();
    if (state.duties[0]) {
      const [year, month] = state.duties[0].date.split("-").map(Number);
      state.visibleMonth = new Date(year, month - 1, 1);
    }
    if (!hasPilotAccess()) {
      setMode("admin");
      setPilotLocked(true);
      return;
    }
    setPilotLocked(false);
    setMode("admin");
    return;
  }
  setPilotLocked(false);
  setMode("family");
  if (!shared) {
    loadPublishedRosterCache();
    updateConnectivityStatus();
    loadPublishedRoster();
  }
}

init();
