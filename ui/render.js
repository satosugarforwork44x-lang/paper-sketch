// paper/ui/render.js — 組んだページを DOM にする（寸法はすべて mm）。画面のプレビューと印刷で同じ関数を使う。
import { glyphBox, gridLines, rubyBox } from "./layout.js";

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

/** 1 ページを描く。opts: { theme, ruby, pageNo, total, showNumber } */
export function renderPage(doc, g, page, opts) {
  const th = opts.theme;
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
  if (opts.showNumber) {
    const y = g.H - doc.page.margin[2] / 2;
    parts.push(`<span class="pp-no" style="top:${mm(y - 1.6)};font-size:${mm(3)}">${opts.pageNo}</span>`);
  }
  el.innerHTML = parts.join("");
  return el;
}
