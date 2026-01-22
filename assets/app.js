const state = {
  calls: [],
  filtered: []
};

const elements = {
  search: document.getElementById("search"),
  company: document.getElementById("company"),
  fyq: document.getElementById("fyq"),
  theme: document.getElementById("theme"),
  results: document.getElementById("results")
};

const calendarElements = {
  shell: document.querySelector(".calendar-shell"),
  monthLabel: document.getElementById("calendarMonthLabel"),
  grid: document.getElementById("calendarGrid"),
  weekdays: document.getElementById("calendarWeekdays"),
  prev: document.getElementById("calendarPrev"),
  next: document.getElementById("calendarNext"),
  today: document.getElementById("calendarToday"),
  toggle: document.getElementById("calendarToggle")
};

const calendarState = {
  month: null,
  baseEvents: [],
  eventsByYear: new Map(),
  collapsed: true
};

const normalize = (value) => (value || "").toLowerCase();

const uniqueSorted = (items) => Array.from(new Set(items.filter(Boolean))).sort();

const parseDate = (value) => {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateKey = (date) => date.toISOString().slice(0, 10);

const getMonthStart = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const addMonths = (date, months) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const startOfTodayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const pad2 = (value) => String(value).padStart(2, "0");

const isSameMonth = (left, right) => {
  if (!left || !right) {
    return false;
  }
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth();
};

const getCurrentMonthStart = () => getMonthStart(startOfTodayUtc());

const isWeekend = (date) => {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
};

const shiftToWeekday = (date, weekday, direction) => {
  let current = new Date(date.getTime());
  let guard = 0;
  while (current.getUTCDay() !== weekday && guard < 7) {
    current = addDays(current, direction);
    guard += 1;
  }
  return current;
};

const adjustForWeekend = (candidate, targetWeekday, targetYear) => {
  if (!isWeekend(candidate)) {
    return candidate;
  }
  const backward = shiftToWeekday(candidate, targetWeekday, -1);
  const forward = shiftToWeekday(candidate, targetWeekday, 1);
  const backDiff = Math.abs((candidate - backward) / 86400000);
  const forwardDiff = Math.abs((forward - candidate) / 86400000);
  const backYearOk = backward.getUTCFullYear() === targetYear;
  const forwardYearOk = forward.getUTCFullYear() === targetYear;
  if (backYearOk && forwardYearOk) {
    return backDiff <= forwardDiff ? backward : forward;
  }
  if (backYearOk) {
    return backward;
  }
  if (forwardYearOk) {
    return forward;
  }
  return backDiff <= forwardDiff ? backward : forward;
};

const projectDate = (baseDate, targetYear) => {
  if (!baseDate || baseDate.getUTCFullYear() >= targetYear) {
    return null;
  }
  const month = baseDate.getUTCMonth();
  const day = baseDate.getUTCDate();
  let candidate = new Date(Date.UTC(targetYear, month, day));
  if (candidate.getUTCMonth() !== month) {
    candidate = new Date(Date.UTC(targetYear, month + 1, 0));
  }
  return adjustForWeekend(candidate, baseDate.getUTCDay(), targetYear);
};

const shiftFyq = (fyq, offset) => {
  if (!fyq || !offset) {
    return fyq;
  }
  const match = fyq.match(/^FY(\d{4})Q([1-4])$/);
  if (!match) {
    return fyq;
  }
  const nextYear = Number(match[1]) + offset;
  return `FY${nextYear}Q${match[2]}`;
};

const buildFilters = () => {
  const companies = uniqueSorted(state.calls.map((call) => `${call.company} (${call.ticker})`));
  const fyqs = uniqueSorted(state.calls.map((call) => call.fyq));
  const themes = uniqueSorted(state.calls.flatMap((call) => call.themes || []));

  companies.forEach((label) => {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    elements.company.appendChild(option);
  });

  fyqs.forEach((fyq) => {
    const option = document.createElement("option");
    option.value = fyq;
    option.textContent = fyq;
    elements.fyq.appendChild(option);
  });

  themes.forEach((theme) => {
    const option = document.createElement("option");
    option.value = theme;
    option.textContent = theme;
    elements.theme.appendChild(option);
  });
};

const ensureWeekdays = () => {
  if (!calendarElements.weekdays || calendarElements.weekdays.children.length) {
    return;
  }
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((label) => {
    const span = document.createElement("span");
    span.textContent = label;
    calendarElements.weekdays.appendChild(span);
  });
};

const addEventToMap = (map, date, event) => {
  const key = toDateKey(date);
  const list = map.get(key) || [];
  list.push(event);
  map.set(key, list);
};

const buildEventsForYear = (year) => {
  if (calendarState.eventsByYear.has(year)) {
    return calendarState.eventsByYear.get(year);
  }
  const map = new Map();
  const today = startOfTodayUtc();

  const actualKeys = new Set();
  calendarState.baseEvents.forEach((event) => {
    if (event.date.getUTCFullYear() === year) {
      actualKeys.add(`${event.ticker}|${event.fyq}`);
      addEventToMap(map, event.date, {
        ...event,
        type: "actual",
        displayFyq: event.fyq
      });
    }
  });

  calendarState.baseEvents.forEach((event) => {
    if (event.date.getUTCFullYear() >= year) {
      return;
    }
    const projected = projectDate(event.date, year);
    if (!projected) {
      return;
    }
    if (projected < today) {
      return;
    }
    const projectedFyq = shiftFyq(event.fyq, year - event.date.getUTCFullYear());
    if (actualKeys.has(`${event.ticker}|${projectedFyq}`)) {
      return;
    }
    addEventToMap(map, projected, {
      company: event.company,
      ticker: event.ticker,
      fyq: event.fyq,
      path: null,
      date: projected,
      type: "expected",
      displayFyq: projectedFyq
    });
  });

  map.forEach((events) => {
    events.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "actual" ? -1 : 1;
      }
      return a.company.localeCompare(b.company);
    });
  });

  calendarState.eventsByYear.set(year, map);
  return map;
};

