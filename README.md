<p align="center"><img src="assets/paper-sketch-256.png" width="96" alt="Paper Sketch"></p>

# Paper Sketch

<p align="center"><b>English</b> · <a href="README.ja.md">日本語</a></p>

An extension for **[Hub](https://github.com/satosugarforwork44x-lang/desktop-hub)**, a workbench that sits at the edge of the Windows desktop.
Pick a paper — letter paper, a memorial address, a school composition grid, a pocket book page — write in **vertical or horizontal** Japanese (or English), and print it or save it as a PDF.
Ruby (furigana), alignment, bold, italic, line and letter spacing work the way they do in Word, and **pictures, shapes and text boxes** can be placed on the paper.
For novelists there is a **per-work glossary** (characters, places, unique readings) that adds ruby every time or only at a term's first appearance in each chapter. Proofreading goes to AI (Claude, ChatGPT, Gemini), and **versions** let you compare before and after and go back.

![Paper Sketch — letter paper with the page preview on top and the writing area below](docs/paper-sketch.png)

> License: [PolyForm Noncommercial 1.0.0](LICENSE) (free for personal and non-commercial use)

## Why

Letters, thank-you notes, a child's composition, a memorial address — each has a fixed paper format, yet making one in Word takes surprisingly long.

- **Vertical manuscript grids are hard to build.** Lining characters up with squares is a job in itself
- **Ruby is buried in menus,** even though texts for children and novels use it all the time
- **The text itself should travel** between apps and AI: draft on an iPhone, have AI proofread it, print it on paper — without losing the earlier draft

So Paper Sketch is just **pick a paper → write → print**.

- **Twelve papers to start from.** Size, direction, rules, squares, margins and color come with the paper and can be changed later
- **You always type horizontally.** The page above — vertical or not — updates as you write
- **The text is one plain string.** Formatting is kept as short marks like `**bold**` and `｜漢字《かんじ》`, so it survives a round trip through AI

![From picking a paper to print and PDF](docs/flow.png)

## UX decisions

| Decision | Why |
|---|---|
| **Paper on top, typing below** | Typing directly on a vertical page makes the caret hard to follow. Type horizontally, see the result on paper |
| **Own typesetting, one character at a time** | No browser line wrapping: characters are placed on the chars × lines / square grid, so preview, print and PDF are identical |
| **Three levels of formatting** | Document (font, size, line and letter spacing) / paragraph (alignment) / character (bold, italic, ruby). No font changes mid-paragraph — that would make the file format as complex as Word's |
| **In vertical writing, “left” becomes “top”** | Alignment icons and names switch with the writing direction. “Bottom” is exactly what a signature needs |
| **No italic in vertical writing** | Japanese fonts have no italics and slanted vertical text breaks. The data is kept and shows again in horizontal writing |
| **Japanese line-breaking rules** | 、。 hang at the line end; characters that must not start a line (」ー っ …) take the previous character with them. Long ruby spreads its base characters instead of covering the next one |
| **An exported .txt reopens exactly as it was** | The first line holds the paper settings (and a copy of the glossary). For other apps (iPhone Notes…) use “Export text only” |
| **Pictures and shapes sit on the paper** | They are kept by position on the page (mm), apart from the text flow, so editing the text never moves them and print matches the screen. Text does not wrap around them (“Behind text” turns them into a backdrop) |
| **Pictures are stored once, by hash** | Imported pictures are copied to `Paper Sketch\_images` under a hash of their content. One copy per picture, and an exported document still points to the same pictures |
| **One glossary per work, ruby added at typesetting** | Novels are usually split into chapters, so a work has one glossary (`<work>.dict.json`) shared by its chapters. The text just says 東雲; the typesetter adds the ruby. Change a reading once and every chapter follows |
| **No automatic “ordinary reading” detection** | That would need a morphological dictionary and make the tool heavy, so each term is registered as “every time” or “first only”. Unique readings default to “every time” |
| **Whole versions, compared before going back** | Kept every 10 minutes while writing, on opening, when sent to AI and before/after AI changes, before and after Claude edits the file, and before going back. Only the changed characters (or English words) are highlighted. Going back keeps the current text as a version too |
| **Nothing is overwritten** | Exports become `name (2).txt`. Edits save in place, and changes made outside (by Claude) can be undone with Ctrl+Z |

## Papers

![Choosing a paper](docs/papers.png)

| Group | Papers |
|---|---|
| Notes & manuscripts | Lined notes (A5, horizontal), novel manuscript (A4 landscape, vertical 40 × 30) |
| Letters | Letter paper (A5, vertical or horizontal, choose the paper color), memorial address (hosho-style, A4 landscape, vertical) |
| School | Picture diary (picture box + grid), compositions of 120 (12 × 10, guide crosses), 162 (18 × 9) and 200 (20 × 10) characters, book report (A4, 400-character grid) |
| Books | Pocket book A6 (vertical 38 × 16 ≈ 600 characters a page), A5 textbook (horizontal 36 × 28), A5 magazine (vertical, two tiers) |

Every paper's size (A4, B5, A5, A6), orientation, writing direction, rules (plain, ruled, squares), margins, columns and page numbers can be changed.

## Features

| Feature | Details |
|---|---|
| **Fonts** | Only fonts installed on the PC are listed (Yu Mincho, Yu Gothic, BIZ UD, UD Digi Kyokasho, HG Seikaisho…) |
| **Size and spacing** | pt / × / em — or set characters × lines and let the size follow |
| **Alignment** | Left (top), center, right (bottom), justify, distribute |
| **Bold, italic** | Italic in horizontal writing only |
| **Ruby** | Select text and press Ruby, or just type `｜漢字《かんじ》`. Click a ruby to edit or remove it. Show or hide ruby on paper; “same ruby only once” hides repeats |
| **Title, date, signature** | Placed the way each paper expects (letters: date and signature after the text; compositions: title on line 1, name on line 2). “Today” writes 令和八年十月十四日 in vertical writing |
| **Paper colors** | White, ecru, pale pink, pale yellow, old paper, pale green, pale blue, pale lilac, pale gray, vermilion rules, hosho — or any color |
| **Pictures** | The picture button, paste or drop from the PC. PNG, JPEG, GIF, WebP, BMP. Resize from the corners (keeps proportions, `Shift` for free), opacity, angle, behind text |
| **Shapes and text boxes** | Box, rounded box, circle, line, arrow. Line color and width, fill. Text inside a shape (bold and ruby too) with size, color, vertical writing and alignment |
| **Work glossary** | Pick (or create) a work in the glossary panel. Register people, places, terms and unique readings with ruby every time, first time per chapter, or never. Select text and right-click → Add to glossary. Click a term to insert it. Shows how often each term appears in the chapter |
| **Versions** | The clock button. Keep a named version (first draft, before sending…), compare with now or with the one before, go back, delete. Versions kept by hand are never deleted automatically |
| **Print / PDF** | Choose “Microsoft Print to PDF” as the printer to save a PDF |
| **Open / export** | Drop a `.txt` (UTF-8 or Shift_JIS) or `.paper.json`. Export a .txt that reopens as is, text only (ruby as 漢字（かんじ）), or `.paper.json` |
| **Japanese and English** | The panel works in either language |

![A picture diary with a picture, a rounded text box and an arrow](docs/objects.png)

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

## Keys

| Key | Action | Key | Action |
|---|---|---|---|
| `Ctrl+B` / `Ctrl+I` | Bold / italic | `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+L` / `Ctrl+E` / `Ctrl+R` | Left (top) / center / right (bottom) | `Ctrl+S` | Save now |
| `Ctrl+J` / `Ctrl+Shift+J` | Justify / distribute | `Ctrl+P` | Print / PDF |
| Type `｜漢字《かんじ》` | Ruby | `Ctrl` + wheel | Zoom the preview |
| `Delete` | Remove the selected picture or shape | Arrow keys | Move the selection 1 mm (Shift: 5 mm) |
| `Ctrl+D` | Duplicate the selection | Right-click in the text | Add to glossary / ruby |

## Using it with AI

**ChatGPT / Gemini (proofreading):** **Proofread with AI** → “Copy a proofreading request”, paste it into the chat, then paste the answer into “Paste the corrected text”.
The request includes the work's glossary so unique readings are not “corrected”. The text before and after is kept as versions, so you can check the changes in **Versions** and go back.

**Claude (Claude Desktop connected to Hub's MCP):** for example:

- “Proofread `Chapter 1` in Paper Sketch. Keep the formatting marks”
- “Read every chapter of `夜明けの街` and build the glossary of characters and places”
- “Turn this thank-you note into vertical letter paper and set today's date”

Claude reads [`PAPER_FORMAT.md`](PAPER_FORMAT.md) (placed in the folder automatically), the `.paper.json` and `.dict.json` files, and edits the JSON.
The panel reloads within about two seconds. The text before Claude's change is kept as a version, so you can always go back.

![A novel chapter and the work glossary. 蒼月町 and 東雲 get ruby at their first appearance in the chapter, 本気 (マジ) every time](docs/terms.png)

![Versions: comparing the text after an outside change with the one before highlights only the changed words](docs/versions.png)

## File format

`<name>.paper.json` is a short JSON with the paper settings, the text (a string with marks) and the things placed on the paper. See [PAPER_FORMAT.md](PAPER_FORMAT.md).

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

## How it works

| File | Role |
|---|---|
| `manifest.json` | Hub module definition (`moduleApi 1`, Hub 0.8+). Panel, exported functions, pictures served at `/blob/paper/…`, pasted pictures received via `upload` |
| `api.py` | Create, open, validate (fixes what it can and warns), save safely, import, export (never overwrites), work glossaries, versions. Python standard library only |
| `templates.json` | Papers, sizes and colors |
| `ui/layout.js` | Typesetting (line breaking, kinsoku, alignment, glossary ruby, pagination). No DOM, so it is tested with node |
| `ui/render.js` | Turns a laid-out page into DOM in millimetres (shared by preview and print) |
| `ui/markup.js` | Reads and writes the formatting marks; applies the glossary |
| `ui/editor.js` | The formatted typing area ↔ the text |
| `ui/versions.js` / `ui/diff.js` | The versions window (list, compare, go back) and paragraph/character differences |
| `ui/terms.js` | The work glossary: list, register, click to insert |
| `ui/objects.js` | Selecting, moving, resizing and setting up pictures, shapes and text boxes |
| `ui/panel.js` | The panel |
| `PAPER_FORMAT.md` | The format explained for Claude (placed in the folder automatically) |

- **The data is the truth.** Only `.paper.json` holds the real state. The panel watches its modified time, so Claude's edits show up as they are (the text before them is kept as a version)
- **One typesetter.** `layout.js` turns a document into pages, lines and character positions (mm); `render.js` turns those into DOM. Preview, print and PDF all match
- **Light by design.** No dependencies. No morphological dictionary — the glossary decides how ruby is added

## Development

```bat
py -m unittest discover -s tests -v
node --test tests/layout.test.mjs
```

## License

**[PolyForm Noncommercial 1.0.0](LICENSE)** — free to use, read, modify and share for **personal, learning, research and other non-commercial purposes**.
Commercial use is not permitted; contact the author if you want to use it commercially.

There are no dependencies (only the Python standard library and Hub's UI). The logo (`assets/`) is under the same license.
The sample text in the `docs/` screenshots was written for them (partly from Natsume Sōseki's *I Am a Cat*, public domain).

## Next

- Tate-chu-yoko (two-digit numbers set horizontally inside vertical text)
