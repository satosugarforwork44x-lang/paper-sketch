// paper/ui/diff.js — 2 つの本文の違い（段落ごと、変わった段落の中は 1 字ずつ）。版を比べる窓で使う。DOM を使わない。

/** 最長共通部分列で、a と b の違いを並べる。ops: [{ op: "=" | "-" | "+", a?, b? }]。大きすぎるときは前後の一致だけを見る */
export function diffSeq(a, b, limit = 4_000_000) {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const head = a.slice(0, s).map((x) => ({ op: "=", a: x, b: x }));
  const tail = a.slice(ea).map((x) => ({ op: "=", a: x, b: x }));
  const A = a.slice(s, ea), B = b.slice(s, eb), n = A.length, m = B.length;
  let mid = [];
  if (!n || !m || n * m > limit) {
    mid = [...A.map((x) => ({ op: "-", a: x })), ...B.map((x) => ({ op: "+", b: x }))];
  } else {
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { mid.push({ op: "=", a: A[i], b: B[j] }); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) mid.push({ op: "-", a: A[i++] });
      else mid.push({ op: "+", b: B[j++] });
    }
    while (i < n) mid.push({ op: "-", a: A[i++] });
    while (j < m) mid.push({ op: "+", b: B[j++] });
  }
  return [...head, ...mid, ...tail];
}

/** 比べる単位: 英数字の単語・空白はまとめて 1 つ、それ以外（日本語など）は 1 字ずつ */
const tokens = (s) => String(s).match(/[A-Za-z0-9'’]+|\s+|[\s\S]/gu) || [];

/** 文字の違いを、続いた同じ種類ごとにまとめる: [{ op, text }] */
export function diffChars(a, b) {
  const out = [];
  for (const o of diffSeq(tokens(a), tokens(b), 1_000_000)) {
    const t = o.op === "+" ? o.b : o.a;
    if (out.length && out.at(-1).op === o.op) out.at(-1).text += t; else out.push({ op: o.op, text: t });
  }
  return out;
}

/** 本文の違いを段落ごとに。rows: { type: "same" | "del" | "add" | "chg", old?, new?, parts? }
 *  消した段落と足した段落が隣り合っていれば、1 つの「直した段落」（chg）として中の字の違いを出す */
export function diffBodies(oldBody, newBody) {
  const ops = diffSeq(String(oldBody).split("\n"), String(newBody).split("\n"));
  const rows = [];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    if (o.op === "=") { rows.push({ type: "same", old: o.a, new: o.b }); continue; }
    const dels = [], adds = [];
    while (k < ops.length && ops[k].op !== "=") { (ops[k].op === "-" ? dels : adds).push(ops[k]); k++; }
    k--;
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) {
      const d = dels[i], a = adds[i];
      if (d && a) rows.push({ type: "chg", old: d.a, new: a.b, parts: diffChars(d.a, a.b) });
      else if (d) rows.push({ type: "del", old: d.a });
      else rows.push({ type: "add", new: a.b });
    }
  }
  return rows;
}

/** 違いの数（直した段落・足した段落・消した段落） */
export function diffStats(rows) {
  const s = { chg: 0, add: 0, del: 0 };
  for (const r of rows) if (r.type !== "same") s[r.type]++;
  return s;
}
