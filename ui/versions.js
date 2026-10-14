// paper/ui/versions.js — 版（作品の保護）。残した版の一覧と、今の文書（または 1 つ前の版）との違い、戻す・消す。
// ・版は api.py が「Paper Sketch\_versions\<名前>」に残す。ここは見る・選ぶ・戻すだけ
// ・自動で残す時（10 分ごと・開いた時・AI の前後・外で書き換えられる前後）は panel.js が snapshot を呼ぶ
import { diffBodies, diffStats } from "./diff.js";

/** P: { ctx, L, getName, getDoc, flush, reload() } */
export function attachVersions(P) {
  const V = P.L.versions;
  const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
  const when = (t) => new Date(t * 1000).toLocaleString(document.documentElement.lang || undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  /** 版を残す（失敗しても書く作業は止めない） */
  async function snap(reason, label = "", doc = null) {
    const name = P.getName();
    if (!name) return null;
    try { return await P.ctx.call("snapshot", { name, reason, label, ...(doc ? { doc } : {}) }); }
    catch (e) { console.warn("snapshot", e); return null; }
  }

  async function open() {
    const name = P.getName();
    if (!name) return;
    await P.flush();
    let list = [], sel = null, mode = "now", cache = new Map();
    const dlg = el("div", "pp-dlg");
    dlg.innerHTML = `<div class="pp-dlg-box pp-vbox" role="dialog" aria-modal="true">
      <div class="pp-vhead"><h3></h3><p class="note"></p><button class="icon-btn pp-ib close">×</button></div>
      <div class="pp-vkeep"><input type="text" maxlength="80"><button class="btn primary keep"></button></div>
      <div class="pp-vbody"><ul class="pp-vlist"></ul><div class="pp-vmain">
        <div class="pp-vbar"><div class="seg seg-sm pp-seg cmp"></div><span class="pp-vstat"></span><span class="sp"></span><button class="btn del"></button><button class="btn primary back"></button></div>
        <div class="pp-vdiff"></div></div></div></div>`;
    const q = (s) => dlg.querySelector(s);
    q("h3").textContent = V.title;
    q(".note").textContent = V.note;
    q(".pp-vkeep input").placeholder = V.labelPh;
    q(".keep").textContent = V.keep;
    q(".del").textContent = V.del;
    q(".back").textContent = V.restore;
    q(".close").title = P.L.cancel;
    const cmp = q(".cmp");
    for (const [v, label] of [["now", V.cmpNow], ["prev", V.cmpPrev]]) {
      const b = el("button", "", label);
      b.type = "button";
      b.dataset.v = v;
      b.addEventListener("click", () => { mode = v; draw(); });
      cmp.append(b);
    }
    const close = () => { dlg.remove(); document.removeEventListener("keydown", onKey, true); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true);
    q(".close").addEventListener("click", close);
    dlg.addEventListener("pointerdown", (e) => { if (e.target === dlg) close(); });

    async function body(id) {
      if (!cache.has(id)) cache.set(id, (await P.ctx.call("version_doc", { name, vid: id })).doc.body);
      return cache.get(id);
    }
    async function load() {
      list = await P.ctx.call("versions", { name });
      if (!list.some((v) => v.id === sel)) sel = list[0]?.id || null;
      const ul = q(".pp-vlist");
      ul.replaceChildren();
      if (!list.length) ul.append(el("li", "pp-tnone", V.empty));
      for (const v of list) {
        const li = el("li", `pp-vitem r-${v.reason}`);
        const b = el("button");
        b.type = "button";
        b.setAttribute("aria-pressed", String(v.id === sel));
        b.append(el("span", "t", when(v.time)), el("span", "r", V.reasons[v.reason] || v.reason), el("span", "c", V.chars(v.chars)));
        if (v.label) b.append(el("span", "l", v.label));
        b.addEventListener("click", () => { sel = v.id; ul.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw(); });
        li.append(b);
        ul.append(li);
      }
      await draw();
    }
    async function draw() {
      cmp.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === mode)));
      const box = q(".pp-vdiff");
      const i = list.findIndex((v) => v.id === sel);
      q(".del").disabled = q(".back").disabled = i < 0;
      if (i < 0) { box.replaceChildren(); q(".pp-vstat").textContent = ""; return; }
      let oldB, newB, oldName, newName;
      if (mode === "now") { oldB = await body(sel); newB = P.getDoc().body; oldName = when(list[i].time); newName = V.now; }
      else {
        const prev = list[i + 1];
        newB = await body(sel); newName = when(list[i].time);
        oldB = prev ? await body(prev.id) : ""; oldName = prev ? when(prev.time) : V.none;
      }
      const rows = diffBodies(oldB, newB);
      const st = diffStats(rows);
      q(".pp-vstat").textContent = `${oldName} → ${newName} ・ ${V.stat(st)}`;
      box.replaceChildren(...renderRows(rows));
    }
    function renderRows(rows) {
      const out = [];
      if (!rows.some((r) => r.type !== "same")) { out.push(el("p", "pp-tnone", V.same)); return out; }
      for (let k = 0; k < rows.length; k++) {
        const r = rows[k];
        if (r.type === "same") {                            // 同じ段落は、違いの前後 1 つだけ見せる
          let n = 0;
          while (k + n < rows.length && rows[k + n].type === "same") n++;
          const showHead = k > 0, showTail = k + n < rows.length;
          const keep = [];
          if (showHead) keep.push(rows[k]);
          if (n > (showHead ? 1 : 0) + (showTail ? 1 : 0)) keep.push(null);
          if (showTail && (n > 1 || !showHead)) keep.push(rows[k + n - 1]);
          for (const x of keep) out.push(x ? el("p", "pp-dsame", x.old || "　") : el("p", "pp-dskip", V.skip));
          k += n - 1;
          continue;
        }
        const p = el("p", `pp-d${r.type}`);
        if (r.type === "chg") for (const part of r.parts) p.append(part.op === "=" ? document.createTextNode(part.text) : el(part.op === "+" ? "ins" : "del", "", part.text));
        else p.textContent = (r.type === "add" ? r.new : r.old) || "　";
        out.push(p);
      }
      return out;
    }

    q(".keep").addEventListener("click", async () => {
      const label = q(".pp-vkeep input").value.trim();
      await P.flush();
      const r = await snap("manual", label);
      if (r?.skipped) P.ctx.toast(V.sameAsLast);
      q(".pp-vkeep input").value = "";
      sel = null;
      await load();
    });
    q(".del").addEventListener("click", async () => {
      if (!sel) return;
      await P.ctx.call("delete_version", { name, vid: sel }).catch((e) => P.ctx.toast(e.message, "error"));
      sel = null;
      await load();
    });
    q(".back").addEventListener("click", async () => {
      if (!sel) return;
      try {
        await P.flush();
        await P.ctx.call("restore_version", { name, vid: sel });
        close();
        await P.reload();
        P.ctx.toast(V.restored);
      } catch (e) { P.ctx.toast(e.message, "error"); }
    });
    document.body.append(dlg);
    await load();
  }

  return { open, snap };
}
