// paper/ui/markup.js — 本文の記法。本文は 1 つの文字列のまま保存し、表示するときにここで段落と飾りに分ける。
//   行頭  >> 右揃え（縦書きは地付き） / >< 中央 / <> 均等割り付け / == 両端揃え / なし = 左揃え（天付き）
//   **太字**  *斜体*  ｜漢字《かんじ》  漢字《かんじ》（漢字が続く所だけに付く。青空文庫と同じ）
//   \ の次の 1 字は記号として扱わない（\* \｜ \《 \> など）
// 画面に依存しない（node でもテストできる）。

export const ALIGN_MARKS = { ">>": "end", "><": "center", "<>": "distribute", "==": "justify" };
const MARK_OF = Object.fromEntries(Object.entries(ALIGN_MARKS).map(([m, a]) => [a, m]));
export const ALIGNS = ["start", "center", "end", "justify", "distribute"];
const ESC = new Set(["\\", "*", "｜", "《", "》", "<", ">", "="]);
const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヶ〇]/u;

/** 行の揃えと、記号を除いた残りを返す */
export function splitAlign(line) {
  const m = line.slice(0, 2);
  return ALIGN_MARKS[m] ? { align: ALIGN_MARKS[m], rest: line.slice(2) } : { align: "start", rest: line };
}

/** 行の揃えを付け替える（本文の文字はそのまま） */
export function withAlign(line, align) {
  const { rest } = splitAlign(line);
  return (MARK_OF[align] || "") + rest;
}

/** 1 行（段落）を飾りの単位（run）に分ける。run: {t, b, i, r?}。r があればルビ（t が親文字） */
export function parseLine(line) {
  const { align, rest: s } = splitAlign(line);
  const runs = [];
  let buf = "", b = false, i = false;
  const flush = () => { if (buf) runs.push({ t: buf, b, i }); buf = ""; };
  const chars = Array.from(s);
  for (let k = 0; k < chars.length; k++) {
    const c = chars[k];
    if (c === "\\" && k + 1 < chars.length && ESC.has(chars[k + 1])) { buf += chars[++k]; continue; }
    if (c === "*") {
      flush();
      if (chars[k + 1] === "*") { b = !b; k++; } else i = !i;
      continue;
    }
    if (c === "｜") {                          // ｜親文字《ルビ》
      const open = chars.indexOf("《", k + 1), close = open < 0 ? -1 : chars.indexOf("》", open + 1);
      if (open > k + 1 && close > open + 1 && !chars.slice(k + 1, open).includes("｜")) {
        flush();
        runs.push({ t: chars.slice(k + 1, open).join(""), r: chars.slice(open + 1, close).join(""), b, i });
        k = close;
        continue;
      }
      buf += c;
      continue;
    }
    if (c === "《") {                          // 漢字《ルビ》: 直前に続く漢字が親文字
      const close = chars.indexOf("》", k + 1);
      const arr = Array.from(buf);
      let n = 0;
      while (n < arr.length && KANJI.test(arr[arr.length - 1 - n])) n++;
      if (close > k + 1 && n > 0) {
        buf = arr.slice(0, arr.length - n).join("");
        flush();
        runs.push({ t: arr.slice(arr.length - n).join(""), r: chars.slice(k + 1, close).join(""), b, i });
        k = close;
        continue;
      }
    }
    buf += c;
  }
  flush();
  return { align, runs };
}

/** 本文全体を段落の配列にする（改行 = 段落の区切り） */
export function parse(body) {
  return String(body ?? "").replace(/\r\n?/g, "\n").split("\n").map(parseLine);
}

/** 段落の文字だけ（ルビの読みは含めない）。字数を数えるときに使う */
export const plainOf = (p) => p.runs.map((r) => r.t).join("");

/** 記法を外した本文（ほかのアプリ向け）。ruby: "paren" = 漢字（かんじ） / "base" = 漢字 / "aozora" = ｜漢字《かんじ》
 *  terms を渡すと、用語集のルビも付ける（組版と同じ決まり） */
export function strip(body, ruby = "paren", terms = [], rubyOnce = false) {
  return applyTerms(parse(body), terms, rubyOnce).map((p) => p.runs.map((r) => {
    if (!r.r || ruby === "base") return r.t;
    return ruby === "aozora" ? `｜${r.t}《${r.r}》` : `${r.t}（${r.r}）`;
  }).join("")).join("\n");
}

