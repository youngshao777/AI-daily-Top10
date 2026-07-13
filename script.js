(() => {
  const catsEl = document.getElementById("cats");
  const listEl = document.getElementById("storyList");
  const emptyEl = document.getElementById("emptyState");
  const viewDateEl = document.getElementById("viewDate");
  const viewBadgeEl = document.getElementById("viewBadge");
  const archiveSelect = document.getElementById("archiveSelect");

  const state = {
    categoryMeta: {},   // id -> name
    latest: {},         // id -> latest date string
    archiveIndex: {},   // id -> [dates] (loaded lazily per category)
    activeCat: null,
  };

  const dayUrl = (cat, date) => `data/archive/${cat}/${date}.json`;

  function formatDateLabel(dateStr) {
    const [y, m, d] = dateStr.split("-");
    return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`;
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return "";
    }
  }

  function setHash(cat, date) {
    const target = `#${cat}/${date}`;
    if (location.hash !== target) history.replaceState(null, "", target);
  }

  function parseHash() {
    const m = location.hash.replace(/^#/, "").split("/");
    if (m.length === 2 && m[0] && m[1]) return { cat: m[0], date: m[1] };
    return null;
  }

  function renderTabs() {
    catsEl.innerHTML = "";
    const ids = Object.keys(state.latest);
    if (ids.length <= 1) return; // hide tabs until multiple categories exist
    ids.forEach((id) => {
      const btn = document.createElement("button");
      btn.textContent = state.categoryMeta[id] || id;
      btn.className = id === state.activeCat ? "active" : "";
      btn.addEventListener("click", () => selectCategory(id));
      catsEl.appendChild(btn);
    });
  }

  function renderItems(items) {
    listEl.innerHTML = "";
    if (!items || items.length === 0) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    items.forEach((item, i) => {
      const li = document.createElement("li");
      li.className = "story-item";
      li.innerHTML = `
        <div class="story-index">${String(i + 1).padStart(2, "0")}</div>
        <div>
          <h2 class="story-title"><a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a></h2>
          <div class="story-meta">${item.source}<span class="dot">·</span>${formatTime(item.published)}</div>
          ${item.summary ? `<p class="story-summary">${item.summary}</p>` : ""}
        </div>
      `;
      listEl.appendChild(li);
    });
  }

  async function loadArchiveIndexFor(cat) {
    if (state.archiveIndex[cat]) return state.archiveIndex[cat];
    try {
      const res = await fetch("data/archive/index.json", { cache: "no-store" });
      const data = await res.json();
      state.archiveIndex = data;
      return data[cat] || [];
    } catch {
      return [];
    }
  }

  function populateArchiveSelect(dates, activeDate) {
    archiveSelect.innerHTML = "";
    dates.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = formatDateLabel(d);
      if (d === activeDate) opt.selected = true;
      archiveSelect.appendChild(opt);
    });
  }

  async function loadDay(cat, date) {
    try {
      const res = await fetch(dayUrl(cat, date), { cache: "no-store" });
      if (!res.ok) throw new Error("not found");
      const data = await res.json();
      renderItems(data.items);
      viewDateEl.textContent = formatDateLabel(data.date);
      viewBadgeEl.hidden = data.date === state.latest[cat];
      setHash(cat, date);
    } catch {
      renderItems([]);
      viewDateEl.textContent = formatDateLabel(date);
    }
  }

  async function selectCategory(cat, preferredDate) {
    state.activeCat = cat;
    renderTabs();

    const dates = await loadArchiveIndexFor(cat);
    const latestDate = state.latest[cat];
    const date = preferredDate && dates.includes(preferredDate) ? preferredDate : latestDate;

    populateArchiveSelect(dates.length ? dates : [latestDate], date);
    await loadDay(cat, date);
  }

  archiveSelect.addEventListener("change", () => {
    if (state.activeCat) loadDay(state.activeCat, archiveSelect.value);
  });

  async function init() {
    try {
      const [catRes, latestRes] = await Promise.all([
        fetch("config/categories.json", { cache: "no-store" }),
        fetch("data/latest.json", { cache: "no-store" }),
      ]);
      const catConfig = await catRes.json();
      state.latest = await latestRes.json();
      catConfig.categories.forEach((c) => {
        state.categoryMeta[c.id] = c.name;
      });
    } catch {
      emptyEl.hidden = false;
      emptyEl.textContent = "数据加载失败，请检查网络或稍后重试。";
      listEl.innerHTML = "";
      return;
    }

    const availableCats = Object.keys(state.latest);
    if (availableCats.length === 0) {
      listEl.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }

    const fromHash = parseHash();
    const startCat = fromHash && availableCats.includes(fromHash.cat) ? fromHash.cat : availableCats[0];
    const startDate = fromHash && fromHash.cat === startCat ? fromHash.date : undefined;

    await selectCategory(startCat, startDate);
  }

  init();
})();
