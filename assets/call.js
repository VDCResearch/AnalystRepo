const tabs = [
  { key: "snapshot", label: "Snapshot" },
  { key: "deep_dive", label: "Deep Dive" },
  { key: "qna", label: "Q&A" },
  { key: "vdc_angle", label: "VDC Angle" },
  { key: "follow_ups", label: "Follow-ups" }
];

const callBadges = document.getElementById("callBadges");
const callTitle = document.getElementById("callTitle");
const callMeta = document.getElementById("callMeta");
const callParticipants = document.getElementById("callParticipants");
const tabBar = document.getElementById("tabBar");
const tabPanels = document.getElementById("tabPanels");
const toc = document.getElementById("toc");
const tocMeta = document.getElementById("tocMeta");
const callNav = document.getElementById("callNav");
const expandSectionsButton = document.getElementById("expandSections");
const collapseSectionsButton = document.getElementById("collapseSections");
const backToTopButton = document.getElementById("backToTop");

const emailShare = document.getElementById("emailShare");
const copyBriefButton = document.getElementById("copyBrief");
const copyAllButton = document.getElementById("copyAll");

const tabState = {
  activeKey: tabs[0].key,
  sectionSlugCounts: new Map(),
  sectionObserver: null
};

const getQuery = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    path: params.get("path"),
    ticker: params.get("ticker"),
    fyq: params.get("fyq")
  };
};

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const createUniqueSectionId = (rawId) => {
  const base = slugify(rawId || "section") || "section";
  const current = tabState.sectionSlugCounts.get(base) || 0;
  tabState.sectionSlugCounts.set(base, current + 1);
  return current === 0 ? base : `${base}-${current + 1}`;
};

const getInitialTab = () => {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("tab");
  if (tabs.some((tab) => tab.key === requested)) {
    return requested;
  }
  return tabs[0].key;
};

const updateSectionAria = (section, header, toggle) => {
  const collapsed = section.classList.contains("collapsed");
  header.setAttribute("aria-expanded", collapsed ? "false" : "true");
  toggle.textContent = collapsed ? "+" : "-";
};

const createSection = (title, bodyHtml, options = {}) => {
  const section = document.createElement("section");
  section.className = "section";
  if (options.collapsed) {
    section.classList.add("collapsed");
  }
  section.id = createUniqueSectionId(options.id || title);

  const header = document.createElement("div");
  header.className = "section-header";
  header.setAttribute("role", "button");
  header.setAttribute("tabindex", "0");

  const heading = document.createElement(options.level || "h3");
  heading.textContent = title;

  const toggle = document.createElement("span");
  toggle.className = "section-toggle";

  header.appendChild(heading);
  header.appendChild(toggle);

  const content = document.createElement("div");
  content.className = "section-content";
  content.innerHTML = bodyHtml;

  const onToggleSection = () => {
    section.classList.toggle("collapsed");
    updateSectionAria(section, header, toggle);
  };
  header.addEventListener("click", onToggleSection);
  header.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggleSection();
    }
  });

  section.appendChild(header);
  section.appendChild(content);
  updateSectionAria(section, header, toggle);

  return section;
};

const createList = (items) => {
  if (!items || !items.length) {
    return "<p>No notes yet.</p>";
  }
  const rows = items.map((item) => `<li>${item}</li>`).join("");
  return `<ul>${rows}</ul>`;
};

const buildSnapshot = (data) => {
  const wrapper = document.createElement("div");

  const tldr = document.createElement("div");
  tldr.className = "tldr";
  tldr.textContent = data.tldr || "TL;DR pending.";
  wrapper.appendChild(tldr);

  const bullets = createList(data.bullets || []);
  wrapper.appendChild(createSection("Snapshot bullets", bullets, { collapsed: false, id: "snapshot-bullets" }));

  return wrapper;
};

const renderMetrics = (metrics, title) => {
  if (!metrics || !metrics.length) {
    return "";
  }
  const cards = metrics.map((metric) => {
    const note = metric.note ? `<small>${metric.note}</small>` : "";
    return `
      <div class="metric-card">
        <h5>${metric.label}</h5>
        <p>${metric.value || ""}</p>
        ${note}
      </div>
    `;
  }).join("");
  return `
    <h4>${title}</h4>
    <div class="metrics-grid">${cards}</div>
  `;
};

