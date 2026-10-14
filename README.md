<p align="center"><img src="assets/paper-sketch-256.png" width="96" alt="Paper Sketch"></p>

# Paper Sketch

<p align="center"><b>English</b> · <a href="README.ja.md">日本語</a></p>

An extension for **[Hub](https://github.com/satosugarforwork44x-lang/desktop-hub)**, a workbench that sits at the edge of the Windows desktop.
Pick a paper — letter paper, a memorial address, a school composition grid, a pocket book page — write in **vertical or horizontal** Japanese (or English), and print it or save it as a PDF.
Ruby (furigana), alignment, bold, italic, line and letter spacing work the way they do in Word, and proofreading goes to AI (Claude, ChatGPT, Gemini).

![Paper Sketch — letter paper with the page preview on top and the writing area below](docs/paper-sketch.png)

> License: [PolyForm Noncommercial 1.0.0](LICENSE) (free for personal and non-commercial use)

## Why

Letters, thank-you notes, a child's composition, a memorial address — each has a fixed paper format, yet making one in Word takes surprisingly long.

- **Vertical manuscript grids are hard to build.** Lining characters up with squares is a job in itself
- **Ruby is buried in menus,** even though texts for children use it all the time
- **The text itself should travel** between apps and AI: draft on an iPhone, have AI proofread it, print it on paper

So Paper Sketch is just **pick a paper → write → print**.

- **Twelve papers to start from.** Size, direction, rules, squares, margins and color come with the paper and can be changed later
- **You always type horizontally.** The page above — vertical or not — updates as you write
- **The text is one plain string.** Formatting is kept as short marks like `**bold**` and `｜漢字《かんじ》`, so it survives a round trip through AI

## UX decisions

| Decision | Why |
|---|---|
| **Paper on top, typing below** | Typing directly on a vertical page makes the caret hard to follow. Type horizontally, see the result on paper |
| **Own typesetting, one character at a time** | No browser line wrapping: characters are placed on the chars × lines / square grid, so preview, print and PDF are identical |
| **Three levels of formatting** | Document (font, size, line and letter spacing) / paragraph (alignment) / character (bold, italic, ruby). No font changes mid-paragraph — that would make the file format as complex as Word's |
| **In vertical writing, “left” becomes “top”** | Alignment icons and names switch with the writing direction. “Bottom” is exactly what a signature needs |
| **No italic in vertical writing** | Japanese fonts have no italics and slanted vertical text breaks. The data is kept and shows again in horizontal writing |
| **Japanese line-breaking rules** | 、。 hang at the line end; characters that must not start a line (」ー っ …) take the previous character with them |
| **An exported .txt reopens exactly as it was** | The first line holds the paper settings. For other apps (iPhone Notes…) use “Export text only” |
| **Nothing is overwritten** | Exports become `name (2).txt`. Edits save in place, and changes made outside (by Claude) can be undone with Ctrl+Z |

## Papers

![Choosing a paper](docs/papers.png)

| Group | Papers |
|---|---|
| Notes & manuscripts | Lined notes (A5, horizontal), novel manuscript (A4 landscape, vertical 40 × 30) |
| Letters | Letter paper (A5, vertical or horizontal, 7 colors), memorial address (hosho-style, A4 landscape, vertical) |
| School | Picture diary (picture box + grid), compositions of 120 (12 × 10, guide crosses), 162 (18 × 9) and 200 (20 × 10) characters, book report (A4, 400-character grid) |
| Books | Pocket book A6 (vertical 38 × 16 ≈ 600 characters a page), A5 textbook (horizontal 36 × 28), A5 magazine (vertical, two tiers) |

Every paper's size (A4, B5, A5, A6), orientation, writing direction, rules (plain, ruled, squares), margins, columns and page numbers can be changed.

## Features

| Feature | Details |
|---|---|
| **Fonts** | Only fonts installed on the PC are listed (Yu Mincho, Yu Gothic, BIZ UD, UD Digi Kyokasho, HG Seikaisho…) |
| **Size and spacing** | pt / × / em — or set characters × lines and let the size follow |
| **Alignment** | Left (top), center, right (bottom), justify, distribute. `Ctrl+L / E / R / J`, distribute `Ctrl+Shift+J` |
| **Bold, italic** | `Ctrl+B` / `Ctrl+I` (italic in horizontal writing only) |
| **Ruby** | Select text, press Ruby. Click a ruby to edit or remove it. Show or hide ruby on paper |
| **Title, date, signature** | Placed the way each paper expects (letters: date and signature after the text; compositions: title on line 1, name on line 2). “Today” writes 令和八年十月十四日 in vertical writing |
| **Print / PDF** | `Ctrl+P`. Choose “Microsoft Print to PDF” to save a PDF |
| **Open** | Drop a `.txt` (UTF-8 or Shift_JIS) or `.paper.json` on the panel |
| **Export** | .txt that reopens as is, text only (.txt, ruby as 漢字（かんじ）), `.paper.json` |
| **Proofread with AI** | “Copy a proofreading request” → paste into ChatGPT / Gemini → “Paste the corrected text”. Claude can edit the file directly through Hub |
| **Japanese and English** | The panel works in either language |

## Getting started

Requires **Hub 0.8 or later**. No Python packages are needed (the UI is HTML, saving uses the standard library).

1. Put this repository in Hub's module folder **named `paper`** (the folder name must match the module id)
   ```bat
   git clone https://github.com/satosugarforwork44x-lang/paper-sketch "%LOCALAPPDATA%\Hub\modules\paper"
   ```
2. Restart Hub and **Paper Sketch** appears on the bar. Pick a paper and start writing.
   Documents live in a **`Paper Sketch`** folder under the folder panels' location, so it also works as a folder panel
3. (Optional) To let Claude proofread: Hub settings (⚙) → Claude → set `Paper Sketch` to **read & write**.
   Claude reads `PAPER_FORMAT.md` in that folder and keeps the formatting marks while fixing the text

## File format

`<name>.paper.json` is a short JSON with the paper settings and the text (a string with marks). See [PAPER_FORMAT.md](PAPER_FORMAT.md).

```text
　拝啓　秋も深まり、｜紅葉《もみじ》の美しい季節になりました。
　先日は**ありがとうございました**。
>>敬具
```

| Mark | Meaning |
|---|---|
| `>>` `><` `<>` `==` at the start of a line | Right (bottom), center, distribute, justify |
| `**…**` `*…*` | Bold, italic |
| `｜base《ruby》` `漢字《かんじ》` | Ruby |

## Files

| File | Role |
|---|---|
| `api.py` | Create, open, save, import, export (Python standard library only) |
| `templates.json` | Papers, sizes and colors |
| `ui/layout.js` | Typesetting (line breaking, kinsoku, alignment, pagination). No DOM, so it is tested with node |
| `ui/render.js` | Turns a laid-out page into DOM in millimetres (shared by preview and print) |
| `ui/markup.js` | Reads and writes the formatting marks |
| `ui/editor.js` | The formatted typing area ↔ the text |
| `ui/panel.js` | The panel |

## Tests

```bat
py -m unittest discover -s tests
node --test tests/layout.test.mjs
```

## Next

- Pictures (decorations for letters and invitations, the picture in a picture diary)
- Tate-chu-yoko (two-digit numbers set horizontally inside vertical text)
