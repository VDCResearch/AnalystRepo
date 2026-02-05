const state = {
  calls: [],
  filtered: [],
  calendar: []
};

const elements = {
  search: document.getElementById("search"),
  company: document.getElementById("company"),
  fyq: document.getElementById("fyq"),
  theme: document.getElementById("theme"),
  sort: document.getElementById("sort"),
  clearFilters: document.getElementById("clearFilters"),
  resultsSummary: document.getElementById("resultsSummary"),
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
  toggle: document.getElementById("calendarToggle"),
  legend: document.getElementById("calendarLegend")
};

const calendarState = {
  month: null,
  baseEvents: [],
  eventsByYear: new Map(),
  collapsed: true,
  mode: "calls"
};

const FILTER_DEFAULTS = Object.freeze({
  search: "",
  company: "",
  fyq: "",
  theme: "",
  sort: "date_desc"
});

const SORT_OPTIONS = new Set(["date_desc", "date_asc", "company_asc", "company_desc"]);
const TAG_TONE_COUNT = 8;

const normalize = (value) => (value || "").toLowerCase();

const uniqueSorted = (items) => Array.from(new Set(items.filter(Boolean))).sort();

const hashText = (value) => {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const getTagTone = (value) => hashText(normalize(value)) % TAG_TONE_COUNT;

const renderThemeTags = (themes) => {
  return (themes || [])
    .slice(0, 4)
    .map((theme) => `<span class="tag tone-${getTagTone(theme)}">${theme}</span>`)
    .join("");
};

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

const getFilterState = () => ({
  search: (elements.search?.value || "").trim(),
  company: elements.company?.value || "",
  fyq: elements.fyq?.value || "",
  theme: elements.theme?.value || "",
  sort: elements.sort?.value || FILTER_DEFAULTS.sort
});

const getInitialFiltersFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const sortParam = params.get("sort");
  return {
    search: params.get("search") || FILTER_DEFAULTS.search,
    company: params.get("company") || FILTER_DEFAULTS.company,
    fyq: params.get("fyq") || FILTER_DEFAULTS.fyq,
    theme: params.get("theme") || FILTER_DEFAULTS.theme,
    sort: SORT_OPTIONS.has(sortParam) ? sortParam : FILTER_DEFAULTS.sort
  };
};

const INITIAL_FILTERS = getInitialFiltersFromUrl();

const applyInitialFilters = () => {
  elements.search.value = INITIAL_FILTERS.search;
  elements.sort.value = INITIAL_FILTERS.sort;

  const hasCompany = Array.from(elements.company.options).some((option) => option.value === INITIAL_FILTERS.company);
  elements.company.value = hasCompany ? INITIAL_FILTERS.company : FILTER_DEFAULTS.company;

  const hasFyq = Array.from(elements.fyq.options).some((option) => option.value === INITIAL_FILTERS.fyq);
  elements.fyq.value = hasFyq ? INITIAL_FILTERS.fyq : FILTER_DEFAULTS.fyq;

  const hasTheme = Array.from(elements.theme.options).some((option) => option.value === INITIAL_FILTERS.theme);
  elements.theme.value = hasTheme ? INITIAL_FILTERS.theme : FILTER_DEFAULTS.theme;
};

const countActiveFilters = (filters) => {
  return [filters.search, filters.company, filters.fyq, filters.theme].filter(Boolean).length;
};

const hasActiveFilters = () => countActiveFilters(getFilterState()) > 0;

const compareByDateDesc = (left, right) => (right.call_date || "").localeCompare(left.call_date || "");
const compareByDateAsc = (left, right) => (left.call_date || "").localeCompare(right.call_date || "");
const compareByCompanyAsc = (left, right) => left.company.localeCompare(right.company) || compareByDateDesc(left, right);
const compareByCompanyDesc = (left, right) => right.company.localeCompare(left.company) || compareByDateDesc(left, right);

const sortMatches = (calls) => {
  const sorted = [...calls];
  const selectedSort = SORT_OPTIONS.has(elements.sort.value) ? elements.sort.value : FILTER_DEFAULTS.sort;

  if (selectedSort === "date_asc") {
    return sorted.sort(compareByDateAsc);
  }
  if (selectedSort === "company_asc") {
    return sorted.sort(compareByCompanyAsc);
  }
  if (selectedSort === "company_desc") {
    return sorted.sort(compareByCompanyDesc);
  }
  return sorted.sort(compareByDateDesc);
};