// ---------- 作品の用語集 ----------
// term: { base: 表記, reading: 読み, rule: "always"（毎回）| "first"（その文書で初めの 1 回）| "none", part: 語の一部でも付けるか }
const scriptOf = (c) => (KANJI.test(c) ? "k" : /[\u30a0-\u30ff\u31f0-\u31ff\uff66-\uff9f]/u.test(c) ? "t" : /[A-Za-z0-9\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]/u.test(c) ? "l" : "");

/** 表記の最初の字で引ける表（長い表記を先に試す） */
export function termIndex(terms) {
  const idx = new Map();
  for (const t of terms || []) {
    if (!t?.base) continue;
    const c = Array.from(t.base)[0];
    if (!idx.has(c)) idx.set(c, []);
    idx.get(c).push({ ...t, chars: Array.from(t.base) });
  }
  for (const list of idx.values()) list.sort((a, b) => b.chars.length - a.chars.length);
  return idx;
}

/** chars[i] から始まる用語（語の境目を守る）。無ければ null */
function matchAt(idx, chars, i) {
  const list = idx.get(chars[i]);
  if (!list) return null;
  for (const t of list) {
    const n = t.chars.length;
    let ok = i + n <= chars.length;
    for (let k = 0; ok && k < n; k++) ok = chars[i + k] === t.chars[k];
    if (!ok) continue;
    if (!t.part) {                                   // 前後に同じ種類の字（漢字・カタカナ・英数字）が続くなら、語の一部なので付けない
      const a = scriptOf(t.chars[0]), b = scriptOf(t.chars[n - 1]);
      if (a && i > 0 && scriptOf(chars[i - 1]) === a) continue;
      if (b && i + n < chars.length && scriptOf(chars[i + n]) === b) continue;
    }
    return t;
  }
  return null;
}

/** 段落の並びに、用語集のルビを付ける。rule が first の用語は、その文書で初めて出た所だけ。
 *  本文に手で書いたルビが先。rubyOnce なら、手で書いた同じルビも 2 回目からは外す */
export function applyTerms(paras, terms, rubyOnce = false) {
  const idx = termIndex((terms || []).filter((t) => t.reading && t.rule !== "none"));
  if (!idx.size && !rubyOnce) return paras;
  const seen = new Set(), seenRuby = new Set();
  return paras.map((p) => {
    const runs = [];
    for (const r of p.runs) {
      if (r.r) {
        seen.add(r.t);
        const key = `${r.t}\u0000${r.r}`;
        if (rubyOnce && seenRuby.has(key)) { runs.push({ t: r.t, b: r.b, i: r.i }); continue; }
        seenRuby.add(key);
        runs.push(r);
        continue;
      }
      const chars = Array.from(r.t);
      let buf = "";
      for (let i = 0; i < chars.length;) {
        const t = idx.size ? matchAt(idx, chars, i) : null;
        if (!t) { buf += chars[i++]; continue; }
        if (t.rule === "first" && seen.has(t.base)) { buf += t.base; i += t.chars.length; continue; }
        seen.add(t.base);
        if (buf) runs.push({ t: buf, b: r.b, i: r.i });
        buf = "";
        runs.push({ t: t.base, r: t.reading, b: r.b, i: r.i, auto: true });
        i += t.chars.length;
      }
      if (buf) runs.push({ t: buf, b: r.b, i: r.i });
    }
    return { ...p, runs };
  });
}

/** 本文に用語が何回出てくるか（表記 → 回数）。手で書いたルビの親文字も数える */
export function termCounts(body, terms) {
  const idx = termIndex(terms), out = new Map();
  for (const p of parse(body)) for (const r of p.runs) {
    const chars = Array.from(r.t);
    for (let i = 0; i < chars.length;) {
      const t = matchAt(idx, chars, i);
      if (t) { out.set(t.base, (out.get(t.base) || 0) + 1); i += t.chars.length; } else i++;
    }
  }
  return out;
}

/** 字数（空白・改行を除く。ルビの読みは数えない） */
export function countChars(body) {
  return parse(body).reduce((n, p) => n + Array.from(plainOf(p)).filter((c) => !/\s/u.test(c)).length, 0);
}

/** 記号として読まれないように、ふつうの文字列を記法の中に入れる形にする */
export function escapeText(s) {
  return Array.from(String(s)).map((c) => (c === "\\" || c === "*" || c === "｜" || c === "《" || c === "》" ? `\\${c}` : c)).join("");
}
