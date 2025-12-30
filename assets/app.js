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

const normalize = (value) => (value || "").toLowerCase();

const uniqueSorted = (items) => Array.from(new Set(items.filter(Boolean))).sort();

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

const matchesFilters = (call) => {
  const query = normalize(elements.search.value);
  const companyFilter = elements.company.value;
  const fyqFilter = elements.fyq.value;
  const themeFilter = elements.theme.value;

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

const init = async () => {
  try {
    const response = await fetch("index.json", { cache: "no-store" });
    const data = await response.json();
    state.calls = data.calls || [];
    buildFilters();
    renderResults();
  } catch (error) {
    elements.results.innerHTML = "<div class=\"card\"><h3>Index missing</h3><p>Ensure /index.json is present and valid JSON.</p></div>";
  }
};

[elements.search, elements.company, elements.fyq, elements.theme].forEach((input) => {
  input.addEventListener("input", renderResults);
  input.addEventListener("change", renderResults);
});

init();
