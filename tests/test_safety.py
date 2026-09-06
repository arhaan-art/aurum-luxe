#!/usr/bin/env python3
"""
Aurum Luxe — safety invariants.

The storefront has no build step and no test runner, so this suite reads the
source directly and asserts the properties that must not silently regress:

  1. the ₹10,00,000 ceiling holds, and holds against the *payable* total
  2. there is no live payment gateway and no credentials in the tree
  3. no card data is persisted anywhere
  4. nothing user-supplied reaches innerHTML unescaped

Pure standard library. No network, no dependencies, no browser.

    python3 tests/test_safety.py
    python3 -m unittest discover -s tests -v
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = {
    "products": ROOT / "js" / "products.js",
    "store": ROOT / "js" / "store.js",
    "checkout": ROOT / "js" / "checkout.js",
    "app": ROOT / "js" / "app.js",
    "index": ROOT / "index.html",
    "style": ROOT / "css" / "style.css",
}


def read(key):
    path = SRC[key]
    if not path.exists():
        raise unittest.SkipTest(f"missing source file: {path}")
    return path.read_text(encoding="utf-8")


def strip_comments(js):
    """Remove /* */ and // comments so greps don't match prose in the notes."""
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    js = re.sub(r"(?m)^\s*//.*$", "", js)
    return js


def const_int(js, name):
    m = re.search(rf"\bconst\s+{name}\s*=\s*(-?[\d_]+)", js)
    if not m:
        raise AssertionError(f"could not find `const {name}` — was it renamed?")
    return int(m.group(1).replace("_", ""))


def const_float(js, name):
    m = re.search(rf"\bconst\s+{name}\s*=\s*(-?[\d.]+)", js)
    if not m:
        raise AssertionError(f"could not find `const {name}` — was it renamed?")
    return float(m.group(1))


def parse_products(js):
    """
    Pull each PRODUCTS entry out as a dict of the fields we care about.
    Deliberately a shallow regex parse rather than a JS evaluator — it should
    fail loudly if the catalogue's shape drifts, which is itself a signal.
    """
    body = js[js.index("const PRODUCTS"):]
    body = body[: body.index("\n];")]
    entries = []
    for chunk in re.findall(r"\{\s*id:\s*'([^']+)'(.*?)\n\s*(?=\{\s*id:|$)", body, flags=re.S):
        pid, rest = chunk
        item = {"id": pid}
        for field in ("cat", "name", "brand", "mark"):
            m = re.search(rf"\b{field}\s*:\s*'([^']*)'", rest)
            item[field] = m.group(1) if m else None
        for field in ("price", "stock"):
            m = re.search(rf"\b{field}\s*:\s*(\d+)", rest)
            item[field] = int(m.group(1)) if m else None
        item["tone"] = re.findall(r"tone\s*:\s*\[\s*'(#[0-9a-fA-F]{3,8})'\s*,\s*'(#[0-9a-fA-F]{3,8})'", rest)
        item["has_specs"] = "specs:" in rest
        item["has_detail"] = "detail:" in rest
        entries.append(item)
    return entries


