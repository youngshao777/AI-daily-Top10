(() => {
  const catsEl = document.getElementById("cats");
  const listEl = document.getElementById("storyList");
  const emptyEl = document.getElementById("emptyState");
  const viewDateEl = document.getElementById("viewDate");
  const viewBadgeEl = document.getElementById("viewBadge");
  const archiveSelect = document.getElementById("archiveSelect");
  const archiveLabelEl = document.getElementById("archiveLabel");
  const taglineEl = document.getElementById("tagline");
  const footerTextEl = document.getElementById("footerText");
  const langToggleBtn = document.getElementById("langToggle");

  const I18N = {
    zh: {
      tagline: "每日自动聚合 · 前沿资讯精选",
      archiveLabel: "存档",
      badgeArchive: "历史存档",
      emptyState: "暂无数据，请稍后再来。",
      loadError: "数据加载失败，请检查网络或稍后重试。",
      footer: "内容由公开 RSS 源自动聚合生成，每日定时更新，版权归原作者与站点所有 · 点击标题跳转原文",
      locale: "zh-CN",
    },
    en: {
      tagline: "Daily curated frontier updates, auto-aggregated",
      archiveLabel: "Archive",
      badgeArchive: "Archived",
      emptyState: "No stories yet — check back soon.",
      loadError: "Failed to load data. Check your connection and try again.",
      footer: "Content is auto-aggregated from public RSS feeds and updated daily. Rights belong to the original authors/publishers · click a title to read the source",
      locale: "en-US",
    },
  };

  const state = {
    categoryMeta: {},   // id -> {zh, en}
    latest: {},         // id -> latest date string
    archiveIndex: {},   // id -> [dates] (loaded lazily per category)
    activeCat: null,
    activeDate: null,
    currentItems: null,
    lang: localStorage.getItem("ai-daily-lang") || "zh",
  };

  const t = (key) => I18N[state.lang][key];
  const dayUrl = (cat, date) => `data/archive/${cat}/${date}.json`;

  function formatDateLabel(dateStr) {
    const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
    if (state.lang === "en") {
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
    }
    return `${y}年${m}月${d}日`;
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(t("locale"), {
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

  function applyStaticText() {
    document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
    taglineEl.textContent = t("tagline");
    archiveLabelEl.textContent = t("archiveLabel");
    viewBadgeEl.textContent = t("badgeArchive");
    footerTextEl.textContent = t("footer");
    langToggleBtn.textContent = state.lang === "en" ? "中文" : "EN";
    langToggleBtn.setAttribute("aria-pressed", state.lang === "en");
  }

  function renderTabs() {
    catsEl.innerHTML = "";
    const ids = Object.keys(state.latest);
    if (ids.length <= 1) return; // hide tabs until multiple categories exist
    ids.forEach((id) => {
      const btn = document.createElement("button");
      const meta = state.categoryMeta[id];
      btn.textContent = (meta && meta[state.lang]) || meta?.zh || id;
      btn.className = id === state.activeCat ? "active" : "";
      btn.addEventListener("click", () => selectCategory(id));
      catsEl.appendChild(btn);
    });
  }

  function pick(field) {
    if (field && typeof field === "object") return field[state.lang] || field.en || field.zh || "";
    return field || "";
  }

  function renderItems(items) {
    listEl.innerHTML = "";
    if (!items || items.length === 0) {
      emptyEl.hidden = false;
      emptyEl.textContent = t("emptyState");
      return;
    }
    emptyEl.hidden = true;
    items.forEach((item, i) => {
      const title = pick(item.title);
      const summary = pick(item.summary);
      const li = document.createElement("li");
      li.className = "story-item";
      li.innerHTML = `
        <div class="story-index">${String(i + 1).padStart(2, "0")}</div>
        <div>
          <h2 class="story-title"><a href="${item.link}" target="_blank" rel="noopener noreferrer">${title}</a></h2>
          <div class="story-meta">${item.source}<span class="dot">·</span>${formatTime(item.published)}</div>
          ${summary ? `<p class="story-summary">${summary}</p>` : ""}
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
      state.activeDate = date;
      state.currentItems = data.items;
      renderItems(data.items);
      viewDateEl.textContent = formatDateLabel(data.date);
      viewBadgeEl.hidden = data.date === state.latest[cat];
      setHash(cat, date);
    } catch {
      state.currentItems = [];
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

  langToggleBtn.addEventListener("click", () => {
    state.lang = state.lang === "en" ? "zh" : "en";
    localStorage.setItem("ai-daily-lang", state.lang);
    applyStaticText();
    renderTabs();
    if (state.activeCat && state.activeDate) {
      populateArchiveSelect(state.archiveIndex[state.activeCat] || [state.activeDate], state.activeDate);
      viewDateEl.textContent = formatDateLabel(state.activeDate);
      renderItems(state.currentItems);
    }
  });

  async function init() {
    applyStaticText();
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
      emptyEl.textContent = t("loadError");
      listEl.innerHTML = "";
      return;
    }

    const availableCats = Object.keys(state.latest);
    if (availableCats.length === 0) {
      listEl.innerHTML = "";
      emptyEl.hidden = false;
      emptyEl.textContent = t("emptyState");
      return;
    }

    const fromHash = parseHash();
    const startCat = fromHash && availableCats.includes(fromHash.cat) ? fromHash.cat : availableCats[0];
    const startDate = fromHash && fromHash.cat === startCat ? fromHash.date : undefined;

    await selectCategory(startCat, startDate);
  }

  init();
})();
