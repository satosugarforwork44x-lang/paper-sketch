// paper/ui/objects.js — 紙の上に置く物（絵・図形・文字ボックス）を、プレビューの上で選ぶ・動かす・大きさを変える・設定する。
// ・データは doc.objects（寸法は mm、紙の左上から。page は 1 から）。描くのは render.js の objectHtml（印刷と同じ）
// ・ここは操作だけ。保存・元に戻すは panel.js から受け取った snap / changed を呼ぶ
import { lineEnds } from "./render.js";

const isLine = (o) => o.kind === "shape" && (o.shape === "line" || o.shape === "arrow");
export const IMAGE_EXT = /\.(png|jpe?g|jfif|gif|webp|bmp)$/i;

/** 点 (px, py) が置く物に当たるか（mm）。回転している物は、物の向きに戻して調べる */
export function hit(o, px, py, tol = 1.5) {
  if (isLine(o)) {
    const [x1, y1, x2, y2] = lineEnds(o);
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)) <= Math.max(tol, o.lineWidth);
  }
  let x = px, y = py;
  if (o.rot) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, a = (-o.rot * Math.PI) / 180;
    x = cx + (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a);
    y = cy + (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a);
  }
  return x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
}

/** 物の上で一番手前にある物（前面 → 背面の順に、後ろに足した物ほど手前） */
export function topmost(objs, px, py, tol) {
  const order = [...objs.filter((o) => !o.behind).reverse(), ...objs.filter((o) => o.behind).reverse()];
  return order.find((o) => hit(o, px, py, tol)) || null;
}

/**
 * P: { ctx, L, view, frames, getDoc, getLaid, snap, changed, repaint(k), imageUrl(src), row, insertRow, svg, icons }
 * 返り値: { decorate(frame), sync(), insert(kind), insertImages(srcs), handleKey(e), handlePaste(e), dropPaths(paths), deselect() }
 */
