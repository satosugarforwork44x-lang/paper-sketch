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

/** 記法を外した本文（ほかのアプリ向け）。ruby: "paren" = 漢字（かんじ） / "base" = 漢字 / "aozora" = ｜漢字《かんじ》 */
export function strip(body, ruby = "paren") {
  return parse(body).map((p) => p.runs.map((r) => {
    if (!r.r || ruby === "base") return r.t;
    return ruby === "aozora" ? `｜${r.t}《${r.r}》` : `${r.t}（${r.r}）`;
  }).join("")).join("\n");
}

/** 字数（空白・改行を除く。ルビの読みは数えない） */
export function countChars(body) {
  return parse(body).reduce((n, p) => n + Array.from(plainOf(p)).filter((c) => !/\s/u.test(c)).length, 0);
}

/** 記号として読まれないように、ふつうの文字列を記法の中に入れる形にする */
export function escapeText(s) {
  return Array.from(String(s)).map((c) => (c === "\\" || c === "*" || c === "｜" || c === "《" || c === "》" ? `\\${c}` : c)).join("");
}
