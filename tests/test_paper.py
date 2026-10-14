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


if __name__ == "__main__":
    unittest.main()
