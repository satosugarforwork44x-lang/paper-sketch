// paper/ui/panel.js — ペーパースケッチ。上に紙のプレビュー、中に道具、下に打ち込み欄。
// ・データは「Paper Sketch」フォルダの <名前>.paper.json。外（Claude など）で書き換えられたら読み直す
// ・組版は layout.js、描くのは render.js（プレビューと印刷で同じ）。打ち込み欄は editor.js
// ・書式の単位: 文書全体（書体・大きさ・行間・字間）/ 段落（揃え）/ 文字（太字・斜体・ルビ）
import { selectBox, TOKEN } from "/ui/js/hub.js";
import { icons } from "/ui/js/icons.js";
import { countChars, strip } from "./markup.js";
import { layout, PT, setMeasure } from "./layout.js";
import { fontStack, renderPage } from "./render.js";
import * as ed from "./editor.js";
import { attachObjects } from "./objects.js";
import { attachTerms } from "./terms.js";
import { attachVersions } from "./versions.js";

const EN = (document.documentElement.lang || navigator.language || "ja").startsWith("en");
const L = EN ? {
  title: "Paper Sketch", newDoc: "New", recent: "Recent", empty: "Nothing yet — pick a paper above.",
  dropNote: "Drop a .txt or .paper.json file here to open it.", pick: "Open a file…",
  groups: { memo: "Notes & manuscripts", letter: "Letters", school: "School", book: "Books" },
  home: "All papers", undo: "Undo (Ctrl+Z)", redo: "Redo (Ctrl+Y)", print: "Print / PDF (Ctrl+P)", ai: "Proofread with AI", more: "More",
  template: "Paper", size: "Size", portrait: "Portrait", landscape: "Landscape", tate: "Vertical", yoko: "Horizontal",
  grid: "Lines", gridKinds: { none: "Plain", lines: "Ruled", genko: "Squares" }, theme: "Paper color",
  paperCustom: "Any paper color", paperReset: "Back to the paper's own color",
  layout: "Layout", margin: "Margins (mm)", mTop: "Top", mRight: "Right", mBottom: "Bottom", mLeft: "Left",
  columns: "Columns", colGap: "Gap", picture: "Picture box", pageNo: "Page numbers", guide: "Guide cross in squares",
  mode: "Set by", modeFree: "Font size", modeFit: "Characters × lines", chars: "chars", lines: "lines",
  font: "Font", fsize: "Size (pt)", lh: "Line spacing", ls: "Letter spacing",
  align: { start: "Left (Ctrl+L)", center: "Center (Ctrl+E)", end: "Right (Ctrl+R)", justify: "Justify (Ctrl+J)", distribute: "Distribute (Ctrl+Shift+J)" },
  alignV: { start: "Top (Ctrl+L)", center: "Center (Ctrl+E)", end: "Bottom (Ctrl+R)", justify: "Justify (Ctrl+J)", distribute: "Distribute (Ctrl+Shift+J)" },
  bold: "Bold (Ctrl+B)", italic: "Italic (Ctrl+I)", italicV: "Italic is not available in vertical writing",
  ruby: "Ruby (furigana) — select text first", rubyShow: "Show ruby", rubyReading: "Reading", rubyRemove: "Remove ruby",
  ok: "OK", cancel: "Cancel", metaTitle: "Title", metaDate: "Date", today: "Today", metaSig: "Signature",
  sigPh: "Company / your name (Enter for a new line)", titlePh: "Title", datePh: "Date",
  editorPh: "Type here. The page above updates as you write.",
  exportTxt: "Export .txt (reopens exactly as it is)", exportPlain: "Export text only (.txt, for other apps / iPhone Notes)",
  exportJson: "Export .paper.json", rename: "Rename", openFolder: "Show in Explorer", pdfTip: "Choose “Microsoft Print to PDF” as the printer to save a PDF.",
  exported: (f) => `Saved ${f}`, renamed: "Renamed", reloaded: "Reloaded (changed outside)", warn: "Some settings were adjusted",
  aiCopy: "Copy a proofreading request", aiPaste: "Paste the corrected text…", aiCopied: "Copied. Paste it into ChatGPT / Gemini, or ask Claude to proofread this paper in Hub.",
  aiPasteTitle: "Replace the text with the AI's correction", aiPasteNote: "Paste the corrected text (with its ** * ｜《》 marks). Ctrl+Z brings back the old text.",
  aiPrompt: (b) => `Please proofread the following text. Fix typos, wrong words and inconsistent spelling only; keep the style and meaning.\nKeep the formatting marks as they are: **bold**, *italic*, ｜base《ruby》, and >> >< <> == at the start of a line (alignment).\nReturn only the corrected text.\n---\n${b}`,
  status: (p, c) => `${p} page${p > 1 ? "s" : ""} · ${c.toLocaleString()} characters`, perPage: (c, n) => `${c} × ${n} per page`,
  pt: (v) => `${v.toFixed(1)} pt`, skipped: (s) => `Could not open: ${s}`, newName: "New name", page: (n, t) => `${n} / ${t}`,
  obj: { insert: "Insert", addImage: "Picture (or paste / drop an image)", addText: "Text box", textDefault: "Text",
    shapes: { rect: "Box", round: "Rounded box", ellipse: "Circle", line: "Line", arrow: "Arrow" },
    hint: "Click to select · drag to move · drag a corner to resize · Delete to remove",
    image: "Picture", shape: "Shape", line: "Line", stroke: "Line", lineWidth: "Width", fill: "Fill", none: "None",
    text: "Text", textPh: "Text in the shape (**bold**, ｜base《ruby》)", size: "Size", color: "Color", vertical: "Vertical",
    opacity: "Opacity", rot: "Angle", behind: "Behind text", forward: "Forward", backward: "Backward", forwardTip: "Bring forward", backwardTip: "Send backward",
    dup: "Duplicate", del: "Delete" },
  versions: { button: "Versions (keep, compare, go back)", title: "Versions", note: "Kept automatically every 10 minutes while you write, when you open a paper, before and after AI changes, and before going back. Versions you keep by hand are never deleted automatically.",
    labelPh: "Name this version (e.g. Draft 1, before sending to the editor)", keep: "Keep this version", del: "Delete", restore: "Go back to this version",
    cmpNow: "vs now", cmpPrev: "vs the one before", now: "now", none: "(nothing)", empty: "No versions yet",
    reasons: { manual: "Kept", auto: "Auto", open: "Opened", "ai-send": "Sent to AI", "ai-before": "Before AI", "ai-after": "After AI", outside: "Before outside change", "outside-after": "After outside change", restore: "Before going back" },
    chars: (n) => `${n.toLocaleString()} chars`, stat: (s) => `${s.chg} changed · ${s.add} added · ${s.del} removed paragraphs`, same: "No differences in the text.",
    skip: "… unchanged paragraphs …", sameAsLast: "Same as the last version (kept the name only if given)", restored: "Went back to the version (the one before is kept too)" },
  rubyOnce: "Same ruby only once", rubyOnceTip: "Hand-written ruby that repeats (same text and reading) is shown only the first time in this document",
  aiDict: (lines) => `\nThese names and readings are intentional — do not change them:\n${lines}`,
  terms: { title: "Glossary", noWork: "(no work)", newWorkItem: "+ New work…", newWork: "Name of the work (shared by its chapters)", renameWork: "Rename the work",
    renamed: (n) => `Renamed (${n} chapter${n === 1 ? "" : "s"} updated)`,
    needWork: "Choose or create a work above. Its chapters share one glossary of names and readings.",
    add: "Add a term", edit: "Edit the term", del: "Delete", base: "Text", reading: "Ruby", readingPh: "Leave empty for names without ruby",
    kind: "Kind", kinds: { person: "Person", place: "Place", term: "Term", reading: "Reading" }, rule: "Ruby",
    rules: { always: "Every time", first: "First only", none: "Never" }, ruleShort: { always: "every", first: "first", none: "" },
    ruleNote: { always: "Shown every time (unique readings such as 本気《マジ》).", first: "Shown the first time in each chapter (ordinary readings, names).", none: "No ruby. Kept for clicking into the text." },
    part: "Also inside longer words (e.g. 真 inside 真実)", note: "Note", all: "All", search: "Search", empty: "No terms yet. Select text and right-click → Add to glossary.",
    noMatch: "Nothing matches", delAsk: (b) => `Delete “${b}” from the glossary? (Text in the chapters stays as it is)`, insertTip: "Click to insert at the cursor", countTip: "Times in this chapter", addSel: "Add to glossary" },
} : {
  title: "ペーパースケッチ", newDoc: "新しく作る", recent: "最近の文書", empty: "まだありません。上の紙から選んでください。",
  dropNote: ".txt や .paper.json をここに落とすと開けます", pick: "ファイルを開く…",
  groups: { memo: "メモ・原稿", letter: "手紙", school: "学校", book: "本" },
  home: "一覧に戻る", undo: "元に戻す（Ctrl+Z）", redo: "やり直す（Ctrl+Y）", print: "印刷・PDF（Ctrl+P）", ai: "AI で校正", more: "その他",
  template: "紙", size: "大きさ", portrait: "縦長", landscape: "横長", tate: "縦書き", yoko: "横書き",
  grid: "罫", gridKinds: { none: "なし", lines: "罫線", genko: "マス目" }, theme: "台紙",
  paperCustom: "台紙の色を自由に選ぶ", paperReset: "台紙の色を元に戻す",
  layout: "レイアウト", margin: "余白（mm）", mTop: "上", mRight: "右", mBottom: "下", mLeft: "左",
  columns: "段組", colGap: "段の間", picture: "絵の枠", pageNo: "ページ番号", guide: "マスに十字の補助線",
  mode: "決め方", modeFree: "文字の大きさ", modeFit: "字数×行数", chars: "字", lines: "行",
  font: "書体", fsize: "大きさ（pt）", lh: "行間", ls: "字間",
  align: { start: "左揃え（Ctrl+L）", center: "中央揃え（Ctrl+E）", end: "右揃え（Ctrl+R）", justify: "両端揃え（Ctrl+J）", distribute: "均等割り付け（Ctrl+Shift+J）" },
  alignV: { start: "天付き（Ctrl+L）", center: "中央（Ctrl+E）", end: "地付き（Ctrl+R）", justify: "両端揃え（Ctrl+J）", distribute: "均等割り付け（Ctrl+Shift+J）" },
  bold: "太字（Ctrl+B）", italic: "斜体（Ctrl+I）", italicV: "縦書きでは斜体は使えません",
  ruby: "ルビ（ふりがな）— 先に字を選んでください", rubyShow: "ルビを出す", rubyReading: "読み", rubyRemove: "ルビを外す",
  ok: "OK", cancel: "やめる", metaTitle: "題名", metaDate: "日付", today: "今日", metaSig: "署名",
  sigPh: "会社名・名前（Enter で改行）", titlePh: "題名", datePh: "日付",
  editorPh: "ここに打ち込みます。上の紙がすぐ変わります。",
  exportTxt: "txt に書き出す（読み込むと元どおりに戻る）", exportPlain: "本文だけを txt に（ほかのアプリ・iPhone のメモ用）",
  exportJson: ".paper.json に書き出す", rename: "名前を変える", openFolder: "エクスプローラーで見る", pdfTip: "プリンターで「Microsoft Print to PDF」を選ぶと PDF になります",
  exported: (f) => `${f} を保存しました`, renamed: "名前を変えました", reloaded: "外で書き換えられたので読み直しました", warn: "直した設定があります",
  aiCopy: "校正を頼む文をコピー", aiPaste: "直った文章を貼って置き換える…", aiCopied: "コピーしました。ChatGPT・Gemini に貼るか、Claude に「このペーパースケッチを校正して」と頼んでください",
  aiPasteTitle: "AI が直した文章で置き換える", aiPasteNote: "直った文章（** * ｜《》 の記号ごと）を貼ってください。Ctrl+Z で元に戻せます。",
  aiPrompt: (b) => `次の文章を校正してください。誤字・脱字・言葉の誤り・表記ゆれだけを直し、文体と内容は変えないでください。\n書式の記号はそのまま残してください: **太字**、*斜体*、｜親文字《ルビ》、行頭の >> >< <> ==（揃え）。\n直した文章だけを返してください。\n---\n${b}`,
  status: (p, c) => `${p} ページ ・ ${c.toLocaleString()} 字`, perPage: (c, n) => `1 ページ ${c}字×${n}行`,
  pt: (v) => `${v.toFixed(1)} pt`, skipped: (s) => `開けなかったもの: ${s}`, newName: "新しい名前", page: (n, t) => `${n} / ${t}`,
  obj: { insert: "挿入", addImage: "絵（貼り付け・ドロップでも置けます）", addText: "文字ボックス", textDefault: "文字",
    shapes: { rect: "四角", round: "角丸", ellipse: "丸", line: "線", arrow: "矢印" },
    hint: "クリックで選ぶ ・ ドラッグで動かす ・ 角のつまみで大きさ ・ Delete で消す",
    image: "絵", shape: "図形", line: "線", stroke: "線", lineWidth: "太さ", fill: "塗り", none: "なし",
    text: "文字", textPh: "図形の中の文字（**太字**、｜漢字《かんじ》）", size: "大きさ", color: "文字色", vertical: "縦書き",
    opacity: "不透明度", rot: "角度", behind: "文字の後ろ", forward: "前へ", backward: "後ろへ", forwardTip: "1 つ手前へ", backwardTip: "1 つ奥へ",
    dup: "複製", del: "消す" },
  versions: { button: "版（残す・比べる・戻す）", title: "版（作品の保護）", note: "書いている間は 10 分ごと、開いた時、AI の前後、外で書き換えられる前後、戻す前に自動で残します。手で残した版は自動では消えません。",
    labelPh: "版の名前（例: 初稿、編集者に送る前）", keep: "今の版を残す", del: "消す", restore: "この版に戻す",
    cmpNow: "今と比べる", cmpPrev: "1 つ前の版と比べる", now: "今", none: "（なし）", empty: "まだ版がありません",
    reasons: { manual: "手で残した", auto: "自動", open: "開いた時", "ai-send": "AI に渡した時", "ai-before": "AI で直す前", "ai-after": "AI で直した後", outside: "外で書き換えられる前", "outside-after": "外で書き換えられた後", restore: "戻す前" },
    chars: (n) => `${n.toLocaleString()} 字`, stat: (s) => `直した段落 ${s.chg} ・ 足した段落 ${s.add} ・ 消した段落 ${s.del}`, same: "本文に違いはありません",
    skip: "…（同じ段落）…", sameAsLast: "直前の版と同じなので、新しくは残しませんでした", restored: "版に戻しました（戻す前の文書も版に残っています）" },
  rubyOnce: "同じルビは2回目から外す", rubyOnceTip: "手で書いたルビ（同じ字・同じ読み）を、この文書で初めの1回だけ出します",
  aiDict: (lines) => `\n次の名前と読みは意図したものです。直さないでください:\n${lines}`,
  terms: { title: "用語集", noWork: "（作品なし）", newWorkItem: "＋ 新しい作品…", newWork: "作品の名前（章ごとの文書で共有します）", renameWork: "作品の名前を変える",
    renamed: (n) => `名前を変えました（${n} 章を書き換え）`,
    needWork: "上で作品を選ぶか作ってください。同じ作品の章どうしで、登場人物や読みの用語集を共有します。",
    add: "用語を足す", edit: "用語を直す", del: "消す", base: "表記", reading: "読み（ルビ）", readingPh: "ルビの要らない名前は空のまま",
    kind: "種類", kinds: { person: "人名", place: "地名", term: "用語", reading: "独自の読み" }, rule: "ルビ",
    rules: { always: "毎回", first: "初出だけ", none: "付けない" }, ruleShort: { always: "毎回", first: "初出", none: "" },
    ruleNote: { always: "出てくるたびに付けます（本気《マジ》のような独自の読み）", first: "章ごとに、初めて出てきた所だけに付けます（ふつうの読み・人名）", none: "ルビは付けません。クリックで入れるためだけに置きます" },
    part: "語の一部でも付ける（「真実」の中の「真」にも付ける）", note: "メモ", all: "すべて", search: "さがす", empty: "まだありません。本文で字を選んで右クリック →「用語集に入れる」",
    noMatch: "見つかりません", delAsk: (b) => `「${b}」を用語集から消しますか？（本文の字はそのまま残ります）`, insertTip: "クリックでカーソルの位置に入れる", countTip: "この章に出てくる回数", addSel: "用語集に入れる" },
};