const buildDeepDive = (data) => {
  const wrapper = document.createElement("div");
  const deep = data.deep_dive || {};

  (deep.segments || []).forEach((segment, index) => {
    const body = segment.body ? `<p>${segment.body}</p>` : createList(segment.points || []);
    wrapper.appendChild(createSection(segment.title || `Segment ${index + 1}`, body, { collapsed: false }));
  });

  if (deep.metrics && (deep.metrics.numbers || deep.metrics.guidance)) {
    const metricsHtml = [
      renderMetrics(deep.metrics.numbers, "Key numbers"),
      renderMetrics(deep.metrics.guidance, "Guidance")
    ].join("");
    wrapper.appendChild(createSection("Numbers & guidance", metricsHtml, { collapsed: false, id: "numbers-guidance" }));
  }

  (deep.notes || []).forEach((note, index) => {
    const body = note.body ? `<p>${note.body}</p>` : createList(note.points || []);
    wrapper.appendChild(createSection(note.title || `Deep note ${index + 1}`, body, { collapsed: false }));
  });

  if (!wrapper.children.length) {
    wrapper.appendChild(createSection("Deep Dive", "<p>No deep dive notes yet.</p>", { collapsed: false }));
  }

  return wrapper;
};

const buildQna = (data) => {
  const wrapper = document.createElement("div");
  const qna = data.qna || {};

  if (qna.themes && qna.themes.length) {
    qna.themes.forEach((theme, index) => {
      const body = theme.body ? `<p>${theme.body}</p>` : createList(theme.points || []);
      wrapper.appendChild(createSection(theme.title || `Theme ${index + 1}`, body, { collapsed: false }));
    });
  }

  if (qna.top_questions && qna.top_questions.length) {
    const questions = qna.top_questions.map((item) => `<li><strong>${item.question}</strong><br />${item.summary || ""}</li>`).join("");
    wrapper.appendChild(createSection("Top questions", `<ul>${questions}</ul>`, { collapsed: false, id: "top-questions" }));
  }

  if (!wrapper.children.length) {
    wrapper.appendChild(createSection("Q&A", "<p>No Q&A notes yet.</p>", { collapsed: false }));
  }

  return wrapper;
};

const buildVdc = (data) => {
  const wrapper = document.createElement("div");
  const vdc = data.vdc_angle || {};

  wrapper.appendChild(createSection("Implications for connected worker", createList(vdc.implications || []), { collapsed: false, id: "vdc-implications" }));
  wrapper.appendChild(createSection("Competitive notes", createList(vdc.competitive_notes || []), { collapsed: false, id: "vdc-competitive" }));
  wrapper.appendChild(createSection("Forecast hooks", createList(vdc.forecast_hooks || []), { collapsed: false, id: "vdc-forecast" }));

  return wrapper;
};

const buildFollowUps = (data) => {
  const wrapper = document.createElement("div");
  const follow = data.follow_ups || {};

  wrapper.appendChild(createSection("Action items", createList(follow.action_items || []), { collapsed: false, id: "follow-actions" }));
  wrapper.appendChild(createSection("Open questions", createList(follow.open_questions || []), { collapsed: false, id: "follow-open" }));
  wrapper.appendChild(createSection("Watch next quarter", createList(follow.watch_next_quarter || []), { collapsed: false, id: "follow-watch" }));

  return wrapper;
};

const buildTabPanels = (data) => {
  tabPanels.innerHTML = "";
  tabBar.innerHTML = "";
  tabBar.setAttribute("role", "tablist");
  tabState.sectionSlugCounts.clear();

  tabs.forEach((tab, index) => {
    const button = document.createElement("button");
    button.className = "tab-button";
    button.textContent = tab.label;
    button.dataset.tab = tab.key;
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `panel-${tab.key}`);
    if (index === 0) {
      button.classList.add("active");
    }
    tabBar.appendChild(button);

    const panel = document.createElement("div");
    panel.className = "tab-panel";
    panel.dataset.tab = tab.key;
    panel.id = `panel-${tab.key}`;
    panel.setAttribute("role", "tabpanel");
    if (index === 0) {
      panel.classList.add("active");
    }

    const content = document.createElement("div");
    if (tab.key === "snapshot") {
      content.appendChild(buildSnapshot(data));
    } else if (tab.key === "deep_dive") {
      content.appendChild(buildDeepDive(data));
    } else if (tab.key === "qna") {
      content.appendChild(buildQna(data));
    } else if (tab.key === "vdc_angle") {
      content.appendChild(buildVdc(data));
    } else if (tab.key === "follow_ups") {
      content.appendChild(buildFollowUps(data));
    }

    panel.appendChild(content);

    tabPanels.appendChild(panel);
  });
};

