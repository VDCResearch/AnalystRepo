const fs = require("fs");
const path = require("path");
const https = require("https");

const root = path.resolve(__dirname, "..");
const outputPath = path.join(root, "calendar.json");

const argv = process.argv.slice(2);
const readArg = (flag) => {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
};

const FEED_URL = process.env.CALENDAR_FEED_URL || readArg("--url");

const downloadText = (url) => new Promise((resolve, reject) => {
  const request = https.get(url, { headers: { "User-Agent": "AnalystRepo calendar fetch" } }, (response) => {
    const { statusCode, headers } = response;
    if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
      response.resume();
      downloadText(headers.location).then(resolve, reject);
      return;
    }
    if (statusCode !== 200) {
      response.resume();
      reject(new Error(`Unexpected response ${statusCode || "unknown"} for ${url}`));
      return;
    }
    response.setEncoding("utf8");
    let body = "";
    response.on("data", (chunk) => {
      body += chunk;
    });
    response.on("end", () => resolve(body));
  });
  request.on("error", reject);
});

const unfoldIcs = (text) => {
  const rawLines = text.split(/\r?\n/);
  const lines = [];
  rawLines.forEach((line) => {
    if (!line) return;
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
      return;
    }
    lines.push(line);
  });
  return lines;
};

const unescapeIcs = (value) => {
  if (!value) return "";
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";");
};

const parseProperty = (line) => {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }
  const head = line.slice(0, colonIndex);
  const value = unescapeIcs(line.slice(colonIndex + 1));
  const parts = head.split(";");
  const name = (parts[0] || "").toUpperCase();
  const params = {};
  parts.slice(1).forEach((part) => {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) return;
    const key = part.slice(0, eqIndex).toUpperCase();
    const paramValue = part.slice(eqIndex + 1);
    if (!key) return;
    params[key] = paramValue;
  });
  return { name, params, value };
};

const parseIcsDate = (prop) => {
  if (!prop || !prop.value) {
    return null;
  }
  const raw = prop.value.trim();
  const isDateOnly = prop.params.VALUE === "DATE" || /^\d{8}$/.test(raw);
  if (isDateOnly) {
    const match = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return null;
    return { date, allDay: true };
  }

  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || "0");
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(date.getTime())) return null;
  return { date, allDay: false };
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const firstHref = (html) => {
  if (!html) return null;
  const match = html.match(/href=\"([^\"]+)\"/i);
  return match ? match[1] : null;
};

const parseIcsEvents = (icsText) => {
  const lines = unfoldIcs(icsText);
  const events = [];
  let current = null;

  lines.forEach((line) => {
    if (line === "BEGIN:VEVENT") {
      current = {};
      return;
    }
    if (line === "END:VEVENT") {
      if (current) {
        events.push(current);
      }
      current = null;
      return;
    }
    if (!current) {
      return;
    }
    const prop = parseProperty(line);
    if (!prop || !prop.name) {
      return;
    }

    if (prop.name === "UID") current.uid = prop.value;
    if (prop.name === "SUMMARY") current.summary = prop.value;
    if (prop.name === "DESCRIPTION") current.description = prop.value;
    if (prop.name === "X-ALT-DESC") current.altDescription = prop.value;
    if (prop.name === "DTSTART") current.dtstart = prop;
    if (prop.name === "DTEND") current.dtend = prop;
  });

  const isQuarterSummary = (summary) => / - Q[1-4]\s+\d{4}\b/i.test(String(summary || ""));

  const normalized = events.map((raw) => {
    const start = parseIcsDate(raw.dtstart);
    if (!start) return null;
    const end = parseIcsDate(raw.dtend);
    const summary = (raw.summary || "").trim();
    const description = raw.altDescription || raw.description || "";
    const url = firstHref(description);

    return {
      id: raw.uid || summary,
      title: summary || "Untitled event",
      date: toIsoDate(start.date),
      start: start.date.toISOString(),
      end: end ? end.date.toISOString() : null,
      all_day: start.allDay,
      url
    };
  }).filter(Boolean).filter((event) => isQuarterSummary(event.title));

  normalized.sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  return normalized;
};

const build = async () => {
  if (!FEED_URL) {
    console.error("Missing CALENDAR_FEED_URL env var (or pass --url <feedUrl>).");
    process.exitCode = 1;
    return;
  }

  const ics = await downloadText(FEED_URL);
  const events = parseIcsEvents(ics);

  const payload = {
    source: "quartr",
    events
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${events.length} events to ${path.relative(root, outputPath)}`);
};

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