const svg = (d) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  back: icons.left || svg('<path d="m15 6-6 6 6 6"/>'), undo: icons.undo, print: icons.print, more: icons.more, folder: icons.folder,
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  ai: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M14 6l4 4"/><path d="M19 15l.7 1.6 1.6.7-1.6.7L19 20l-.7-1.6-1.6-.7 1.6-.7z"/>'),
  start: svg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'), center: svg('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  end: svg('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'), justify: svg('<path d="M4 6h16M4 10h16M4 14h16M4 18h10"/>'),
  distribute: svg('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/><path d="M2.5 18h0M21.5 18h0"/>'),
  vstart: svg('<path d="M18 4v16M14 4v10M10 4v16M6 4v10"/>'), vcenter: svg('<path d="M18 4v16M14 7v10M10 4v16M6 7v10"/>'),
  vend: svg('<path d="M18 4v16M14 10v10M10 4v16M6 10v10"/>'), vjustify: svg('<path d="M18 4v16M14 4v16M10 4v16M6 4v10"/>'),
  vdistribute: svg('<path d="M18 4v16M14 4v16M10 4v16M6 4v16"/>'),
  bold: svg('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" stroke-width="2.2"/>'),
  italic: svg('<path d="M10 5h8M6 19h8M14 5l-4 14"/>'),
  ruby: svg('<path d="M5 20l3.5-9 3.5 9M6.3 17h4.4"/><path d="M14 20v-6a2.5 2.5 0 0 1 5 0v6M14 17h5"/><path d="M7 5.5h10" stroke-width="1.4"/>'),
  layout: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>'),
  history: svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4h4"/><path d="M12 7.5V12l3 2"/>'),
  image: icons.image || svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 3 3 3-3 5 5"/>'),
  textbox: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke-dasharray="2.5 2"/><path d="M8.5 9h7M12 9v7"/>'),
  rect: svg('<rect x="4" y="6" width="16" height="12" rx="1"/>'), round: svg('<rect x="4" y="6" width="16" height="12" rx="4"/>'),
  ellipse: svg('<ellipse cx="12" cy="12" rx="8" ry="6.5"/>'), line: svg('<path d="M5 19 19 5"/>'), arrow: svg('<path d="M5 19 19 5"/><path d="M11 5h8v8"/>'),
};
const ALIGNS = ["start", "center", "end", "justify", "distribute"];
const FONTS = [["Yu Mincho", "游明朝"], ["Yu Gothic", "游ゴシック"], ["BIZ UDPMincho", "BIZ UDP明朝"], ["BIZ UDPGothic", "BIZ UDPゴシック"],
  ["UD Digi Kyokasho NK-R", "UD デジタル 教科書体"], ["HG正楷書体-PRO", "HG正楷書体"], ["HG行書体", "HG行書体"], ["HGP創英角ﾎﾟｯﾌﾟ体", "HG創英角ポップ体"],
  ["MS Mincho", "ＭＳ 明朝"], ["MS Gothic", "ＭＳ ゴシック"], ["Meiryo", "メイリオ"], ["Noto Serif JP", "Noto Serif JP"], ["Noto Sans JP", "Noto Sans JP"],
  ["Georgia", "Georgia"], ["Segoe UI", "Segoe UI"]];