const clearSectionObserver = () => {
  if (!tabState.sectionObserver) {
    return;
  }
  tabState.sectionObserver.disconnect();
  tabState.sectionObserver = null;
};

const highlightTocSection = (sectionId) => {
  Array.from(toc.querySelectorAll("a")).forEach((link) => {
    link.classList.toggle("active", link.dataset.sectionId === sectionId);
  });
};

const observeVisibleSections = (panel) => {
  clearSectionObserver();
  if (typeof IntersectionObserver === "undefined") {
    return;
  }
  const sections = Array.from(panel.querySelectorAll(".section"));
  if (!sections.length) {
    return;
  }

  tabState.sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => right.intersectionRatio - left.intersectionRatio);
    if (visible.length) {
      highlightTocSection(visible[0].target.id);
    }
  }, {
    root: null,
    rootMargin: "-26% 0px -58% 0px",
    threshold: [0.2, 0.5, 0.8]
  });

  sections.forEach((section) => tabState.sectionObserver.observe(section));
};

const updateSectionControls = (panel) => {
  const hasSections = !!panel && panel.querySelectorAll(".section").length > 0;
  if (expandSectionsButton) {
    expandSectionsButton.disabled = !hasSections;
  }
  if (collapseSectionsButton) {
    collapseSectionsButton.disabled = !hasSections;
  }
};

const updateToc = (panel) => {
  const sections = Array.from(panel.querySelectorAll(".section"));
  toc.innerHTML = "";

  if (!sections.length) {
    toc.innerHTML = "<div>No sections yet.</div>";
    tocMeta.textContent = "";
    updateSectionControls(null);
    return;
  }

  sections.forEach((section) => {
    const heading = section.querySelector(".section-header h3, .section-header h4");
    const link = document.createElement("a");
    link.href = `#${section.id}`;
    link.dataset.sectionId = section.id;
    link.textContent = heading ? heading.textContent : section.id;
    toc.appendChild(link);
  });

  tocMeta.textContent = `${sections.length} sections`;
  highlightTocSection(sections[0].id);
  observeVisibleSections(panel);
  updateSectionControls(panel);
};

const syncTabToUrl = (key) => {
  const params = new URLSearchParams(window.location.search);
  if (key && key !== tabs[0].key) {
    params.set("tab", key);
  } else {
    params.delete("tab");
  }
  const query = params.toString();
  const target = `${window.location.pathname}${query ? `?${query}` : ""}`;
  window.history.replaceState(null, "", target);
};

const setActiveTab = (key, options = {}) => {
  const { syncUrl = true } = options;
  tabState.activeKey = key;
  tabBar.querySelectorAll(".tab-button").forEach((button) => {
    const isActive = button.dataset.tab === key;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  tabPanels.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tab === key);
  });
  const activePanel = tabPanels.querySelector(`.tab-panel[data-tab="${key}"]`);
  if (activePanel) {
    updateToc(activePanel);
  }
  if (syncUrl) {
    syncTabToUrl(key);
  }
};

const bindTabEvents = () => {
  tabBar.addEventListener("click", (event) => {
    if (event.target.matches(".tab-button")) {
      setActiveTab(event.target.dataset.tab);
    }
  });

  tabBar.addEventListener("keydown", (event) => {
    if (!event.target.matches(".tab-button")) {
      return;
    }
    const buttons = Array.from(tabBar.querySelectorAll(".tab-button"));
    const currentIndex = buttons.indexOf(event.target);
    if (currentIndex === -1) {
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = buttons[(currentIndex + 1) % buttons.length];
      next.focus();
      setActiveTab(next.dataset.tab);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = buttons[(currentIndex - 1 + buttons.length) % buttons.length];
      prev.focus();
      setActiveTab(prev.dataset.tab);
    }
  });
};

const setActivePanelSectionState = (collapsed) => {
  const panel = tabPanels.querySelector(`.tab-panel[data-tab="${tabState.activeKey}"]`);
  if (!panel) {
    return;
  }

  panel.querySelectorAll(".section").forEach((section) => {
    section.classList.toggle("collapsed", collapsed);
    const header = section.querySelector(".section-header");
    const toggle = section.querySelector(".section-toggle");
    if (header && toggle) {
      updateSectionAria(section, header, toggle);
    }
  });
};

