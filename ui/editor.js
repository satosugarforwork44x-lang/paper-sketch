// paper/ui/editor.js — 打ち込み欄（書式付き）。見た目は Word のように太字・斜体・揃え・ルビが見え、保存するのは記法の文字列。
// ・本文 → 画面: fill(body)    画面 → 本文: read()
// ・太字・斜体はブラウザの編集機能（<b> <i>）に任せ、読むときに要素と style から判断する
// ・ルビは編集できない小さな塊（.pe-ruby）。クリックで読みを直す
import { ALIGN_MARKS, escapeText, parse } from "./markup.js";

const MARK_OF = Object.fromEntries(Object.entries(ALIGN_MARKS).map(([m, a]) => [a, m]));
const BLOCK = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE"]);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const cleanRuby = (s) => String(s ?? "").replace(/[｜《》\n\r]/g, "").trim();

export function rubyChip(base, reading) {
  const s = document.createElement("span");
  s.className = "pe-ruby";
  s.contentEditable = "false";
  s.dataset.r = reading;
  s.textContent = base;
  return s;
}

/** 本文（記法）を打ち込み欄の HTML にする */
export function toHtml(body) {
  return parse(body).map((p) => {
    const inner = p.runs.map((r) => {
      let h = r.r ? `<span class="pe-ruby" contenteditable="false" data-r="${esc(r.r)}">${esc(r.t)}</span>` : esc(r.t);
      if (r.i) h = `<i>${h}</i>`;
      if (r.b) h = `<b>${h}</b>`;
      return h;
    }).join("");
    return `<div data-align="${p.align}">${inner || "<br>"}</div>`;
  }).join("");
}

function lastMeaningful(block) {
  let n = block.lastChild;
  while (n && n.nodeType === 3 && !n.data) n = n.previousSibling;
  return n;
}

/** 打ち込み欄から本文（記法）を作る */
export function read(root) {
  const paras = [];
  let cur = null;
  const start = (align) => { cur = { align, segs: [] }; paras.push(cur); };
  const ensure = () => { if (!cur) start("start"); };
  const alignOf = (el) => {
    if (el.dataset?.align && MARK_OF[el.dataset.align] !== undefined) return el.dataset.align;
    if (el.dataset?.align === "start") return "start";
    const ta = el.style?.textAlign;
    return ta === "center" ? "center" : ta === "right" || ta === "end" ? "end" : ta === "justify" ? "justify" : "start";
  };
  const walk = (node, b, i, block) => {
    if (node.nodeType === 3) {
      const parts = node.data.replace(/ /g, " ").split("\n");
      parts.forEach((t, k) => { if (k) start(cur?.align || "start"); ensure(); if (t) cur.segs.push({ t, b, i }); });
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node, tag = el.tagName;
    if (tag === "BR") { if (lastMeaningful(block) !== el) { ensure(); start(cur.align); } return; }
    if (el.classList?.contains("pe-ruby")) {
      const base = cleanRuby(el.textContent), r = cleanRuby(el.dataset.r);
      ensure();
      cur.segs.push(base && r ? { ruby: true, t: base, r, b, i } : { t: base, b, i });
      return;
    }
    if (tag === "RT" || tag === "RP" || tag === "STYLE" || tag === "SCRIPT") return;
    if (BLOCK.has(tag)) {
      start(alignOf(el));
      for (const c of el.childNodes) walk(c, b, i, el);
      cur = null;
      return;
    }
    let nb = b || tag === "B" || tag === "STRONG", ni = i || tag === "I" || tag === "EM";
    const fw = el.style?.fontWeight, fs = el.style?.fontStyle;
    if (fw) nb = fw === "bold" || fw === "bolder" || Number(fw) >= 600;
    if (fs) ni = fs === "italic" || fs === "oblique";
    for (const c of el.childNodes) walk(c, nb, ni, block);
  };
  for (const c of root.childNodes) walk(c, false, false, root);
  return paras.map(toMarkup).join("\n");
}

function toMarkup(p) {
  let s = "", b = false, i = false;
  const tog = (nb, ni) => { if (nb !== b) { s += "**"; b = nb; } if (ni !== i) { s += "*"; i = ni; } };
  for (const g of p.segs) {
    if (g.ruby) { tog(g.b, g.i); s += `｜${g.t}《${g.r}》`; continue; }
    tog(g.b, g.i);
    s += escapeText(g.t);
  }
  tog(false, false);
  if (ALIGN_MARKS[s.slice(0, 2)]) s = `\\${s}`;
  return (MARK_OF[p.align] || "") + s;
}

// ---------- カーソルの位置（段落の番号と、段落の中の字の位置） ----------
export function blockOf(root, node) {
  if (node === root) return null;
  while (node && node.parentNode !== root) node = node.parentNode;
  return node && node.nodeType === 1 ? node : null;
}

export function caret(root) {
  const s = getSelection();
  if (!s?.rangeCount) return null;
  const r = s.getRangeAt(0);
  if (!root.contains(r.startContainer)) return null;
  let block = blockOf(root, r.startContainer);
  if (!block) block = root.childNodes[Math.min(r.startOffset, root.childNodes.length - 1)];
  const p = Math.max(0, [...root.children].indexOf(block));
  let o = 0;
  if (block && block.contains(r.startContainer)) {
    const pre = document.createRange();
    pre.setStart(block, 0);
    pre.setEnd(r.startContainer, r.startOffset);
    o = pre.toString().length;
  }
  return { p, o };
}

export function setCaret(root, pos) {
  const blocks = root.children;
  if (!blocks.length || !pos) return;
  const block = blocks[Math.min(pos.p, blocks.length - 1)];
  const range = document.createRange();
  let left = pos.o, done = false;
  for (const n of block.childNodes.length ? walkTexts(block) : []) {
    const chip = n.parentElement?.closest(".pe-ruby");
    const len = n.data.length;
    if (left <= len) {
      if (chip) range.setStartAfter(chip); else range.setStart(n, left);
      done = true;
      break;
    }
    left -= len;
  }
  if (!done) { range.selectNodeContents(block); range.collapse(false); }
  range.collapse(true);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(range);
}

function* walkTexts(el) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) yield n;
}

/** 選んでいる範囲にかかる段落（要素）。選んでいなければカーソルのある段落 */
export function blocksInRange(root, range) {
  if (!range) return [];
  const a = blockOf(root, range.startContainer) || root.children[range.startOffset] || root.lastElementChild;
  const b = blockOf(root, range.endContainer) || a;
  const all = [...root.children];
  const i = all.indexOf(a), j = all.indexOf(b);
  return i < 0 ? [] : all.slice(i, (j < i ? i : j) + 1);
}