const monthHasEvents = (year, month) => {
  const eventsByYear = buildEventsForYear(year);
  const prefix = `${year}-${pad2(month + 1)}-`;
  for (const key of eventsByYear.keys()) {
    if (key.startsWith(prefix)) {
      return true;
    }
  }
  return false;
};

const findMonthWithEvents = (start, direction) => {
  let candidate = getMonthStart(start);
  for (let i = 0; i < 240; i += 1) {
    candidate = addMonths(candidate, direction);
    if (monthHasEvents(candidate.getUTCFullYear(), candidate.getUTCMonth())) {
      return candidate;
    }
  }
  return null;
};

const ensureMonthWithEvents = () => {
  if (!calendarState.collapsed || !calendarState.month) {
    return;
  }
  const year = calendarState.month.getUTCFullYear();
  const month = calendarState.month.getUTCMonth();
  if (monthHasEvents(year, month)) {
    return;
  }
  const next = findMonthWithEvents(calendarState.month, 1);
  if (next) {
    calendarState.month = next;
    return;
  }
  const prev = findMonthWithEvents(calendarState.month, -1);
  if (prev) {
    calendarState.month = prev;
  }
};

const getEventsForDate = (date, year, eventsByYear, eventsByPrevYear, eventsByNextYear) => {
  const dateKey = toDateKey(date);
  if (date.getUTCFullYear() === year) {
    return eventsByYear.get(dateKey) || [];
  }
  if (date.getUTCFullYear() < year) {
    return eventsByPrevYear.get(dateKey) || [];
  }
  return eventsByNextYear.get(dateKey) || [];
};

const updateCalendarToggle = () => {
  if (!calendarElements.toggle || !calendarElements.shell) {
    return;
  }
  calendarElements.toggle.textContent = calendarState.collapsed ? "Expand" : "Collapse";
  calendarElements.shell.classList.toggle("is-collapsed", calendarState.collapsed);
};

const updateTodayButton = () => {
  if (!calendarElements.today) {
    return;
  }
  const currentMonth = getCurrentMonthStart();
  const isCurrent = isSameMonth(calendarState.month, currentMonth);
  calendarElements.today.disabled = isCurrent;
  calendarElements.today.hidden = isCurrent;
};

