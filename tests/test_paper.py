"""test_paper.py — ペーパースケッチの api.py を、Hub を起動せずに確かめる（py -m unittest discover -s tests）。"""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


class _Store:
    def __init__(self):
        self.d = {}

    def get(self, scope, key, default=None):
        return self.d.get((scope, key), default)

    def set(self, scope, key, value):
        self.d[(scope, key)] = json.loads(json.dumps(value))


class _Ctx:
    pass


class PaperTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("hubmod_paper_test", Path(__file__).resolve().parent.parent / "api.py")
        self.api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.api)
        self.tmp = Path(tempfile.mkdtemp())
        ctx = _Ctx()
        ctx.store, ctx.data_dir, ctx.config = _Store(), self.tmp / "data", {}
        ctx.host = _Ctx()
        ctx.host.config = {"modules": {"folders": {"root": str(self.tmp / "registries")}}}
        self.api.setup(ctx)

    def _doc(self, name):
        return self.api.open_paper(name)["doc"]

    def test_folder_and_guide(self):
        st = self.api.state()
        folder = Path(st["folder"])
        self.assertEqual(folder, self.tmp / "registries" / "Paper Sketch")
        self.assertTrue((folder / "PAPER_FORMAT.md").is_file())
        self.assertGreaterEqual(len(st["templates"]), 10)

    def test_every_template_is_valid(self):
        for tid in self.api.TEMPLATES:
            doc, warn = self.api.normalize(self.api.new_doc(tid))
            self.assertEqual(warn, [], tid)
            self.assertEqual(doc, self.api.new_doc(tid), tid)

    def test_create_never_overwrites(self):
        a = self.api.create("letter", "お礼")["name"]
        b = self.api.create("letter", "お礼")["name"]
        self.assertEqual((a, b), ("お礼", "お礼 (2)"))

    def test_save_rounds_and_keeps_body(self):
        name = self.api.create("memo", "m")["name"]
        doc = self._doc(name)
        doc["body"] = "**太字**\n>>｜署名《しょめい》"
        doc["text"]["size"] = 999
        doc["page"]["size"] = "B4"
        r = self.api.save_paper(name, doc)
        self.assertTrue(any("B4" in w for w in r["warnings"]))
        got = self._doc(name)
        self.assertEqual(got["text"]["size"], 72)
        self.assertEqual(got["body"], "**太字**\n>>｜署名《しょめい》")

    def _roundtrip(self, kind):
        name = self.api.create("bunko", "本")["name"]
        doc = self._doc(name)
        doc["body"] = "　吾輩は｜猫《ねこ》である。\n\n>>**名前**はまだ無い。\r\n*end*"
        doc["meta"].update(title="題", date="令和八年十月十四日", signature="会社\n名前")
        doc["page"]["vertical"] = False
        doc["text"].update(letterSpacing=0.1, lineHeight=1.9)
        doc["ruby"] = False
        self.api.save_paper(name, doc)
        before = self._doc(name)
        out = self.api.export(name, kind)
        made = self.api.import_files([out["path"]])
        self.assertEqual(made["skipped"], [])
        self.assertEqual(made["warnings"], [])
        after = self._doc(made["made"][0])
        self.assertEqual(after, before)
        return out

    def test_txt_export_reimports_to_the_same_document(self):
        out = self._roundtrip("txt")
        raw = Path(out["path"]).read_bytes()
        self.assertIn(b"\r\n", raw)            # Windows のメモ帳で改行が見える
        self.assertTrue(raw.startswith(self.api.TXT_HEAD.encode()))

    def test_json_export_reimports_to_the_same_document(self):
        self._roundtrip("json")

    def test_plain_text_is_read_literally(self):
        p = self.tmp / "memo.txt"
        p.write_bytes("2*3=6\r\n>>右ではない\r\n漢字《かんじ》".encode("cp932"))
        name = self.api.import_files([str(p)])["made"][0]
        self.assertEqual(self._doc(name)["body"], "2\\*3=6\n\\>>右ではない\n漢字\\《かんじ\\》")

    def test_plain_export_does_not_overwrite(self):
        name = self.api.create("memo", "x")["name"]
        a = self.api.export(name, "plain", text="本文")["file"]
        b = self.api.export(name, "plain", text="本文")["file"]
        self.assertNotEqual(a, b)

    def test_rename_and_bad_names(self):
        name = self.api.create("memo", "a")["name"]
        self.assertEqual(self.api.rename(name, "b")["name"], "b")
        with self.assertRaises(self.api.PaperError):
            self.api.rename("b", "../x")
        with self.assertRaises(self.api.PaperError):
            self.api.open_paper("..\\secret")

    def test_reveal_stays_inside_folder(self):
        seen = []
        self.api._ctx.host.reveal_path = seen.append
        self.api.reveal(file="..\\..\\Windows\\win.ini")
        self.assertEqual(Path(seen[0]), Path(self.api.state()["folder"]))

    PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 32

    def test_images_are_stored_once_and_served_only_from_the_folder(self):
        pic = self.tmp / "花.png"
        pic.write_bytes(self.PNG)
        a = self.api.add_image_files([str(pic), str(self.tmp / "x.txt")])
        b = self.api.save_image(self.PNG)
        self.assertEqual(a["made"][0], b["src"])
        self.assertEqual(len(a["skipped"]), 1)
        self.assertTrue(self.api.blob_path(b["src"]).is_file())
        for bad in ("../x.png", "abc.png", b["src"].replace(".png", ".exe")):
            with self.assertRaises(self.api.PaperError):
                self.api.blob_path(bad)
        with self.assertRaises(self.api.PaperError):
            self.api.save_image(b"MZ not an image")

    def test_objects_are_normalized(self):
        name = self.api.create("letter", "o")["name"]
        doc = self._doc(name)
        src = self.api.save_image(self.PNG)["src"]
        doc["objects"] = [
            {"kind": "image", "src": src, "x": 10, "y": 20, "w": 50, "h": 40, "page": 1, "behind": True},
            {"kind": "shape", "shape": "arrow", "x": 5, "y": 5, "w": -30, "h": 10, "stroke": "#ff0000"},
            {"kind": "shape", "shape": "round", "text": "**お知らせ**", "fill": "javascript:alert(1)", "w": 9999},
            {"kind": "image", "src": "../../secret.png"},
            {"kind": "video"},
        ]
        r = self.api.save_paper(name, doc)
        self.assertEqual(len(r["warnings"]), 2)
        got = self._doc(name)["objects"]
        self.assertEqual([o["kind"] for o in got], ["image", "shape", "shape"])
        self.assertEqual(got[1]["w"], -30)
        self.assertEqual(got[2]["fill"], "none")
        self.assertEqual(got[2]["w"], 600)
        self.assertEqual(len({o["id"] for o in got}), 3)
        self.assertEqual(self.api.open_paper(name)["missing"], [])

    def test_objects_survive_txt_and_json_roundtrip(self):
        name = self.api.create("memo", "rt")["name"]
        doc = self._doc(name)
        src = self.api.save_image(self.PNG)["src"]
        doc["objects"] = [{"kind": "image", "src": src, "x": 1, "y": 2, "w": 3, "h": 4},
                          {"kind": "shape", "shape": "ellipse", "text": "｜吹《ふ》き出し", "vertical": True}]
        self.api.save_paper(name, doc)
        before = self._doc(name)
        for kind in ("txt", "json"):
            out = self.api.export(name, kind)
            made = self.api.import_files([out["path"]])
            self.assertEqual(made["warnings"], [])
            self.assertEqual(self._doc(made["made"][0]), before)

    TERMS = [{"base": "東雲", "reading": "しののめ", "kind": "person"},
             {"base": "本気", "reading": "マジ", "kind": "reading"},
             {"base": "東雲", "reading": "ちがう"},
             {"base": "｜蒼《月", "reading": "そうげつ", "rule": "never"}]

    def test_work_dictionary_is_normalized(self):
        self.api.create_work("夜明けの街")
        r = self.api.save_dict("夜明けの街", self.TERMS)
        self.assertEqual([t["base"] for t in r["terms"]], ["東雲", "本気", "蒼月"])
        self.assertEqual([t["rule"] for t in r["terms"]], ["first", "always", "first"])   # 独自の読みは毎回
        self.assertEqual(len(r["warnings"]), 1)
        self.assertEqual(self.api.works(), [{"name": "夜明けの街", "terms": 3}])
        with self.assertRaises(self.api.PaperError):
            self.api.create_work("夜明けの街")
        with self.assertRaises(self.api.PaperError):
            self.api.get_dict("../x")

    def test_chapters_share_the_work_dictionary_and_rename_follows(self):
        self.api.save_dict("作品A", self.TERMS[:2])
        names = [self.api.create("novel", f"第{i}章")["name"] for i in (1, 2)]
        for n in names:
            d = self._doc(n); d["work"] = "作品A"; self.api.save_paper(n, d)
        self.assertEqual(len(self.api.open_paper(names[1])["dict"]["terms"]), 2)
        r = self.api.rename_work("作品A", "作品B")
        self.assertEqual(r["docs"], 2)
        self.assertEqual(self._doc(names[0])["work"], "作品B")
        self.assertEqual(len(self.api.get_dict("作品B")["terms"]), 2)
        self.assertEqual(self.api.get_dict("作品A")["terms"], [])

    def test_export_carries_the_dictionary_and_import_restores_it(self):
        self.api.save_dict("作品C", self.TERMS[:2])
        n = self.api.create("bunko", "第1章")["name"]
        d = self._doc(n); d["work"] = "作品C"; d["body"] = "東雲は本気だった。"; d["rubyOnce"] = True
        self.api.save_paper(n, d)
        before = self._doc(n)
        for kind in ("txt", "json"):
            out = self.api.export(n, kind)
            self.api._dict_path("作品C").unlink()                  # 用語集が無い PC で読み込むつもり
            made = self.api.import_files([out["path"]])
            self.assertEqual(self._doc(made["made"][0]), before)
            self.assertEqual([t["base"] for t in self.api.get_dict("作品C")["terms"]], ["東雲", "本気"])
        # すでにある用語は上書きしない
        self.api.save_dict("作品C", [{"base": "東雲", "reading": "あずまぐも"}])
        self.api.import_files([out["path"]])
        got = {t["base"]: t["reading"] for t in self.api.get_dict("作品C")["terms"]}
        self.assertEqual(got, {"東雲": "あずまぐも", "本気": "マジ"})

    def test_versions_keep_restore_and_dedupe(self):
        n = self.api.create("memo", "原稿")["name"]
        d = self._doc(n); d["body"] = "一稿"; self.api.save_paper(n, d)
        a = self.api.snapshot(n, "manual", "一稿")
        self.assertTrue(self.api.snapshot(n, "auto")["skipped"])          # 同じ中身は残さない
        d["body"] = "二稿（AI が直した）"
        b = self.api.snapshot(n, "ai-before", doc=d)                     # 画面の中の文書を残す
        self.assertFalse(b["skipped"])
        self.api.save_paper(n, d)
        vs = self.api.versions(n)
        self.assertEqual([v["reason"] for v in vs], ["ai-before", "manual"])
        self.assertEqual(vs[1]["label"], "一稿")
        r = self.api.restore_version(n, a["id"])
        self.assertEqual(r["doc"]["body"], "一稿")
        # 戻す前の中身（二稿）は版に残っている（同じ中身の版がすでにあれば、新しくは作らない）
        self.assertEqual(self.api.version_doc(n, self.api.versions(n)[0]["id"])["doc"]["body"], "二稿（AI が直した）")
        d["body"] = "三稿"; self.api.save_paper(n, d)
        self.api.restore_version(n, a["id"])
        self.assertEqual(self.api.versions(n)[0]["reason"], "restore")
        with self.assertRaises(self.api.PaperError):
            self.api.version_doc(n, "../../x")
        with self.assertRaises(self.api.PaperError):
            self.api.snapshot(n, "hack")
        self.api.rename(n, "原稿2")                                       # 名前を変えても版は付いてくる
        self.assertEqual(len(self.api.versions("原稿2")), 3)

    def test_auto_versions_are_pruned_but_manual_stay(self):
        self.api.VERSION_AUTO_KEEP, self.api.VERSION_MAX = 3, 5
        n = self.api.create("memo", "p")["name"]
        d = self._doc(n)
        for i in range(4):
            d["body"] = f"m{i}"; self.api.snapshot(n, "manual", doc=d)
        for i in range(6):
            d["body"] = f"a{i}"; self.api.snapshot(n, "auto", doc=d)
        vs = self.api.versions(n)
        self.assertEqual(sum(v["reason"] == "manual" for v in vs), 4)
        self.assertLessEqual(len(vs), 5)


if __name__ == "__main__":
    unittest.main()
