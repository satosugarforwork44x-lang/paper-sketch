# ペーパースケッチの形式（hub-paper/1）— Claude 向けの説明書

このフォルダの `<名前>.paper.json` は、Hub の拡張「ペーパースケッチ」の文書です。
ファイルを書き換えると、開いているパネルが 2 秒ほどで読み直します（利用者は Ctrl+Z で元に戻せます）。

## 頼まれやすいこと

| 頼まれたこと | すること |
|---|---|
| 「校正して」 | `body` だけを直す。誤字・脱字・言葉の誤り・表記ゆれ。**書式の記号（下記）は消さない**。文体と内容は変えない |
| 「題名を付けて」「日付を入れて」 | `meta.title` / `meta.date` を書く |
| 「縦書きにして」「A4 にして」 | `page.vertical` / `page.size` を変える |
| 「続きを書いて」 | `body` の最後に足す。段落は改行（`\n`）で分ける |

## 本文（body）の記法

本文は 1 つの文字列。**改行 = 段落の区切り**。日本語の段落の頭は全角の空白（`　`）で 1 字下げる。

| 書き方 | 意味 |
|---|---|
| 行頭に `>>` | 右揃え（縦書きは地付き） |
| 行頭に `><` | 中央揃え |
| 行頭に `<>` | 均等割り付け（最後の行も広げる） |
| 行頭に `==` | 両端揃え |
| `**太字**` | 太字 |
| `*斜体*` | 斜体（横書きのときだけ見える） |
| `｜東京《とうきょう》` | ルビ（`｜` は全角の縦棒） |
| `漢字《かんじ》` | ルビ（直前に続く漢字が親文字） |
| `\*` `\｜` `\《` `\\` | その字そのもの（記号として読まない） |

## 全体の形

```json
{
  "format": "hub-paper/1",
  "template": "letter",
  "page": { "size": "A5", "landscape": false, "vertical": true, "margin": [22, 14, 18, 14], "columns": 1, "columnGap": 8 },
  "grid": { "kind": "lines", "chars": 20, "lines": 10, "guide": false, "picture": 0 },
  "text": { "font": "Yu Mincho", "mode": "free", "size": 12, "lineHeight": 2.2, "letterSpacing": 0.05, "chars": 20, "lines": 12 },
  "meta": { "placement": "letter", "titleAlign": "start", "pageNumbers": false, "title": "", "date": "令和八年十月十四日", "signature": "山田　花子" },
  "theme": "kinari",
  "ruby": true,
  "body": "　拝啓　秋も深まり、｜紅葉《もみじ》の美しい季節になりました。\n>>敬具"
}
```

| 項目 | 値 |
|---|---|
| `page.size` | `A4` `B5` `A5` `A6`。`landscape: true` で横長 |
| `page.margin` | 余白 mm。`[上, 右, 下, 左]` |
| `page.columns` | 段組 1〜3（縦書きは上下に段、横書きは左右に段） |
| `grid.kind` | `none`（なし）/ `lines`（罫線）/ `genko`（原稿用紙のマス目。`grid.chars` 字 × `grid.lines` 行） |
| `grid.picture` | 紙の上側の絵の枠の割合 0〜0.8（絵日記） |
| `text.mode` | `free`（`size` pt・`lineHeight` 倍・`letterSpacing` em で決める）/ `fit`（`chars` 字 × `lines` 行が入るように決める） |
| `meta.placement` | 題名・日付・署名の置き方。`top`（先頭）/ `letter`（題名は先頭、日付と署名は本文の後）/ `grid`（作文: 題名は 2 マス下げ、2 行目に名前） |
| `theme` | `white` `kinari` `sakura` `wakakusa` `sora` `shu` `houshoshi` |
| `ruby` | ルビを出すか |

## 紙の上に置く物（objects）

絵・図形・文字ボックス。寸法は **mm**（紙の左上から）、`page` は 1 から。後ろに書いた物ほど手前に出ます。

```json
"objects": [
  { "id": "o1", "kind": "image", "page": 1, "x": 22, "y": 20, "w": 120, "h": 90, "rot": 0, "opacity": 1, "behind": false, "src": "3f2a…c1.png" },
  { "id": "o2", "kind": "shape", "shape": "round", "page": 1, "x": 128, "y": 18, "w": 62, "h": 26, "rot": 0, "opacity": 1, "behind": false,
    "stroke": "#e0623a", "fill": "#fff6ea", "lineWidth": 0.6,
    "text": "**10月14日**\nはれ", "size": 16, "color": "#7a3b22", "vertical": false, "align": "center", "font": "" },
  { "id": "o3", "kind": "shape", "shape": "arrow", "page": 1, "x": 150, "y": 44, "w": -28, "h": 22, "stroke": "#e0623a", "lineWidth": 0.7 }
]
```

| 項目 | 値 |
|---|---|
| `kind` | `image`（絵）/ `shape`（図形。`text` を入れると文字ボックス） |
| `shape` | `rect` `round`（角丸）`ellipse` `line` `arrow`。線と矢印は (x, y) から (x+w, y+h) へ引く（w・h は負でもよい） |
| `src` | 絵の名前。絵は `Paper Sketch\_images` に置いてある（名前は中身のハッシュ）。Claude が新しい絵を足すことはできない |
| `stroke` `fill` | `#rrggbb` か `"none"` |
| `text` | 本文と同じ記法（`**太字**`、`｜漢字《かんじ》`、改行で段落） |
| `size` | 文字の大きさ pt。`vertical: true` で縦書き。`align`: `start` `center` `end` |
| `behind` | `true` で本文の文字の後ろ（地紋・飾り） |
| `rot` | 角度（度）。線には使わない |

範囲の外の値は、読み込むときに近い値に直されます（ファイルは壊れません）。