const fontOK = (() => {        // 文字の幅で、その書体が PC に入っているかを調べる
  const g0 = document.createElement("canvas").getContext("2d"), probe = "あいう漢字WwMm123";
  const base = (f) => { g0.font = `40px ${f}`; return g0.measureText(probe).width; };
  const mono = base("monospace"), serif = base("serif");
  return (f) => { g0.font = `40px "${f}", monospace`; const a = g0.measureText(probe).width; g0.font = `40px "${f}", serif`; const b = g0.measureText(probe).width; return a !== mono || b !== serif; };
})();
const PX = 96 / 25.4;
// 半角の字（英字・数字）の幅を、文書の書体で測る（全角 = 1）。結果は覚えておく
{
  const g0 = document.createElement("canvas").getContext("2d"), cache = new Map();
  setMeasure((c, font, bold) => {
    const k = `${font}|${bold ? 1 : 0}|${c}`;
    let w = cache.get(k);
    if (w === undefined) {
      g0.font = `${bold ? 700 : 400} 100px ${fontStack(font)}`;
      w = g0.measureText(c).width / g0.measureText("あ").width;
      cache.set(k, w);
    }
    return w;
  });
}          // 1mm = 3.78px
const SAMPLE = EN ? "Dear friend,\nThank you so much for the lovely gift.\n" : "　拝啓　秋も深まり、｜紅葉《もみじ》の美しい季節になりました。\n　先日はすてきな贈り物をありがとうございました。";
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(`paper.${k}`)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(`paper.${k}`, JSON.stringify(v)); } catch { /* 保存できなくても動く */ } } };