export function attachObjects(P) {
  const { L } = P;
  let sel = null;            // 選んでいる物の id
  let drag = null;
  let pending = 0;

  const doc = () => P.getDoc();
  const objOf = (id) => doc()?.objects.find((o) => o.id === id) || null;
  const pageCount = () => P.getLaid()?.pages.length || 1;
  const pageOf = (o) => Math.min(o.page, pageCount()) - 1;
  const objsOn = (k) => (doc()?.objects || []).filter((o) => pageOf(o) === k);
  const sheetOf = (k) => P.frames[k]?.querySelector(".pp-sheet");
  const pxPerMm = (k) => { const s = sheetOf(k); return s ? s.getBoundingClientRect().width / P.getLaid().g.W : 1; };
  const toMm = (k, e) => { const r = sheetOf(k).getBoundingClientRect(), s = r.width / P.getLaid().g.W; return [(e.clientX - r.left) / s, (e.clientY - r.top) / s]; };
  const newId = () => { const ids = new Set(doc().objects.map((o) => o.id)); let n = doc().objects.length + 1; while (ids.has(`o${n}`)) n++; return `o${n}`; };

  // ---------- 選んでいる物の枠とつまみ ----------
  function handles(o) {
    if (isLine(o)) { const [x1, y1, x2, y2] = lineEnds(o); return [[x1, y1], [x2, y2]]; }
    return [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]];
  }
  function decorate(frame) {
    frame.querySelector(".pp-selbox")?.remove();
    const o = objOf(sel);
    const k = P.frames.indexOf(frame);
    if (!o || pageOf(o) !== k || !frame.querySelector(".pp-page")) return;
    const s = pxPerMm(k);
    const box = document.createElement("div");
    box.className = "pp-selbox";
    if (isLine(o)) box.classList.add("line");
    else {
      box.style.cssText = `left:${o.x * s}px;top:${o.y * s}px;width:${o.w * s}px;height:${o.h * s}px;${o.rot ? `transform:rotate(${o.rot}deg)` : ""}`;
    }
    const hs = handles(o);
    hs.forEach(([x, y], i) => {
      const h = document.createElement("span");
      h.className = "pp-handle";
      if (isLine(o)) h.style.cssText = `left:${x * s}px;top:${y * s}px`;
      else h.style.cssText = `left:${(x - o.x) * s}px;top:${(y - o.y) * s}px`;
      h.dataset.h = i;
      box.append(h);
    });
    frame.querySelector(".pp-sheet").append(box);
  }
  const redrawSel = () => P.frames.forEach(decorate);

  function select(id) {
    sel = id;
    redrawSel();
    buildProps();
  }
  function deselect() { if (sel) select(null); }

  // ---------- プレビューの上の操作 ----------
  P.view.addEventListener("pointerdown", (e) => {
    const sheet = e.target.closest?.(".pp-sheet");
    if (e.button !== 0 || !doc()) return;
    if (!sheet) { if (e.target === P.view || e.target.closest?.(".pp-pages")) deselect(); return; }   // 紙の外をクリック
    const k = P.frames.findIndex((f) => f.contains(sheet));
    const [mx, my] = toMm(k, e);
    const s = pxPerMm(k), tol = 7 / s;
    const cur = objOf(sel);
    let mode = null, target = null, hIdx = -1;
    if (cur && pageOf(cur) === k) {
      hIdx = handles(cur).findIndex(([x, y]) => Math.hypot(x - mx, y - my) <= tol * 1.2);
      if (hIdx >= 0) { mode = isLine(cur) ? "end" : "resize"; target = cur; }
    }
    if (!target) { target = topmost(objsOn(k), mx, my, tol); mode = target ? "move" : null; }
    if (!target) { deselect(); return; }
    e.preventDefault();
    P.view.focus({ preventScroll: true });
    if (sel !== target.id) select(target.id);
    drag = { mode, id: target.id, k, h: hIdx, x0: mx, y0: my, o0: { ...target }, moved: false, shift: e.shiftKey };
    P.view.setPointerCapture(e.pointerId);
  });
  P.view.addEventListener("pointermove", (e) => {
    if (!drag) {                                          // 物の上ではカーソルを変える
      const sheet = e.target.closest?.(".pp-sheet");
      if (!sheet || !doc()) return;
      const k = P.frames.findIndex((f) => f.contains(sheet));
      if (k < 0 || !P.getLaid()) return;
      const [mx, my] = toMm(k, e);
      sheet.style.cursor = e.target.classList?.contains("pp-handle") ? "nwse-resize" : topmost(objsOn(k), mx, my, 4 / pxPerMm(k)) ? "move" : "";
      return;
    }
    const o = objOf(drag.id);
    if (!o) return;
    const [mx, my] = toMm(drag.k, e);
    const dx = mx - drag.x0, dy = my - drag.y0, a = drag.o0;
    if (!drag.moved) { if (Math.hypot(dx, dy) * pxPerMm(drag.k) < 3) return; drag.moved = true; P.snap("set"); }
    const r = (v) => Math.round(v * 10) / 10;
    if (drag.mode === "move") { o.x = r(a.x + dx); o.y = r(a.y + dy); }
    else if (drag.mode === "end") {
      if (drag.h === 0) { o.x = r(mx); o.y = r(my); o.w = r(a.x + a.w - mx); o.h = r(a.y + a.h - my); }
      else { o.w = r(mx - a.x); o.h = r(my - a.y); }
    } else {                                              // 角のつまみ: 向かいの角を止めて大きさを変える（絵は縦横比をそのまま。Shift で自由）
      const fx = drag.h === 0 || drag.h === 3 ? a.x + a.w : a.x, fy = drag.h < 2 ? a.y + a.h : a.y;
      let w = Math.max(3, Math.abs(mx - fx)), h = Math.max(3, Math.abs(my - fy));
      if ((o.kind === "image") !== e.shiftKey) { const ar = a.w / a.h; if (w / h > ar) h = w / ar; else w = h * ar; }
      o.w = r(w); o.h = r(h);
      o.x = r(mx < fx ? fx - w : fx); o.y = r(my < fy ? fy - h : fy);
    }
    if (!pending) pending = requestAnimationFrame(() => { pending = 0; P.repaint(drag ? drag.k : pageOf(o)); });
  });
  const end = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) { P.changed(); buildProps(); }
  };
  P.view.addEventListener("pointerup", end);
  P.view.addEventListener("pointercancel", end);
  P.view.addEventListener("dblclick", (e) => {
    const o = objOf(sel);
    if (o?.kind === "shape" && !isLine(o) && e.target.closest?.(".pp-sheet")) P.row.querySelector("textarea")?.focus();
  });

  // ---------- 足す ----------
  function currentPage() {                                // 画面の真ん中に一番近いページ
    const vr = P.view.getBoundingClientRect(), cy = vr.top + vr.height / 2;
    let best = 0, bd = Infinity;
    P.frames.forEach((f, k) => { const r = f.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - cy); if (d < bd) { bd = d; best = k; } });
    return best;
  }
  function add(o) {
    const d = doc(), g = P.getLaid().g;
    const k = currentPage();
    P.snap("set");
    const obj = { page: k + 1, rot: 0, opacity: 1, behind: false, ...o, id: newId() };
    if (obj.x === undefined) { obj.x = Math.round((g.W - obj.w) / 2); obj.y = Math.round((g.H - obj.h) / 2); }
    while (d.objects.some((x) => x.page === obj.page && Math.abs(x.x - obj.x) < 1 && Math.abs(x.y - obj.y) < 1)) { obj.x += 6; obj.y += 6; }  // 重ならないように少しずらす
    d.objects.push(obj);
    sel = obj.id;
    P.changed();
    buildProps();
    return obj;
  }
  function insert(kind) {
    const v = doc().page.vertical;
    const base = { kind: "shape", stroke: "#333333", fill: "none", lineWidth: 0.4, text: "", size: 12, color: "#222222", vertical: v, align: "center", font: "" };
    if (kind === "text") add({ ...base, shape: "rect", stroke: "none", text: L.obj.textDefault, size: 14, w: v ? 16 : 60, h: v ? 60 : 16 });
    else if (kind === "line" || kind === "arrow") {
      const g = P.getLaid().g;
      add({ ...base, shape: kind, x: Math.round(g.W / 2 - 25), y: Math.round(g.H / 2), w: 50, h: 0.01, stroke: kind === "arrow" ? "#d23c3c" : "#333333", lineWidth: 0.6 });
    } else add({ ...base, shape: kind, w: kind === "ellipse" ? 40 : 50, h: kind === "ellipse" ? 40 : 30 });
    if (kind === "text") requestAnimationFrame(() => { const t = P.row.querySelector("textarea"); t?.focus(); t?.select(); });
  }
  async function insertImages(srcs) {
    const g = P.getLaid().g;
    for (const src of srcs) {
      const size = await new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([1, 1]); im.src = P.imageUrl(src); });
      const ar = size[0] / size[1] || 1, maxW = g.area.w * 0.6, maxH = g.area.h * 0.45;
      let w = maxW, h = w / ar;
      if (h > maxH) { h = maxH; w = h * ar; }
      add({ kind: "image", src, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 });
    }
  }
  async function pickImages() {
    const paths = await P.ctx.host.pickFiles(P.ctx.id).catch(() => null);
    if (paths?.length) await dropPaths(paths);
  }
  /** ファイルが落とされた: 絵だけなら取り込んで置く（true を返す）。それ以外は panel が文書として開く */
  async function dropPaths(paths) {
    if (!doc() || !paths.every((p) => IMAGE_EXT.test(p))) return false;
    try {
      const r = await P.ctx.call("add_image_files", { paths });
      if (r.skipped.length) P.ctx.toast(L.skipped(r.skipped.join(", ")), "error", 6000);
      await insertImages(r.made);
    } catch (e) { P.ctx.toast(e.message, "error"); }
    return true;
  }
  /** 貼り付けに絵が入っていれば、取り込んで置く */
  async function handlePaste(e) {
    if (!doc()) return false;
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
    if (!file) return false;
    e.preventDefault();
    e.stopPropagation();
    try { const r = await P.ctx.upload("save_image", file); await insertImages([r.src]); }
    catch (err) { P.ctx.toast(err.message, "error"); }
    return true;
  }

  // ---------- 設定の段 ----------
  function update(fn, kind = "set") {
    const o = objOf(sel);
    if (!o) return;
    P.snap(kind);
    fn(o);
    P.changed();
    P.repaint(pageOf(o));
  }
  function remove() {
    const o = objOf(sel);
    if (!o) return;
    P.snap("set");
    doc().objects = doc().objects.filter((x) => x !== o);
    sel = null;
    P.changed();
    buildProps();
  }
  function duplicate() {
    const o = objOf(sel);
    if (!o) return;
    add({ ...structuredClone(o), id: undefined, x: o.x + 5, y: o.y + 5, page: o.page });
  }
  function reorder(dir) {
    const list = doc().objects, i = list.findIndex((x) => x.id === sel), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    P.snap("set");
    [list[i], list[j]] = [list[j], list[i]];
    P.changed();
  }

  const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
  function btn(label, onClick, title = "") {
    const b = el("button", "btn pp-obtn", label);
    b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }
  function color(label, value, onChange, allowNone = false) {
    const w = el("label", "pp-color");
    w.append(el("span", "", label));
    const inp = el("input");
    inp.type = "color";
    inp.value = value === "none" ? "#ffffff" : value;
    inp.disabled = value === "none";
    inp.addEventListener("input", () => onChange(inp.value, "type"));
    w.append(inp);
    if (allowNone) {
      const c = el("input");
      c.type = "checkbox";
      c.checked = value === "none";
      c.title = L.obj.none;
      c.addEventListener("change", () => { inp.disabled = c.checked; onChange(c.checked ? "none" : inp.value, "set"); });
      const lab = el("span", "pp-none", L.obj.none);
      w.append(c, lab);
    }
    return w;
  }
  function num(label, value, min, max, step, unit, onChange) {
    const w = el("label", "pp-num");
    w.append(el("span", "", label));
    const inp = el("input");
    Object.assign(inp, { type: "number", min, max, step, value });
    inp.style.width = "58px";
    inp.addEventListener("change", () => { const v = Math.min(max, Math.max(min, parseFloat(inp.value))); if (Number.isFinite(v)) onChange(v); });
    w.append(inp, el("em", "", unit));
    return w;
  }
  function check(label, value, onChange) {
    const w = el("label", "pp-check");
    const c = el("input");
    c.type = "checkbox";
    c.checked = value;
    c.addEventListener("change", () => onChange(c.checked));
    w.append(c, el("span", "", label));
    return w;
  }
  function seg(options, value, onChange) {
    const box = el("div", "seg seg-sm pp-seg");
    for (const [v, label, icon] of options) {
      const b = el("button");
      b.type = "button";
      b.innerHTML = icon || "";
      if (!icon) b.textContent = label;
      b.title = label;
      b.setAttribute("aria-label", label);
      b.setAttribute("aria-pressed", String(v === value));
      b.addEventListener("click", () => onChange(v));
      box.append(b);
    }
    return box;
  }

  function buildProps() {
    const o = objOf(sel);
    P.row.hidden = !o;
    redrawSel();
    if (!o) { P.row.replaceChildren(); return; }
    const items = [el("b", "pp-otitle", o.kind === "image" ? L.obj.image : isLine(o) ? L.obj.line : L.obj.shape)];
    if (o.kind === "shape") {
      items.push(seg(["rect", "round", "ellipse", "line", "arrow"].map((s) => [s, L.obj.shapes[s], P.icons[s]]), o.shape, (v) => {
        update((x) => {
          const wasLine = isLine(x);
          x.shape = v;
          if (wasLine !== isLine(x)) {                      // 線 ↔ 箱: 大きさを作り直す
            if (isLine(x)) { x.y += x.h / 2; x.h = 0.01; x.w = Math.max(10, Math.abs(x.w)); }
            else { x.x = Math.min(x.x, x.x + x.w); x.w = Math.max(10, Math.abs(x.w)); x.h = Math.max(10, x.w * 0.6); x.y -= x.h / 2; }
          }
        });
        buildProps();
      }));
      items.push(color(L.obj.stroke, o.stroke, (v, k) => update((x) => { x.stroke = v; }, k), !isLine(o)),
        num(L.obj.lineWidth, o.lineWidth, 0.1, 5, 0.1, "mm", (v) => update((x) => { x.lineWidth = v; })));
      if (!isLine(o)) {
        items.push(color(L.obj.fill, o.fill, (v, k) => update((x) => { x.fill = v; }, k), true));
        const ta = el("textarea", "pp-otextarea");
        ta.rows = 1;
        ta.value = o.text;
        ta.placeholder = L.obj.textPh;
        const fit = () => { ta.style.height = "auto"; ta.style.height = `${Math.min(80, ta.scrollHeight)}px`; };
        ta.addEventListener("input", () => { update((x) => { x.text = ta.value; }, "type"); fit(); });
        requestAnimationFrame(fit);
        const tw = el("label", "pp-field pp-ofield");
        tw.append(el("span", "", L.obj.text), ta);
        items.push(tw,
          num(L.obj.size, o.size, 5, 120, 0.5, "pt", (v) => update((x) => { x.size = v; })),
          color(L.obj.color, o.color, (v, k) => update((x) => { x.color = v; }, k)),
          check(L.obj.vertical, o.vertical, (v) => update((x) => { x.vertical = v; })),
          seg(["start", "center", "end"].map((a) => [a, (o.vertical ? L.alignV : L.align)[a], P.icons[(o.vertical ? "v" : "") + a]]), o.align, (v) => { update((x) => { x.align = v; }); buildProps(); }));
      }
    } else {
      items.push(num(L.obj.opacity, Math.round(o.opacity * 100), 5, 100, 5, "%", (v) => update((x) => { x.opacity = v / 100; })));
    }
    if (!isLine(o)) items.push(num(L.obj.rot, o.rot, -180, 180, 1, "°", (v) => update((x) => { x.rot = v; })));
    items.push(check(L.obj.behind, o.behind, (v) => update((x) => { x.behind = v; })),
      btn(L.obj.forward, () => reorder(1), L.obj.forwardTip), btn(L.obj.backward, () => reorder(-1), L.obj.backwardTip),
      btn(L.obj.dup, duplicate, "Ctrl+D"), btn(L.obj.del, remove, "Delete"));
    P.row.replaceChildren(...items);
  }

  function buildInsert() {
    const b = (icon, label, fn) => {
      const x = el("button", "icon-btn pp-ib");
      x.type = "button";
      x.innerHTML = icon;
      x.title = label;
      x.setAttribute("aria-label", label);
      x.addEventListener("mousedown", (e) => e.preventDefault());
      x.addEventListener("click", fn);
      return x;
    };
    P.insertRow.replaceChildren(el("span", "pp-ilab", L.obj.insert),
      b(P.icons.image, L.obj.addImage, pickImages), b(P.icons.textbox, L.obj.addText, () => insert("text")),
      b(P.icons.rect, L.obj.shapes.rect, () => insert("rect")), b(P.icons.round, L.obj.shapes.round, () => insert("round")),
      b(P.icons.ellipse, L.obj.shapes.ellipse, () => insert("ellipse")), b(P.icons.line, L.obj.shapes.line, () => insert("line")),
      b(P.icons.arrow, L.obj.shapes.arrow, () => insert("arrow")), el("span", "pp-ihint", L.obj.hint));
  }

  /** プレビューにフォーカスがあるときのキー（Delete・矢印・Ctrl+D・Esc）。使ったら true */
  function handleKey(e) {
    const o = objOf(sel);
    if (!o) return false;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Delete" || e.key === "Backspace") { remove(); return true; }
    if (e.key === "Escape") { deselect(); return true; }
    if (mod && e.key.toLowerCase() === "d") { duplicate(); return true; }
    const step = e.shiftKey ? 5 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { update((x) => { x.x += mv[0]; x.y += mv[1]; }, "nudge"); return true; }
    return false;
  }

  /** 文書を開き直した・元に戻したとき */
  function sync() {
    if (sel && !objOf(sel)) sel = null;
    buildInsert();
    buildProps();
  }

  return { decorate, sync, insert, insertImages, handleKey, handlePaste, dropPaths, deselect, objsOn };
}