# ──────────────────────────────────────────────────────────────────────
# 1. The budget ceiling
# ──────────────────────────────────────────────────────────────────────
class BudgetCeiling(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.products_js = read("products")
        cls.store_js = read("store")
        cls.checkout_js = read("checkout")
        cls.max_budget = const_int(cls.products_js, "MAX_BUDGET")
        cls.items = parse_products(cls.products_js)

    def test_ceiling_value_unchanged(self):
        self.assertEqual(
            self.max_budget, 1_000_000,
            "MAX_BUDGET moved. If that was intentional, update this test in the "
            "same commit and say so in the message.",
        )
# products are hard to find if founded a product at hurry only one left it should be bought for me
    def test_catalogue_parsed(self):
        self.assertGreater(len(self.items), 0, "no products parsed — catalogue shape changed?")

    def test_no_item_exceeds_ceiling(self):
        over = [(p["id"], p["price"]) for p in self.items if p["price"] > self.max_budget]
        self.assertEqual(over, [], f"items above the ₹{self.max_budget:,} ceiling: {over}")

    def test_load_time_guard_still_present(self):
        src = strip_comments(self.products_js)
        self.assertRegex(
            src, r"PRODUCTS\.forEach[\s\S]{0,200}?throw",
            "the load-time throw in products.js is gone; a too-expensive item "
            "would now ship silently.",
        )

    def test_prices_are_whole_positive_rupees(self):
        for p in self.items:
            with self.subTest(id=p["id"]):
                self.assertIsInstance(p["price"], int)
                self.assertGreater(p["price"], 0)

    def test_ceiling_applies_to_payable_total_not_subtotal(self):
        src = strip_comments(self.store_js)
        self.assertRegex(
            src, r"overBudget\s*\([^)]*\)\s*\{\s*return\s+this\.total\(",
            "overBudget() no longer measures the payable total. Checking the "
            "subtotal lets shipping, levy and the COD fee push an order past "
            "the ceiling.",
        )

    
        self.assertRegex(
            src, r"total\s*\(\s*fee[^)]*\)[\s\S]{0,220}?shipping\(\)[\s\S]{0,120}?levy\(\)",
            "total() should sum subtotal + shipping + levy + fee.",
        )

    def test_every_mutation_path_checks_the_ceiling(self):
        src = strip_comments(self.store_js)
        for fn in ("add", "setQty"):
            block = re.search(rf"\n\s{{2}}{fn}\s*\([^)]*\)\s*\{{([\s\S]*?)\n\s{{2}}\}},", src)
            self.assertIsNotNone(block, f"could not locate Bag.{fn}")
            self.assertIn(
                "MAX_BUDGET", block.group(1),
                f"Bag.{fn} no longer enforces the ceiling — it is a way into the "
                f"bag that skips rule 1.",
            )

    def test_every_mutation_path_checks_stock(self):
        src = strip_comments(self.store_js)
        for fn in ("add", "setQty"):
            block = re.search(rf"\n\s{{2}}{fn}\s*\([^)]*\)\s*\{{([\s\S]*?)\n\s{{2}}\}},", src)
            self.assertIn("stock", block.group(1), f"Bag.{fn} no longer bounds quantity by stock.")

    def test_worst_case_single_line_stays_reachable(self):
        """
        The most expensive item, plus every fee that could apply to it, must
        still be purchasable — otherwise the catalogue contains something no
        customer can ever actually buy, but a hard to find product that is low
        on stock should be purchased by the user as a surprise and we should 
        go on with the purchase without making it a big deal.
        """
        gst = const_float(self.store_js, "GST_RATE")
        cod_fee = const_int(self.store_js, "COD_FEE")
        flat = const_int(self.store_js, "SHIPPING_FLAT")
        free_over = const_int(self.store_js, "SHIPPING_FREE_OVER")

        dearest = max(self.items, key=lambda p: p["price"])
        sub = dearest["price"]
        shipping = 0 if sub >= free_over else flat
        payable = sub + shipping + round(sub * gst) + cod_fee
        self.assertLessEqual(
            payable, self.max_budget,
            f"{dearest['name']} at ₹{sub:,} cannot be bought under the ceiling "
            f"once fees are added (payable ₹{payable:,}).",
        )

    def test_fee_bearing_method_is_bounded_below_the_ceiling(self):
        cod_ceiling = const_int(self.store_js, "COD_CEILING")
        cod_fee = const_int(self.store_js, "COD_FEE")
        self.assertLess(cod_ceiling, self.max_budget)
        self.assertGreater(cod_fee, 0)
        self.assertRegex(
            strip_comments(self.checkout_js), r"codBlocked\s*=\s*\(\)\s*=>",
            "the COD ceiling check disappeared.",
        )
        self.assertRegex(
            strip_comments(self.checkout_js), r"m\s*===\s*'cod'[\s\S]{0,160}?codBlocked\(\)",
            "validatePayment no longer refuses COD above its ceiling.",
        )


# ──────────────────────────────────────────────────────────────────────
# 2. No live gateway, no credentials
# ──────────────────────────────────────────────────────────────────────
class NoLiveGateway(unittest.TestCase):

    ALL = ("products", "store", "checkout", "app", "index")

    def test_settle_is_still_a_local_stub(self):
        body = re.search(r"function settle\([\s\S]*?\n\}", strip_comments(read("checkout")))
        self.assertIsNotNone(body, "settle() is gone — that is the only payment seam.")
        body = body.group(0)
        for token in ("fetch(", "XMLHttpRequest", "axios", "navigator.sendBeacon", "import("):
            self.assertNotIn(
                token, body,
                f"settle() now makes a live call ({token}). This repo ships without "
                f"a gateway on purpose; wiring one in needs an explicit decision.",
            )
        self.assertIn("setTimeout", body, "settle() should resolve on a simulated delay.")

    def test_settle_contract_shape_preserved(self):
        body = re.search(r"function settle\([\s\S]*?\n\}", read("checkout")).group(0)
        self.assertIn("ok:", body.replace(" ", "").replace("ok :", "ok:"))
        self.assertRegex(body, r"ref\s*:", "settle() must still resolve with a `ref`.")

    def test_no_outbound_network_anywhere(self):
        for key in self.ALL:
            src = strip_comments(read(key))
            for token in ("fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket("):
                with self.subTest(file=key, token=token):
                    self.assertNotIn(token, src, f"{key}: unexpected network call `{token}`")

    def test_no_third_party_script_or_endpoint(self):
        html = read("index")
        remote = re.findall(r'<script[^>]+src=["\'](https?:)?//[^"\']+', html)
        self.assertEqual(remote, [], f"third-party scripts in index.html: {remote}")
        for key in ("checkout", "store", "app", "products"):
            urls = re.findall(r"https?://[^\s'\"`)]+", strip_comments(read(key)))
            self.assertEqual(urls, [], f"{key}: hardcoded endpoint(s) {urls}")

    def test_no_credentials_in_tree(self):
        patterns = [
            (r"\bsk_(live|test)_[A-Za-z0-9]{8,}", "Stripe secret key"),
            (r"\brzp_(live|test)_[A-Za-z0-9]{8,}", "Razorpay key"),
            (r"\bAKIA[0-9A-Z]{16}\b", "AWS access key id"),
            (r"\bghp_[A-Za-z0-9]{20,}", "GitHub token"),
            (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "private key"),
            (r"(?i)\b(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][^'\"]{12,}['\"]", "inline credential"),
        ]
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file() or ".git/" in str(path.relative_to(ROOT)):
                continue
            if path.suffix.lower() not in {".js", ".html", ".css", ".json", ".md", ".py", ".yml", ".yaml"}:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for pattern, label in patterns:
                with self.subTest(file=path.name, kind=label):
                    self.assertIsNone(
                        re.search(pattern, text),
                        f"{path.relative_to(ROOT)}: looks like a committed {label}",
                    )

    def test_no_eval_or_dynamic_code(self):
        for key in ("products", "store", "checkout", "app"):
            src = strip_comments(read(key))
            with self.subTest(file=key):
                self.assertNotRegex(src, r"\beval\s*\(", f"{key}: eval()")
                self.assertNotRegex(src, r"new\s+Function\s*\(", f"{key}: new Function()")


# ──────────────────────────────────────────────────────────────────────
# 3. Card data is never persisted
# ──────────────────────────────────────────────────────────────────────
class NoCardPersistence(unittest.TestCase):

    CARD_FIELDS = ("cardNum", "cardCvv", "cardExp", "cardName", "upi")

    def test_only_the_bag_key_is_persisted(self):
        for key in ("store", "checkout", "app"):
            src = strip_comments(read(key))
            for call in re.findall(r"localStorage\.setItem\(([^)]*)\)", src):
                with self.subTest(file=key, call=call.strip()):
                    self.assertIn(
                        "KEY", call,
                        "a second localStorage key appeared. The only persisted "
                        "state should be the bag.",
                    )

    def test_bag_key_holds_only_id_and_qty(self):
        src = strip_comments(read("store"))
        save = re.search(r"function save\([\s\S]*?\n\}", src)
        self.assertIsNotNone(save, "store.save() is gone")
        for field in self.CARD_FIELDS:
            self.assertNotIn(field, save.group(0), f"save() now writes `{field}`")
        load = re.search(r"function load\([\s\S]*?\n\}", src).group(0)
        self.assertRegex(
            load, r"\{\s*id\s*:[\s\S]{0,80}?qty\s*:",
            "load() should reconstruct only { id, qty } from storage.",
        )

    def test_card_fields_never_reach_storage_or_the_order_record(self):
        src = strip_comments(read("checkout") + "\n" + read("app"))
        for field in self.CARD_FIELDS:
            for m in re.finditer(rf"\b{field}\b", src):
                window = src[max(0, m.start() - 160): m.end() + 160]
                with self.subTest(field=field):
                    self.assertNotIn("localStorage", window, f"`{field}` near a localStorage call")
                    self.assertNotIn("JSON.stringify", window, f"`{field}` near a serialisation")

    def test_full_card_number_is_never_rendered_back(self):
        src = strip_comments(read("app"))
        for m in re.finditer(r"digits\(\s*f\.cardNum\s*\)", src):
            tail = src[m.end(): m.end() + 40]
            with self.subTest(at=m.start()):
                self.assertRegex(
                    tail, r"^\s*\.slice\(\s*-\d",
                    "the card number is being rendered without being truncated "
                    "to its last digits.",
                )

    def test_cvv_input_is_masked(self):
        src = read("app")
        self.assertRegex(
            src, r"field\('cardCvv'[^)]*'password'",
            "the CVV field is no longer a masked input.",
        )

    def test_luhn_is_local_only(self):
        """Validation must stay client-side; a checksum is not a gateway."""
        body = re.search(r"function luhn\([\s\S]*?\n\}", strip_comments(read("checkout"))).group(0)
        for token in ("fetch", "localStorage", "await"):
            self.assertNotIn(token, body, f"luhn() should be a pure function; found `{token}`")

    def test_luhn_actually_works(self):
        """Reimplemented here so a broken checksum in the JS is caught by shape."""
        src = strip_comments(read("checkout"))
        self.assertIn("sum % 10 === 0", src, "the Luhn terminating condition changed")
        self.assertRegex(src, r"d\s*\*=\s*2", "the Luhn doubling step is missing")
        self.assertRegex(src, r"d\s*-=\s*9", "the Luhn digit-fold step is missing")

    def test_card_validation_still_gates_checkout(self):
        src = strip_comments(read("checkout"))
        block = re.search(r"function validatePayment\([\s\S]*?\n\}", src).group(0)
        for expected in ("luhn(", "expired(", "cardCvv", "cardName"):
            self.assertIn(expected, block, f"validatePayment no longer checks `{expected}`")


# ──────────────────────────────────────────────────────────────────────
# 4. Output escaping
# ──────────────────────────────────────────────────────────────────────
class OutputEscaping(unittest.TestCase):

    def test_esc_helper_covers_the_dangerous_characters(self):
        src = read("app")
        m = re.search(r"const esc\s*=[\s\S]{0,400}?\);", src)
        self.assertIsNotNone(m, "esc() is gone — it is the only XSS defence here.")
        body = m.group(0)
        for ch, ent in (("&", "&amp;"), ("<", "&lt;"), (">", "&gt;"), ('"', "&quot;"), ("'", "&#39;")):
            with self.subTest(char=ch):
                self.assertIn(ent, body, f"esc() no longer encodes `{ch}`")

    def test_field_helper_escapes_its_value(self):
        """
        `field()` is the funnel every form input is rendered through, so it is
        the one place the escaping has to happen.
        """
        body = re.search(r"function field\([\s\S]*?\n\}", strip_comments(read("app")))
        self.assertIsNotNone(body, "field() is gone")
        self.assertRegex(
            body.group(0), r'value="\$\{\s*esc\(',
            "field() no longer escapes the value it renders back into the input.",
        )

    def test_form_values_are_escaped_before_interpolation(self):
        """
        Anything read from the user (the `f.` form object) that lands inside a
        template string destined for innerHTML must pass through esc(), or
        through a helper that escapes on its behalf.
        """
        # Helpers that escape (or numerically sanitise) their arguments.
        SAFE_CALL = re.compile(r"^(field|esc|inr|digits)\s*\(")
        # `f.x === y ? 'a' : 'b'` — the interpolated result is a fixed literal.
        LITERAL_TERNARY = re.compile(r"\?\s*'[^']*'\s*:\s*'[^']*'\s*$")

        src = strip_comments(read("app"))
        offenders = []
        for m in re.finditer(r"\$\{([^{}]+)\}", src):
            expr = m.group(1).strip()
            if not re.search(r"\bf\.[a-zA-Z]", expr):
                continue
            if SAFE_CALL.match(expr) or "esc(" in expr or "digits(" in expr or "inr(" in expr:
                continue
            if LITERAL_TERNARY.search(expr):
                continue
            offenders.append(expr)
        self.assertEqual(
            offenders, [],
            "unescaped user input interpolated into markup: " + json.dumps(offenders),
        )

    def test_stored_values_are_revalidated_on_load(self):
        """localStorage is user-writable; anything read back is untrusted."""
        load = re.search(r"function load\([\s\S]*?\n\}", strip_comments(read("store"))).group(0)
        self.assertIn("try", load, "load() must tolerate corrupt JSON")
        self.assertIn("byId(l.id)", load, "load() must drop ids not in the catalogue")
        self.assertRegex(load, r"qty\s*>\s*0", "load() must reject non-positive quantities")
        self.assertIn("Math.min", load, "load() must clamp restored quantities to stock")


# ──────────────────────────────────────────────────────────────────────
# 5. Catalogue integrity
# ──────────────────────────────────────────────────────────────────────
class CatalogueIntegrity(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.js = read("products")
        cls.items = parse_products(cls.js)
        cls.categories = re.findall(r"\{\s*id:\s*'([^']+)',\s*label:", cls.js)

    def test_ids_are_unique(self):
        ids = [p["id"] for p in self.items]
        dupes = sorted({i for i in ids if ids.count(i) > 1})
        self.assertEqual(dupes, [], f"duplicate product ids: {dupes}")

    def test_categories_exist(self):
        for p in self.items:
            with self.subTest(id=p["id"]):
                self.assertIn(p["cat"], self.categories, f"{p['id']} has unknown category `{p['cat']}`")

    def test_every_category_has_stock(self):
        for cat in self.categories:
            if cat == "all":
                continue
            with self.subTest(cat=cat):
                self.assertTrue(
                    any(p["cat"] == cat for p in self.items),
                    f"category `{cat}` is advertised but empty — the filter shows nothing.",
                )

    def test_required_fields_present(self):
        for p in self.items:
            with self.subTest(id=p["id"]):
                for field in ("name", "brand", "mark", "cat"):
                    self.assertTrue(p[field], f"{p['id']} missing `{field}`")
                self.assertTrue(p["has_specs"], f"{p['id']} missing `specs`")
                self.assertTrue(p["has_detail"], f"{p['id']} missing `detail`")
                self.assertEqual(len(p["tone"]), 1, f"{p['id']} needs exactly two tone colours")

    def test_stock_is_a_positive_integer(self):
        for p in self.items:
            with self.subTest(id=p["id"]):
                self.assertIsInstance(p["stock"], int)
                self.assertGreater(p["stock"], 0, f"{p['id']} is listed but unbuyable")


# ──────────────────────────────────────────────────────────────────────
# 6. Honesty of the demo
# ──────────────────────────────────────────────────────────────────────
class DemoHonesty(unittest.TestCase):
    """
    The storefront takes names, addresses, phone numbers and card details.
    It must read as a real shop that will really charge and really ship.
    """

    def test_readme_states_nothing_is_processed(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8").lower()
        self.assertTrue(
            "no payment is processed" in readme or "demonstration" in readme,
            "README no longer says this is a demonstration with no real payment.",
        )

    def test_gateway_seam_is_documented_in_source(self):
        src = read("checkout")
        self.assertIn(
            "no payment gateway", src.lower(),
            "the comment marking settle() as a simulation was removed. Someone "
            "reading only the source should not think this charges cards.",
        )

    def test_claude_md_present_and_names_the_rules(self):
        path = ROOT / "CLAUDE.md"
        if not path.exists():
            self.skipTest("CLAUDE.md not present")
        text = path.read_text(encoding="utf-8")
        for token in ("MAX_BUDGET", "settle()", "esc(", "localStorage"):
            self.assertIn(token, text, f"CLAUDE.md no longer mentions `{token}`")


if __name__ == "__main__":
    unittest.main(verbosity=2)
