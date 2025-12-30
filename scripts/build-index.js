const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const callsDir = path.join(root, "calls");

const readJson = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const listJsonFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsonFiles(full);
    if (entry.isFile() && entry.name.endsWith(".json")) return [full];
    return [];
  });
};

const normalize = (value) => String(value || "");

const buildSearchBlob = (data) => {
  const fields = [
    data.company,
    data.ticker,
    data.fyq,
    data.call_date,
    data.tldr,
    ...(data.bullets || []),
    ...(data.themes || [])
  ];

  const deep = data.deep_dive || {};
  (deep.segments || []).forEach((segment) => {
    fields.push(segment.title, ...(segment.points || []), segment.body);
  });
  (deep.notes || []).forEach((note) => {
    fields.push(note.title, ...(note.points || []), note.body);
  });

  const qna = data.qna || {};
  (qna.themes || []).forEach((theme) => {
    fields.push(theme.title, ...(theme.points || []), theme.body);
  });
  (qna.top_questions || []).forEach((item) => {
    fields.push(item.question, item.summary);
  });

  const vdc = data.vdc_angle || {};
  fields.push(...(vdc.implications || []), ...(vdc.competitive_notes || []), ...(vdc.forecast_hooks || []));

  const follow = data.follow_ups || {};
  fields.push(...(follow.action_items || []), ...(follow.open_questions || []), ...(follow.watch_next_quarter || []));

  return fields.filter(Boolean).map(normalize).join(" ");
};

const isIncomplete = (data) => {
  if (!data.participants || !data.participants.length) return true;
  if (!data.bullets || data.bullets.length < 3) return true;
  const deep = data.deep_dive || {};
  const hasDeep = (deep.segments && deep.segments.length) || (deep.notes && deep.notes.length) || (deep.metrics && (deep.metrics.numbers || deep.metrics.guidance));
  if (!hasDeep) return true;

  const qna = data.qna || {};
  const hasQna = (qna.themes && qna.themes.length) || (qna.top_questions && qna.top_questions.length);
  if (!hasQna) return true;

  const vdc = data.vdc_angle || {};
  const hasVdc = (vdc.implications && vdc.implications.length) || (vdc.competitive_notes && vdc.competitive_notes.length) || (vdc.forecast_hooks && vdc.forecast_hooks.length);
  if (!hasVdc) return true;

  const follow = data.follow_ups || {};
  const hasFollow = (follow.action_items && follow.action_items.length) || (follow.open_questions && follow.open_questions.length) || (follow.watch_next_quarter && follow.watch_next_quarter.length);
  if (!hasFollow) return true;
  return false;
};

const buildIndex = () => {
  const files = listJsonFiles(callsDir);
  const calls = files.map((filePath) => {
    const data = readJson(filePath);
    const relativePath = path.relative(root, filePath).replace(/\\/g, "/");
    return {
      company: data.company,
      ticker: data.ticker,
      fyq: data.fyq,
      call_date: data.call_date,
      tldr: data.tldr,
      bullets: data.bullets || [],
      themes: data.themes || [],
      path: relativePath,
      incomplete: isIncomplete(data),
      search_blob: buildSearchBlob(data)
    };
  });

  calls.sort((a, b) => (b.call_date || "").localeCompare(a.call_date || ""));

  const index = {
    generated_at: new Date().toISOString().slice(0, 10),
    calls
  };

  fs.writeFileSync(path.join(root, "index.json"), JSON.stringify(index, null, 2));
};

buildIndex();