const syncFiltersToUrl = () => {
  const filters = getFilterState();
  const params = new URLSearchParams(window.location.search);

  if (filters.search) {
    params.set("search", filters.search);
  } else {
    params.delete("search");
  }

  if (filters.company) {
    params.set("company", filters.company);
  } else {
    params.delete("company");
  }

  if (filters.fyq) {
    params.set("fyq", filters.fyq);
  } else {
    params.delete("fyq");
  }

  if (filters.theme) {
    params.set("theme", filters.theme);
  } else {
    params.delete("theme");
  }

  if (filters.sort && filters.sort !== FILTER_DEFAULTS.sort) {
    params.set("sort", filters.sort);
  } else {
    params.delete("sort");
  }

  const next = params.toString();
  const current = window.location.search.replace(/^\?/, "");
  if (next !== current) {
    const target = `${window.location.pathname}${next ? `?${next}` : ""}`;
    window.history.replaceState(null, "", target);
  }
};

const updateResultsSummary = (matchesCount) => {
  if (!elements.resultsSummary) {
    return;
  }
  const filters = getFilterState();
  const activeFilters = countActiveFilters(filters);
  const summary = `${matchesCount} of ${state.calls.length} call briefs`;
  const suffix = activeFilters ? ` - ${activeFilters} filter${activeFilters === 1 ? "" : "s"} active` : "";
  elements.resultsSummary.textContent = `${summary}${suffix}`;
};

const updateClearFiltersButton = () => {
  if (!elements.clearFilters) {
    return;
  }
  const active = hasActiveFilters();
  elements.clearFilters.disabled = !active;
};

const clearFilters = () => {
  elements.search.value = FILTER_DEFAULTS.search;
  elements.company.value = FILTER_DEFAULTS.company;
  elements.fyq.value = FILTER_DEFAULTS.fyq;
  elements.theme.value = FILTER_DEFAULTS.theme;
  elements.sort.value = FILTER_DEFAULTS.sort;
  renderResults();
  elements.search.focus();
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

  if (calendarState.mode === "feed") {
    calendarState.baseEvents.forEach((event) => {
      if (event.date.getUTCFullYear() === year) {
        addEventToMap(map, event.date, event);
      }
    });

    map.forEach((events) => {
      events.sort((a, b) => {
        const timeDiff = a.date - b.date;
        if (timeDiff !== 0) {
          return timeDiff;
        }
        return a.company.localeCompare(b.company);
      });
    });

    calendarState.eventsByYear.set(year, map);
    return map;
  }

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

const updateCalendarLegend = () => {
  if (!calendarElements.legend) {
    return;
  }

  if (calendarState.mode === "feed") {
    calendarElements.legend.innerHTML = "<span class=\"legend-item\"><span class=\"legend-swatch actual\"></span>Quartr feed</span>";
    return;
  }

  calendarElements.legend.innerHTML = "<span class=\"legend-item\"><span class=\"legend-swatch actual\"></span>Actual</span><span class=\"legend-item\"><span class=\"legend-swatch expected\"></span>Expected</span>";
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

const pickCollapsedWeekRows = (weekRows) => {
  if (!weekRows.length) {
    return [];
  }

  const today = startOfTodayUtc();
  const upcomingOrCurrent = weekRows.find((weekRow) => weekRow.hasEvents && weekRow.end >= today);
  if (upcomingOrCurrent) {
    return [upcomingOrCurrent];
  }

  const recentWithEvents = [...weekRows].reverse().find((weekRow) => weekRow.hasEvents);
  if (recentWithEvents) {
    return [recentWithEvents];
  }

  return [weekRows[0]];
};

const renderCalendar = () => {
  if (!calendarElements.grid || !calendarElements.monthLabel) {
    return;
  }

  ensureWeekdays();
  updateCalendarToggle();
  updateCalendarLegend();

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
  const maxEvents = calendarState.collapsed ? 3 : 6;
  let cursor = addDays(monthStart, -firstDay);
  const weekRows = [];

  for (let week = 0; week < weeksInView; week += 1) {
    const weekDates = [];
    let weekHasEvents = false;

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      weekDates.push(cursor);
      if (!weekHasEvents) {
        const events = cursor.getUTCMonth() === month
          ? getEventsForDate(cursor, year, eventsByYear, eventsByPrevYear, eventsByNextYear)
          : [];
        if (events.length) {
          weekHasEvents = true;
        }
      }
      cursor = addDays(cursor, 1);
    }

    weekRows.push({
      weekDates,
      hasEvents: weekHasEvents,
      end: weekDates[6]
    });
  }

  const weekRowsToRender = calendarState.collapsed ? pickCollapsedWeekRows(weekRows) : weekRows;

  weekRowsToRender.forEach(({ weekDates }) => {
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
        const hasCallLink = event.type === "actual" && event.path;
        const hasExternalLink = !hasCallLink && event.url;
        if (hasCallLink || hasExternalLink) {
          const titleLink = document.createElement("a");
          titleLink.href = hasCallLink
            ? `call.html?path=${encodeURIComponent(event.path)}`
            : event.url;
          if (hasExternalLink) {
            titleLink.target = "_blank";
            titleLink.rel = "noopener noreferrer";
          }
          titleLink.textContent = event.company;
          title.appendChild(titleLink);
        } else {
          title.textContent = event.company;
        }

        item.appendChild(title);

        const metaParts = [];
        const fyqLabel = event.displayFyq || event.fyq;
        if (event.ticker) metaParts.push(event.ticker);
        if (fyqLabel) metaParts.push(fyqLabel);
        if (event.timeLabel) metaParts.push(event.timeLabel);

        const metaHasExpected = event.type === "expected";
        const metaHasText = metaParts.length > 0;

        if (metaHasText || metaHasExpected) {
          const meta = document.createElement("div");
          meta.className = "event-meta";

          if (metaHasText) {
            const metaText = document.createElement("span");
            metaText.textContent = metaParts.join(" - ");
            meta.appendChild(metaText);
          }

          if (metaHasExpected) {
            const badge = document.createElement("span");
            badge.className = "event-badge expected";
            badge.textContent = "Expected";
            meta.appendChild(badge);
          }

          item.appendChild(meta);
        }
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
  });

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

  const matches = sortMatches(state.calls.filter(matchesFilters));
  state.filtered = matches;
  updateResultsSummary(matches.length);
  updateClearFiltersButton();
  syncFiltersToUrl();

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "card empty-state";
    empty.innerHTML = `
      <h3>No matches</h3>
      <p>Try removing a filter or adjusting your search terms.</p>
      <button class="button ghost mini" type="button" data-clear-empty>Clear filters</button>
    `;
    const clearButton = empty.querySelector("[data-clear-empty]");
    if (clearButton) {
      clearButton.addEventListener("click", clearFilters);
    }
    elements.results.appendChild(empty);
    return;
  }

  matches.forEach((call, index) => {
    const card = document.createElement("article");
    card.className = "card";
    card.style.animationDelay = `${Math.min(index * 0.05, 0.3)}s`;

    const link = `call.html?path=${encodeURIComponent(call.path)}`;
    const themes = renderThemeTags(call.themes);

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

  const feedEvents = (state.calendar || []).filter(Boolean);

  if (feedEvents.length) {
    calendarState.mode = "feed";
    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit"
    });
    calendarState.baseEvents = feedEvents.map((event) => {
      const start = event.start ? new Date(event.start) : null;
      if (!start || Number.isNaN(start.getTime())) {
        return null;
      }
      const timeLabel = event.all_day ? "All day" : timeFormatter.format(start);
      return {
        company: event.title || "Untitled event",
        ticker: "",
        fyq: "",
        path: null,
        url: event.url || null,
        date: start,
        type: "actual",
        timeLabel
      };
    }).filter(Boolean);
  } else {
    calendarState.mode = "calls";
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
        date,
        type: "actual"
      };
    }).filter(Boolean);
  }

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

