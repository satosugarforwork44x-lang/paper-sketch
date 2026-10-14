// paper/ui/terms.js — 作品の用語集（登場人物・地名・用語・独自の読み）。打ち込み欄の右の一覧。
// ・用語集は作品ごとに 1 つ（<作品名>.dict.json）。章ごとの文書は doc.work で作品を指す
// ・クリックで表記をカーソルの位置に入れる。ルビは組版が付ける（毎回 / 初出だけ / 付けない）
// ・本文で字を選んで右クリック →「用語集に入れる」
import { selectBox } from "/ui/js/hub.js";
import { termCounts } from "./markup.js";

const KINDS = ["person", "place", "term", "reading"];
const RULES = ["always", "first", "none"];

/**
 * P: { ctx, L, aside, editor, getDoc, getDict, setDict(dict), setWork(work), restoreRange(), icons, store }
 * 返り値: { render(), counts(), addFromSelection() }
 */
export function attachTerms(P) {
  const { L } = P;
  const T = L.terms;
  let filter = P.store.get("termFilter", "all"), query = "";
  const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };

  async function saveTerms(terms) {
    const d = P.getDict();
    try {
      const r = await P.ctx.call("save_dict", { work: d.work, terms });
      if (r.warnings?.length) P.ctx.toast(r.warnings[0], "info", 5000);
      P.setDict({ work: r.work, terms: r.terms, mtime: r.mtime });
    } catch (e) { P.ctx.toast(e.message, "error"); }
  }

  /** 用語を足す・直す窓。返り値: 用語 / false（消す）/ null（やめる） */
  function termDialog(t, isNew) {
    return new Promise((resolve) => {
      const v = { base: "", reading: "", kind: "person", rule: "first", part: false, note: "", ...t };
      let ruleTouched = !isNew;
      const dlg = el("div", "pp-dlg");
      dlg.innerHTML = `<div class="pp-dlg-box pp-tdlg" role="dialog" aria-modal="true"><h3></h3>
        <label class="pp-tf"><span></span><input name="base" type="text" maxlength="40"></label>
        <label class="pp-tf"><span></span><input name="reading" type="text" maxlength="60"></label>
        <div class="pp-tf"><span></span><div class="seg seg-sm pp-seg kinds"></div></div>
        <div class="pp-tf"><span></span><div class="seg seg-sm pp-seg rules"></div></div>
        <p class="note rnote"></p>
        <label class="pp-check"><input name="part" type="checkbox"><span></span></label>
        <label class="pp-tf"><span></span><input name="note" type="text" maxlength="200"></label>
        <div class="btn-row"><button class="btn del"></button><span class="sp"></span><button class="btn cancel"></button><button class="btn primary go"></button></div></div>`;
      const q = (s) => dlg.querySelector(s);
      q("h3").textContent = isNew ? T.add : T.edit;
      const labels = dlg.querySelectorAll(".pp-tf > span");
      [T.base, T.reading, T.kind, T.rule, T.note].forEach((s, i) => { labels[i].textContent = s; });
      q("[name=base]").value = v.base;
      q("[name=reading]").value = v.reading;
      q("[name=note]").value = v.note;
      q("[name=reading]").placeholder = T.readingPh;
      q("[name=part]").checked = v.part;
      q("[name=part] + span").textContent = T.part;
      const seg = (box, list, names, key, after) => {
        const draw = () => box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v[key])));
        for (const x of list) {
          const b = el("button", "", names[x]);
          b.type = "button";
          b.dataset.v = x;
          b.addEventListener("click", () => { v[key] = x; after?.(x); draw(); drawNote(); });
          box.append(b);
        }
        draw();
        return draw;
      };
      const drawNote = () => { q(".rnote").textContent = T.ruleNote[v.rule]; };
      const drawRules = seg(q(".rules"), RULES, T.rules, "rule", () => { ruleTouched = true; });
      seg(q(".kinds"), KINDS, T.kinds, "kind", (k) => { if (!ruleTouched) { v.rule = k === "reading" ? "always" : "first"; drawRules(); } });
      drawNote();
      const del = q(".del");
      if (isNew) del.remove(); else { del.textContent = T.del; del.addEventListener("click", () => done(false)); }
      q(".cancel").textContent = L.cancel;
      q(".go").textContent = L.ok;
      const done = (r) => { dlg.remove(); resolve(r); };
      const ok = () => {
        const base = q("[name=base]").value.replace(/[｜《》\\*\n]/g, "").trim();
        if (!base) { q("[name=base]").focus(); return; }
        done({ ...v, base, reading: q("[name=reading]").value.replace(/[｜《》\\*\n]/g, "").trim(), part: q("[name=part]").checked, note: q("[name=note]").value });
      };
      q(".cancel").addEventListener("click", () => done(null));
      q(".go").addEventListener("click", ok);
      dlg.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.stopPropagation(); done(null); }
        if (e.key === "Enter" && !e.isComposing && e.target.tagName === "INPUT") { e.preventDefault(); ok(); }
      });
      dlg.addEventListener("pointerdown", (e) => { if (e.target === dlg) done(null); });
      document.body.append(dlg);
      (v.base ? q("[name=reading]") : q("[name=base]")).focus();
    });
  }

  async function add(base = "") {
    const d = P.getDict();
    if (!d) { P.ctx.toast(T.needWork, "info"); return; }
    const exist = d.terms.find((t) => t.base === base);
    const r = await termDialog(exist || { base }, !exist);
    P.editor.focus();
    if (!r) { if (r === false && exist) await saveTerms(d.terms.filter((t) => t !== exist)); return; }
    const list = d.terms.filter((t) => t.base !== r.base && t !== exist);
    if (exist) list.splice(d.terms.indexOf(exist), 0, r); else list.push(r);
    await saveTerms(list);
  }
  async function edit(t) {
    const d = P.getDict();
    const r = await termDialog(t, false);
    if (r === null) return;
    const list = d.terms.slice();
    const i = list.indexOf(t);
    if (r === false) list.splice(i, 1);
    else { const j = list.findIndex((x) => x.base === r.base); if (j >= 0 && j !== i) list.splice(j, 1); list[list.indexOf(t)] = r; }
    await saveTerms(list);
  }

  async function remove(t) {
    if (!(await P.confirm(T.delAsk(t.base)))) return;
    const d = P.getDict();
    await saveTerms(d.terms.filter((x) => x.base !== t.base));
  }

  function insert(t) {
    P.restoreRange();
    document.execCommand("insertText", false, t.base);
  }

  /** 本文で選んでいる字を用語集に入れる（右クリックのメニューから） */
  function addFromSelection() {
    const s = getSelection();
    const text = s?.rangeCount && P.editor.contains(s.getRangeAt(0).startContainer) ? s.toString().replace(/\s+/g, "").slice(0, 40) : "";
    add(text);
  }

  async function chooseWork(v) {
    if (v === "__new") {
      const n = await P.prompt(T.newWork, P.getDoc().work || "");
      if (!n) { render(); return; }
      try { await P.ctx.call("create_work", { work: n.trim() }); }
      catch (e) { if (!/同じ名前|already/.test(e.message)) { P.ctx.toast(e.message, "error"); render(); return; } }
      v = n.trim();
    }
    await P.setWork(v === "__none" ? "" : v);
  }
  async function renameWork() {
    const d = P.getDict();
    const n = await P.prompt(T.renameWork, d.work);
    if (!n || n.trim() === d.work) return;
    try {
      const r = await P.ctx.call("rename_work", { work: d.work, new_work: n.trim() });
      await P.afterRenameWork(r.work);
      P.ctx.toast(T.renamed(r.docs));
    } catch (e) { P.ctx.toast(e.message, "error"); }
  }

  // ---------- 一覧 ----------
  let countsCache = null;
  function counts() {
    const d = P.getDict(), doc = P.getDoc();
    if (!d || !doc) return new Map();
    const key = `${doc.body.length}|${d.mtime}`;
    if (countsCache?.key !== key || countsCache.body !== doc.body) countsCache = { key, body: doc.body, map: termCounts(doc.body, d.terms) };
    return countsCache.map;
  }

  function render() {
    const doc = P.getDoc(), d = P.getDict();
    const a = P.aside;
    if (!doc) { a.replaceChildren(); return; }
    const head = el("div", "pp-th");
    const works = P.works();
    const sb = selectBox({ options: [{ value: "__none", label: T.noWork }, ...works.map((w) => ({ value: w.name, label: w.name })),
      ...(doc.work && !works.some((w) => w.name === doc.work) ? [{ value: doc.work, label: doc.work }] : []), { value: "__new", label: T.newWorkItem }],
    value: doc.work || "__none", onChange: chooseWork });
    sb.classList.add("pp-work");
    head.append(el("b", "", T.title), sb);
    if (d) {
      const rn = el("button", "icon-btn pp-ib");
      rn.innerHTML = P.icons.rename;
      rn.title = T.renameWork;
      rn.addEventListener("click", renameWork);
      const plus = el("button", "icon-btn pp-ib");
      plus.innerHTML = P.icons.plus;
      plus.title = T.add;
      plus.addEventListener("click", () => add(""));
      head.append(rn, plus);
    }
    if (!d) {
      const msg = el("p", "pp-tnone", T.needWork);
      a.replaceChildren(head, msg);
      return;
    }
    const chips = el("div", "pp-tchips");
    for (const k of ["all", ...KINDS]) {
      const b = el("button", "", k === "all" ? T.all : T.kinds[k]);
      b.type = "button";
      b.setAttribute("aria-pressed", String(filter === k));
      b.addEventListener("click", () => { filter = k; P.store.set("termFilter", k); render(); });
      chips.append(b);
    }
    const search = el("input", "pp-tsearch");
    search.type = "search";
    search.placeholder = T.search;
    search.value = query;
    search.addEventListener("input", () => { query = search.value; drawList(); });
    const list = el("ul", "pp-tlist");
    const cnt = counts();
    function drawList() {
      const qq = query.trim();
      const items = d.terms.filter((t) => (filter === "all" || t.kind === filter) && (!qq || t.base.includes(qq) || t.reading.includes(qq) || t.note.includes(qq)));
      list.replaceChildren();
      if (!items.length) { list.append(el("li", "pp-tnone", d.terms.length ? T.noMatch : T.empty)); return; }
      for (const t of items) {
        const li = el("li", `pp-term k-${t.kind}`);
        const b = el("button", "pp-tins");
        b.type = "button";
        b.title = `${T.insertTip}${t.note ? `\n${t.note}` : ""}`;
        b.addEventListener("mousedown", (e) => e.preventDefault());       // 打ち込み欄の選択を消さない
        b.addEventListener("click", () => insert(t));
        b.append(el("span", "bs", t.base), el("span", "rd", t.reading || ""), el("span", "rl", T.ruleShort[t.rule]));
        const n = cnt.get(t.base) || 0;
        const c = el("span", "ct", n ? String(n) : "");
        c.title = T.countTip;
        const e = el("button", "icon-btn pp-ib pp-tedit");
        e.innerHTML = P.icons.rename;
        e.title = T.edit;
        e.addEventListener("click", () => edit(t));
        const x = el("button", "icon-btn pp-ib pp-tedit pp-tdel");
        x.innerHTML = P.icons.trash;
        x.title = T.del;
        x.setAttribute("aria-label", `${T.del}: ${t.base}`);
        x.addEventListener("click", () => remove(t));
        li.append(b, c, e, x);
        list.append(li);
      }
    }
    drawList();
    a.replaceChildren(head, chips, search, list);
  }

  // 本文で右クリック: 用語集に入れる
  P.editor.addEventListener("contextmenu", (e) => {
    const s = getSelection();
    if (!s?.rangeCount || s.isCollapsed || !P.getDoc()) return;
    e.preventDefault();
    P.ctx.contextMenu([
      { label: T.addSel, icon: P.icons.plus, onClick: () => { if (!P.getDict()) P.ctx.toast(T.needWork, "info"); else addFromSelection(); } },
      { label: L.ruby, onClick: () => P.rubyDialog() },
    ], e.clientX, e.clientY);
  });

  return { render, addFromSelection };
}
