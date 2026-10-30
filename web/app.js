(() => {
  "use strict";

  const app = document.getElementById("app");
  const BANK = window.QUESTION_BANK;
  if (!BANK || !Array.isArray(BANK.questions) || !BANK.questions.length) {
    app.innerHTML = '<div class="wrap"><div class="card empty">Không tìm thấy dữ liệu câu hỏi (questions.js).<br>Chạy <code>python scripts/fetch_questions.py</code> để tạo.</div></div>';
    return;
  }

  // ---------- data ----------
  const BANK_ID = BANK.id || BANK.exam;
  const SOURCES = BANK.sources || [{ id: BANK_ID, name: BANK.title || BANK_ID }];
  const QS = BANK.questions.map((q) => ({ ...q, source: q.source || SOURCES[0].id }));
  const BY_ID = new Map(QS.map((q) => [q.id, q]));
  const CATS = [...new Set(QS.map((q) => q.category))];
  const catsOf = (src) => [...new Set(QS.filter((q) => q.source === src).map((q) => q.category))];
  const CAT_SOURCE = new Map(QS.map((q) => [q.category, q.source]));
  const srcName = (src) => (SOURCES.find((s) => s.id === src) || { name: src }).name;
  const LETTERS = "ABCDEFGH";
  const PASS_PCT = 70;
  const EXAM_EXCLUDED_CATS = new Set(["exam-logistics"]); // câu về lệ phí/điểm thi... không có trong đề thật
  const CAT_LABELS = {
    "azure-ai-workloads": "AI workloads & Responsible AI",
    "azure-ml-fundamentals": "Machine Learning trên Azure",
    "azure-computer-vision": "Computer Vision",
    "azure-nlp": "Natural Language Processing",
    "azure-generative-ai": "Generative AI",
    "generative-ai-apps": "Generative AI apps & agents (Foundry)",
    "generative-ai": "Generative AI",
    "natural-language-processing": "Natural Language Processing",
    "responsible-ai": "Responsible AI",
    "computer-vision": "Computer Vision",
    "ai-concepts": "Khái niệm AI",
    "information-extraction": "Information extraction",
    "ai-workloads": "AI workloads",
    "exam-logistics": "Thông tin kỳ thi",
  };
  const DIFF_LABELS = { easy: "Dễ", medium: "Trung bình", hard: "Khó" };
  const catLabel = (c) => CAT_LABELS[c] || c.replace(/^azure-/, "").replace(/-/g, " ").replace(/\b\w/g, (s) => s.toUpperCase());

  // ---------- storage ----------
  const PREFIX = `oep:${BANK_ID}:`;
  // Bản cũ lưu tiến độ theo từng bộ đề (oep:<exam>:...); chuyển sang khoá chung một lần.
  for (const key of ["progress", "bookmarks", "history", "session", "setup"]) {
    try {
      if (localStorage.getItem(PREFIX + key) != null) continue;
      const old = SOURCES.map((s) => localStorage.getItem(`oep:${s.id}:${key}`)).find((v) => v != null);
      if (old != null) localStorage.setItem(PREFIX + key, old);
    } catch { /* storage unavailable */ }
  }
  const load = (key, fallback) => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full / private mode */ }
  };

  let progress = load(PREFIX + "progress", {}); // id -> { a: attempts, c: correct, last: 1|0, t: time }
  let bookmarks = new Set(load(PREFIX + "bookmarks", []));
  let history = load(PREFIX + "history", []);
  let session = load(PREFIX + "session", null);
  if (session && !(Array.isArray(session.items) && session.items.every((it) => BY_ID.has(it.id)))) session = null;
  const settings = { theme: "auto", shuffle: true, lookup: false, ...load("oep:settings", {}) };
  const savedSetup = load(PREFIX + "setup", {});
  const setup = {
    practice: { sources: [], cats: [], diffs: [], status: "all", order: "random", count: 20, ...savedSetup.practice },
    // Mặc định thi thử theo bộ đề mới nhất (AI-901 thay AI-900 từ 30/06/2026).
    exam: { sources: [SOURCES[SOURCES.length - 1].id], size: 50, minutes: 45, ...savedSetup.exam },
  };
  for (const cfg of [setup.practice, setup.exam]) cfg.sources = cfg.sources.filter((s) => SOURCES.some((x) => x.id === s));
  setup.practice.cats = setup.practice.cats.filter((c) => CATS.includes(c));

  const saveProgress = () => save(PREFIX + "progress", progress);
  const saveBookmarks = () => save(PREFIX + "bookmarks", [...bookmarks]);
  const saveHistory = () => save(PREFIX + "history", history);
  const saveSession = () => save(PREFIX + "session", session);
  const saveSettings = () => save("oep:settings", settings);
  const saveSetup = () => save(PREFIX + "setup", setup);

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const pct = (a, b) => (b ? Math.round((a * 100) / b) : 0);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const fmtTime = (sec) => {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };
  const fmtDate = (t) => new Date(t).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const isCorrect = (it) => it.chosen === BY_ID.get(it.id).correctAnswer;

  const ICONS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 18l6-6-6-6"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v2M12 20.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1.5 12h2M20.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    redo: '<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    lang: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
    speaker: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  };
  const icon = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  function toast(msg) {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = settings.theme;
    const dark = settings.theme === "dark" || (settings.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector('meta[name="theme-color"]').content = dark ? "#0d1117" : "#f4f6fa";
  }

  // ---------- progress ----------
  function record(id, ok) {
    const p = progress[id] || { a: 0, c: 0 };
    p.a++;
    if (ok) p.c++;
    p.last = ok ? 1 : 0;
    p.t = Date.now();
    progress[id] = p;
  }

  function stats(ids) {
    let answered = 0, right = 0, attempts = 0, correct = 0;
    for (const id of ids) {
      const p = progress[id];
      if (!p) continue;
      answered++;
      if (p.last) right++;
      attempts += p.a;
      correct += p.c;
    }
    return { total: ids.length, answered, right, wrong: answered - right, acc: pct(correct, attempts) };
  }

  function statusMatch(id, status) {
    const p = progress[id];
    switch (status) {
      case "new": return !p;
      case "wrong": return !!p && !p.last;
      case "bookmarked": return bookmarks.has(id);
      default: return true;
    }
  }
  const idsWhere = (status) => QS.filter((q) => statusMatch(q.id, status)).map((q) => q.id);

  // ---------- sessions ----------
  function newItem(id) {
    const order = BY_ID.get(id).options.map((_, i) => i);
    return { id, order: settings.shuffle ? shuffle(order) : order, chosen: null };
  }

  function startSession(mode, ids, title, minutes) {
    if (!ids.length) return toast("Không có câu hỏi phù hợp.");
    if (session && !session.finished && session.items.some((it) => it.chosen != null)
      && !confirm(`Phiên "${session.title}" đang làm dở sẽ bị huỷ. Tiếp tục?`)) return;
    session = {
      mode, title,
      items: ids.map(newItem),
      idx: 0,
      startedAt: Date.now(),
      endsAt: minutes ? Date.now() + minutes * 60000 : null,
      finished: false,
    };
    saveSession();
    resultFilter = "all";
    go("#/quiz", true);
  }

  // Lấy đề thi theo tỷ lệ số câu của từng chủ đề (largest remainder).
  function examPool(cfg) {
    return QS.filter((q) => !EXAM_EXCLUDED_CATS.has(q.category) && (!cfg.sources.length || cfg.sources.includes(q.source)));
  }

  function examIds(pool, size) {
    size = Math.min(size, pool.length);
    const groups = CATS.map((c) => shuffle(pool.filter((q) => q.category === c).map((q) => q.id)));
    const quotas = groups.map((g) => (size * g.length) / pool.length);
    const take = quotas.map(Math.floor);
    const rest = size - take.reduce((a, b) => a + b, 0);
    quotas.map((q, i) => [q - take[i], i]).sort((a, b) => b[0] - a[0]).slice(0, rest).forEach(([, i]) => take[i]++);
    return shuffle(groups.flatMap((g, i) => g.slice(0, take[i])));
  }

  function grade(s) {
    const byCat = {};
    let correct = 0, answered = 0;
    for (const it of s.items) {
      const q = BY_ID.get(it.id);
      const ok = isCorrect(it);
      if (it.chosen != null) answered++;
      if (ok) correct++;
      const b = (byCat[q.category] ||= { n: 0, c: 0 });
      b.n++;
      if (ok) b.c++;
    }
    return { total: s.items.length, answered, correct, byCat };
  }

  const current = () => session.items[session.idx];

  // Giải thích vì sao từng đáp án sai (chỉ một số bộ đề có), theo thứ tự đáp án đang hiển thị.
  function wrongNotes(q, it) {
    const w = q.wrongExplanations;
    if (!w) return "";
    const rows = it.order.map((orig, j) => (w[orig] ? `<li class="${orig === it.chosen ? "picked" : ""}"><b>${LETTERS[j]}.</b> ${esc(w[orig])}</li>` : "")).join("");
    return rows ? `<div class="why"><div class="why-title">Vì sao các đáp án khác sai</div><ul>${rows}</ul></div>` : "";
  }

  function choose(orig) {
    if (!session || session.finished) return;
    const it = current();
    if (session.mode === "practice") {
      if (it.chosen != null) return;
      it.chosen = orig;
      record(it.id, isCorrect(it));
      saveProgress();
    } else {
      it.chosen = orig;
    }
    saveSession();
    renderQuiz(true);
  }

  function move(delta) {
    const i = session.idx + delta;
    if (i < 0 || i >= session.items.length) return false;
    session.idx = i;
    saveSession();
    renderQuiz();
    return true;
  }

  function next() {
    if (!move(1)) askFinish();
  }

  function askFinish() {
    const done = session.items.filter((it) => it.chosen != null).length;
    if (session.mode === "exam") {
      const left = session.items.length - done;
      if (!confirm(left ? `Còn ${left} câu chưa làm. Nộp bài?` : "Nộp bài?")) return;
    } else if (!done) {
      session = null;
      saveSession();
      return go("#/");
    }
    finish();
  }

  function finish() {
    stopTimer();
    if (session.mode === "exam") {
      for (const it of session.items) if (it.chosen != null) record(it.id, isCorrect(it));
      saveProgress();
      const r = grade(session);
      history.unshift({ t: Date.now(), n: r.total, c: r.correct, sec: Math.round((Date.now() - session.startedAt) / 1000) });
      history = history.slice(0, 30);
      saveHistory();
    }
    session.finished = true;
    session.finishedAt = Date.now();
    saveSession();
    go("#/result", true);
  }

  function toggleBookmark(id) {
    if (bookmarks.has(id)) bookmarks.delete(id);
    else bookmarks.add(id);
    saveBookmarks();
    toast(bookmarks.has(id) ? "Đã đánh dấu câu này" : "Đã bỏ đánh dấu");
  }

  // ---------- timer ----------
  let timer = null;
  const stopTimer = () => { clearInterval(timer); timer = null; };
  function tick() {
    if (view !== "quiz" || !session || session.finished || !session.endsAt) return stopTimer();
    const left = (session.endsAt - Date.now()) / 1000;
    if (left <= 0) {
      toast("Hết giờ! Bài đã được nộp tự động.");
      return finish();
    }
    const el = document.getElementById("timer");
    if (el) {
      el.textContent = fmtTime(left);
      el.classList.toggle("low", left <= 300);
    }
  }

  // ---------- router ----------
  let view = "home";
  let resultFilter = "all";
  let lastIdx = -1;

  function go(hash, replace) {
    if (location.hash === hash) render();
    else if (replace) location.replace(hash);
    else location.hash = hash;
  }

  function render() {
    closeSheet();
    const [name, arg] = location.hash.replace(/^#\/?/, "").split("/");
    if (name === "quiz" && session && !session.finished) return renderQuiz();
    if (name === "result" && session && session.finished) return renderResult();
    if (name === "setup" && (arg === "practice" || arg === "exam")) return renderSetup(arg);
    renderHome();
  }

  function show(name, html) {
    if (name !== "quiz") stopTimer();
    const changed = view !== name;
    view = name;
    lastIdx = name === "quiz" ? lastIdx : -1;
    closeLookup();
    document.documentElement.classList.toggle("lk-on-areas", settings.lookup);
    app.innerHTML = html;
    if (changed) window.scrollTo(0, 0);
  }

  const lookupBtn = () => `<button class="iconbtn ${settings.lookup ? "lk-on" : ""}" data-act="toggle-lookup" aria-pressed="${settings.lookup}"
      aria-label="Tra từ tiếng Anh" title="Tra từ tiếng Anh (T)">${icon("lang")}</button>`;
  const lookupHint = (quiz) => (settings.lookup
    ? `<div class="lk-hint">Tra từ: chạm vào từ tiếng Anh để xem nghĩa${quiz ? " · chạm ô chữ cái để chọn đáp án" : ""}</div>`
    : "");

  function topbar({ back, title, sub, lookup } = {}) {
    const themeIcon = { auto: "auto", light: "sun", dark: "moon" }[settings.theme];
    const themeName = { auto: "theo hệ thống", light: "sáng", dark: "tối" }[settings.theme];
    return `<header class="topbar"><div class="topbar-in">
      ${back ? `<button class="iconbtn" data-act="go" data-arg="${back}" aria-label="Quay lại">${icon("back")}</button>` : ""}
      <div class="brand">
        ${back ? "" : '<span class="logo">AI</span>'}
        <span><b>${esc(title || BANK.title || BANK_ID)}</b><small>${esc(sub || "Luyện thi offline")}</small></span>
      </div>
      <span class="offline-pill" title="Không có mạng — app vẫn dùng bình thường">Offline</span>
      ${lookup ? lookupBtn() : ""}
      <button class="iconbtn" data-act="theme" title="Giao diện: ${themeName}" aria-label="Đổi giao diện (đang: ${themeName})">${icon(themeIcon)}</button>
    </div>${lookup ? lookupHint() : ""}</header>`;
  }

  // ---------- home ----------
  function renderHome() {
    const all = QS.map((q) => q.id);
    const s = stats(all);
    const mastery = pct(s.right, s.total);
    const wrongN = idsWhere("wrong").length;
    const newN = s.total - s.answered;
    const bmN = idsWhere("bookmarked").length;

    const mode = (act, arg, ic, color, title, desc, disabled) =>
      `<button class="mode" style="--c:${color}" data-act="${act}" data-arg="${arg}" ${disabled ? "disabled" : ""}>
        <span class="mi">${icon(ic)}</span><b>${title}</b><small>${desc}</small></button>`;

    const catRow = (c) => {
      const ids = QS.filter((q) => q.category === c).map((q) => q.id);
      const cs = stats(ids);
      return `<button class="row" data-act="cat" data-arg="${esc(c)}">
        <div class="grow"><b>${esc(catLabel(c))}</b>
          <small>${cs.answered}/${cs.total} đã làm${cs.answered ? ` · ${cs.right} đúng · ${cs.wrong} sai` : ""}</small>
          <div class="bar"><span class="g" style="width:${pct(cs.right, cs.total)}%"></span><span class="r" style="width:${pct(cs.wrong, cs.total)}%"></span></div>
        </div>${icon("next", "chev")}</button>`;
    };
    // Bộ đề mới nhất lên trước.
    const catSections = [...SOURCES].reverse().map((src) => {
      const ss = stats(QS.filter((q) => q.source === src.id).map((q) => q.id));
      const head = SOURCES.length > 1 ? `Chủ đề ${esc(src.name)} <span class="sec-sub">${ss.answered}/${ss.total} đã làm</span>` : "Theo chủ đề";
      return `<h2 class="sec">${head}</h2><section class="card list">${catsOf(src.id).map(catRow).join("")}</section>`;
    }).join("");

    const hist = history.slice(0, 8).map((h) => {
      const p = pct(h.c, h.n);
      return `<div class="row static"><div class="grow"><b>${h.c}/${h.n} câu · ${p}%</b>
        <small>${fmtDate(h.t)} · ${fmtTime(h.sec)}</small></div>
        <span class="badge ${p >= PASS_PCT ? "pass" : "fail"}">${p >= PASS_PCT ? "Đạt" : "Chưa đạt"}</span></div>`;
    }).join("");

    show("home", `${topbar()}
    <main class="wrap">
      <section class="card hero">
        <div class="ring" style="--p:${mastery}"><div><b>${mastery}%</b><small>đã thuộc</small></div></div>
        <div class="hero-stats">
          <div><span>Đã làm</span><b>${s.answered}/${s.total}</b></div>
          <div><span>Tỷ lệ trả lời đúng</span><b>${s.acc}%</b></div>
          <div><span>Cần ôn lại</span><b>${wrongN}</b></div>
        </div>
      </section>
      ${resumeCard()}
      ${installBanner()}
      <section class="modes">
        ${mode("go", "#/setup/practice", "book", "#2563eb", "Luyện tập", "Chọn chủ đề, độ khó; xem đáp án & giải thích ngay")}
        ${mode("go", "#/setup/exam", "clock", "#7c3aed", "Thi thử", "Đề ngẫu nhiên, tính giờ, chấm điểm khi nộp bài")}
      </section>
      <section class="modes quick">
        ${mode("quick", "new", "sparkle", "#0891b2", "Chưa làm", `${newN} câu`, !newN)}
        ${mode("quick", "wrong", "redo", "#dc2626", "Câu sai", `${wrongN} câu`, !wrongN)}
        ${mode("quick", "bookmarked", "star", "#d97706", "Đánh dấu", `${bmN} câu`, !bmN)}
      </section>

      ${catSections}

      ${hist ? `<h2 class="sec">Lịch sử thi thử</h2><section class="card list">${hist}</section>` : ""}

      <h2 class="sec">Ứng dụng</h2>
      <section class="card list">${appRows()}</section>

      <h2 class="sec">Cài đặt</h2>
      <section class="card list">
        <button class="row" data-act="toggle-lookup" role="switch" aria-checked="${settings.lookup}">
          <div class="grow"><b>Tra từ tiếng Anh</b><small>Chạm vào từ trong câu hỏi để xem nghĩa tiếng Việt (bật/tắt nhanh bằng nút ${icon("lang", "inline")} khi làm bài)</small></div>
          <span class="switch ${settings.lookup ? "on" : ""}"></span></button>
        <button class="row" data-act="toggle-shuffle" role="switch" aria-checked="${settings.shuffle}">
          <div class="grow"><b>Trộn thứ tự đáp án</b><small>Tránh nhớ theo vị trí A/B/C/D</small></div>
          <span class="switch ${settings.shuffle ? "on" : ""}"></span></button>
        <button class="row" data-act="export"><div class="grow"><b>Xuất tiến độ</b><small>Lưu file để chuyển sang máy/điện thoại khác</small></div>${icon("next", "chev")}</button>
        <button class="row" data-act="import"><div class="grow"><b>Nhập tiến độ</b><small>Gộp tiến độ từ file đã xuất</small></div>${icon("next", "chev")}</button>
        <button class="row danger" data-act="reset"><div class="grow"><b>Xoá toàn bộ tiến độ</b><small>Xoá kết quả, đánh dấu và lịch sử thi</small></div></button>
      </section>
      <input type="file" id="importFile" accept=".json,application/json" hidden>
      <p class="footnote">${QS.length} câu hỏi (${SOURCES.map((src) => `${esc(src.name)}: ${QS.filter((q) => q.source === src.id).length}`).join(", ")})
        · Dữ liệu: open-exam-prep.com · Tiến độ lưu trên trình duyệt này</p>
    </main>`);
  }

  function resumeCard() {
    if (!session || session.finished) return "";
    const done = session.items.filter((it) => it.chosen != null).length;
    const left = session.endsAt ? ` · còn ${fmtTime((session.endsAt - Date.now()) / 1000)}` : "";
    return `<section class="card resume">
      <div><b>${esc(session.title)}</b><small>Đang làm dở · ${done}/${session.items.length} câu${left}</small></div>
      <div class="resume-btns">
        <button class="btn ghost" data-act="discard">Huỷ</button>
        <button class="btn primary" data-act="go" data-arg="#/quiz">Tiếp tục</button>
      </div></section>`;
  }

  // ---------- setup ----------
  function practicePool(cfg) {
    return QS.filter((q) =>
      (!cfg.sources.length || cfg.sources.includes(q.source)) &&
      (!cfg.cats.length || cfg.cats.includes(q.category)) &&
      (!cfg.diffs.length || cfg.diffs.includes(q.difficulty)) &&
      statusMatch(q.id, cfg.status));
  }

  function renderSetup(kind) {
    const chip = (key, val, label, on, extra = "") =>
      `<button class="chip ${on ? "on" : ""}" data-act="chip" data-kind="${kind}" data-key="${key}" data-val="${esc(val)}" aria-pressed="${on}">${label}${extra}</button>`;
    const count = (n) => ` <small>${n}</small>`;
    const sourceField = (cfg, pool) => SOURCES.length < 2 ? "" : `<div class="field"><label>Bộ đề</label><div class="chips">
      ${chip("sources", "", "Tất cả", !cfg.sources.length)}
      ${SOURCES.map((s) => chip("sources", s.id, esc(s.name), cfg.sources.includes(s.id), count(pool.filter((q) => q.source === s.id).length))).join("")}
      </div></div>`;

    if (kind === "practice") {
      const cfg = setup.practice;
      const n = practicePool(cfg).length;
      const total = cfg.count ? Math.min(cfg.count, n) : n;
      const cnt = (st) => count(idsWhere(st).length);
      const shownSources = SOURCES.filter((s) => !cfg.sources.length || cfg.sources.includes(s.id));
      const catChips = shownSources.map((s) => `
        ${shownSources.length > 1 ? `<div class="chips-head">${esc(s.name)}</div>` : ""}
        <div class="chips">${catsOf(s.id).map((c) => chip("cats", c, esc(catLabel(c)), cfg.cats.includes(c), count(QS.filter((q) => q.category === c).length))).join("")}</div>`).join("");
      show("setup", `${topbar({ back: "#/", title: "Luyện tập", sub: "Xem đáp án ngay sau mỗi câu" })}
      <main class="wrap">
        <section class="card form">
          ${sourceField(cfg, QS)}
          <div class="field"><label>Chủ đề</label>
            <div class="chips">${chip("cats", "", "Tất cả chủ đề", !cfg.cats.length)}</div>
            ${catChips}
          </div>
          <div class="field"><label>Độ khó</label><div class="chips">
            ${chip("diffs", "", "Tất cả", !cfg.diffs.length)}
            ${Object.entries(DIFF_LABELS).map(([k, v]) => chip("diffs", k, v, cfg.diffs.includes(k))).join("")}
          </div></div>
          <div class="field"><label>Trạng thái</label><div class="chips">
            ${chip("status", "all", "Tất cả", cfg.status === "all")}
            ${chip("status", "new", "Chưa làm", cfg.status === "new", cnt("new"))}
            ${chip("status", "wrong", "Làm sai", cfg.status === "wrong", cnt("wrong"))}
            ${chip("status", "bookmarked", "Đã đánh dấu", cfg.status === "bookmarked", cnt("bookmarked"))}
          </div></div>
          <div class="field"><label>Thứ tự câu hỏi</label><div class="chips">
            ${chip("order", "random", "Ngẫu nhiên", cfg.order === "random")}
            ${chip("order", "seq", "Theo thứ tự", cfg.order === "seq")}
          </div></div>
          <div class="field"><label>Số câu</label><div class="chips">
            ${[10, 20, 30, 50, 0].map((v) => chip("count", v, v || "Tất cả", cfg.count === v)).join("")}
          </div></div>
        </section>
        <div class="cta"><button class="btn primary big" data-act="start-practice" ${total ? "" : "disabled"}>
          ${total ? `Bắt đầu · ${total} câu` : "Không có câu hỏi phù hợp"}</button></div>
      </main>`);
    } else {
      const cfg = setup.exam;
      const total = Math.min(cfg.size, examPool(cfg).length);
      show("setup", `${topbar({ back: "#/", title: "Thi thử", sub: "Chấm điểm khi nộp bài" })}
      <main class="wrap">
        <section class="card form">
          ${sourceField(cfg, examPool({ sources: [] }))}
          <div class="field"><label>Số câu</label><div class="chips">
            ${[20, 40, 50, 60].map((v) => chip("size", v, `${v} câu`, cfg.size === v)).join("")}
          </div></div>
          <div class="field"><label>Thời gian</label><div class="chips">
            ${[30, 45, 60, 0].map((v) => chip("minutes", v, v ? `${v} phút` : "Không giới hạn", cfg.minutes === v)).join("")}
          </div></div>
        </section>
        <p class="hint">Câu hỏi lấy ngẫu nhiên theo tỷ lệ từng chủ đề (không gồm nhóm "Thông tin kỳ thi"). Đáp án và giải thích chỉ hiện sau khi nộp bài.
          Bài thi thật cần 700/1000 điểm để đạt; ở đây lấy mốc tham khảo ${PASS_PCT}% số câu đúng.</p>
        <div class="cta"><button class="btn primary big" data-act="start-exam" ${total ? "" : "disabled"}>Bắt đầu thi · ${total} câu${cfg.minutes ? ` · ${cfg.minutes} phút` : ""}</button></div>
      </main>`);
    }
  }

  function setChip(kind, key, raw) {
    const cfg = setup[kind];
    const val = ["count", "size", "minutes"].includes(key) ? Number(raw) : raw;
    if (Array.isArray(cfg[key])) {
      if (!val) cfg[key] = [];
      else cfg[key] = cfg[key].includes(val) ? cfg[key].filter((v) => v !== val) : [...cfg[key], val];
    } else {
      cfg[key] = val;
    }
    // Bỏ chủ đề thuộc bộ đề vừa bị bỏ chọn.
    if (key === "sources" && cfg.cats && cfg.sources.length) {
      cfg.cats = cfg.cats.filter((c) => cfg.sources.some((s) => catsOf(s).includes(c)));
    }
    saveSetup();
    const y = window.scrollY;
    renderSetup(kind);
    window.scrollTo(0, y);
  }

  // ---------- quiz ----------
  function navGrid() {
    const exam = session.mode === "exam";
    const cells = session.items.map((it, i) => {
      let cls = "cell";
      if (it.chosen != null) cls += exam ? " answered" : isCorrect(it) ? " ok" : " bad";
      if (i === session.idx) cls += " cur";
      if (bookmarks.has(it.id)) cls += " bm";
      return `<button class="${cls}" data-act="jump" data-arg="${i}" aria-label="Câu ${i + 1}">${i + 1}</button>`;
    }).join("");
    const legend = exam
      ? '<span><i class="l-a"></i>Đã chọn</span>'
      : '<span><i class="l-ok"></i>Đúng</span><span><i class="l-bad"></i>Sai</span>';
    return `<div class="navgrid">${cells}</div><div class="legend">${legend}<span><i class="l-bm"></i>Đánh dấu</span></div>`;
  }

  function renderQuiz(answeredNow) {
    const s = session;
    const it = current();
    const q = BY_ID.get(it.id);
    const exam = s.mode === "exam";
    const n = s.items.length;
    const reveal = !exam && it.chosen != null;
    const done = s.items.filter((x) => x.chosen != null);
    const right = done.filter(isCorrect).length;
    const last = s.idx === n - 1;

    const opts = it.order.map((orig, i) => {
      let cls = "opt", mark = "";
      if (reveal) {
        if (orig === q.correctAnswer) { cls += " correct"; mark = icon("check"); }
        else if (orig === it.chosen) { cls += " wrong"; mark = icon("x"); }
        else cls += " dim";
      } else if (orig === it.chosen) cls += " selected";
      return `<button class="${cls}" data-act="choose" data-arg="${orig}" ${reveal ? "disabled" : ""}>
        <span class="key">${LETTERS[i]}</span><span class="txt">${esc(q.options[orig])}</span>${mark}</button>`;
    }).join("");

    let feedback = "";
    if (reveal) {
      const ok = isCorrect(it);
      const letter = LETTERS[it.order.indexOf(q.correctAnswer)];
      feedback = `<div class="feedback ${ok ? "ok" : "bad"}" id="fb" role="status">
        <div class="fb-title">${ok ? "Chính xác!" : `Chưa đúng — đáp án đúng là ${letter}`}</div>
        <p>${esc(q.explanation)}</p>${wrongNotes(q, it)}</div>`;
    }

    const sub = exam
      ? `Câu ${s.idx + 1}/${n} · đã làm ${done.length}`
      : `Câu ${s.idx + 1}/${n} · ✓ ${right}  ✗ ${done.length - right}`;
    const bm = bookmarks.has(it.id);

    show("quiz", `<div class="quiz">
      <header class="topbar"><div class="topbar-in">
        <button class="iconbtn" data-act="go" data-arg="#/" aria-label="Về trang chủ">${icon("back")}</button>
        <div class="qtitle"><b>${esc(s.title)}</b><small>${sub}</small></div>
        ${exam && s.endsAt ? `<span class="timer" id="timer" aria-label="Thời gian còn lại">${fmtTime((s.endsAt - Date.now()) / 1000)}</span>` : ""}
        <span class="offline-pill" title="Không có mạng — app vẫn dùng bình thường">Offline</span>
        ${lookupBtn()}
        <button class="iconbtn ${bm ? "on" : ""}" data-act="bookmark" aria-pressed="${bm}" aria-label="Đánh dấu câu này" title="Đánh dấu (S)">${icon("star")}</button>
        <button class="iconbtn only-mobile" data-act="nav" aria-label="Danh sách câu">${icon("grid")}</button>
      </div><div class="pbar"><span style="width:${pct(exam ? done.length : s.idx + (reveal ? 1 : 0), n)}%"></span></div>${lookupHint(true)}</header>
      <div class="wrap quiz-body">
        <main class="card qcard" id="qcard">
          <div class="qmeta">${SOURCES.length > 1 ? `<span class="tag src">${esc(srcName(q.source))}</span>` : ""}<span class="tag">${esc(catLabel(q.category))}</span><span class="tag d-${esc(q.difficulty)}">${DIFF_LABELS[q.difficulty] || esc(q.difficulty)}</span></div>
          <h1 class="qtext">${esc(q.question)}</h1>
          <div class="opts">${opts}</div>
          ${feedback}
          <p class="swipe-hint">Vuốt trái/phải để chuyển câu</p>
        </main>
        <aside class="card side only-desktop"><div class="navhead">Danh sách câu</div>${navGrid()}</aside>
      </div>
      <footer class="qfoot"><div class="qfoot-in">
        <button class="btn" data-act="prev" ${s.idx === 0 ? "disabled" : ""}>${icon("back")}<span>Trước</span></button>
        <button class="btn ${exam ? "warn" : "ghost"}" data-act="finish">${exam ? "Nộp bài" : "Kết thúc"}</button>
        <button class="btn primary" data-act="next"><span>${last ? (exam ? "Nộp bài" : "Kết quả") : "Tiếp"}</span>${icon("next")}</button>
      </div></footer>
    </div>`);

    if (lastIdx !== s.idx) window.scrollTo(0, 0);
    lastIdx = s.idx;
    if (answeredNow && reveal) {
      const fb = document.getElementById("fb");
      const footTop = document.querySelector(".qfoot").getBoundingClientRect().top;
      if (fb.getBoundingClientRect().bottom > footTop) fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (exam && s.endsAt) {
      if (!timer) timer = setInterval(tick, 1000);
      tick();
    }
  }

  // ---------- result ----------
  function renderResult() {
    const s = session;
    const r = grade(s);
    const exam = s.mode === "exam";
    const base = exam ? r.total : r.answered;
    const p = pct(r.correct, base);
    const pass = p >= PASS_PCT;
    const dur = Math.round(((s.finishedAt || Date.now()) - s.startedAt) / 1000);
    const wrongIds = s.items.filter((it) => !isCorrect(it) && (exam || it.chosen != null)).map((it) => it.id);

    const multiSource = new Set(s.items.map((it) => BY_ID.get(it.id).source)).size > 1;
    const cats = Object.entries(r.byCat).map(([c, b]) => `<div class="row static"><div class="grow">
        <b>${esc(catLabel(c))}${multiSource ? ` <span class="muted">· ${esc(srcName(CAT_SOURCE.get(c)))}</span>` : ""}</b>
        <small>${b.c}/${b.n} đúng · ${pct(b.c, b.n)}%</small>
        <div class="bar"><span class="g" style="width:${pct(b.c, b.n)}%"></span></div></div></div>`).join("");

    const items = s.items.map((it, i) => ({ it, i, ok: isCorrect(it) }))
      .filter(({ it, ok }) => exam || it.chosen != null)
      .filter(({ ok }) => resultFilter === "all" || (resultFilter === "wrong" ? !ok : ok));
    const review = items.map(({ it, i, ok }) => {
      const q = BY_ID.get(it.id);
      const opts = it.order.map((orig, j) => {
        const cls = orig === q.correctAnswer ? "correct" : orig === it.chosen ? "wrong" : "";
        return `<li class="${cls}"><b>${LETTERS[j]}.</b><span>${esc(q.options[orig])}</span></li>`;
      }).join("");
      return `<details class="rv ${ok ? "ok" : "bad"}">
        <summary><span class="rv-n">${i + 1}</span><span class="rv-q">${esc(q.question)}</span>${icon(ok ? "check" : "x")}</summary>
        <div class="rv-body"><ul class="rv-opts">${opts}</ul>
          ${it.chosen == null ? '<p class="muted">Chưa trả lời</p>' : ""}
          <p class="exp">${esc(q.explanation)}</p>${wrongNotes(q, it)}</div></details>`;
    }).join("");

    const fchip = (val, label) => `<button class="chip ${resultFilter === val ? "on" : ""}" data-act="rfilter" data-arg="${val}">${label}</button>`;

    show("result", `${topbar({ back: "#/", title: "Kết quả", sub: s.title, lookup: true })}
    <main class="wrap">
      <section class="card score">
        <div class="muted">${exam ? "Điểm thi thử" : "Kết quả luyện tập"}</div>
        <div class="big">${p}%</div>
        <div>${r.correct}/${base} câu đúng${exam && r.answered < r.total ? ` · ${r.total - r.answered} câu bỏ trống` : ""}</div>
        ${exam ? `<div style="margin-top:10px"><span class="badge ${pass ? "pass" : "fail"}">${pass ? "Đạt" : "Chưa đạt"} (mốc ${PASS_PCT}%)</span></div>` : ""}
        <div class="sub">Thời gian: ${fmtTime(dur)}</div>
      </section>
      <div class="result-actions">
        ${wrongIds.length ? `<button class="btn primary" data-act="retry-wrong">${icon("redo")}Ôn lại ${wrongIds.length} câu sai</button>` : ""}
        <button class="btn" data-act="go" data-arg="#/setup/${exam ? "exam" : "practice"}">${exam ? "Làm đề mới" : "Luyện tiếp"}</button>
        <button class="btn" data-act="go" data-arg="#/">Trang chủ</button>
      </div>
      <h2 class="sec">Theo chủ đề</h2>
      <section class="card list">${cats}</section>
      <h2 class="sec">Xem lại bài làm</h2>
      <div class="filters">${fchip("all", "Tất cả")}${fchip("wrong", "Sai")}${fchip("right", "Đúng")}</div>
      <section class="card list">${review || '<div class="empty">Không có câu nào.</div>'}</section>
    </main>`);
  }

  // ---------- sheet ----------
  function openNavSheet() {
    closeSheet();
    const bg = document.createElement("div");
    bg.className = "sheet-bg";
    bg.dataset.act = "close-sheet";
    bg.innerHTML = `<div class="sheet" role="dialog" aria-label="Danh sách câu">
      <div class="navhead"><span>Danh sách câu</span><button class="iconbtn" data-act="close-sheet" aria-label="Đóng">${icon("x")}</button></div>
      ${navGrid()}</div>`;
    document.body.appendChild(bg);
  }
  function closeSheet() {
    document.querySelectorAll(".sheet-bg").forEach((el) => el.remove());
  }

  // ---------- tra từ ----------
  const LOOKUP_AREAS = ".qtext, .opt .txt, .feedback, .rv-q, .rv-body";
  const WORD_RE = /[A-Za-z][A-Za-z0-9]*(?:['’-][A-Za-z0-9]+)*/g;
  let dictPromise = null;

  // Từ điển (~1 MB) chỉ tải khi tra từ lần đầu; dùng <script> để chạy được cả khi mở file trực tiếp.
  function loadDict() {
    if (window.DICTIONARY) return Promise.resolve(window.DICTIONARY);
    dictPromise ||= new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = "dictionary.js";
      el.onload = () => (window.DICTIONARY ? resolve(window.DICTIONARY) : reject(new Error("empty")));
      el.onerror = () => {
        dictPromise = null;
        el.remove();
        reject(new Error("load failed"));
      };
      document.head.appendChild(el);
    });
    return dictPromise;
  }

  const normWord = (w) => w.toLowerCase().replace(/’/g, "'").replace(/'s$/, "");

  // Từ tiếng Anh nằm ở toạ độ (x, y) bên trong root.
  function wordAtPoint(root, x, y) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const m of node.data.matchAll(WORD_RE)) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        for (const r of range.getClientRects()) {
          if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) {
            return { node, index: m.index, text: m[0], range: range.cloneRange() };
          }
        }
      }
    }
    return null;
  }

  // Thuật ngữ nhiều từ trong glossary có chứa từ vừa chạm (vd chạm "learning" trong "machine learning").
  function phrasesAround(D, hit) {
    const words = [...hit.node.data.matchAll(WORD_RE)];
    const k = words.findIndex((m) => m.index === hit.index);
    const found = [];
    for (let n = 5; n >= 2; n--) {
      for (let st = Math.max(0, k - n + 1); st <= k && st + n <= words.length; st++) {
        const win = words.slice(st, st + n);
        const spaced = win.every((m, i) => i === 0 || /^ +$/.test(hit.node.data.slice(win[i - 1].index + win[i - 1][0].length, m.index)));
        if (!spaced) continue;
        const parts = win.map((m) => normWord(m[0]));
        const exact = parts.join(" ");
        const plural = [...parts.slice(0, -1), D.forms[parts[n - 1]] || parts[n - 1]].join(" ");
        const key = D.glossary[exact] ? exact : D.glossary[plural] ? plural : null;
        if (key && !found.includes(key)) found.push(key);
      }
    }
    return found;
  }

  function wordInfo(D, word) {
    const w = normWord(word);
    const head = D.forms[w] || w;
    const gloss = D.glossary[w] || D.glossary[head];
    const entry = D.entries[head];
    return gloss || entry ? { head, gloss, entry } : null;
  }

  function lookupItems(D, text, phrases) {
    const items = phrases.map((p) => ({ head: p, gloss: D.glossary[p] }));
    const add = (x) => x && !items.some((i) => i.head === x.head) && items.push(x);
    const whole = wordInfo(D, text);
    if (whole) add(whole);
    else text.split(/[-\s]+/).forEach((part) => part && add(wordInfo(D, part)));
    return items;
  }

  function renderLookup(text, items) {
    const speak = "speechSynthesis" in window
      ? `<button class="iconbtn sm" data-act="speak" data-arg="${esc(text)}" aria-label="Nghe phát âm" title="Nghe phát âm">${icon("speaker")}</button>` : "";
    const single = items.length === 1 && items[0].head === normWord(text);
    const blocks = items.map((i) => {
      const senses = (i.entry?.[1] || []).map(([pos, means]) =>
        `${pos ? `<div class="lk-pos">${esc(pos)}</div>` : ""}<ul>${means.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`).join("");
      return `<div class="lk-item">
        ${single ? "" : `<div class="lk-word">${esc(i.head)}${i.entry?.[0] ? ` <span class="ipa">/${esc(i.entry[0])}/</span>` : ""}</div>`}
        ${i.gloss ? `<div class="lk-gloss"><span class="lk-badge">Thuật ngữ</span> ${esc(i.gloss)}</div>` : ""}
        ${senses}</div>`;
    }).join("");
    const ipa = single && items[0].entry?.[0] ? ` <span class="ipa">/${esc(items[0].entry[0])}/</span>` : "";
    const gt = `https://translate.google.com/?sl=en&tl=vi&op=translate&text=${encodeURIComponent(text)}`;
    return `<div class="lk-head"><div class="grow"><b>${esc(text)}</b>${ipa}</div>${speak}
        <button class="iconbtn sm" data-act="close-lookup" aria-label="Đóng">${icon("x")}</button></div>
      <div class="lk-body">${blocks || '<p class="muted">Không có trong từ điển offline.</p>'}</div>
      <div class="lk-foot"><a href="${gt}" target="_blank" rel="noopener">Google Dịch ↗</a><span>Từ điển Anh–Việt FVDP</span></div>`;
  }

  function placeLookup(pop, rect) {
    // Điện thoại: thẻ cố định phía dưới màn hình; máy tính: bong bóng ngay cạnh từ.
    if (innerWidth < 640 || !rect) return pop.classList.add("docked");
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let top = rect.bottom + 8;
    if (top + h > innerHeight - 12 && rect.top - h - 8 > 12) top = rect.top - h - 8;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - w / 2), innerWidth - w - 8);
    pop.style.top = `${Math.max(8, top) + scrollY}px`;
    pop.style.left = `${left + scrollX}px`;
  }

  async function openLookup(text, rect, range, hit) {
    closeLookup();
    const pop = document.createElement("div");
    pop.className = "lk-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", `Nghĩa của ${text}`);
    pop.innerHTML = `<div class="lk-head"><div class="grow"><b>${esc(text)}</b></div></div><div class="lk-body muted">Đang tải từ điển…</div>`;
    document.body.appendChild(pop);
    placeLookup(pop, rect);
    if (range && window.Highlight && CSS.highlights) CSS.highlights.set("lookup", new Highlight(range));
    let D;
    try {
      D = await loadDict();
    } catch {
      pop.querySelector(".lk-body").textContent = "Không tải được từ điển (dictionary.js).";
      return;
    }
    if (!pop.isConnected) return;
    pop.innerHTML = renderLookup(text, lookupItems(D, text, hit ? phrasesAround(D, hit) : []));
    placeLookup(pop, rect);
  }

  function closeLookup() {
    document.querySelectorAll(".lk-pop").forEach((el) => el.remove());
    if (window.CSS?.highlights) CSS.highlights.delete("lookup");
  }

  // Chế độ tra từ: chạm vào từ trong nội dung câu hỏi -> mở nghĩa thay vì chọn đáp án.
  function lookupClick(e) {
    if (!settings.lookup || (view !== "quiz" && view !== "result")) return false;
    const area = e.target.closest(LOOKUP_AREAS);
    if (!area) return false;
    const hit = wordAtPoint(area, e.clientX, e.clientY);
    // Chạm vào chữ của đáp án nhưng lệch khỏi từ: bỏ qua, tránh vô tình chọn đáp án.
    if (!hit && !area.matches(".opt .txt")) return false;
    e.preventDefault();
    e.stopPropagation();
    if (hit) openLookup(hit.text, hit.range.getBoundingClientRect(), hit.range, hit);
    return true;
  }

  // ---------- PWA ----------
  let installPrompt = null;
  let offlineReady = false;
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function installBanner() {
    if (isStandalone() || !(installPrompt || (isIOS() && location.protocol.startsWith("http")))) return "";
    return `<section class="card install">
      <span class="mi">${icon("download")}</span>
      <div class="grow"><b>Cài ứng dụng lên máy</b>
        <small>${installPrompt ? "Mở nhanh từ màn hình chính, ôn được cả khi không có mạng." : "Bấm nút Chia sẻ của Safari → “Thêm vào MH chính”."}</small></div>
      ${installPrompt ? '<button class="btn primary" data-act="install">Cài đặt</button>' : ""}
    </section>`;
  }

  function appRows() {
    let title = "Cài ứng dụng lên máy", desc, canInstall = false;
    if (isStandalone()) [title, desc] = ["Đang chạy dạng ứng dụng", "Đã cài trên thiết bị này"];
    else if (installPrompt) [desc, canInstall] = ["Thêm biểu tượng ra màn hình chính / desktop", true];
    else if (!location.protocol.startsWith("http")) desc = "Cần mở web qua địa chỉ https (vd link Vercel) mới cài được";
    else if (isIOS()) desc = "Mở bằng Safari → nút Chia sẻ → “Thêm vào MH chính”";
    else desc = "Mở menu trình duyệt (⋮) → “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”";
    const offline = !location.protocol.startsWith("http")
      ? "Đang mở file trực tiếp nên vẫn dùng được trên máy này"
      : offlineReady ? "Sẵn sàng — toàn bộ câu hỏi và từ điển đã lưu trên máy" : "Đang tải dữ liệu về máy…";
    const installRow = canInstall
      ? `<button class="row" data-act="install"><div class="grow"><b>${title}</b><small>${desc}</small></div><span class="btn primary">Cài đặt</span></button>`
      : `<div class="row static"><div class="grow"><b>${title}</b><small>${desc}</small></div></div>`;
    return `${installRow}
      <div class="row static"><div class="grow"><b>Dùng khi không có mạng</b><small>${offline}</small></div>
        ${offlineReady ? icon("check", "ok-ic") : ""}</div>`;
  }

  // ---------- import / export ----------
  function exportData() {
    const data = { exam: BANK_ID, exportedAt: new Date().toISOString(), progress, bookmarks: [...bookmarks], history };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    a.download = `${BANK_ID}-tien-do-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function importData(file) {
    try {
      const data = JSON.parse(await file.text());
      // File xuất từ bản cũ ghi exam = id của từng bộ đề.
      const known = [BANK_ID, ...SOURCES.map((x) => x.id)];
      if (!known.includes(data.exam) || typeof data.progress !== "object") throw new Error("bad file");
      for (const [id, p] of Object.entries(data.progress)) {
        if (!BY_ID.has(id) || !p || typeof p.a !== "number") continue;
        if (!progress[id] || (p.t || 0) > (progress[id].t || 0)) progress[id] = p;
      }
      (data.bookmarks || []).forEach((id) => BY_ID.has(id) && bookmarks.add(id));
      const seen = new Set(history.map((h) => h.t));
      history = [...history, ...(data.history || []).filter((h) => h && !seen.has(h.t))].sort((a, b) => b.t - a.t).slice(0, 30);
      saveProgress();
      saveBookmarks();
      saveHistory();
      toast("Đã nhập tiến độ");
      render();
    } catch {
      toast("File không hợp lệ");
    }
  }

  // ---------- events ----------
  const ACTIONS = {
    go: (arg) => go(arg),
    theme: () => {
      settings.theme = { auto: "light", light: "dark", dark: "auto" }[settings.theme] || "auto";
      saveSettings();
      applyTheme();
      render();
    },
    quick: (status) => {
      const titles = { new: "Câu chưa làm", wrong: "Ôn câu sai", bookmarked: "Câu đã đánh dấu" };
      startSession("practice", shuffle(idsWhere(status)), titles[status]);
    },
    cat: (c) => startSession("practice", shuffle(QS.filter((q) => q.category === c).map((q) => q.id)), catLabel(c)),
    discard: () => {
      if (!confirm("Huỷ phiên đang làm dở?")) return;
      session = null;
      saveSession();
      render();
    },
    "toggle-shuffle": () => {
      settings.shuffle = !settings.shuffle;
      saveSettings();
      render();
    },
    export: exportData,
    import: () => document.getElementById("importFile").click(),
    reset: () => {
      if (!confirm("Xoá toàn bộ tiến độ, đánh dấu và lịch sử thi? Không thể hoàn tác.")) return;
      progress = {};
      bookmarks = new Set();
      history = [];
      session = null;
      saveProgress();
      saveBookmarks();
      saveHistory();
      saveSession();
      toast("Đã xoá tiến độ");
      render();
    },
    chip: (_, el) => setChip(el.dataset.kind, el.dataset.key, el.dataset.val),
    "start-practice": () => {
      const cfg = setup.practice;
      let ids = practicePool(cfg).map((q) => q.id);
      if (cfg.order === "random") ids = shuffle(ids);
      if (cfg.count) ids = ids.slice(0, cfg.count);
      startSession("practice", ids, cfg.cats.length === 1 ? catLabel(cfg.cats[0]) : "Luyện tập");
    },
    "start-exam": () => {
      const cfg = setup.exam;
      const ids = examIds(examPool(cfg), cfg.size);
      const names = cfg.sources.length && cfg.sources.length < SOURCES.length ? cfg.sources.map(srcName).join(" + ") + " · " : "";
      startSession("exam", ids, `Thi thử ${names}${ids.length} câu`, cfg.minutes);
    },
    choose: (arg) => choose(Number(arg)),
    prev: () => move(-1),
    next,
    finish: askFinish,
    bookmark: () => {
      toggleBookmark(current().id);
      renderQuiz();
    },
    nav: openNavSheet,
    jump: (arg) => {
      closeSheet();
      session.idx = Number(arg);
      saveSession();
      renderQuiz();
    },
    "close-sheet": (_, el, e) => {
      if (e.target === el || el.classList.contains("iconbtn")) closeSheet();
    },
    rfilter: (arg) => {
      resultFilter = arg;
      const y = window.scrollY;
      renderResult();
      window.scrollTo(0, y);
    },
    "toggle-lookup": () => {
      settings.lookup = !settings.lookup;
      saveSettings();
      toast(settings.lookup ? "Đã bật tra từ: chạm vào từ tiếng Anh để xem nghĩa" : "Đã tắt tra từ");
      if (view === "quiz") renderQuiz();
      else if (view === "result") renderResult();
      else render();
    },
    speak: (text) => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.9;
      speechSynthesis.speak(u);
    },
    "close-lookup": closeLookup,
    install: async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      installPrompt = null;
      if (outcome !== "accepted") toast("Đã huỷ cài đặt");
      if (view === "home") renderHome();
    },
    "retry-wrong": () => {
      const ids = session.items.filter((it) => !isCorrect(it) && (session.mode === "exam" || it.chosen != null)).map((it) => it.id);
      startSession("practice", shuffle(ids), "Ôn lại câu sai");
    },
  };

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".lk-pop")) {
      closeLookup();
      if (lookupClick(e)) return;
    }
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) fn(el.dataset.arg, el, e);
  });

  // Máy tính: bôi đen từ/cụm từ trong câu hỏi -> tra nghĩa.
  document.addEventListener("mouseup", (e) => {
    if (e.button !== 0 || (view !== "quiz" && view !== "result")) return;
    setTimeout(() => {
      const sel = getSelection();
      const text = sel && !sel.isCollapsed ? sel.toString().replace(/\s+/g, " ").trim() : "";
      if (!text || text.length > 60 || !/[A-Za-z]/.test(text)) return;
      if (!sel.anchorNode?.parentElement?.closest(LOOKUP_AREAS) || e.target.closest(".lk-pop")) return;
      const range = sel.getRangeAt(0);
      openLookup(text, range.getBoundingClientRect(), null, null);
    });
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "importFile" && e.target.files[0]) importData(e.target.files[0]);
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector(".sheet-bg")) {
      if (e.key === "Escape") closeSheet();
      return;
    }
    if (e.key === "Escape" && document.querySelector(".lk-pop")) return closeLookup();
    if (e.key.toLowerCase() === "t" && (view === "quiz" || view === "result")) {
      e.preventDefault();
      return ACTIONS["toggle-lookup"]();
    }
    if (view !== "quiz" || !session || session.finished) return;
    const k = e.key.toLowerCase();
    let i = "abcdefgh".indexOf(k);
    if (i < 0) i = "12345678".indexOf(k);
    if (k.length === 1 && i >= 0) {
      const it = current();
      if (i < it.order.length) choose(it.order[i]);
    } else if (k === "arrowright" || (k === "enter" && e.target === document.body)) {
      next();
    } else if (k === "arrowleft") {
      move(-1);
    } else if (k === "s") {
      ACTIONS.bookmark();
    } else {
      return;
    }
    e.preventDefault();
  });

  // Vuốt ngang trên thẻ câu hỏi để chuyển câu (điện thoại).
  let touch = null;
  document.addEventListener("touchstart", (e) => {
    touch = view === "quiz" && e.touches.length === 1 && e.target.closest("#qcard")
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) move(dx < 0 ? 1 : -1);
  }, { passive: true });

  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
  window.addEventListener("hashchange", render);

  // ---------- PWA: cài đặt & offline ----------
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // tự hiện nút "Cài đặt" thay cho banner mặc định
    installPrompt = e;
    if (view === "home") renderHome();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    toast("Đã cài ứng dụng lên máy");
    if (view === "home") renderHome();
  });
  const onNetwork = () => {
    document.documentElement.classList.toggle("is-offline", !navigator.onLine);
  };
  window.addEventListener("online", () => { onNetwork(); toast("Đã có mạng trở lại"); });
  window.addEventListener("offline", () => { onNetwork(); toast("Mất mạng — app vẫn dùng bình thường"); });
  onNetwork();

  if (location.protocol.startsWith("http") && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        offlineReady = true;
        if (view === "home") renderHome();
      })
      .catch(() => {});
    navigator.storage?.persist?.(); // xin trình duyệt không tự xoá tiến độ khi máy thiếu dung lượng
  }

  applyTheme();
  render();
})();
