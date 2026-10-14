// paper/ui/render.js — 組んだページを DOM にする（寸法はすべて mm）。画面のプレビューと印刷で同じ関数を使う。
import { glyphBox, gridLines, rubyBox, PT } from "./layout.js";
import { parse } from "./markup.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mm = (v) => `${+v.toFixed(3)}mm`;
// 奉書紙風の地（細かい繊維）。画像ファイルは使わず SVG のノイズで描く
const FIBER = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="f"><feTurbulence type="fractalNoise" baseFrequency=".9 .045" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .42  0 0 0 .09 0"/></filter><rect width="240" height="240" filter="url(#f)"/></svg>')}")`;

/** フォント名を CSS の font-family にする（無ければ近い書体で代わりに出す） */
export function fontStack(font) {
  const mincho = /mincho|明朝|kyokasho|教科書|楷書|kaisho|serif/i.test(font);
  const fb = mincho ? `"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", "Noto Serif JP", serif`
    : `"Yu Gothic", "YuGothic", "Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", sans-serif`;
  return `"${String(font).replace(/["\\]/g, "")}", ${fb}`;
}

// ---------- 紙の上に置く物（絵・図形・文字ボックス）。寸法は mm、紙の左上から ----------
/** 図形の中の文字（記法つき）を HTML にする。ルビは <ruby> */
function richText(text, ruby) {
  return parse(text).map((p) => {
    const inner = p.runs.map((r) => {
      let h = esc(r.t);
      if (r.r) h = ruby ? `<ruby>${h}<rt>${esc(r.r)}</rt></ruby>` : h;
      if (r.i) h = `<i>${h}</i>`;
      if (r.b) h = `<b>${h}</b>`;
      return h;
    }).join("");
    const al = p.align === "end" ? "end" : p.align === "center" ? "center" : p.align === "start" ? "" : "justify";
    return `<div${al ? ` style="text-align:${al}${p.align === "distribute" ? ";text-align-last:justify" : ""}"` : ""}>${inner || "<br>"}</div>`;
  }).join("");
}

/** 線・矢印の、紙の上の 2 点（mm） */
export const lineEnds = (o) => [o.x, o.y, o.x + o.w, o.y + o.h];

/** 置く物を 1 つ HTML にする。opts: { imageUrl(src), ruby, font } */
export function objectHtml(o, opts) {
  const op = o.opacity < 1 ? `;opacity:${o.opacity}` : "";
  if (o.kind === "image") {
    return `<img class="pp-obj" alt="" draggable="false" src="${esc(opts.imageUrl(o.src))}" style="left:${mm(o.x)};top:${mm(o.y)};width:${mm(o.w)};height:${mm(o.h)}${o.rot ? `;transform:rotate(${o.rot}deg)` : ""}${op}">`;
  }
  const sw = o.stroke === "none" ? 0 : o.lineWidth;
  if (o.shape === "line" || o.shape === "arrow") {          // 線は向きがあるので、紙全体の大きさの SVG に描く
    const [x1, y1, x2, y2] = lineEnds(o);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const hs = Math.max(2.4, o.lineWidth * 5), back = o.shape === "arrow" ? hs * 0.8 : 0;
    let h = `<svg class="pp-obj pp-line" style="left:0;top:0;width:100%;height:100%${op}" viewBox="0 0 ${opts.W} ${opts.H}">` +
      `<line x1="${x1}" y1="${y1}" x2="${x2 - ux * back}" y2="${y2 - uy * back}" stroke="${o.stroke === "none" ? "#333333" : o.stroke}" stroke-width="${o.lineWidth}" stroke-linecap="round"/>`;
    if (o.shape === "arrow") {
      const px = -uy, py = ux;
      h += `<polygon points="${x2},${y2} ${x2 - ux * hs + px * hs * 0.45},${y2 - uy * hs + py * hs * 0.45} ${x2 - ux * hs - px * hs * 0.45},${y2 - uy * hs - py * hs * 0.45}" fill="${o.stroke === "none" ? "#333333" : o.stroke}"/>`;
    }
    return `${h}</svg>`;
  }
  const w = o.w, hgt = o.h, r = o.shape === "round" ? Math.min(w, hgt) * 0.18 : 0;
  const fill = o.fill === "none" ? "none" : o.fill, stroke = o.stroke === "none" ? "none" : o.stroke;
  const shape = o.shape === "ellipse"
    ? `<ellipse cx="${w / 2}" cy="${hgt / 2}" rx="${Math.max(0, w / 2 - sw / 2)}" ry="${Math.max(0, hgt / 2 - sw / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`
    : `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(0, w - sw)}" height="${Math.max(0, hgt - sw)}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
  const pad = Math.min(2.5, Math.min(w, hgt) * 0.12) + (o.shape === "ellipse" ? Math.min(w, hgt) * 0.12 : 0);
  const text = o.text ? `<div class="pp-otext" style="padding:${mm(pad)};writing-mode:${o.vertical ? "vertical-rl" : "horizontal-tb"};justify-content:center;` +
    `text-align:${o.align};font-size:${mm(o.size * PT)};color:${o.color};font-family:${esc(fontStack(o.font || opts.font))}"><div>${richText(o.text, opts.ruby)}</div></div>` : "";
  return `<div class="pp-obj pp-shape" style="left:${mm(o.x)};top:${mm(o.y)};width:${mm(w)};height:${mm(hgt)}${o.rot ? `;transform:rotate(${o.rot}deg)` : ""}${op}">` +
    `<svg viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">${shape}</svg>${text}</div>`;
}

/** 1 ページを描く。opts: { theme, ruby, pageNo, total, showNumber, objects, imageUrl } */
export function renderPage(doc, g, page, opts) {
  const th = doc.paper ? { ...opts.theme, paper: doc.paper } : opts.theme;   // 台紙の色を自由に選んだとき
  const el = document.createElement("div");
  el.className = "pp-page";
  el.style.cssText = `width:${mm(g.W)};height:${mm(g.H)};background-color:${th.paper};color:${th.ink};` +
    `font-family:${fontStack(doc.text.font)};${th.texture ? `background-image:${FIBER};` : ""}`;
  const parts = [];
  // 罫線・マス目・絵の枠
  const lines = gridLines(g, doc);
  if (lines.length || g.picture) {
    let s = `<svg class="pp-grid" width="${mm(g.W)}" height="${mm(g.H)}" viewBox="0 0 ${g.W} ${g.H}" aria-hidden="true">`;
    for (const l of lines) {
      const w = l.kind === "frame" ? 0.35 : l.kind === "guide" ? 0.12 : 0.18;
      s += `<line x1="${+l.x1.toFixed(3)}" y1="${+l.y1.toFixed(3)}" x2="${+l.x2.toFixed(3)}" y2="${+l.y2.toFixed(3)}" stroke="${th.line}" stroke-width="${w}"${l.kind === "guide" ? ' stroke-dasharray="0.6 0.6"' : ""}/>`;
    }
    if (g.picture) {
      const p = g.picture;
      s += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="1.5" fill="none" stroke="${th.line}" stroke-width="0.35"/>`;
    }
    parts.push(`${s}</svg>`);
  }
  const objs = opts.objects || [], oo = { imageUrl: opts.imageUrl || ((x) => x), ruby: opts.ruby, font: doc.text.font, W: g.W, H: g.H };
  for (const o of objs) if (o.behind) parts.push(objectHtml(o, oo));        // 背面: 文字の下
  // 文字
  const wm = g.vertical ? "vertical-rl" : "horizontal-tb";
  for (const line of page.lines) {
    const font = g.font * line.scale;
    for (let k = 0; k < line.units.length;) {
      const u = line.units[k];
      // 続いた半角（英単語・数字）は 1 つにまとめて、字の幅のまま並べる（1 字ずつ枠の中央に置くと間が空いて見える）
      let n = 1;
      if (u.w < 1) while (k + n < line.units.length && line.units[k + n].w < 1 && line.units[k + n].b === u.b && line.units[k + n].i === u.i &&
        Math.abs(line.pos[k + n] - line.pos[k + n - 1] - line.units[k + n - 1].w) < 1e-6) n++;
      const b = glyphBox(g, line, k), e = glyphBox(g, line, k + n - 1);
      const w = g.vertical ? b.w : e.x + e.w - b.x, h = g.vertical ? e.y + e.h - b.y : b.h;
      const st = `left:${mm(b.x)};top:${mm(b.y)};width:${mm(w)};height:${mm(h)};font-size:${mm(font)};line-height:${mm(font)};writing-mode:${wm}` +
        `${u.b ? ";font-weight:700" : ""}${u.i && !g.vertical ? ";font-style:italic" : ""}${u.w < 1 ? ";text-align:start" : ""}`;
      parts.push(`<span class="pp-ch" style="${st}">${esc(line.units.slice(k, k + n).map((x) => x.c).join(""))}</span>`);
      k += n;
    }
    if (opts.ruby) {                                          // ルビ: 親文字の範囲に均等に置く
      for (let k = 0; k < line.units.length;) {
        const rid = line.units[k].rid;
        let n = 1;
        if (rid < 0) { k++; continue; }
        while (k + n < line.units.length && line.units[k + n].rid === rid) n++;
        const rb = rubyBox(g, line, k, k + n - 1);
        const chars = Array.from(line.rubies[rid].r);
        const fits = chars.length * rb.font < (g.vertical ? rb.h : rb.w);
        const st = `left:${mm(rb.x)};top:${mm(rb.y)};width:${mm(rb.w)};height:${mm(rb.h)};font-size:${mm(rb.font)};line-height:${mm(rb.font)};writing-mode:${wm};justify-content:${fits ? "space-around" : "center"}`;
        parts.push(`<span class="pp-ruby" style="${st}">${chars.map((c) => `<i>${esc(c)}</i>`).join("")}</span>`);
        k += n;
      }
    }
  }
  for (const o of objs) if (!o.behind) parts.push(objectHtml(o, oo));       // 前面: 文字の上
  if (opts.showNumber) {
    const y = g.H - doc.page.margin[2] / 2;
    parts.push(`<span class="pp-no" style="top:${mm(y - 1.6)};font-size:${mm(3)}">${opts.pageNo}</span>`);
  }
  el.innerHTML = parts.join("");
  return el;
}
