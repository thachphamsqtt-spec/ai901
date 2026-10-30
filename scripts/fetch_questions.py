"""Tải ngân hàng câu hỏi từ open-exam-prep.com và xuất ra Markdown + HTML để học offline.

Các bộ đề được gộp (bỏ câu trùng) vào web/questions.js; bộ đứng trước được giữ khi trùng.

Cách dùng:
    python scripts/fetch_questions.py                          # mặc định: azure-ai-900 azure-ai-901
    python scripts/fetch_questions.py azure-ai-900 az-900      # bộ đề khác (slug trên URL /practice/<slug>)
"""
import difflib
import html
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

BASE = "https://open-exam-prep.com"
UA = {"User-Agent": "Mozilla/5.0"}
ROOT = Path(__file__).resolve().parent.parent
LETTERS = "ABCDEFGH"
DEFAULT_EXAMS = ["azure-ai-900", "azure-ai-901"]
BANK_ID = "azure-ai-fundamentals"  # khoá lưu tiến độ trên web
BANK_TITLE = "Azure AI Fundamentals"
DUP_RATIO = 0.85  # độ giống nhau của câu hỏi để coi là trùng


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read().decode("utf-8")


def fetch(exam):
    page = get(f"{BASE}/practice/{exam}")
    m = re.search(r'questionBankRevision\\?":\\?"([0-9a-f]+)', page)
    rev = m.group(1) if m else ""
    m = re.search(r'"examId\\?":\\?"([^"\\]+)', page)
    exam_id = m.group(1) if m else exam
    m = re.search(r'"examName\\?":\\?"([^"\\]+)', page)
    exam_name = m.group(1) if m else exam_id
    data = json.loads(get(f"{BASE}/data/question-bank/{exam_id}.json?v={rev}"))
    return exam_id, exam_name, data


def to_markdown(exam, qs):
    out = [f"# {exam} — {len(qs)} câu hỏi\n"]
    for cat, n in Counter(q["category"] for q in qs).most_common():
        out.append(f"- {cat}: {n}")
    for i, q in enumerate(qs, 1):
        out.append(f"\n---\n\n### {i}. {q['question']}\n")
        out.append(f"*{q.get('category', '')} · {q.get('difficulty', '')}*\n")
        for j, opt in enumerate(q["options"]):
            out.append(f"- **{LETTERS[j]}.** {opt}")
        ans = q["correctAnswer"]
        why = "".join(f"\n- *{LETTERS[int(k)]} sai:* {v}" for k, v in sorted(q.get("wrongExplanations", {}).items()))
        out.append(f"\n<details><summary>Đáp án</summary>\n\n**{LETTERS[ans]}. {q['options'][ans]}**\n\n{q.get('explanation', '')}\n{why}\n</details>")
    return "\n".join(out) + "\n"


def to_html(exam, qs):
    payload = json.dumps(qs, ensure_ascii=False).replace("</", "<\\/")
    return HTML_TEMPLATE.replace("__TITLE__", html.escape(exam)).replace("__DATA__", payload)