const bindSectionControlEvents = () => {
  if (expandSectionsButton) {
    expandSectionsButton.addEventListener("click", () => {
      setActivePanelSectionState(false);
    });
  }
  if (collapseSectionsButton) {
    collapseSectionsButton.addEventListener("click", () => {
      setActivePanelSectionState(true);
    });
  }
  if (backToTopButton) {
    backToTopButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
};

const buildMeta = (data) => {
  callTitle.textContent = `${data.company} (${data.ticker})`;
  document.title = `${data.company} ${data.fyq} Call Brief`;

  const metaItems = [
    `<span>${data.fyq}</span>`,
    `<span>${data.call_date || ""}</span>`
  ];

  callMeta.innerHTML = metaItems.join("");

  callParticipants.innerHTML = "";
  (data.participants || []).forEach((name) => {
    const pill = document.createElement("span");
    pill.textContent = name;
    callParticipants.appendChild(pill);
  });

  callBadges.innerHTML = "";
  if (data.incomplete) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "Incomplete";
    callBadges.appendChild(badge);
    if (data.missing_sections && data.missing_sections.length) {
      const missing = document.createElement("span");
      missing.className = "badge";
      missing.textContent = `${data.missing_sections.length} gaps`;
      missing.title = `Missing coverage: ${data.missing_sections.join(", ")}`;
      callBadges.appendChild(missing);
    }
  }
};

const flashButtonText = (button, text) => {
  if (!button) {
    return;
  }
  const original = button.dataset.defaultLabel || button.textContent;
  button.dataset.defaultLabel = original;
  button.textContent = text;
  setTimeout(() => {
    button.textContent = original;
  }, 1500);
};

const copyToClipboard = async (text) => {
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    throw new Error("Clipboard API unavailable");
  }
  await navigator.clipboard.writeText(text);
};

const buildShare = (data) => {
  const link = window.location.href;
  const bullets = (data.bullets || []).slice(0, 3).map((item) => `- ${item}`).join("\n");
  const subject = `Earnings Call Brief: ${data.company} ${data.fyq}`;
  const body = `Link: ${link}\n\nTL;DR: ${data.tldr || ""}\n\n${bullets}`.trim();
  emailShare.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  copyBriefButton.addEventListener("click", async () => {
    const vdc = data.vdc_angle || {};
    const vdcText = [
      "VDC Angle:",
      ...(vdc.implications || []).map((item) => `- ${item}`),
      ...(vdc.competitive_notes || []).map((item) => `- ${item}`),
      ...(vdc.forecast_hooks || []).map((item) => `- ${item}`)
    ].join("\n");

    const text = [
      `TL;DR: ${data.tldr || ""}`,
      (data.bullets || []).map((item) => `- ${item}`).join("\n"),
      vdcText
    ].filter(Boolean).join("\n\n");

    try {
      await copyToClipboard(text);
      flashButtonText(copyBriefButton, "Copied");
    } catch (error) {
      flashButtonText(copyBriefButton, "Copy failed");
    }
  });

  copyAllButton.addEventListener("click", async () => {
    const sections = [];
    sections.push(`${data.company} (${data.ticker}) - ${data.fyq}`);
    sections.push(`Call date: ${data.call_date || ""}`);
    sections.push(`TL;DR: ${data.tldr || ""}`);
    sections.push("Bullets:\n" + (data.bullets || []).map((item) => `- ${item}`).join("\n"));

    const deep = data.deep_dive || {};
    (deep.segments || []).forEach((segment) => {
      const body = segment.body ? segment.body : (segment.points || []).map((item) => `- ${item}`).join("\n");
      sections.push(`${segment.title || "Segment"}:\n${body}`);
    });

    if (deep.metrics && (deep.metrics.numbers || deep.metrics.guidance)) {
      const numbers = (deep.metrics.numbers || [])
        .map((item) => `- ${item.label}: ${item.value || ""}${item.note ? ` (${item.note})` : ""}`)
        .join("\n");
      const guidance = (deep.metrics.guidance || [])
        .map((item) => `- ${item.label}: ${item.value || ""}${item.note ? ` (${item.note})` : ""}`)
        .join("\n");
      sections.push(`Numbers & guidance:\n${[numbers, guidance].filter(Boolean).join("\n")}`);
    }

    (deep.notes || []).forEach((note) => {
      const body = note.body ? note.body : (note.points || []).map((item) => `- ${item}`).join("\n");
      sections.push(`${note.title || "Deep note"}:\n${body}`);
    });

    const qna = data.qna || {};
    if (qna.themes && qna.themes.length) {
      qna.themes.forEach((theme) => {
        const body = theme.body ? theme.body : (theme.points || []).map((item) => `- ${item}`).join("\n");
        sections.push(`${theme.title || "Theme"}:\n${body}`);
      });
    }

    if (qna.top_questions && qna.top_questions.length) {
      sections.push("Top questions:\n" + qna.top_questions.map((item) => `- ${item.question}: ${item.summary || ""}`).join("\n"));
    }

    const vdc = data.vdc_angle || {};
    sections.push("VDC Angle:\n" + [
      ...(vdc.implications || []).map((item) => `- ${item}`),
      ...(vdc.competitive_notes || []).map((item) => `- ${item}`),
      ...(vdc.forecast_hooks || []).map((item) => `- ${item}`)
    ].join("\n"));

    const follow = data.follow_ups || {};
    sections.push("Follow-ups:\n" + [
      ...(follow.action_items || []).map((item) => `- ${item}`),
      ...(follow.open_questions || []).map((item) => `- ${item}`),
      ...(follow.watch_next_quarter || []).map((item) => `- ${item}`)
    ].join("\n"));

    try {
      await copyToClipboard(sections.filter(Boolean).join("\n\n"));
      flashButtonText(copyAllButton, "Copied");
    } catch (error) {
      flashButtonText(copyAllButton, "Copy failed");
    }
  });
};