const renderCalendar = () => {
  if (!calendarElements.grid || !calendarElements.monthLabel) {
    return;
  }

  ensureWeekdays();
  updateCalendarToggle();

  if (!calendarState.month) {
    calendarState.month = getCurrentMonthStart();
  }
  ensureMonthWithEvents();
  const monthStart = calendarState.month;
  updateTodayButton();

  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });

  calendarElements.monthLabel.textContent = monthFormatter.format(monthStart);
  calendarElements.grid.innerHTML = "";

  const year = monthStart.getUTCFullYear();
  const month = monthStart.getUTCMonth();
  const firstDay = monthStart.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeksInView = Math.ceil((firstDay + daysInMonth) / 7);

  const eventsByYear = buildEventsForYear(year);
  const eventsByPrevYear = buildEventsForYear(year - 1);
  const eventsByNextYear = buildEventsForYear(year + 1);

  const now = new Date();
  const todayKey = toDateKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));

  const fragment = document.createDocumentFragment();
  const maxEvents = Number.POSITIVE_INFINITY;
  let cursor = addDays(monthStart, -firstDay);

  for (let week = 0; week < weeksInView; week += 1) {
    const weekDates = [];
    let weekHasEvents = false;

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      weekDates.push(cursor);
      if (!weekHasEvents) {
        const events = (!calendarState.collapsed || cursor.getUTCMonth() === month)
          ? getEventsForDate(cursor, year, eventsByYear, eventsByPrevYear, eventsByNextYear)
          : [];
        if (events.length) {
          weekHasEvents = true;
        }
      }
      cursor = addDays(cursor, 1);
    }

    if (calendarState.collapsed && !weekHasEvents) {
      continue;
    }

    weekDates.forEach((dayDate) => {
      const dateKey = toDateKey(dayDate);
      const cell = document.createElement("div");
      cell.className = "calendar-day";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", dayFormatter.format(dayDate));

      if (dayDate.getUTCMonth() !== month) {
        cell.classList.add("is-outside");
      }
      if (dateKey === todayKey) {
        cell.classList.add("is-today");
      }

      const number = document.createElement("div");
      number.className = "day-number";
      number.textContent = String(dayDate.getUTCDate());
      cell.appendChild(number);

      const eventsHolder = document.createElement("div");
      eventsHolder.className = "day-events";

      const events = (!calendarState.collapsed || dayDate.getUTCMonth() === month)
        ? getEventsForDate(dayDate, year, eventsByYear, eventsByPrevYear, eventsByNextYear)
        : [];
      const visibleEvents = events.slice(0, maxEvents);

      visibleEvents.forEach((event) => {
        const item = document.createElement("div");
        item.className = `day-event ${event.type}`;

        const title = document.createElement("div");
        title.className = "event-title";
        if (event.type === "actual" && event.path) {
          const link = document.createElement("a");
          link.href = `call.html?path=${encodeURIComponent(event.path)}`;
          link.textContent = event.company;
          title.appendChild(link);
        } else {
          title.textContent = event.company;
        }

        const meta = document.createElement("div");
        meta.className = "event-meta";
        const metaText = document.createElement("span");
        const metaParts = [event.ticker, event.displayFyq || event.fyq].filter(Boolean);
        metaText.textContent = metaParts.join(" - ");
        meta.appendChild(metaText);

        if (event.type === "expected") {
          const badge = document.createElement("span");
          badge.className = "event-badge expected";
          badge.textContent = "Expected";
          meta.appendChild(badge);
        }

        item.appendChild(title);
        item.appendChild(meta);
        eventsHolder.appendChild(item);
      });

      if (events.length > maxEvents) {
        const more = document.createElement("div");
        more.className = "day-more";
        more.textContent = `+${events.length - maxEvents} more`;
        eventsHolder.appendChild(more);
      }

      cell.appendChild(eventsHolder);
      fragment.appendChild(cell);
    });
  }

  calendarElements.grid.appendChild(fragment);
};

