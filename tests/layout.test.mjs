// node --test tests/   … 記法と組版を、画面なしで確かめる
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, parseLine, strip, countChars, withAlign } from "../ui/markup.js";
import { breakLines, layout, geometry } from "../ui/layout.js";

const T = JSON.parse(readFileSync(new URL("../templates.json", import.meta.url), "utf8"));
const docOf = (id, body = "", meta = {}) => {
  const t = T.templates.find((x) => x.id === id);
  return { template: id, page: { ...t.page }, grid: { ...t.grid }, text: { ...t.text },
    meta: { placement: "top", titleAlign: "start", pageNumbers: false, title: "", date: "", signature: "", ...t.meta, ...meta }, theme: t.theme, ruby: true, body };
};
const U = (s) => Array.from(s).map((c) => ({ c, w: c.charCodeAt(0) < 0x7f ? 0.5 : 1, b: false, i: false, rid: -1 }));
const text = (lines) => lines.map((l) => l.flatMap((c) => c.u).map((u) => u.c).join(""));

test("記法: 揃え・太字・斜体・ルビ・エスケープ", () => {
  const p = parseLine(">>**太字**と*斜め*、｜東京《とうきょう》と漢字《かんじ》\\*星");
  assert.equal(p.align, "end");
  assert.deepEqual(p.runs.map((r) => [r.t, r.b, r.i, r.r ?? null]), [
    ["太字", true, false, null], ["と", false, false, null], ["斜め", false, true, null], ["、", false, false, null],
    ["東京", false, false, "とうきょう"], ["と", false, false, null], ["漢字", false, false, "かんじ"], ["*星", false, false, null]]);
  assert.equal(strip("｜東京《とうきょう》**へ**", "paren"), "東京（とうきょう）へ");
  assert.equal(strip("｜東京《とうきょう》", "base"), "東京");
  assert.equal(countChars("｜東京《とうきょう》 へ\n行く"), 5);
  assert.equal(withAlign("><中央", "end"), ">>中央");
  assert.equal(withAlign(">>右", "start"), "右");
  assert.equal(parseLine("\\>>そのまま").runs[0].t, ">>そのまま");
  assert.equal(parseLine("ひらがな《よみ》").runs.length, 1);   // 漢字が無ければルビにしない
});

test("禁則: 句読点はぶら下げ、閉じ括弧は前の字と送る、開き括弧は行末に残さない", () => {
  assert.deepEqual(text(breakLines(U("あいうえお。"), 5)), ["あいうえお。"]);
  assert.deepEqual(text(breakLines(U("あいうえお」か"), 5)), ["あいうえ", "お」か"]);
  assert.deepEqual(text(breakLines(U("あいうえ「お"), 5)), ["あいうえ", "「お"]);
  assert.deepEqual(text(breakLines(U("hello world"), 3)), ["hello ", "world"]);
  assert.deepEqual(text(breakLines(U("ab cd ef"), 1.5)), ["ab ", "cd ", "ef"]);   // 英単語は分けない（半角は 0.5 マス）
  assert.deepEqual(text(breakLines(U(""), 5)), [""]);
});

test("文庫: 1 ページ 38字×16行（約600字）", () => {
  const body = "あ".repeat(38 * 16 * 2 + 5);
  const r = layout(docOf("bunko", body), T.sizes);
  assert.equal(r.g.C, 38);
  assert.equal(r.g.N, 16);
  assert.equal(r.pages.length, 3);
  assert.equal(r.pages[0].lines.length, 16);
  assert.ok(r.g.font / (25.4 / 72) > 8 && r.g.font / (25.4 / 72) < 10, "字の大きさは 9pt 前後");
});

test("作文帳 200字: 1 枚 20字×10行。題名は 2 マス下げ、名前は下に 1 マス空ける", () => {
  const d = docOf("sakubun200", "い".repeat(200), { title: "夏休み", signature: "山田花子" });
  const r = layout(d, T.sizes);
  const [t, s] = r.pages[0].lines;
  assert.equal(t.pos[0], 2);
  assert.equal(s.pos.at(-1) + 1, 19);
  assert.equal(r.pages.length, 2);
  assert.equal(r.paraPage[0], 0);
});

test("揃え: 中央・地付き・均等割り付け", () => {
  const d = docOf("memo", "><中央\n>>右\n<>均等");
  const r = layout(d, T.sizes);
  const C = r.g.C;
  const [c, e, j] = r.pages[0].lines;
  assert.equal(c.pos[0], (C - 2) / 2);
  assert.equal(e.pos.at(-1) + 1, C);
  assert.equal(j.pos[0], 0);
  assert.equal(j.pos.at(-1) + 1, C);
});

test("自由に組む: 文字の大きさと行間から字数・行数が決まる", () => {
  const d = docOf("memo");
  d.text.size = 10.5; d.text.lineHeight = 2; d.text.letterSpacing = 0;
  const g = geometry(d, T.sizes);
  assert.equal(g.C, Math.floor(g.colLen / (10.5 * 25.4 / 72)));
  d.text.lineHeight = 1.5;
  assert.ok(geometry(d, T.sizes).N > g.N);
});
