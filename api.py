"""paper/api.py — ペーパースケッチ。便箋・作文帳・文庫本などの紙に、文章を書いて印刷する。

・文書は、フォルダ窓の置き場所の下の「Paper Sketch」フォルダにある <名前>.paper.json（フォルダ窓として Claude と共有できる）
・本文は 1 つの文字列（記法つきのテキスト）。紙・書式・題名などの設定は同じ JSON の別の項目
・組版（ページ分け・縦書き・ルビ）は画面が行う。ここは作る・開く・保存・読み込み・書き出しだけ
・書き出した .txt / .paper.json は、読み込むと元と同じ文書に戻る（txt は 1 行目に設定を入れる）
・紙の上に置く物（objects）: 絵（image）と図形（shape。中に文字を入れられる）。絵は「Paper Sketch\\_images」に中身の
  ハッシュの名前で写して置き、文書には名前だけを書く（同じ絵は 1 つ。書き出した文書を読み込んでも同じ絵を指す）
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import re
import tempfile
from datetime import date
from pathlib import Path

_ctx = None

EXT = ".paper.json"
FORMAT = "hub-paper/1"
FOLDER_NAME = "Paper Sketch"
GUIDE = "PAPER_FORMAT.md"
EXPORT_DIR = "export"
TXT_HEAD = "%paper-sketch "          # 書き出した txt の 1 行目（この後ろに本文以外の設定を JSON で入れる）
TEXT_EXTS = {".txt", ".text", ".md"}
BODY_MAX = 2_000_000                 # 本文の上限（文字）。文庫 1 冊でも 30 万字ほど
ALIGNS = ("start", "center")
PLACEMENTS = ("top", "letter", "grid")
GRID_KINDS = ("none", "lines", "genko")
IMAGE_DIR = "_images"
IMAGE_MAX = 30 * 1024 * 1024
IMAGE_MAGIC = {".png": (b"\x89PNG\r\n\x1a\n",), ".jpg": (b"\xff\xd8\xff",), ".gif": (b"GIF87a", b"GIF89a"),
               ".webp": (b"RIFF",), ".bmp": (b"BM",)}
IMAGE_EXTS = {".png": ".png", ".jpg": ".jpg", ".jpeg": ".jpg", ".jfif": ".jpg", ".gif": ".gif", ".webp": ".webp", ".bmp": ".bmp"}
IMAGE_NAME_RE = re.compile(r"^[0-9a-f]{20}\.(png|jpg|gif|webp|bmp)$")
SHAPES = ("rect", "round", "ellipse", "line", "arrow")
OBJ_MAX = 300
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
NAME_RE = re.compile(r"^[^\\/:*?\"<>|\x00-\x1f]{1,80}$")

_TEMPLATES = json.loads(Path(__file__).with_name("templates.json").read_text(encoding="utf-8"))
SIZES: dict = _TEMPLATES["sizes"]
THEMES: dict = _TEMPLATES["themes"]
TEMPLATES: dict = {t["id"]: t for t in _TEMPLATES["templates"]}
DEFAULT_TEMPLATE = "memo"


class PaperError(Exception):
    pass


def setup(ctx):
    global _ctx
    _ctx = ctx


# ---------- 保存先 ----------
def _folder() -> Path:
    """既定は フォルダ窓の置き場所\\Paper Sketch（無ければ作る）。設定 modules.paper.folder で変えられる。"""
    p = (_ctx.config or {}).get("folder")
    if not p:
        root = ((getattr(_ctx.host, "config", None) or {}).get("modules") or {}).get("folders", {}).get("root") or "~/Hub"
        p = Path(root).expanduser() / FOLDER_NAME
    f = Path(p).expanduser()
    f.mkdir(parents=True, exist_ok=True)
    guide, ours = f / GUIDE, Path(__file__).with_name(GUIDE)
    try:  # Claude が読む説明書。同梱の版と違えば置き直す
        if ours.is_file() and (not guide.is_file() or guide.read_bytes() != ours.read_bytes()):
            _write_atomic(guide, ours.read_text(encoding="utf-8"))
    except OSError:
        pass
    return f


def _check_name(name: str) -> str:
    if not isinstance(name, str) or not NAME_RE.match(name) or name.strip() != name or name in (".", ".."):
        raise PaperError(f"名前に使えない文字があります: {name}")
    return name


def _path(name: str) -> Path:
    return _folder() / f"{_check_name(name)}{EXT}"


def _write_atomic(path: Path, text: str, newline: str = "\n") -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".paper-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline=newline) as f:
            f.write(text)
        os.replace(tmp, path)
    except Exception:
        Path(tmp).unlink(missing_ok=True)
        raise


def _free_name(stem: str) -> str:
    """同じ名前があれば 'name (2)'。"""
    stem = re.sub(r"[\\/:*?\"<>|\x00-\x1f]", "_", stem).strip()[:70] or "paper"
    folder = _folder()
    if not (folder / f"{stem}{EXT}").exists():
        return stem
    for i in range(2, 1000):
        if not (folder / f"{stem} ({i}){EXT}").exists():
            return f"{stem} ({i})"
    raise PaperError("同じ名前のファイルが多すぎます")


def _unique(path: Path) -> Path:
    """上書きしない: 'name.txt' があれば 'name (2).txt'。"""
    if not path.exists():
        return path
    stem, suffix = (path.name[: -len(EXT)], EXT) if path.name.endswith(EXT) else (path.stem, path.suffix)
    for i in range(2, 1000):
        p = path.with_name(f"{stem} ({i}){suffix}")
        if not p.exists():
            return p
    raise PaperError("同じ名前のファイルが多すぎます")


# ---------- 文書の形 ----------
def _num(v, lo, hi, default, digits=2):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    if x != x:  # NaN
        return default
    return round(max(lo, min(hi, x)), digits)


def _int(v, lo, hi, default):
    return int(_num(v, lo, hi, default, 0))


def _str(v, limit: int, default: str = "") -> str:
    if not isinstance(v, str):
        return default
    return v.replace("\r\n", "\n").replace("\r", "\n")[:limit]


def new_doc(template: str = DEFAULT_TEMPLATE) -> dict:
    """ひな形から新しい文書を作る（ひな形の値を写す）。"""
    t = TEMPLATES.get(template) or TEMPLATES[DEFAULT_TEMPLATE]
    meta = {"placement": "top", "titleAlign": "start", "pageNumbers": False, "title": "", "date": "", "signature": "", **t["meta"]}
    return {
        "format": FORMAT,
        "template": t["id"],
        "page": dict(t["page"]),
        "grid": dict(t["grid"]),
        "text": dict(t["text"]),
        "meta": meta,
        "theme": t["theme"],
        "ruby": True,
        "objects": [],
        "body": "",
    }


def normalize(raw) -> tuple[dict, list[str]]:
    """読み込んだ JSON を、画面が扱える形にそろえる。範囲外は丸め、読めない所はひな形の値にして warnings に残す。"""
    if not isinstance(raw, dict):
        raise PaperError("中身が JSON のオブジェクトではありません")
    warn: list[str] = []
    if raw.get("format") not in (None, FORMAT):
        warn.append(f"format が {raw.get('format')} です（{FORMAT} として読みました）")
    tid = raw.get("template")
    if tid not in TEMPLATES:
        if tid is not None:
            warn.append(f"template「{tid}」は無いので {DEFAULT_TEMPLATE} にしました")
        tid = DEFAULT_TEMPLATE
    out = new_doc(tid)
    d = lambda k: raw.get(k) if isinstance(raw.get(k), dict) else {}  # noqa: E731

    pg, base = d("page"), out["page"]
    size = pg.get("size", base["size"])
    if size not in SIZES:
        warn.append(f"page.size「{size}」は使えないので {base['size']} にしました（{', '.join(SIZES)}）")
        size = base["size"]
    margin = pg.get("margin", base["margin"])
    if not (isinstance(margin, list) and len(margin) == 4):
        margin = base["margin"]
    out["page"] = {
        "size": size,
        "landscape": bool(pg.get("landscape", base["landscape"])),
        "vertical": bool(pg.get("vertical", base["vertical"])),
        "margin": [_num(m, 0, 80, 15, 1) for m in margin],
        "columns": _int(pg.get("columns", base["columns"]), 1, 3, 1),
        "columnGap": _num(pg.get("columnGap", base["columnGap"]), 2, 30, 8, 1),
    }

    gr, base = d("grid"), out["grid"]
    kind = gr.get("kind", base["kind"])
    if kind not in GRID_KINDS:
        warn.append(f"grid.kind「{kind}」は使えないので {base['kind']} にしました")
        kind = base["kind"]
    out["grid"] = {
        "kind": kind,
        "chars": _int(gr.get("chars", base["chars"]), 4, 60, 20),
        "lines": _int(gr.get("lines", base["lines"]), 2, 60, 10),
        "guide": bool(gr.get("guide", base["guide"])),
        "picture": _num(gr.get("picture", base["picture"]), 0, 0.8, 0, 2),
    }

    tx, base = d("text"), out["text"]
    out["text"] = {
        "font": _str(tx.get("font"), 80, base["font"]).strip() or base["font"],
        "mode": tx.get("mode") if tx.get("mode") in ("free", "fit") else base["mode"],
        "size": _num(tx.get("size", base["size"]), 5, 72, base["size"], 1),
        "lineHeight": _num(tx.get("lineHeight", base["lineHeight"]), 1.0, 4.0, base["lineHeight"], 2),
        "letterSpacing": _num(tx.get("letterSpacing", base["letterSpacing"]), -0.2, 1.0, 0, 2),
        "chars": _int(tx.get("chars", base["chars"]), 5, 80, base["chars"]),
        "lines": _int(tx.get("lines", base["lines"]), 3, 80, base["lines"]),
    }

    mt, base = d("meta"), out["meta"]
    out["meta"] = {
        "placement": mt.get("placement") if mt.get("placement") in PLACEMENTS else base["placement"],
        "titleAlign": mt.get("titleAlign") if mt.get("titleAlign") in ALIGNS else base["titleAlign"],
        "pageNumbers": bool(mt.get("pageNumbers", base["pageNumbers"])),
        "title": _str(mt.get("title", base["title"]), 200),
        "date": _str(mt.get("date", base["date"]), 80),
        "signature": _str(mt.get("signature", base["signature"]), 400),
    }

    theme = raw.get("theme", out["theme"])
    if theme not in THEMES:
        warn.append(f"theme「{theme}」は無いので {out['theme']} にしました")
        theme = out["theme"]
    out["theme"] = theme
    out["ruby"] = bool(raw.get("ruby", True))

    out["objects"] = _objects(raw.get("objects"), warn)

    body = raw.get("body", "")
    if not isinstance(body, str):
        warn.append("body が文字列ではないので空にしました")
        body = ""
    if len(body) > BODY_MAX:
        warn.append(f"本文が長すぎるので {BODY_MAX:,} 字で切りました")
    out["body"] = _str(body, BODY_MAX)
    return out, warn


def _color(v, default):
    return v if isinstance(v, str) and COLOR_RE.match(v) else default


def _objects(raw, warn: list[str]) -> list[dict]:
    """紙の上に置く物をそろえる。寸法は mm（紙の左上から）、page は 1 から。"""
    if raw is None:
        return []
    if not isinstance(raw, list):
        warn.append("objects がリストではないので空にしました")
        return []
    out, ids = [], set()
    for i, o in enumerate(raw[:OBJ_MAX]):
        kind = o.get("kind") if isinstance(o, dict) else None
        if kind not in ("image", "shape"):
            warn.append(f"objects[{i}] を読み飛ばしました（kind は image / shape）")
            continue
        oid = re.sub(r"[^\w-]", "", str(o.get("id") or ""))[:20] or f"o{i + 1}"
        while oid in ids:
            oid += "_"
        ids.add(oid)
        line = kind == "shape" and o.get("shape") in ("line", "arrow")
        lo = -600 if line else 1                          # 線は向きがあるので w・h が負でもよい
        x = {"id": oid, "kind": kind, "page": _int(o.get("page"), 1, 9999, 1),
             "x": _num(o.get("x"), -300, 900, 20, 2), "y": _num(o.get("y"), -300, 900, 20, 2),
             "w": _num(o.get("w"), lo, 600, 40, 2), "h": _num(o.get("h"), lo, 600, 30, 2),
             "rot": _num(o.get("rot"), -180, 180, 0, 1), "opacity": _num(o.get("opacity"), 0.05, 1, 1, 2),
             "behind": bool(o.get("behind", False))}
        if line and abs(x["w"]) + abs(x["h"]) < 1:
            x["w"] = 30
        if kind == "image":
            src = o.get("src")
            if not (isinstance(src, str) and IMAGE_NAME_RE.match(src)):
                warn.append(f"objects[{i}] の絵の名前が正しくないので読み飛ばしました")
                continue
            x["src"] = src
        else:
            x.update({"shape": o.get("shape") if o.get("shape") in SHAPES else "rect",
                      "stroke": _color(o.get("stroke"), "#333333") if o.get("stroke") != "none" else "none",
                      "fill": _color(o.get("fill"), "none") if o.get("fill") != "none" else "none",
                      "lineWidth": _num(o.get("lineWidth"), 0.1, 5, 0.4, 2),
                      "text": _str(o.get("text"), 4000), "size": _num(o.get("size"), 5, 120, 12, 1),
                      "color": _color(o.get("color"), "#222222"), "vertical": bool(o.get("vertical", False)),
                      "align": o.get("align") if o.get("align") in ("start", "center", "end") else "center",
                      "font": _str(o.get("font"), 80).strip()})
        out.append(x)
    if isinstance(raw, list) and len(raw) > OBJ_MAX:
        warn.append(f"置く物が多すぎるので {OBJ_MAX} 個までにしました")
    return out


def _dump(doc: dict) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n"


# ---------- txt（往復で同じ文書に戻る） ----------
def to_txt(doc: dict) -> str:
    """1 行目に本文以外の設定、2 行目から本文（記法のまま）。"""
    head = {k: v for k, v in doc.items() if k != "body"}
    return TXT_HEAD + json.dumps(head, ensure_ascii=False, separators=(",", ":")) + "\n" + doc["body"]


_ESC_CHARS = set("\\*｜《》")
_ALIGN_MARKS = (">>", "><", "<>", "==")


def escape_plain(text: str) -> str:
    """ふつうの文章を、記法として読まれない形にする（* や《》をそのままの字として出す）。ui/markup.js と同じ決まり。"""
    out = []
    for line in text.split("\n"):
        s = "".join("\\" + c if c in _ESC_CHARS else c for c in line)
        out.append("\\" + s if s[:2] in _ALIGN_MARKS else s)
    return "\n".join(out)


def from_txt(text: str) -> tuple[dict, list[str]]:
    """txt を文書にする。1 行目に設定があれば元どおりに、無ければ本文だけのメモにする（記号はそのままの字として読む）。"""
    text = text.lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n")
    if text.startswith(TXT_HEAD):
        first, _, body = text.partition("\n")
        try:
            head = json.loads(first[len(TXT_HEAD):])
        except json.JSONDecodeError:
            head = None
        if isinstance(head, dict):
            return normalize({**head, "body": body})
        return normalize({"body": escape_plain(text)})[0], ["1 行目の設定が読めないので、本文として読みました"]
    return normalize({"body": escape_plain(text)})


def _read_text_file(p: Path) -> str:
    raw = p.read_bytes()
    for enc in ("utf-8-sig", "cp932"):  # Windows の古いメモ帳の Shift_JIS も読む
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise PaperError(f"{p.name} の文字コードが読めません（UTF-8 か Shift_JIS にしてください）")


# ---------- 絵 ----------
def _image_dir() -> Path:
    d = _folder() / IMAGE_DIR
    d.mkdir(exist_ok=True)
    return d


def _image_ext(data: bytes, hint: str = "") -> str:
    for ext, magics in IMAGE_MAGIC.items():
        if any(data.startswith(m) for m in magics) and (ext != ".webp" or data[8:12] == b"WEBP"):
            return ext
    raise PaperError(f"絵として読めません{f'（{hint}）' if hint else ''}。PNG・JPEG・GIF・WebP・BMP が使えます")


def _store_image(data: bytes, hint: str = "") -> str:
    """絵を _images に置く（中身のハッシュの名前。同じ絵なら置き直さない）。返すのは名前。"""
    if not data or len(data) > IMAGE_MAX:
        raise PaperError(f"絵が大きすぎるか空です{f'（{hint}）' if hint else ''}。30MB まで")
    name = hashlib.sha1(data).hexdigest()[:20] + _image_ext(data, hint)
    p = _image_dir() / name
    if not p.exists():
        fd, tmp = tempfile.mkstemp(dir=p.parent, prefix=".paper-", suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
            os.replace(tmp, p)
        except Exception:
            Path(tmp).unlink(missing_ok=True)
            raise
    return name


def add_image_files(paths: list[str]) -> dict:
    """PC の絵のファイルを取り込む（元のファイルは変えない）。"""
    made, skipped = [], []
    for raw_path in paths or []:
        p = Path(str(raw_path))
        if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
            skipped.append(p.name)
            continue
        try:
            if p.stat().st_size > IMAGE_MAX:
                raise PaperError(f"{p.name} は大きすぎます（30MB まで）")
            made.append(_store_image(p.read_bytes(), p.name))
        except (OSError, PaperError) as e:
            skipped.append(f"{p.name}（{e}）")
    return {"made": made, "skipped": skipped}


def save_image(data: bytes) -> dict:
    """貼り付けた絵を受け取る（Hub 0.8 の upload）。"""
    return {"src": _store_image(bytes(data))}


def blob_path(key: str) -> Path:
    """/blob/paper/<絵の名前> … _images の中の絵だけ。"""
    key = str(key)
    if not IMAGE_NAME_RE.match(key):
        raise PaperError("ありません")
    p = _folder() / IMAGE_DIR / key
    if not p.is_file():
        raise PaperError("ありません")
    return p


def _missing_images(doc: dict) -> list[str]:
    d = _folder() / IMAGE_DIR
    return sorted({o["src"] for o in doc.get("objects", []) if o["kind"] == "image" and not (d / o["src"]).is_file()})


# ---------- 画面から呼ぶ ----------
def _summary(p: Path) -> dict:
    name = p.name[: -len(EXT)]
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        doc, _ = normalize(raw)
    except (OSError, json.JSONDecodeError, PaperError):
        return {"name": name, "broken": True, "mtime": p.stat().st_mtime}
    first = next((ln for ln in doc["body"].split("\n") if ln.strip()), "")
    return {"name": name, "template": doc["template"], "title": doc["meta"]["title"], "theme": doc["theme"],
            "vertical": doc["page"]["vertical"], "head": first[:60], "chars": len(doc["body"]), "mtime": p.stat().st_mtime}


def state() -> dict:
    f = _folder()
    files = sorted(f.glob(f"*{EXT}"), key=lambda p: p.stat().st_mtime, reverse=True)
    return {"folder": str(f), "files": [_summary(p) for p in files], "current": _ctx.store.get("paper", "current", None),
            "templates": list(TEMPLATES.values()), "themes": THEMES, "sizes": SIZES}


def create(template: str = DEFAULT_TEMPLATE, name: str = "") -> dict:
    """ひな形から新しい文書を作って開く。"""
    if template not in TEMPLATES:
        raise PaperError(f"ひな形がありません: {template}")
    doc = new_doc(template)
    stem = name.strip() if isinstance(name, str) and name.strip() else f"{TEMPLATES[template]['name']['ja']} {date.today():%Y-%m-%d}"
    name = _free_name(stem)
    _write_atomic(_path(name), _dump(doc))
    return open_paper(name)


def _read(name: str) -> tuple[Path, dict, list[str]]:
    p = _path(name)
    if not p.exists():
        raise PaperError(f"見つかりません: {name}")
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise PaperError(f"{p.name} の JSON が壊れています（{e.lineno} 行目）")
    doc, warn = normalize(raw)
    return p, doc, warn


def open_paper(name: str) -> dict:
    p, doc, warn = _read(name)
    _ctx.store.set("paper", "current", name)
    return {"name": name, "doc": doc, "warnings": warn, "mtime": p.stat().st_mtime, "missing": _missing_images(doc)}


def save_paper(name: str, doc: dict) -> dict:
    clean, warn = normalize(doc)
    p = _path(name)
    _write_atomic(p, _dump(clean))
    return {"mtime": p.stat().st_mtime, "warnings": warn}


def poll(name: str) -> dict:
    p = _path(name)
    return {"mtime": p.stat().st_mtime if p.exists() else None}


def rename(name: str, new_name: str) -> dict:
    src = _path(name)
    if not src.exists():
        raise PaperError(f"見つかりません: {name}")
    new_name = _check_name(str(new_name).strip())
    if new_name == name:
        return {"name": name}
    dst = _path(new_name)
    if dst.exists():
        raise PaperError(f"同じ名前があります: {new_name}")
    os.replace(src, dst)
    if _ctx.store.get("paper", "current", None) == name:
        _ctx.store.set("paper", "current", new_name)
    return {"name": new_name}


def import_files(paths: list[str]) -> dict:
    """ファイルを落とされたとき。.paper.json・.txt・.md を文書にする（元のファイルは変えない）。"""
    made, skipped, warnings = [], [], []
    folder = _folder().resolve()
    for raw_path in paths or []:
        p = Path(str(raw_path))
        if not p.is_file():
            skipped.append(p.name)
            continue
        try:
            if p.name.endswith(EXT):
                if p.parent.resolve() == folder:
                    made.append(p.name[: -len(EXT)])       # もう置き場所にある → 開くだけ
                    continue
                doc, warn = normalize(json.loads(p.read_text(encoding="utf-8")))
                stem = p.name[: -len(EXT)]
            elif p.suffix.lower() in TEXT_EXTS:
                doc, warn = from_txt(_read_text_file(p))
                stem = p.stem
            else:
                skipped.append(p.name)
                continue
        except (OSError, json.JSONDecodeError, PaperError) as e:
            skipped.append(f"{p.name}（{e}）")
            continue
        name = _free_name(stem)
        _write_atomic(_path(name), _dump(doc))
        made.append(name)
        warnings += [f"{p.name}: {w}" for w in warn]
        if _missing_images(doc):
            warnings.append(f"{p.name}: 見つからない絵があります（「{FOLDER_NAME}\\{IMAGE_DIR}」に無い）")
    if made:
        _ctx.store.set("paper", "current", made[-1])
    return {"made": made, "skipped": skipped, "warnings": warnings}


def export(name: str, kind: str = "txt", text: str = "") -> dict:
    """書き出す（上書きしない）。
    kind="txt": 読み込むと元に戻る txt（1 行目に設定） / "json": 文書そのもの / "plain": 記法を外した本文（画面が作った text）"""
    _, doc, _ = _read(name)
    out_dir = _folder() / EXPORT_DIR
    out_dir.mkdir(exist_ok=True)
    if kind == "txt":
        out, body, nl = _unique(out_dir / f"{name}.txt"), to_txt(doc), "\r\n"
    elif kind == "json":
        out, body, nl = _unique(out_dir / f"{name}{EXT}"), _dump(doc), "\n"
    elif kind == "plain":
        if not isinstance(text, str) or len(text) > BODY_MAX:
            raise PaperError("書き出す本文が正しくありません")
        out, body, nl = _unique(out_dir / f"{name} (本文).txt"), text, "\r\n"
    else:
        raise PaperError("この形式には書き出せません")
    _write_atomic(out, body, newline=nl)
    return {"path": str(out), "file": out.name, "rel": f"{EXPORT_DIR}/{out.name}"}


def reveal(name: str | None = None, file: str = "") -> bool:
    """エクスプローラーで見せる: file（書き出したもの）> name（文書）> 置き場所。"""
    target = _folder()
    if file:
        p = _folder() / EXPORT_DIR / Path(str(file)).name     # 名前だけを使う（置き場所の外は見せない）
        if p.is_file():
            target = p
    elif name:
        p = _path(name)
        if p.is_file():
            target = p
    if _ctx.host is not None and hasattr(_ctx.host, "reveal_path"):
        _ctx.host.reveal_path(str(target))
    return True