const setupInteractions = () => {
  [elements.search, elements.company, elements.fyq, elements.theme, elements.sort].forEach((input) => {
    input.addEventListener("input", renderResults);
    input.addEventListener("change", renderResults);
  });

  if (elements.clearFilters) {
    elements.clearFilters.addEventListener("click", clearFilters);
  }

  // "/" focuses search unless user is already typing in a form field.
  document.addEventListener("keydown", (event) => {
    const isTyping = event.target instanceof HTMLElement
      && (event.target.tagName === "INPUT"
        || event.target.tagName === "TEXTAREA"
        || event.target.tagName === "SELECT"
        || event.target.isContentEditable);
    if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping) {
      event.preventDefault();
      elements.search.focus();
      elements.search.select();
    }
  });
};

const init = async () => {
  setupInteractions();

  try {
    const response = await fetch("index.json", { cache: "no-store" });
    const data = await response.json();
    state.calls = data.calls || [];

    try {
      const calendarResponse = await fetch("calendar.json", { cache: "no-store" });
      if (calendarResponse.ok) {
        const calendarData = await calendarResponse.json();
        state.calendar = calendarData.events || [];
      } else {
        state.calendar = [];
      }
    } catch (error) {
      state.calendar = [];
    }
    buildFilters();
    applyInitialFilters();
    renderResults();
    setupCalendar();
  } catch (error) {
    elements.results.innerHTML = "<div class=\"card\"><h3>Index missing</h3><p>Ensure /index.json is present and valid JSON.</p></div>";
    updateResultsSummary(0);
    updateClearFiltersButton();
    setupCalendar();
  }
};

init();
