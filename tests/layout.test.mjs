// node --test tests/   … 記法と組版を、画面なしで確かめる
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, parseLine, strip, countChars, withAlign, applyTerms, termCounts } from "../ui/markup.js";
import { breakLines, layout, geometry } from "../ui/layout.js";
import { hit, topmost } from "../ui/objects.js";

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

test("置いた物: 当たり判定（回転・線・前面と背面）", () => {
  const box = { id: "a", kind: "shape", shape: "rect", x: 10, y: 10, w: 20, h: 10, rot: 0, behind: false, lineWidth: 0.4 };
  assert.ok(hit(box, 15, 15));
  assert.ok(!hit(box, 35, 15));
  assert.ok(hit({ ...box, rot: 90 }, 20, 22));            // 90° 回すと縦長になる
  assert.ok(!hit({ ...box, rot: 90 }, 11, 15));
  const line = { id: "l", kind: "shape", shape: "arrow", x: 0, y: 0, w: 30, h: 30, lineWidth: 0.5 };
  assert.ok(hit(line, 15, 16));
  assert.ok(!hit(line, 15, 25));
  const back = { ...box, id: "b", behind: true }, front = { ...box, id: "f" };
  assert.equal(topmost([front, back], 15, 15).id, "f");   // 背面より前面
  assert.equal(topmost([back, { ...front, id: "g" }, { ...front, id: "h" }], 15, 15).id, "h");   // 後から置いた物が手前
});

test("用語集: 初出だけ・毎回・付けない、語の境目、手書きのルビが先", () => {
  const terms = [
    { base: "東雲", reading: "しののめ", rule: "first" },
    { base: "本気", reading: "マジ", rule: "always" },
    { base: "真", reading: "まこと", rule: "first" },
    { base: "アリス", reading: "Alice", rule: "always" },
    { base: "蒼", reading: "あお", rule: "none" },
  ];
  const ruby = (body, once = false) => applyTerms(parse(body), terms, once).flatMap((p) => p.runs.filter((r) => r.r).map((r) => `${r.t}:${r.r}`));
  assert.deepEqual(ruby("東雲が来た。東雲は笑った。\n東雲。"), ["東雲:しののめ"]);              // 初出だけ（段落をまたいでも）
  assert.deepEqual(ruby("本気だ。本気だぞ。"), ["本気:マジ", "本気:マジ"]);                   // 毎回
  assert.deepEqual(ruby("真実を知った真が"), ["真:まこと"]);                                // 「真実」の真には付けない
  assert.deepEqual(ruby("アリスとアリストテレス"), ["アリス:Alice"]);                        // カタカナの続き
  assert.deepEqual(ruby("蒼い空"), []);                                                      // 付けない
  assert.deepEqual(ruby("｜東雲《あけぼの》と東雲"), ["東雲:あけぼの"]);                       // 手書きのルビが先、以後は初出済み
  assert.deepEqual(ruby("｜宵《よい》と｜宵《よい》", true), ["宵:よい"]);                      // 手書きの同じルビも 2 回目から外す
  assert.equal(strip("東雲が東雲を", "paren", terms), "東雲（しののめ）が東雲を");
  assert.deepEqual([...termCounts("東雲と東雲、真実と真", terms)], [["東雲", 2], ["真", 1]]);
  const r = layout(docOf("bunko", "東雲が来た。"), T.sizes, terms);
  assert.ok(r.pages[0].lines[0].rubies.some((x) => x.r === "しののめ"));
});

test("長いルビ: 親文字の間を広げる（マス目では広げない）", () => {
  const r = layout(docOf("bunko", "｜嘘《フェイクニュース》だ。｜東京《とうきょう》"), T.sizes);
  const line = r.pages[0].lines[0];
  assert.equal(line.units[0].w, 4);                        // 8 字のルビ = 4 マス → 1 字の「嘘」を 4 マスに
  assert.equal(line.pos[1], 4);                            // 次の字は広げた後ろから
  assert.deepEqual(line.units.slice(3, 5).map((u) => u.w), [1.25, 1.25]);   // とうきょう（5 字 = 2.5 マス）を 2 字に割り振る
  const g = layout(docOf("sakubun200", "｜嘘《フェイクニュース》"), T.sizes);
  assert.equal(g.pages[0].lines[0].units[0].w, 1);
});

test("版の比べ方: 段落ごと、直した段落は字ごと", async () => {
  const { diffBodies, diffStats } = await import("../ui/diff.js");
  const rows = diffBodies("一行目\n吾輩は猫でる。\n消える段落\n最後", "一行目\n吾輩は猫である。\n最後\n足した段落");
  assert.deepEqual(rows.map((r) => r.type), ["same", "chg", "del", "same", "add"]);
  const chg = rows.find((r) => r.type === "chg" && r.old.startsWith("吾輩"));
  assert.deepEqual(chg.parts, [{ op: "=", text: "吾輩は猫で" }, { op: "+", text: "あ" }, { op: "=", text: "る。" }]);
  const st = diffStats(rows);
  assert.equal(st.chg + st.add + st.del >= 2, true);
  assert.deepEqual(diffStats(diffBodies("a\nb", "a\nb")), { chg: 0, add: 0, del: 0 });
});