HTML_TEMPLATE = r"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__ — Practice offline</title>
<style>
 body{font-family:system-ui,Segoe UI,sans-serif;max-width:820px;margin:0 auto;padding:16px;background:#f6f7f9;color:#1d1f23}
 header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
 select,button{font:inherit;padding:6px 10px;border:1px solid #c9ccd3;border-radius:6px;background:#fff;cursor:pointer}
 .card{background:#fff;border:1px solid #dde0e6;border-radius:10px;padding:20px}
 .meta{color:#6b7080;font-size:13px;margin-bottom:8px}
 .q{font-size:18px;font-weight:600;margin-bottom:14px}
 .opt{display:block;width:100%;text-align:left;margin:6px 0;padding:10px 12px}
 .opt.correct{background:#e3f6e8;border-color:#2e9e4f}
 .opt.wrong{background:#fde7e7;border-color:#d64545}
 .exp{margin-top:14px;padding:12px;background:#f1f4fb;border-radius:8px;display:none}
 nav{display:flex;justify-content:space-between;margin-top:14px}
 .score{margin-left:auto;font-weight:600}
</style></head><body>
<header>
 <strong>__TITLE__</strong>
 <select id="cat"></select>
 <select id="mode"><option value="all">Tất cả</option><option value="new">Chưa làm</option><option value="missed">Làm sai</option></select>
 <button id="shuffle">Trộn</button>
 <button id="reset">Xoá tiến độ</button>
 <span class="score" id="score"></span>
</header>
<div class="card">
 <div class="meta" id="meta"></div>
 <div class="q" id="q"></div>
 <div id="opts"></div>
 <div class="exp" id="exp"></div>
 <nav><button id="prev">← Trước</button><button id="next">Tiếp →</button></nav>
</div>
<script>
const ALL = __DATA__;
const KEY = "offline_progress:" + document.title;
const L = "ABCDEFGH";
let prog = JSON.parse(localStorage.getItem(KEY) || "{}"); // id -> chosen index
let list = [], idx = 0;
const $ = id => document.getElementById(id);
const cats = [...new Set(ALL.map(q => q.category))];
$("cat").innerHTML = '<option value="">Mọi chủ đề</option>' + cats.map(c => `<option>${c}</option>`).join("");
function save(){ localStorage.setItem(KEY, JSON.stringify(prog)); }
function build(){
  const c = $("cat").value, m = $("mode").value;
  list = ALL.filter(q => (!c || q.category === c) &&
    (m === "all" || (m === "new" && !(q.id in prog)) || (m === "missed" && q.id in prog && prog[q.id] !== q.correctAnswer)));
  idx = 0; render();
}
function render(){
  const done = ALL.filter(q => q.id in prog), ok = done.filter(q => prog[q.id] === q.correctAnswer);
  $("score").textContent = `Đúng ${ok.length}/${done.length} · đã làm ${done.length}/${ALL.length}`;
  if (!list.length){ $("meta").textContent = ""; $("q").textContent = "Không có câu hỏi nào."; $("opts").innerHTML = ""; $("exp").style.display = "none"; return; }
  const q = list[idx];
  $("meta").textContent = `Câu ${idx+1}/${list.length} · ${q.id} · ${q.category} · ${q.difficulty}`;
  $("q").textContent = q.question;
  $("opts").innerHTML = "";
  q.options.forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "opt"; b.textContent = `${L[i]}. ${o}`;
    b.onclick = () => { prog[q.id] = i; save(); render(); };
    $("opts").appendChild(b);
  });
  const exp = $("exp");
  if (q.id in prog){
    const btns = $("opts").children;
    btns[q.correctAnswer].classList.add("correct");
    if (prog[q.id] !== q.correctAnswer) btns[prog[q.id]].classList.add("wrong");
    exp.innerHTML = `<b>Đáp án: ${L[q.correctAnswer]}</b><br>`;
    exp.appendChild(document.createTextNode(q.explanation || ""));
    exp.style.display = "block";
  } else exp.style.display = "none";
}
$("prev").onclick = () => { if (idx > 0){ idx--; render(); } };
$("next").onclick = () => { if (idx < list.length - 1){ idx++; render(); } };
$("cat").onchange = $("mode").onchange = build;
$("shuffle").onclick = () => { for (let i = list.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [list[i], list[j]] = [list[j], list[i]]; } idx = 0; render(); };
$("reset").onclick = () => { if (confirm("Xoá toàn bộ tiến độ?")){ prog = {}; save(); build(); } };
document.addEventListener("keydown", e => {
  if (e.key === "ArrowRight") $("next").click();
  else if (e.key === "ArrowLeft") $("prev").click();
  else { const i = L.toLowerCase().indexOf(e.key.toLowerCase()); const b = $("opts").children[i]; if (i >= 0 && b) b.click(); }
});
build();
</script></body></html>
"""


def norm(text):
    return re.sub(r"[^a-z0-9 ]", "", text.lower()).strip()


def similar(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def is_dup(q, p):
    """Gần trùng cả câu hỏi lẫn đáp án đúng (chỉ so câu hỏi thì bắt nhầm 'few-shot' với 'zero-shot')."""
    return (similar(q["question"], p["question"]) >= DUP_RATIO
            and similar(q["options"][q["correctAnswer"]], p["options"][p["correctAnswer"]]) >= 0.5)


def merge(banks):
    """Gộp các bộ đề; câu của bộ sau bị bỏ nếu trùng với câu của bộ trước.

    Câu trùng = có trong data/duplicates.json (đã rà thủ công) hoặc gần trùng theo is_dup().
    """
    manual = json.loads((ROOT / "data" / "duplicates.json").read_text(encoding="utf-8"))
    kept, skipped = [], []
    for exam_id, qs in banks:
        earlier = list(kept)  # chỉ so với các bộ trước, không so trong cùng một bộ
        by_id = {p["id"]: p for p in earlier}
        for q in qs:
            dup = by_id.get(manual.get(q["id"])) or next((p for p in earlier if is_dup(q, p)), None)
            if dup:
                skipped.append((q, dup))
            else:
                kept.append({**q, "source": exam_id})
    return kept, skipped


def short_name(exam_id, exam_name):
    m = re.search(r"[A-Z]{2,3}-\d{3}", exam_name) or re.search(r"[a-z]{2,3}-\d{3}$", exam_id)
    return m.group(0).upper() if m else exam_name


def main():
    sys.stdout.reconfigure(errors="replace")  # console Windows không phải UTF-8
    exams = sys.argv[1:] or DEFAULT_EXAMS
    out = ROOT / "data"
    out.mkdir(exist_ok=True)
    banks, sources = [], []
    for exam in exams:
        exam_id, exam_name, qs = fetch(exam)
        qs.sort(key=lambda q: q["id"])
        (out / f"{exam_id}.json").write_text(json.dumps(qs, ensure_ascii=False, indent=2), encoding="utf-8")
        (ROOT / f"{exam_id}.md").write_text(to_markdown(exam_id, qs), encoding="utf-8")
        (ROOT / f"{exam_id}.html").write_text(to_html(exam_id, qs), encoding="utf-8")
        print(f"{exam_name}: {len(qs)} câu -> data/{exam_id}.json, {exam_id}.md, {exam_id}.html")
        banks.append((exam_id, qs))
        sources.append({"id": exam_id, "name": short_name(exam_id, exam_name), "title": exam_name})

    questions, skipped = merge(banks)
    for q, orig in skipped:
        print(f"  Bỏ câu trùng {q['id']}: {q['question']!r}\n    ~ {orig['id']}: {orig['question']!r}")
    bank = {"id": BANK_ID, "title": BANK_TITLE, "sources": sources, "questions": questions}
    (ROOT / "web" / "questions.js").write_text(
        "window.QUESTION_BANK = " + json.dumps(bank, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"web/questions.js: {len(questions)} câu ({len(skipped)} câu trùng đã bỏ)")


if __name__ == "__main__":
    main()