export async function mount(el, ctx) {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = new URL("./paper.css", import.meta.url).href;
  document.head.append(css);

  let st = null;            // api.state()
  let name = null, doc = null, mtime = null, laid = null;
  let saving = null, saveTimer = null, layoutTimer = null, dirty = false;
  const undo = [], redo = [];
  let lastSnap = 0, lastKind = "";
  let dict = null;           // 作品の用語集 { work, terms, mtime }（作品が無ければ null）
  const terms = () => dict?.terms || [];
  let lastRange = null;      // 打ち込み欄で最後に選んでいた範囲（道具を押すと選択が消えるため）
  let zoom = store.get("zoom", 1);

  el.innerHTML = `<div class="pp"><div class="pp-home" hidden></div><div class="pp-edit" hidden>
    <div class="pp-view" tabindex="-1"><div class="pp-pages"></div></div>
    <div class="pp-split" role="separator" aria-orientation="horizontal"></div>
    <div class="pp-tools"><div class="pp-row pp-paper"></div><div class="pp-row pp-type"></div><div class="pp-row pp-meta"></div><div class="pp-row pp-insert"></div><div class="pp-row pp-objrow" hidden></div></div>
    <div class="pp-write"><div class="pp-editor pe" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true"></div><aside class="pp-terms"></aside></div>
  </div></div>`;
  const $ = (s) => el.querySelector(s);
  const home = $(".pp-home"), edit = $(".pp-edit"), view = $(".pp-view"), pagesEl = $(".pp-pages"), editor = $(".pp-editor");
  editor.dataset.ph = L.editorPh;
  const imageUrl = (src) => `/blob/paper/${encodeURIComponent(src)}?t=${encodeURIComponent(TOKEN)}`;
  const write = $(".pp-write");
  write.style.height = `${store.get("editorH", 220)}px`;

  // ---------- 見出しのボタン ----------
  const switcherSlot = document.createElement("span");
  switcherSlot.className = "pp-switch";
  const backBtn = ctx.addTool(IC.back, L.home, async () => { await flush(); await refresh(); showHome(); });
  document.querySelector("#tools")?.prepend(backBtn, switcherSlot);
  const undoBtn = ctx.addTool(IC.undo, L.undo, () => doUndo());
  const redoBtn = ctx.addTool(IC.redo, L.redo, () => doRedo());
  const printBtn = ctx.addTool(IC.print, L.print, () => print());
  const histBtn = ctx.addTool(IC.history, L.versions.button, () => vers.open());
  const aiBtn = ctx.addTool(IC.ai, L.ai, () => aiMenu());
  const moreBtn = ctx.addTool(IC.more, L.more, () => moreMenu());
  const editOnly = [backBtn, undoBtn, redoBtn, printBtn, histBtn, aiBtn, moreBtn];

  const T = (id) => st.templates.find((t) => t.id === id);
  const tname = (t) => (EN ? t.name.en : t.name.ja);
  const themeName = (id) => (EN ? st.themes[id].name.en : st.themes[id].name.ja);

  // ---------- 一覧 ----------
  function showHome() {
    name = null; doc = null; laid = null;
    edit.hidden = true; home.hidden = false;
    for (const b of editOnly) b.style.display = "none";
    switcherSlot.replaceChildren();
    ctx.setTitle(L.title);
    ctx.setStatus("");
    home.innerHTML = `<h3 class="pp-h"></h3><div class="pp-tpls"></div>
      <div class="pp-h2"><h3 class="pp-h"></h3><span class="pp-drop-note"></span><button class="btn pick"></button></div><div class="pp-recent"></div>`;
    const [h1, h2] = home.querySelectorAll(".pp-h");
    h1.textContent = L.newDoc; h2.textContent = L.recent;
    home.querySelector(".pp-drop-note").textContent = L.dropNote;
    const pick = home.querySelector(".pick");
    pick.textContent = L.pick;
    pick.addEventListener("click", async () => {
      const paths = await ctx.host.pickFiles(ctx.id).catch(() => null);
      if (paths?.length) importFiles(paths);
    });
    const tpls = home.querySelector(".pp-tpls");
    for (const grp of Object.keys(L.groups)) {
      const list = st.templates.filter((t) => t.group === grp);
      if (!list.length) continue;
      const sec = document.createElement("section");
      sec.innerHTML = `<h4></h4><div class="pp-cards"></div>`;
      sec.querySelector("h4").textContent = L.groups[grp];
      for (const t of list) {
        const b = document.createElement("button");
        b.className = "pp-card";
        b.innerHTML = `<span class="tw"><span class="thumb"></span></span><span class="nm"></span><span class="sm"></span>`;
        b.querySelector(".nm").textContent = tname(t);
        b.querySelector(".sm").textContent = EN ? t.summary.en : t.summary.ja;
        b.title = EN ? t.summary.en : t.summary.ja;
        thumb(b.querySelector(".thumb"), docFromTemplate(t, SAMPLE), 128, 150);
        b.addEventListener("click", () => create(t.id));
        sec.querySelector(".pp-cards").append(b);
      }
      tpls.append(sec);
    }
    const rec = home.querySelector(".pp-recent");
    if (!st.files.length) { rec.innerHTML = `<p class="pp-none"></p>`; rec.firstChild.textContent = L.empty; }
    for (const f of st.files) {
      const b = document.createElement("button");
      b.className = "pp-file";
      b.innerHTML = `<span class="nm"></span><span class="hd"></span><span class="mt"></span>`;
      b.querySelector(".nm").textContent = f.name;
      b.querySelector(".hd").textContent = f.broken ? "⚠" : (f.head || "");
      const t = f.template && T(f.template);
      b.querySelector(".mt").textContent = [t && tname(t), f.chars != null && `${f.chars.toLocaleString()}${EN ? " chars" : " 字"}`,
        new Date(f.mtime * 1000).toLocaleDateString()].filter(Boolean).join(" ・ ");
      b.addEventListener("click", () => open(f.name));
      rec.append(b);
    }
  }

  function docFromTemplate(t, body = "") {
    return { format: "hub-paper/1", template: t.id, page: structuredClone(t.page), grid: structuredClone(t.grid), text: structuredClone(t.text),
      meta: { placement: "top", titleAlign: "start", pageNumbers: false, title: "", date: "", signature: "", ...t.meta }, theme: t.theme, ruby: true, body };
  }

  function thumb(box, d, w, h) {
    const r = layout(d, st.sizes);
    const page = renderPage(d, r.g, r.pages[0], { theme: st.themes[d.theme], ruby: d.ruby, pageNo: 1, showNumber: d.meta.pageNumbers });
    const s = Math.min(w / (r.g.W * PX), h / (r.g.H * PX));
    box.style.width = `${r.g.W * PX * s}px`;
    box.style.height = `${r.g.H * PX * s}px`;
    page.style.zoom = s;
    box.replaceChildren(page);
  }

  async function refresh() { st = await ctx.call("state"); }
  async function create(tid) {
    try { const d = new Date(), ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const r = await ctx.call("create", { template: tid, name: `${tname(T(tid))} ${ymd}` }); await refresh(); await open(r.name); }
    catch (e) { ctx.toast(e.message, "error"); }
  }
  async function importFiles(paths) {
    try {
      const r = await ctx.call("import_files", { paths });
      if (r.skipped.length) ctx.toast(L.skipped(r.skipped.join(", ")), "error", 6000);
      else if (r.warnings.length) ctx.toast(`${L.warn}: ${r.warnings[0]}`, "info", 6000);
      await refresh();
      if (r.made.length) await open(r.made.at(-1));
    } catch (e) { ctx.toast(e.message, "error"); }
  }
  ctx.onNativeDrop(async (paths) => {
    if (!paths?.length) return;
    if (doc && !edit.hidden && await objs.dropPaths(paths)) return;     // 絵なら紙に置く
    importFiles(paths);
  });

  // ---------- 開く・保存 ----------
  async function open(n, quiet = false) {
    try {
      const r = await ctx.call("open_paper", { name: n });
      if (quiet && doc) snap("reload");
      else if (name !== n) { undo.length = 0; redo.length = 0; }
      name = r.name; doc = r.doc; mtime = r.mtime; dirty = false; dict = r.dict;
      if (r.warnings.length) ctx.toast(`${L.warn}: ${r.warnings[0]}`, "info", 6000);
      showEdit();
      const pos = quiet ? ed.caret(editor) : null;
      fillEditor();
      if (pos) ed.setCaret(editor, pos);
      if (!quiet) { view.scrollTop = 0; editor.focus(); ed.setCaret(editor, { p: 1e9, o: 1e9 }); vers.snap("open"); lastAuto = { at: Date.now(), body: doc.body }; }
    } catch (e) { ctx.toast(e.message, "error"); await refresh(); showHome(); }
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 600);
  }
  async function flush() {
    clearTimeout(saveTimer);
    if (!dirty || !name) return saving;
    dirty = false;
    const n = name, body = structuredClone(doc);
    saving = ctx.call("save_paper", { name: n, doc: body })
      .then((r) => { if (n === name) mtime = r.mtime; })
      .catch((e) => { dirty = true; ctx.toast(e.message, "error"); })
      .finally(() => { saving = null; });
    return saving;
  }
  setInterval(async () => {          // 外（Claude・エディタ）で書き換えられたら読み直す
    if (!name || saving || dirty || document.hidden) return;
    try {
      const r = await ctx.call("poll", { name, work: doc?.work || "" });
      if (r.mtime && mtime && r.mtime !== mtime && !dirty && !saving) {
        await vers.snap("outside", "", doc);              // 外（Claude など）で書き換えられる前の、画面の中の文書を残す
        await open(name, true);
        await vers.snap("outside-after");
        ctx.toast(L.reloaded);
        return;
      }
      if (doc?.work && r.dictMtime && r.dictMtime !== dict?.mtime) { await loadDict(); ctx.toast(L.reloaded); }   // 用語集が外で書き換えられた
    } catch { /* 次の回にまた見る */ }
  }, 2000);
  window.addEventListener("beforeunload", () => { if (dirty) flush(); });

  // ---------- 元に戻す ----------
  function snap(kind) {
    const now = Date.now();
    if (kind === "type" && lastKind === "type" && now - lastSnap < 900) { lastSnap = now; return; }
    undo.push(JSON.stringify(doc));
    if (undo.length > 200) undo.shift();
    redo.length = 0;
    lastSnap = now; lastKind = kind;
    syncHistory();
  }
  function changed() { dirty = true; save(); scheduleLayout(); syncHistory(); }
  function syncHistory() { undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length; }
  function restore(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(doc));
    const pos = ed.caret(editor);
    doc = JSON.parse(from.pop());
    lastKind = "";
    fillEditor();
    if (pos) ed.setCaret(editor, pos);
    dirty = true; save();
    syncHistory();
  }
  const doUndo = () => restore(undo, redo), doRedo = () => restore(redo, undo);

  // ---------- 編集画面 ----------
  function showEdit() {
    home.hidden = true; edit.hidden = false;
    for (const b of editOnly) b.style.display = "";
    ctx.setTitle(`${name} — ${L.title}`);
    const sb = selectBox({ options: st.files.map((f) => ({ value: f.name, label: f.name })).concat(st.files.some((f) => f.name === name) ? [] : [{ value: name, label: name }]),
      value: name, onChange: async (v) => { await flush(); open(v); } });
    switcherSlot.replaceChildren(sb);
  }

  /** 文書の値を、道具と打ち込み欄とプレビューに出し直す */
  function fillEditor() {
    editor.innerHTML = ed.toHtml(doc.body);
    editor.classList.toggle("hide-ruby", !doc.ruby);
    buildTools();
    objs.sync();
    termsUI.render();
    relayout();
  }

  // ---------- 道具 ----------
  function seg(options, value, onChange, cls = "") {
    const box = document.createElement("div");
    box.className = `seg seg-sm pp-seg ${cls}`;
    box.setAttribute("role", "group");
    for (const o of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.v = o.value;
      b.innerHTML = o.icon || "";
      if (o.label) { const s = document.createElement("span"); s.textContent = o.label; b.append(s); }
      if (o.title) { b.title = o.title; b.setAttribute("aria-label", o.title); }
      b.setAttribute("aria-pressed", String(o.value === value));
      b.addEventListener("mousedown", (e) => e.preventDefault());      // 打ち込み欄の選択を消さない
      b.addEventListener("click", () => onChange(o.value));
      box.append(b);
    }
    box.set = (v) => box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(v))));
    return box;
  }
  function num({ label, value, min, max, step, onChange, unit = "", width = 52 }) {
    const w = document.createElement("label");
    w.className = "pp-num";
    w.innerHTML = `<span></span><input type="number"><em></em>`;
    w.querySelector("span").textContent = label;
    w.querySelector("em").textContent = unit;
    const inp = w.querySelector("input");
    Object.assign(inp, { min, max, step, value });
    inp.style.width = `${width}px`;
    inp.addEventListener("change", () => {
      const v = Math.min(max, Math.max(min, parseFloat(inp.value)));
      if (Number.isFinite(v)) onChange(v); else inp.value = value;
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    return w;
  }
  function iconBtn(icon, title, onClick, pressed = null) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "icon-btn pp-ib";
    b.innerHTML = icon;
    b.title = title;
    b.setAttribute("aria-label", title);
    if (pressed !== null) b.setAttribute("aria-pressed", String(pressed));
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", onClick);
    return b;
  }
  function labeled(label, node) {
    const w = document.createElement("div");
    w.className = "pp-lab";
    const s = document.createElement("span");
    s.textContent = label;
    w.append(s, node);
    return w;
  }
  const sep = () => Object.assign(document.createElement("span"), { className: "pp-sep" });

  /** 設定を変える（元に戻せる）。fn の中で doc を書き換える */
  function setDoc(fn, rebuild = true) {
    snap("set");
    fn(doc);
    if (rebuild) buildTools();
    changed();
  }

  let typeRefs = {};
  function buildTools() {
    const paper = $(".pp-paper"), type = $(".pp-type"), meta = $(".pp-meta");
    const genko = doc.grid.kind === "genko", fit = !genko && doc.text.mode === "fit", V = doc.page.vertical;

    // 1 段目: 紙
    const tSel = selectBox({ options: st.templates.map((t) => ({ value: t.id, label: tname(t) })), value: doc.template,
      onChange: (v) => setDoc((d) => {             // 紙を変えても、本文・題名・日付・署名・ルビはそのまま
        const t = docFromTemplate(T(v));
        Object.assign(d, { template: v, page: t.page, grid: t.grid, text: t.text, theme: t.theme,
          meta: { ...t.meta, title: d.meta.title || t.meta.title || "", date: d.meta.date, signature: d.meta.signature } });
      }) });
    const sizeSeg = seg(Object.keys(st.sizes).map((k) => ({ value: k, label: k })), doc.page.size, (v) => setDoc((d) => { d.page.size = v; }));
    const orient = seg([{ value: "p", label: L.portrait }, { value: "l", label: L.landscape }], doc.page.landscape ? "l" : "p", (v) => setDoc((d) => { d.page.landscape = v === "l"; }));
    const dir = seg([{ value: "v", label: L.tate }, { value: "h", label: L.yoko }], V ? "v" : "h", (v) => setDoc((d) => { d.page.vertical = v === "v"; }));
    const gridSel = selectBox({ options: Object.entries(L.gridKinds).map(([value, label]) => ({ value, label })), value: doc.grid.kind,
      onChange: (v) => setDoc((d) => { d.grid.kind = v; }) });
    const themeSel = selectBox({ options: Object.keys(st.themes).map((k) => ({ value: k, label: `${themeName(k)}` })), value: doc.theme,
      onChange: (v) => setDoc((d) => { d.theme = v; d.paper = ""; }) });
    themeSel.style.setProperty("--swatch", doc.paper || st.themes[doc.theme].paper);
    themeSel.classList.add("pp-theme");
    // 台紙: 色の見本付きの一覧 ＋ 自由な色
    const custom = document.createElement("label");
    custom.className = "pp-paper-color";
    custom.title = L.paperCustom;
    custom.innerHTML = `<input type="color"><button type="button" class="icon-btn pp-ib" hidden>×</button>`;
    const ci = custom.querySelector("input"), cx = custom.querySelector("button");
    ci.value = doc.paper || st.themes[doc.theme].paper;
    cx.hidden = !doc.paper;
    cx.title = L.paperReset;
    ci.addEventListener("change", () => setDoc((d) => { d.paper = ci.value; }));
    cx.addEventListener("click", (e) => { e.preventDefault(); setDoc((d) => { d.paper = ""; }); });
    paper.replaceChildren(labeled(L.template, tSel), sizeSeg, orient, dir, labeled(L.grid, gridSel), labeled(L.theme, themeSel), custom, layoutDetails());

    // 2 段目: 文字
    const fonts = FONTS.filter(([f]) => f === doc.text.font || fontOK(f));
    if (!fonts.some(([f]) => f === doc.text.font)) fonts.unshift([doc.text.font, doc.text.font]);
    const fontSel = selectBox({ options: fonts.map(([value, label]) => ({ value, label })), value: doc.text.font,
      onChange: (v) => setDoc((d) => { d.text.font = v; }) });
    fontSel.classList.add("pp-font");
    const items = [labeled(L.font, fontSel)];
    if (!genko) items.push(seg([{ value: "free", label: L.modeFree }, { value: "fit", label: L.modeFit }], doc.text.mode, (v) => setDoc((d) => { d.text.mode = v; })));
    if (genko || fit) {
      const src = genko ? "grid" : "text";
      items.push(num({ label: "", value: doc[src].chars, min: genko ? 4 : 5, max: genko ? 60 : 80, step: 1, unit: L.chars, width: 56, onChange: (v) => setDoc((d) => { d[src].chars = v; }, false) }),
        num({ label: "×", value: doc[src].lines, min: genko ? 2 : 3, max: genko ? 60 : 80, step: 1, unit: L.lines, width: 56, onChange: (v) => setDoc((d) => { d[src].lines = v; }, false) }));
    }
    if (!genko && !fit) items.push(num({ label: L.fsize, value: doc.text.size, min: 5, max: 72, step: 0.5, onChange: (v) => setDoc((d) => { d.text.size = v; }, false) }),
      num({ label: L.lh, value: doc.text.lineHeight, min: 1, max: 4, step: 0.1, unit: "×", onChange: (v) => setDoc((d) => { d.text.lineHeight = v; }, false) }));
    if (!genko) items.push(num({ label: L.ls, value: doc.text.letterSpacing, min: -0.2, max: 1, step: 0.05, unit: "em", width: 60, onChange: (v) => setDoc((d) => { d.text.letterSpacing = v; }, false) }));
    const tips = V ? L.alignV : L.align;
    const alignSeg = seg(ALIGNS.map((a) => ({ value: a, icon: IC[(V ? "v" : "") + a], title: tips[a] })), "start", (a) => applyAlign(a), "pp-align");
    const bBtn = iconBtn(IC.bold, L.bold, () => format("bold"), false);
    const iBtn = iconBtn(IC.italic, V ? L.italicV : L.italic, () => format("italic"), false);
    iBtn.disabled = V;
    const rBtn = iconBtn(IC.ruby, L.ruby, () => rubyDialog());
    const show = document.createElement("label");
    show.className = "pp-check";
    show.innerHTML = `<input type="checkbox"><span></span>`;
    show.querySelector("span").textContent = L.rubyShow;
    show.querySelector("input").checked = doc.ruby;
    show.querySelector("input").addEventListener("change", (e) => setDoc((d) => { d.ruby = e.target.checked; editor.classList.toggle("hide-ruby", !d.ruby); }, false));
    const once = document.createElement("label");
    once.className = "pp-check";
    once.title = L.rubyOnceTip;
    once.innerHTML = `<input type="checkbox"><span></span>`;
    once.querySelector("span").textContent = L.rubyOnce;
    once.querySelector("input").checked = doc.rubyOnce;
    once.querySelector("input").addEventListener("change", (e) => setDoc((d) => { d.rubyOnce = e.target.checked; }, false));
    items.push(sep(), alignSeg, sep(), bBtn, iBtn, rBtn, show, once);
    type.replaceChildren(...items);
    typeRefs = { alignSeg, bBtn, iBtn };

    // 3 段目: 題名・日付・署名
    const field = (label, key, ph, multi = false) => {
      const w = document.createElement("label");
      w.className = `pp-field ${key}`;
      w.innerHTML = `<span></span>${multi ? "<textarea rows=\"1\"></textarea>" : "<input type=\"text\">"}`;
      w.querySelector("span").textContent = label;
      const inp = w.querySelector("input, textarea");
      inp.value = doc.meta[key];
      inp.placeholder = ph;
      const fit2 = () => { if (multi) { inp.style.height = "auto"; inp.style.height = `${Math.min(72, inp.scrollHeight)}px`; } };
      inp.addEventListener("input", () => { snap("type"); doc.meta[key] = inp.value; changed(); fit2(); });
      requestAnimationFrame(fit2);
      return w;
    };
    const dateF = field(L.metaDate, "date", L.datePh);
    const todayBtn = document.createElement("button");
    todayBtn.type = "button";
    todayBtn.className = "btn pp-today";
    todayBtn.textContent = L.today;
    todayBtn.addEventListener("click", () => {
      const inp = dateF.querySelector("input");
      inp.value = today(doc.page.vertical);
      inp.dispatchEvent(new Event("input"));
    });
    dateF.append(todayBtn);
    meta.replaceChildren(field(L.metaTitle, "title", L.titlePh), dateF, field(L.metaSig, "signature", L.sigPh, true));
    syncFormat();
  }

  function layoutDetails() {
    const d = document.createElement("details");
    d.className = "pp-more";
    d.open = store.get("layoutOpen", false);
    d.addEventListener("toggle", () => store.set("layoutOpen", d.open));
    d.innerHTML = `<summary>${IC.layout}<span></span></summary><div class="pp-pop"></div>`;
    d.querySelector("summary span").textContent = L.layout;
    const pop = d.querySelector(".pp-pop");
    const m = doc.page.margin;
    const mk = (i, lab) => num({ label: lab, value: m[i], min: 0, max: 80, step: 1, width: 44, onChange: (v) => setDoc((x) => { x.page.margin[i] = v; }, false) });
    const row1 = document.createElement("div");
    row1.className = "pp-pop-row";
    const t1 = document.createElement("b"); t1.textContent = L.margin;
    row1.append(t1, mk(0, L.mTop), mk(1, L.mRight), mk(2, L.mBottom), mk(3, L.mLeft));
    const row2 = document.createElement("div");
    row2.className = "pp-pop-row";
    if (doc.grid.kind !== "genko") {
      row2.append(labeled(L.columns, seg([1, 2, 3].map((n) => ({ value: n, label: String(n) })), doc.page.columns, (v) => setDoc((x) => { x.page.columns = v; }))),
        num({ label: L.colGap, value: doc.page.columnGap, min: 2, max: 30, step: 1, unit: "mm", width: 44, onChange: (v) => setDoc((x) => { x.page.columnGap = v; }, false) }));
    }
    row2.append(num({ label: L.picture, value: Math.round(doc.grid.picture * 100), min: 0, max: 80, step: 5, unit: "%", width: 48, onChange: (v) => setDoc((x) => { x.grid.picture = v / 100; }, false) }));
    const chk = (label, get, set) => {
      const w = document.createElement("label");
      w.className = "pp-check";
      w.innerHTML = `<input type="checkbox"><span></span>`;
      w.querySelector("span").textContent = label;
      w.querySelector("input").checked = get();
      w.querySelector("input").addEventListener("change", (e) => setDoc((x) => set(x, e.target.checked), false));
      return w;
    };
    row2.append(chk(L.pageNo, () => doc.meta.pageNumbers, (x, v) => { x.meta.pageNumbers = v; }));
    if (doc.grid.kind === "genko") row2.append(chk(L.guide, () => doc.grid.guide, (x, v) => { x.grid.guide = v; }));
    pop.append(row1, row2);
    return d;
  }

  function today(vertical) {
    const d = new Date();
    if (!vertical || EN) return EN ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    const K = "〇一二三四五六七八九";
    const kan = (n) => (n < 10 ? K[n] : `${n >= 20 ? K[Math.floor(n / 10)] : ""}十${n % 10 ? K[n % 10] : ""}`);
    const parts = new Intl.DateTimeFormat("ja-JP-u-ca-japanese", { era: "long", year: "numeric" }).formatToParts(d);
    const era = parts.find((p) => p.type === "era")?.value || "令和";
    const y = Number(parts.find((p) => p.type === "year")?.value) || d.getFullYear() - 2018;
    return `${era}${y === 1 ? "元" : kan(y)}年${kan(d.getMonth() + 1)}月${kan(d.getDate())}日`;
  }

  // ---------- 打ち込み欄 ----------
  function fromEditor(kind = "type") {
    const body = ed.read(editor);
    if (body === doc.body) return;
    snap(kind);
    doc.body = body;
    changed();
  }
  let pasting = false;
  editor.addEventListener("input", (e) => {
    // ｜漢字《かんじ》・漢字《かんじ》と打ったら、その場でルビにする（打っている所だけ。貼り付けは全体）
    if (!e.isComposing) ed.autoRuby(editor, e.inputType === "insertFromPaste" || pasting ? null : getSelection()?.anchorNode);
    fromEditor("type");
  });
  editor.addEventListener("paste", (e) => {           // 書式の付いた貼り付けは、字だけにする
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") || "";
    if (text) { pasting = true; document.execCommand("insertText", false, text.replace(/\r\n?/g, "\n")); pasting = false; }
  });
  editor.addEventListener("drop", (e) => { if (!e.dataTransfer?.types?.includes("text/plain")) e.preventDefault(); });
  editor.addEventListener("click", (e) => {
    const chip = e.target.closest?.(".pe-ruby");
    if (chip && editor.contains(chip)) rubyDialog(chip);
  });
  document.addEventListener("selectionchange", () => {
    const s = getSelection();
    if (s?.rangeCount && editor.contains(s.getRangeAt(0).startContainer)) { lastRange = s.getRangeAt(0).cloneRange(); syncFormat(); followCaret(); }
  });
  function restoreRange() {
    const s = getSelection();
    const inside = s?.rangeCount && editor.contains(s.getRangeAt(0).startContainer);
    editor.focus();
    if (!inside && lastRange && editor.contains(lastRange.startContainer)) { s.removeAllRanges(); s.addRange(lastRange); }
    if (!editor.children.length) { editor.innerHTML = "<div data-align=\"start\"><br></div>"; ed.setCaret(editor, { p: 0, o: 0 }); }
  }
  function format(cmd) {
    if (cmd === "italic" && doc.page.vertical) return;
    restoreRange();
    document.execCommand("styleWithCSS", false, false);
    document.execCommand(cmd, false, null);
    fromEditor("set");
    syncFormat();
  }
  function applyAlign(a) {
    restoreRange();
    const blocks = ed.blocksInRange(editor, getSelection().rangeCount ? getSelection().getRangeAt(0) : lastRange);
    if (!blocks.length) return;
    const all = blocks.every((b) => b.dataset.align === a);
    for (const b of blocks) { b.dataset.align = all ? "start" : a; b.style.textAlign = ""; }
    fromEditor("set");
    syncFormat();
  }
  function syncFormat() {
    if (!typeRefs.alignSeg) return;
    const r = lastRange && editor.contains(lastRange.startContainer) ? lastRange : null;
    const block = r ? ed.blocksInRange(editor, r)[0] : null;
    typeRefs.alignSeg.set(block?.dataset.align || "start");
    if (r && document.activeElement === editor) {
      typeRefs.bBtn.setAttribute("aria-pressed", String(document.queryCommandState("bold")));
      typeRefs.iBtn.setAttribute("aria-pressed", String(document.queryCommandState("italic")));
    }
  }

  // ルビ: 選んだ字に付ける。付いているルビをクリックすると直す・外す
  async function rubyDialog(chip = null) {
    let base = "";
    let range = null;
    if (chip) base = chip.textContent;
    else {
      restoreRange();
      const s = getSelection();
      range = s.rangeCount ? s.getRangeAt(0) : null;
      base = ed.cleanRuby(range?.toString() || "");
      if (!range || range.collapsed || !base || range.toString().includes("\n") || range.cloneContents().querySelector?.(".pe-ruby, div")) {
        ctx.toast(L.ruby, "info");
        return;
      }
    }
    const res = await dialog({ title: `${L.rubyReading}: ${base}`, value: chip?.dataset.r || "", input: true, extra: chip ? L.rubyRemove : null });
    if (res === null) return;
    snap("set");
    if (chip) {
      if (res === false || !ed.cleanRuby(res)) chip.replaceWith(document.createTextNode(chip.textContent));
      else chip.dataset.r = ed.cleanRuby(res);
    } else {
      const reading = ed.cleanRuby(res);
      if (!reading) return;
      range.deleteContents();
      const c = ed.rubyChip(base, reading);
      range.insertNode(c);
      const s = getSelection(); s.removeAllRanges();
      const after = document.createRange(); after.setStartAfter(c); after.collapse(true); s.addRange(after);
    }
    lastKind = "set";
    doc.body = ed.read(editor);
    changed();
  }

  /** 小さな入力窓。input: 1 行 / area: 複数行。extra のボタンは false を返す。やめたら null */
  function dialog({ title, note = "", value = "", input = false, area = false, extra = null }) {
    return new Promise((resolve) => {
      const dlg = document.createElement("div");
      dlg.className = "pp-dlg";
      dlg.innerHTML = `<div class="pp-dlg-box" role="dialog" aria-modal="true"><h3></h3><p class="note"></p>${input ? "<input type=\"text\">" : ""}${area ? "<textarea rows=\"10\"></textarea>" : ""}
        <div class="btn-row"><button class="btn extra"></button><span class="sp"></span><button class="btn cancel"></button><button class="btn primary go"></button></div></div>`;
      dlg.querySelector("h3").textContent = title;
      dlg.querySelector(".note").textContent = note;
      if (!note) dlg.querySelector(".note").remove();
      const f = dlg.querySelector("input, textarea");
      if (f) f.value = value;
      const ex = dlg.querySelector(".extra");
      if (extra) ex.textContent = extra; else ex.remove();
      dlg.querySelector(".cancel").textContent = L.cancel;
      dlg.querySelector(".go").textContent = L.ok;
      const done = (v) => { dlg.remove(); editor.focus(); resolve(v); };
      dlg.querySelector(".cancel").addEventListener("click", () => done(null));
      dlg.querySelector(".go").addEventListener("click", () => done(f ? f.value : true));
      ex.addEventListener?.("click", () => done(false));
      dlg.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.stopPropagation(); done(null); }
        if (e.key === "Enter" && input && !e.isComposing) { e.preventDefault(); done(f.value); }
      });
      dlg.addEventListener("pointerdown", (e) => { if (e.target === dlg) done(null); });
      document.body.append(dlg);
      (f || dlg.querySelector(".go")).focus();
      f?.select?.();
    });
  }

  // ---------- プレビュー ----------
  const frames = [];
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) { e.target._visible = e.isIntersecting; if (e.isIntersecting) paintFrame(e.target); }
  }, { root: view, rootMargin: "600px 0px" });
  function scheduleLayout() { clearTimeout(layoutTimer); layoutTimer = setTimeout(relayout, 90); }
  function scale() {
    const aw = Math.max(120, view.clientWidth - 48), ah = Math.max(120, view.clientHeight - 64);
    return Math.min(aw / (laid.g.W * PX), ah / (laid.g.H * PX), 1.6) * zoom;          // 1 ページが丸ごと見える大きさ（Ctrl+ホイールで拡大）
  }
  function relayout() {
    if (!doc) return;
    laid = layout(doc, st.sizes, terms());
    const s = scale();
    const gkey = JSON.stringify([doc.page, doc.grid, doc.text, doc.theme, doc.paper, doc.ruby, doc.rubyOnce, doc.work, dict?.mtime, doc.meta.pageNumbers, s, laid.pages.length]);
    const total = laid.pages.length;
    while (frames.length > total) { const f = frames.pop(); io.unobserve(f); f.remove(); }
    laid.pages.forEach((page, k) => {
      let f = frames[k];
      if (!f) {
        f = document.createElement("div");
        f.className = "pp-frame";
        f.innerHTML = `<div class="pp-sheet"></div><span class="pp-cap"></span>`;
        frames.push(f);
        pagesEl.append(f);
        io.observe(f);
      }
      const key = gkey + JSON.stringify(page.lines) + JSON.stringify(objs.objsOn(k));
      f.querySelector(".pp-cap").textContent = L.page(k + 1, total);
      f.querySelector(".pp-sheet").style.cssText = `width:${laid.g.W * PX * s}px;height:${laid.g.H * PX * s}px`;
      if (f._key !== key) { f._key = key; f._page = page; f._k = k; f._painted = false; if (f._visible) paintFrame(f); }
    });
    const chars = countChars(doc.body);
    const g = laid.g;
    const info = g.mode === "free" ? `${L.perPage(g.C * g.cols, g.N)}` : L.perPage(g.C, g.N);
    ctx.setStatus(`${L.status(total, chars)} ・ ${info} ・ ${L.pt(g.font / PT)}`);
    editor.style.fontFamily = fontStack(doc.text.font);
    if (!$(".pp-terms").contains(document.activeElement)) termsUI.render();   // 出てくる回数を新しくする
    followCaret();
  }
  function paintFrame(f) {
    if (f._painted || !f._page || !laid) return;
    f._painted = true;
    const page = renderPage(doc, laid.g, f._page, { theme: st.themes[doc.theme], ruby: doc.ruby, pageNo: f._k + 1, showNumber: doc.meta.pageNumbers,
      objects: objs.objsOn(f._k), imageUrl });
    page.style.zoom = scale();
    f.querySelector(".pp-sheet").replaceChildren(page);
    objs.decorate(f);
  }
  /** 1 ページだけ描き直す（物を動かしている最中） */
  function repaint(k) {
    const f = frames[k];
    if (!f) return;
    f._painted = false;
    f._key = null;
    paintFrame(f);
  }
  function followCaret() {                // 打っている所のページを見せる
    if (!laid || document.activeElement !== editor) return;
    const pos = ed.caret(editor);
    if (!pos) return;
    let k;
    for (let p = Math.min(pos.p, laid.paraPage.length - 1); p >= 0 && k === undefined; p--) k = laid.paraPage[p];
    const f = frames[k ?? 0];
    if (!f) return;
    const vr = view.getBoundingClientRect(), fr = f.getBoundingClientRect();
    if (fr.bottom < vr.top + 40 || fr.top > vr.bottom - 40) view.scrollTop += fr.top - vr.top - 12;
  }
  new ResizeObserver(() => { if (laid) { frames.forEach((f) => { f._key = null; }); relayout(); } }).observe(view);
  view.addEventListener("wheel", (e) => {
    if (!e.ctrlKey || !laid) return;
    e.preventDefault();
    zoom = Math.min(3, Math.max(0.3, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    store.set("zoom", zoom);
    relayout();
  }, { passive: false });

  // プレビューと打ち込み欄の境目を動かす
  const split = $(".pp-split");
  split.addEventListener("pointerdown", (e) => {
    split.setPointerCapture(e.pointerId);
    const y0 = e.clientY, h0 = write.offsetHeight;
    const move = (ev) => { write.style.height = `${Math.min(innerHeight * 0.7, Math.max(90, h0 - (ev.clientY - y0)))}px`; };
    const up = () => { split.removeEventListener("pointermove", move); split.removeEventListener("pointerup", up); store.set("editorH", write.offsetHeight); };
    split.addEventListener("pointermove", move);
    split.addEventListener("pointerup", up);
  });

  // ---------- 印刷・PDF ----------
  async function print() {
    if (!doc) return;
    await flush();
    const r = layout(doc, st.sizes, terms());
    document.getElementById("pp-print")?.remove();
    const box = document.createElement("div");
    box.id = "pp-print";
    const style = document.createElement("style");
    style.textContent = `@page { size: ${r.g.W}mm ${r.g.H}mm; margin: 0; }`;
    box.append(style);
    const total = r.pages.length;
    r.pages.forEach((p, k) => box.append(renderPage(doc, r.g, p, { theme: st.themes[doc.theme], ruby: doc.ruby, pageNo: k + 1, showNumber: doc.meta.pageNumbers,
      objects: doc.objects.filter((o) => Math.min(o.page, total) === k + 1), imageUrl })));
    document.body.append(box);
    await document.fonts?.ready;
    await Promise.all([...box.querySelectorAll("img")].map((im) => im.decode().catch(() => {})));
    ctx.toast(L.pdfTip, "info", 5000);
    window.print();
    setTimeout(() => box.remove(), 1500);
  }

  // ---------- メニュー ----------
  const at = (btn) => { const r = btn.getBoundingClientRect(); return [r.left, r.bottom + 4]; };
  function moreMenu() {
    ctx.contextMenu([
      { label: L.exportTxt, onClick: () => doExport("txt") },
      { label: L.exportPlain, onClick: () => doExport("plain") },
      { label: L.exportJson, onClick: () => doExport("json") },
      "-",
      { label: L.rename, icon: icons.rename, onClick: () => doRename() },
      { label: L.openFolder, icon: icons.folder, onClick: () => ctx.call("reveal", { name }).catch((e) => ctx.toast(e.message, "error")) },
    ], ...at(moreBtn));
  }
  async function doExport(kind) {
    try {
      await flush();
      const r = await ctx.call("export", { name, kind, text: kind === "plain" ? strip(doc.body, doc.ruby ? "paren" : "base", terms(), doc.rubyOnce) : "" });
      ctx.toast(L.exported(r.file));
      ctx.call("reveal", { name, file: r.file }).catch(() => {});
    } catch (e) { ctx.toast(e.message, "error"); }
  }
  async function doRename() {
    const v = await dialog({ title: L.newName, value: name, input: true });
    if (!v || v.trim() === name) return;
    try {
      await flush();
      const r = await ctx.call("rename", { name, new_name: v.trim() });
      name = r.name;
      await refresh();
      showEdit();
      ctx.toast(L.renamed);
    } catch (e) { ctx.toast(e.message, "error"); }
  }
  function aiMenu() {
    ctx.contextMenu([
      { label: L.aiCopy, onClick: async () => {
        try { await flush(); await vers.snap("ai-send"); await navigator.clipboard.writeText(L.aiPrompt(doc.body) + (terms().length ? L.aiDict(terms().map((t) => `- ${t.base}${t.reading ? `（${t.reading}）` : ""}`).join("\n")) : "")); ctx.toast(L.aiCopied, "info", 6000); }
        catch (e) { ctx.toast(e.message, "error"); }
      } },
      { label: L.aiPaste, onClick: async () => {
        const v = await dialog({ title: L.aiPasteTitle, note: L.aiPasteNote, area: true });
        if (typeof v !== "string" || !v.trim()) return;
        const body = v.replace(/\r\n?/g, "\n").replace(/^---\n/, "").replace(/\n+$/, "");
        await flush();
        await vers.snap("ai-before");
        setDoc((d) => { d.body = body; }, false);
        editor.innerHTML = ed.toHtml(doc.body);
        await flush();
        await vers.snap("ai-after");
      } },
    ], ...at(aiBtn));
  }

  // ---------- キー ----------
  document.addEventListener("keydown", (e) => {
    if (!doc || edit.hidden || document.querySelector(".pp-dlg")) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const inEditor = document.activeElement === editor;
    const inField = !inEditor && /INPUT|TEXTAREA/.test(document.activeElement?.tagName || "");
    if (!inEditor && !inField && objs.handleKey(e)) { e.preventDefault(); return; }
    if (mod && k === "z" && !inField) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && k === "y" && !inField) { e.preventDefault(); doRedo(); return; }
    if (mod && k === "p") { e.preventDefault(); print(); return; }
    if (mod && k === "s") { e.preventDefault(); dirty = true; flush(); return; }
    if (!inEditor) return;
    if (mod && k === "u") { e.preventDefault(); return; }                 // 下線は使わない
    if (mod && (k === "b" || k === "i")) { e.preventDefault(); format(k === "b" ? "bold" : "italic"); return; }
    const al = { l: "start", e: "center", r: "end", j: e.shiftKey ? "distribute" : "justify" }[k];
    if (mod && al) { e.preventDefault(); applyAlign(al); }
  });

  // ---------- 紙の上に置く物 ----------
  const objs = attachObjects({ ctx, L, view, frames, getDoc: () => doc, getLaid: () => laid, snap, changed, repaint, imageUrl,
    row: $(".pp-objrow"), insertRow: $(".pp-insert"), icons: IC });
  document.addEventListener("paste", (e) => {                    // 絵の貼り付け（打ち込み欄にいても紙に置く）
    if (doc && !edit.hidden && !document.querySelector(".pp-dlg")) objs.handlePaste(e);
  }, true);

  // ---------- 作品の用語集 ----------
  async function loadDict() {
    dict = doc?.work ? await ctx.call("get_dict", { work: doc.work }).catch((e) => { ctx.toast(e.message, "error"); return null; }) : null;
    termsUI.render();
    relayout();
  }
  const termsUI = attachTerms({ ctx, L, aside: $(".pp-terms"), editor, store, icons: { ...icons, plus: icons.plus || IC.ruby, rename: icons.rename || IC.layout, trash: icons.trash || "×" },
    getDoc: () => doc, getDict: () => dict, works: () => st.works || [],
    setDict: (d) => { dict = d; termsUI.render(); relayout(); },
    setWork: async (w) => { setDoc((d) => { d.work = w; }, false); await flush(); await refresh(); await loadDict(); },
    afterRenameWork: async (w) => { doc.work = w; await refresh(); await loadDict(); },
    prompt: (title, value) => dialog({ title, value, input: true }),
    confirm: async (title) => (await dialog({ title })) === true,
    restoreRange, rubyDialog: () => rubyDialog() });

  // ---------- 版（作品の保護） ----------
  let lastAuto = { at: 0, body: null };
  const vers = attachVersions({ ctx, L, getName: () => name, getDoc: () => doc, flush, reload: () => open(name, true) });
  setInterval(async () => {                              // 書いている間は 10 分ごとに自動で残す（変わっていなければ残さない）
    if (!doc || document.hidden || Date.now() - lastAuto.at < 10 * 60 * 1000 || lastAuto.body === doc.body) return;
    lastAuto = { at: Date.now(), body: doc.body };
    await flush();
    vers.snap("auto");
  }, 60 * 1000);

  // ---------- 始める ----------
  for (const b of editOnly) b.style.display = "none";
  await refresh();
  if (st.current && st.files.some((f) => f.name === st.current)) await open(st.current);
  else showHome();
}