const buildCallNav = async (path) => {
  if (!callNav) return;
  try {
    const response = await fetch("index.json", { cache: "no-store" });
    const index = await response.json();
    const calls = index.calls || [];
    const currentIndex = calls.findIndex((call) => call.path === path);
    if (currentIndex === -1) return;

    const prev = calls[currentIndex + 1];
    const next = calls[currentIndex - 1];

    const items = [];
    if (prev) {
      items.push(`<a class="button" href="call.html?path=${encodeURIComponent(prev.path)}">Prev: ${prev.company} ${prev.fyq}</a>`);
    }
    if (next) {
      items.push(`<a class="button" href="call.html?path=${encodeURIComponent(next.path)}">Next: ${next.company} ${next.fyq}</a>`);
    }

    callNav.innerHTML = items.join("");
  } catch (error) {
    callNav.innerHTML = "";
  }
};

const checkIncomplete = (data) => {
  const missing = [];
  if (!data.participants || !data.participants.length) missing.push("participants");
  if (!data.bullets || data.bullets.length < 3) missing.push("snapshot bullets");
  const deep = data.deep_dive || {};
  const hasDeep = (deep.segments && deep.segments.length) || (deep.notes && deep.notes.length) || (deep.metrics && (deep.metrics.numbers || deep.metrics.guidance));
  if (!hasDeep) missing.push("deep dive");

  const qna = data.qna || {};
  const hasQna = (qna.themes && qna.themes.length) || (qna.top_questions && qna.top_questions.length);
  if (!hasQna) missing.push("qna");

  const vdc = data.vdc_angle || {};
  const hasVdc = (vdc.implications && vdc.implications.length) || (vdc.competitive_notes && vdc.competitive_notes.length) || (vdc.forecast_hooks && vdc.forecast_hooks.length);
  if (!hasVdc) missing.push("vdc angle");

  const follow = data.follow_ups || {};
  const hasFollow = (follow.action_items && follow.action_items.length) || (follow.open_questions && follow.open_questions.length) || (follow.watch_next_quarter && follow.watch_next_quarter.length);
  if (!hasFollow) missing.push("follow-ups");

  data.missing_sections = missing;
  if (missing.length) {
    data.incomplete = true;
  }
};

const init = async () => {
  const query = getQuery();
  const path = query.path || (query.ticker && query.fyq ? `calls/${query.ticker}/${query.fyq}.json` : null);
  const initialTab = getInitialTab();

  bindSectionControlEvents();
  window.addEventListener("beforeunload", clearSectionObserver);

  if (!path) {
    callTitle.textContent = "Missing call path";
    callMeta.textContent = "Provide ?path=calls/TICKER/FY2025Q1.json";
    return;
  }

  try {
    const response = await fetch(path, { cache: "no-store" });
    const data = await response.json();
    checkIncomplete(data);
    buildMeta(data);
    buildTabPanels(data);
    bindTabEvents();
    setActiveTab(initialTab, { syncUrl: false });
    buildShare(data);
    buildCallNav(path);
  } catch (error) {
    callTitle.textContent = "Call not found";
    callMeta.textContent = `Missing or invalid JSON at ${path}`;
  }
};

init();
