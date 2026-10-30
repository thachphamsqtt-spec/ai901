"""Tạo web/dictionary.js: từ điển Anh–Việt offline cho tính năng tra từ trên web.

Chỉ giữ các từ xuất hiện trong ngân hàng câu hỏi (web/questions.js) để file nhỏ gọn.
Nguồn:
  - Từ điển Anh–Việt FVDP (Free Vietnamese Dictionary Project, Hồ Ngọc Đức), tải về data/dict-src/
  - data/glossary.json: thuật ngữ AI/Azure (tự soạn) + từ bổ sung

Chạy lại sau mỗi lần cập nhật câu hỏi:
    python scripts/build_dictionary.py
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "data" / "dict-src"
SOURCES = [  # bản 109k mục trước, bản 58k bù những mục thiếu
    ("fvdp-109k.txt", "https://raw.githubusercontent.com/manhminno/English-Vietnamese-Dictionary/master/data/english-vietnamese.txt"),
    ("fvdp-58k.txt", "https://raw.githubusercontent.com/DucLoc1999/Dictionary/master/AnhViet.txt"),
]
MAX_POS = 4  # số từ loại tối đa mỗi từ
MAX_MEANINGS = 4  # số nghĩa tối đa mỗi từ loại
WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9]*(?:['’-][A-Za-z0-9]+)*")


def download(name, url):
    path = SRC_DIR / name
    if not path.exists():
        SRC_DIR.mkdir(parents=True, exist_ok=True)
        print(f"Tải {url} ...")
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=600) as r:
            path.write_bytes(r.read())
    return path


def parse_fvdp(path):
    """Định dạng FVDP: '@từ /phiên âm/', '* từ loại', '- nghĩa', '=ví dụ+ dịch' (bỏ qua ví dụ)."""
    entries, head, cur = {}, None, None
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("@") or head is None:
            m = re.match(r"@?([^/]+?)\s*(?:/([^/]*)/.*)?$", line)
            if not m:
                continue
            head = m.group(1).strip().lower()
            cur = None
            if head not in entries:
                entries[head] = [(m.group(2) or "").strip(), []]
            else:
                head = "\0skip"  # mục trùng trong cùng file: giữ mục đầu
            continue
        if head == "\0skip":
            continue
        senses = entries[head][1]
        if line.startswith("*"):
            pos = re.sub(r"\s+", " ", line.lstrip("* ").split(",")[0]).strip()
            cur = [pos, []]
            senses.append(cur)
        elif line.startswith("-"):
            if cur is None:
                cur = ["", []]
                senses.append(cur)
            meaning = re.sub(r"\s+", " ", line[1:]).strip()
            if meaning and meaning not in cur[1]:
                cur[1].append(meaning)
    for e in entries.values():
        e[1] = [[pos, means[:MAX_MEANINGS]] for pos, means in e[1] if means][:MAX_POS]
    return {h: e for h, e in entries.items() if e[1]}


def candidates(w):
    """Dạng gốc có thể có của một từ (số nhiều, quá khứ, -ing, so sánh...)."""
    c = [w]
    if w.endswith("ies"): c.append(w[:-3] + "y")
    if w.endswith("es"): c.append(w[:-2])
    if w.endswith("s"): c.append(w[:-1])
    if w.endswith("ied"): c.append(w[:-3] + "y")
    if w.endswith("ed"): c += [w[:-2], w[:-1], w[:-3]]
    if w.endswith("ing"): c += [w[:-3], w[:-3] + "e", w[:-4]]
    if w.endswith("ier"): c.append(w[:-3] + "y")
    if w.endswith("iest"): c.append(w[:-4] + "y")
    if w.endswith("er"): c += [w[:-2], w[:-1]]
    if w.endswith("est"): c += [w[:-3], w[:-2]]
    if w.endswith("ily"): c.append(w[:-3] + "y")
    if w.endswith("ly"): c.append(w[:-2])
    return c


def bank_words():
    s = (ROOT / "web" / "questions.js").read_text(encoding="utf-8")
    bank = json.loads(s[s.index("{"):s.rindex("}") + 1])
    words = set()
    for q in bank["questions"]:
        for text in [q["question"], q.get("explanation", ""), *q["options"], *q.get("wrongExplanations", {}).values()]:
            for m in WORD_RE.finditer(text):
                w = m.group(0).lower().replace("’", "'")
                w = re.sub(r"'s$", "", w)
                words.add(w)
                if "-" in w:
                    words.update(p for p in w.split("-") if p)
    return words


def main():
    sys.stdout.reconfigure(errors="replace")  # console Windows không phải UTF-8
    dicts = [parse_fvdp(download(name, url)) for name, url in SOURCES]
    fvdp = {}
    for d in dicts:
        for h, e in d.items():
            fvdp.setdefault(h, e)
    gl = json.loads((ROOT / "data" / "glossary.json").read_text(encoding="utf-8"))
    terms, extra = gl["terms"], gl["words"]

    entries, forms, missing = {}, {}, []
    for w in sorted(bank_words()):
        target = next((c for c in candidates(w) if c in terms or c in extra or c in fvdp), None)
        if target is None:
            missing.append(w)
            continue
        if target != w:
            forms[w] = target
        if target in fvdp:
            entries[target] = fvdp[target]
        elif target in extra:
            entries[target] = ["", [["", [extra[target]]]]]

    data = {
        "source": "FVDP English–Vietnamese Dictionary (Hồ Ngọc Đức) + glossary.json",
        "entries": entries,
        "forms": forms,
        "glossary": terms,
    }
    out = ROOT / "web" / "dictionary.js"
    out.write_text("window.DICTIONARY = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                   encoding="utf-8")
    print(f"web/dictionary.js: {len(entries)} mục từ, {len(forms)} dạng biến thể, {len(terms)} thuật ngữ, "
          f"{out.stat().st_size // 1024} KB")
    print(f"Không tìm thấy {len(missing)} từ (web sẽ tra từng phần của từ ghép):")
    print(", ".join(missing))


if __name__ == "__main__":
    main()