const matchesFilters = (call) => {
  const query = normalize(elements.search.value);
  const companyFilter = elements.company.value;
  const fyqFilter = elements.fyq.value;
  const themeFilter = elements.theme.value;
  const callDate = parseDate(call.call_date);
  if (callDate && callDate > startOfTodayUtc()) {
    return false;
  }

  if (companyFilter && `${call.company} (${call.ticker})` !== companyFilter) {
    return false;
  }

  if (fyqFilter && call.fyq !== fyqFilter) {
    return false;
  }

  if (themeFilter && !(call.themes || []).includes(themeFilter)) {
    return false;
  }

  if (query) {
    const blob = normalize(call.search_blob || [
      call.company,
      call.ticker,
      call.fyq,
      call.tldr,
      ...(call.bullets || []),
      ...(call.themes || [])
    ].join(" "));
    if (!blob.includes(query)) {
      return false;
    }
  }

  return true;
};

const renderResults = () => {
  elements.results.innerHTML = "";

  const matches = state.calls.filter(matchesFilters).sort((a, b) => {
    return (b.call_date || "").localeCompare(a.call_date || "");
  });

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.innerHTML = "<h3>No matches</h3><p>Try removing a filter or adjusting your search.</p>";
    elements.results.appendChild(empty);
    return;
  }

  matches.forEach((call, index) => {
    const card = document.createElement("article");
    card.className = "card";
    card.style.animationDelay = `${Math.min(index * 0.05, 0.3)}s`;

    const link = `call.html?path=${encodeURIComponent(call.path)}`;
    const themes = (call.themes || []).slice(0, 4).map((theme) => `<span class="tag">${theme}</span>`).join("");

    card.innerHTML = `
      ${call.incomplete ? '<span class="incomplete">Incomplete</span>' : ""}
      <h3><a href="${link}">${call.company}</a></h3>
      <div class="meta">
        <span>${call.ticker}</span>
        <span>${call.fyq}</span>
        <span>${call.call_date || ""}</span>
      </div>
      <p>${call.tldr || "No TL;DR yet."}</p>
      <div class="taglist">${themes}</div>
    `;

    elements.results.appendChild(card);
  });
};

const setupCalendar = () => {
  if (!calendarElements.shell) {
    return;
  }

  calendarState.baseEvents = state.calls.map((call) => {
    const date = parseDate(call.call_date);
    if (!date) {
      return null;
    }
    return {
      company: call.company,
      ticker: call.ticker,
      fyq: call.fyq,
      path: call.path,
      date
    };
  }).filter(Boolean);

  calendarState.eventsByYear.clear();
  calendarState.month = getCurrentMonthStart();

  const shiftMonth = (direction) => {
    if (calendarState.collapsed) {
      const next = findMonthWithEvents(calendarState.month, direction);
      if (next) {
        calendarState.month = next;
      }
    } else {
      calendarState.month = addMonths(calendarState.month, direction);
    }
    renderCalendar();
  };

  if (calendarElements.prev) {
    calendarElements.prev.addEventListener("click", () => {
      shiftMonth(-1);
    });
  }

  if (calendarElements.next) {
    calendarElements.next.addEventListener("click", () => {
      shiftMonth(1);
    });
  }

  if (calendarElements.today) {
    calendarElements.today.addEventListener("click", () => {
      const currentMonth = getCurrentMonthStart();
      calendarState.month = currentMonth;
      if (calendarState.collapsed && !monthHasEvents(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth())) {
        calendarState.collapsed = false;
      }
      renderCalendar();
    });
  }

  if (calendarElements.toggle) {
    calendarElements.toggle.addEventListener("click", () => {
      calendarState.collapsed = !calendarState.collapsed;
      renderCalendar();
    });
  }

  renderCalendar();
};

const init = async () => {
  try {
    const response = await fetch("index.json", { cache: "no-store" });
    const data = await response.json();
    state.calls = data.calls || [];
    buildFilters();
    renderResults();
    setupCalendar();
  } catch (error) {
    elements.results.innerHTML = "<div class=\"card\"><h3>Index missing</h3><p>Ensure /index.json is present and valid JSON.</p></div>";
    setupCalendar();
  }
};

[elements.search, elements.company, elements.fyq, elements.theme].forEach((input) => {
  input.addEventListener("input", renderResults);
  input.addEventListener("change", renderResults);
});

init();
