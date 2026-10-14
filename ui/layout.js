// paper/ui/layout.js — 組版。文書（.paper.json の中身）を、ページと行と文字の位置（mm）にする。
// ・ブラウザの折り返しに任せず、ここで 1 字ずつ位置を決める。画面・印刷・PDF が同じ結果になり、縦書きの原稿用紙も同じ仕組みで組める
// ・字の幅は 全角 = 1 マス、半角 = 0.5 マス。禁則は「、。」のぶら下げと、行頭・行末の追い出し
// ・DOM を使わない（node でもテストできる）。描くのは render.js
import { parse, parseLine } from "./markup.js";

export const PT = 25.4 / 72;              // 1pt = 0.3528mm
const EPS = 1e-6;
const NO_START = new Set("、。，．,.)）」』】〕〉》｝]}’”ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖ々〻‐゠–〜～？！?!‼⁇⁈⁉・：；:;");
const HANG = new Set("、。，．,.");
const NO_END = new Set("（(「『【〔〈《｛[{‘“");
const isHalf = (c) => { const n = c.codePointAt(0); return (n >= 0x20 && n <= 0x7e) || (n >= 0xff61 && n <= 0xff9f); };
const isWordChar = (c) => /[A-Za-z0-9'\-_.@#%&+]/.test(c);

/** 紙の大きさ（mm）。landscape なら横長にする */
export function pageSize(doc, sizes) {
  const [w, h] = sizes[doc.page.size] || sizes.A4;
  return doc.page.landscape ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
}

/** 版面の寸法を決める。mode: genko（マス目）/ fit（字数×行数で決める）/ free（文字の大きさ・行間で決める） */
export function geometry(doc, sizes) {
  const [W, H] = pageSize(doc, sizes);
  const [mt, mr, mb, ml] = doc.page.margin;
  const vertical = doc.page.vertical;
  const area = { x: ml, y: mt, w: Math.max(10, W - ml - mr), h: Math.max(10, H - mt - mb) };
  let picture = null;
  if (doc.grid.picture > 0) {                         // 絵の枠（絵日記）は紙の上側
    const ph = area.h * doc.grid.picture;
    picture = { x: area.x, y: area.y, w: area.w, h: ph };
    area.y += ph + 5; area.h = Math.max(10, area.h - ph - 5);
  }
  const inlineLen = vertical ? area.h : area.w, blockLen = vertical ? area.w : area.h;
  const genko = doc.grid.kind === "genko";
  const mode = genko ? "genko" : doc.text.mode;
  const g = { W, H, vertical, area, picture, mode, inlineLen, blockLen, cols: 1, colGap: 0, offI: 0, offB: 0, rubyGap: 0 };
  if (genko) {
    const C = doc.grid.chars, N = doc.grid.lines;
    const s = Math.min(inlineLen / C, blockLen / (N * 1.3));
    Object.assign(g, { C, N, cell: s, pitch: s * 1.3, font: s * 0.72, rubyGap: s * 0.3, colLen: C * s,
      offI: (inlineLen - C * s) / 2, offB: (blockLen - N * s * 1.3) / 2 });
    return g;
  }
  const cols = doc.page.columns, colGap = cols > 1 ? doc.page.columnGap : 0;
  const colLen = (inlineLen - colGap * (cols - 1)) / cols;
  Object.assign(g, { cols, colGap, colLen });
  if (mode === "fit") {
    const C = doc.text.chars, N = doc.text.lines;
    const cell = colLen / C;
    Object.assign(g, { C, N, cell, font: cell / (1 + Math.max(0, doc.text.letterSpacing)), pitch: blockLen / N });
  } else {
    const font = doc.text.size * PT;
    const cell = font * (1 + doc.text.letterSpacing);
    const pitch = font * doc.text.lineHeight;
    Object.assign(g, { C: Math.max(1, Math.floor(colLen / cell + EPS)), N: Math.max(1, Math.floor(blockLen / pitch + EPS)), cell, font, pitch });
  }
  return g;
}

// ---------- 段落 → 行 ----------
// 半角の字の幅（全角 = 1）。画面では setMeasure で実際の書体の幅を測る。測れないとき（node など）は 0.5
let measure = null;
export function setMeasure(fn) { measure = fn; }

function unitsOf(runs, font, fixed) {
  const units = [], rubies = [];
  for (const r of runs) {
    const rid = r.r ? rubies.push({ r: r.r }) - 1 : -1;
    for (const c of Array.from(r.t)) {
      const w = !isHalf(c) ? 1 : fixed || !measure ? 0.5 : Math.max(0.15, Math.min(1, measure(c, font, r.b)));
      units.push({ c, w, b: r.b, i: r.i, rid });
    }
  }
  return { units, rubies };
}

function chunksOf(units, cap) {
  const out = [];
  for (let k = 0; k < units.length;) {
    const u = units[k];
    let n = 1;
    if (u.rid >= 0) while (k + n < units.length && units[k + n].rid === u.rid) n++;
    else if (isWordChar(u.c)) while (k + n < units.length && units[k + n].rid < 0 && isWordChar(units[k + n].c)) n++;
    const part = units.slice(k, k + n);
    const w = part.reduce((s, x) => s + x.w, 0);
    if (w > cap + EPS && n > 1) for (const x of part) out.push({ u: [x], w: x.w });   // 1 行に入らない塊はばらす
    else out.push({ u: part, w });
    k += n;
  }
  return out;
}

const first = (ch) => ch.u[0].c, last = (ch) => ch.u[ch.u.length - 1].c;

/** 1 段落を、cap マスの行に分ける。返すのは行ごとの chunk の配列 */
export function breakLines(units, cap) {
  const chunks = chunksOf(units, cap);
  const lines = [];
  let cur = [], w = 0;
  for (let k = 0; k < chunks.length; k++) {
    const ch = chunks[k];
    if (w + ch.w <= cap + EPS) { cur.push(ch); w += ch.w; continue; }
    if (cur.length && ch.u.length === 1 && HANG.has(first(ch)) && w + ch.w <= cap + 1 + EPS) {   // ぶら下げ
      cur.push(ch); lines.push(cur); cur = []; w = 0; continue;
    }
    if (!cur.length) { lines.push([ch]); continue; }                                        // 念のため（1 字でも入らない）
    const carry = [];
    if (NO_START.has(first(ch)) && cur.length > 1) carry.unshift(cur.pop());               // 行頭禁則: 前の字と一緒に送る
    while (cur.length > 1 && NO_END.has(last(cur[cur.length - 1]))) carry.unshift(cur.pop()); // 行末禁則
    lines.push(cur);
    cur = carry; w = carry.reduce((s, x) => s + x.w, 0);
    k--;                                                                                     // 同じ塊を次の行でもう一度
  }
  if (cur.length || !lines.length) lines.push(cur);
  // 折り返した行の頭の半角空白は消す（英文の単語の間で折り返したとき）
  for (let n = 1; n < lines.length; n++) while (lines[n].length > 1 && lines[n][0].u.every((u) => u.c === " ")) lines[n].shift();
  return lines;
}

/** 行の中の字の位置（マス単位）。揃えに合わせてずらし、両端揃え・均等割り付けは字の間を広げる */
function placeLine(chunks, cap, align, isLast, snap) {
  const units = chunks.flatMap((c) => c.u);
  const lastCh = chunks.at(-1);
  const hang = lastCh && lastCh.u.length === 1 && HANG.has(lastCh.u[0].c) ? lastCh.w : 0;
  const used = units.reduce((s, u) => s + u.w, 0);
  const over = used - cap > EPS;
  const body = over ? used - hang : used;
  const free = Math.max(0, cap - body);
  const gaps = chunks.length - 1 - (over ? 1 : 0);                       // 広げるのは塊（字・英単語・ルビ）の間だけ
  const spread = !snap && gaps > 0 && (align === "distribute" || (align === "justify" && !isLast));
  const gap = spread ? free / gaps : 0;
  let shift = 0;
  if (!spread) {
    if (align === "center" || (align === "distribute" && chunks.length === 1)) shift = free / 2;
    else if (align === "end") shift = free;
    if (snap) shift = Math.floor(shift + EPS);
  }
  let x = shift;
  const pos = [];
  chunks.forEach((c, k) => {
    for (const u of c.u) { pos.push(x); x += u.w; }
    if (spread && k < gaps) x += gap;                                       // ぶら下げた字の前は広げない
  });
  return { units, pos };
}

// ---------- 題名・日付・署名 ----------
function metaParas(doc, genko) {
  const m = doc.meta, before = [], after = [];
  // 題名・日付・署名はそのままの字（ルビ ｜漢字《かんじ》 だけ使える）
  const lit = (s) => { const t = s.replace(/[\\*]/g, "\\$&"); return /^(>>|><|<>|==)/.test(t) ? `\\${t}` : t; };
  const P = (text, o = {}) => ({ ...parseLine(lit(text)), ...o, meta: true });
  const sig = m.signature.split("\n").map((s) => s.trim()).filter(Boolean);
  if (m.placement === "grid") {                       // 作文: 1 行目は 2 マス下げて題名、2 行目は下に 1 マス空けて日付と名前
    if (m.title) before.push(P(m.title, { align: m.titleAlign === "center" ? "center" : "start", indent: m.titleAlign === "center" ? 0 : 2 }));
    const tail = [m.date, sig.join("　")].filter(Boolean).join("　");
    if (tail) before.push(P(tail, { align: "end", endPad: 1 }));
  } else if (m.placement === "letter") {              // 手紙: 題名、本文、日付（2 字下げ）、署名（地付き）
    if (m.title) before.push(P(m.title, { align: m.titleAlign, scale: genko ? 1 : 1.35, bold: true, indent: m.titleAlign === "start" ? 1 : 0 }), P(""));
    if (m.date || sig.length) after.push(P(""));
    if (m.date) after.push(P(m.date, { indent: 2 }));
    for (const s of sig) after.push(P(s, { align: "end", endPad: genko ? 1 : 0.5 }));
  } else {                                            // 本・メモ: 先頭に題名、日付と署名は地付き
    if (m.title) before.push(P(m.title, { align: m.titleAlign, scale: genko ? 1 : 1.4, bold: true }));
    if (m.date) before.push(P(m.date, { align: "end" }));
    for (const s of sig) before.push(P(s, { align: "end" }));
    if (before.length) before.push(P(""));
  }
  return { before, after };
}

/** 文書を組む。返り値: { g, pages: [{ lines: [...] }], paraPage: 段落ごとの最初のページ } */
export function layout(doc, sizes) {
  const g = geometry(doc, sizes);
  const snap = g.mode === "genko";
  const { before, after } = metaParas(doc, snap);
  const body = parse(doc.body).map((p, k) => ({ ...p, para: k }));
  const paras = [...before, ...body, ...after];
  const rows = [];                                     // 行（まだページに置いていない）
  for (const p of paras) {
    const scale = p.scale || 1, slots = scale > 1.05 ? 2 : 1;
    const cell = g.cell * scale;
    const cap = Math.max(1, Math.floor((g.C * g.cell) / cell + EPS)) - (p.indent || 0) - (p.endPad || 0);
    const { units, rubies } = unitsOf(p.runs.map((r) => (p.bold ? { ...r, b: true } : r)), doc.text.font, snap);
    const lines = breakLines(units, Math.max(1, cap));
    lines.forEach((chunks, k) => {
      const isLast = k === lines.length - 1;
      const { units: us, pos } = placeLine(chunks, Math.max(1, cap), p.align, isLast, snap);
      rows.push({ units: us, pos: pos.map((x) => x + (p.indent || 0)), rubies, scale, slots, para: p.para, meta: !!p.meta });
    });
  }
  // ページ（と段）に詰める
  const pages = [];
  const paraPage = [];
  let page = null, col = 0, slot = 0;
  const newPage = () => { page = { lines: [] }; pages.push(page); col = 0; slot = 0; };
  newPage();
  for (const r of rows) {
    if (slot + r.slots > g.N) { col++; slot = 0; if (col >= g.cols) newPage(); }
    page.lines.push({ ...r, col, slot });
    if (r.para !== undefined && paraPage[r.para] === undefined) paraPage[r.para] = pages.length - 1;
    slot += r.slots;
  }
  return { g, pages, paraPage };
}

/** 行の中の 1 字の、紙の上の位置（mm）。描く側（render.js）で使う */
export function glyphBox(g, line, k) {
  const u = line.units[k];
  const cell = g.cell * line.scale, font = g.font * line.scale;
  const colStart = g.offI + line.col * (g.colLen + g.colGap);
  const i0 = colStart + line.pos[k] * cell;              // 行の方向の始まり
  const len = u.w * cell;
  const b = g.offB + line.slot * g.pitch + (g.pitch * line.slots + g.rubyGap) / 2;   // 行の中心（行の並ぶ方向）
  return box(g, i0, len, b, font);
}

/** ルビの位置（mm）: 親文字の範囲の、行の並ぶ方向の手前側（縦書きは右、横書きは上） */
export function rubyBox(g, line, from, to) {
  const cell = g.cell * line.scale, font = g.font * line.scale, rf = font * 0.5;
  const colStart = g.offI + line.col * (g.colLen + g.colGap);
  const i0 = colStart + line.pos[from] * cell, i1 = colStart + (line.pos[to] + line.units[to].w) * cell;
  const b = g.offB + line.slot * g.pitch + (g.pitch * line.slots + g.rubyGap) / 2 - font / 2 - rf / 2 - font * 0.02;
  return { ...box(g, i0, i1 - i0, b, rf), font: rf };
}

function box(g, i0, len, bCenter, thick) {
  if (g.vertical) return { x: g.area.x + g.area.w - bCenter - thick / 2, y: g.area.y + i0, w: thick, h: len };
  return { x: g.area.x + i0, y: g.area.y + bCenter - thick / 2, w: len, h: thick };
}

/** 罫線・マス目の線（mm の線分の配列）。kind: frame（太め）/ rule / guide（点線） */
export function gridLines(g, doc) {
  const out = [];
  const L = (x1, y1, x2, y2, kind = "rule") => out.push({ x1, y1, x2, y2, kind });
  const { area } = g;
  const toXY = (i, b) => (g.vertical ? [area.x + area.w - b, area.y + i] : [area.x + i, area.y + b]);
  const seg = (i1, b1, i2, b2, kind) => { const [x1, y1] = toXY(i1, b1), [x2, y2] = toXY(i2, b2); L(x1, y1, x2, y2, kind); };
  if (doc.grid.kind === "genko") {
    const s = g.cell, i0 = g.offI, i1 = g.offI + g.C * s;
    for (let n = 0; n < g.N; n++) {
      const b0 = g.offB + n * g.pitch + g.rubyGap, b1 = b0 + s;    // マスの列（手前にルビ用のすき間）
      seg(i0, b0, i1, b0); seg(i0, b1, i1, b1);
      for (let c = 0; c <= g.C; c++) seg(i0 + c * s, b0, i0 + c * s, b1);
      if (doc.grid.guide) for (let c = 0; c < g.C; c++) {
        seg(i0 + c * s, (b0 + b1) / 2, i0 + (c + 1) * s, (b0 + b1) / 2, "guide");
        seg(i0 + (c + 0.5) * s, b0, i0 + (c + 0.5) * s, b1, "guide");
      }
    }
    const bA = g.offB, bB = g.offB + g.N * g.pitch + g.rubyGap * 0;        // 外枠
    seg(i0, bA, i1, bA, "frame"); seg(i0, bB, i1, bB, "frame"); seg(i0, bA, i0, bB, "frame"); seg(i1, bA, i1, bB, "frame");
  } else if (doc.grid.kind === "lines") {
    for (let c = 0; c < g.cols; c++) {
      const i0 = c * (g.colLen + g.colGap), i1 = i0 + g.colLen;
      for (let n = 0; n <= g.N; n++) seg(i0, n * g.pitch, i1, n * g.pitch);
    }
  }
  return out;
}
