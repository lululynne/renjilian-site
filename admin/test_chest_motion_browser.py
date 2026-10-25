#!/opt/homebrew/opt/python@3.14/bin/python3.14
"""Observe real avatar animation under both motion preferences in local browser fixtures."""
from __future__ import annotations

import json
import unittest

import test_chest_browser as fixtures


class ChestMotionBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.ChestBrowser.setUpClass()

    @classmethod
    def tearDownClass(cls):
        fixtures.ChestBrowser.tearDownClass()

    def setUp(self):
        self.fixture = fixtures.ChestBrowser("test_full_edit_preview_save_remove_reorder_and_filter")
        self.fixture.setUp()

    def tearDown(self):
        self.fixture.tearDown()

    def assert_motion_preferences(self, page):
        selector = ".collection-avatar .blink"
        self.assertGreater(page.locator(selector).count(), 0, "a real character avatar must render")
        observed = {}
        for preference in ["no-preference", "reduce", "no-preference"]:
            page.emulate_media(reduced_motion=preference)
            rows = page.locator(selector).evaluate_all(
                "els => els.map(el => ({name:getComputedStyle(el).animationName, "
                "animations:el.getAnimations().length}))")
            observed[preference] = rows
            if preference == "reduce":
                self.assertTrue(all(row["name"] == "none" and row["animations"] == 0 for row in rows), rows)
            else:
                self.assertTrue(all(row["name"] != "none" and row["animations"] > 0 for row in rows), rows)
        print(json.dumps({"local_browser_motion": observed}, ensure_ascii=False))

    def test_private_chest_stops_and_resumes_existing_avatar_animation(self):
        page, errors = self.fixture.page()
        self.assert_motion_preferences(page)
        self.assertEqual(errors, [])

    def test_public_collection_component_stops_and_resumes_existing_avatar_animation(self):
        context = fixtures.ChestBrowser.browser.new_context(reduced_motion="no-preference")
        self.fixture.contexts.append(context)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route(self.fixture.origin + "/a17-motion-check.html", lambda route: route.fulfill(
            status=200, content_type="text/html; charset=utf-8", body="""<!doctype html>
            <link rel="stylesheet" href="/avatar-v8.css">
            <link rel="stylesheet" href="/collection-view.css">
            <script src="/avatar-v8.js"></script><script src="/rj-card.js"></script>
            <script src="/collection-view.js"></script><div id="display"></div>"""))
        page.goto(self.fixture.origin + "/a17-motion-check.html")
        item = self.fixture.backend.items("A")[1]
        public_item = {key: item[key] for key in ["catalog_id", "kind", "name", "source_label", "preview"]}
        page.evaluate("item => RJ_COLLECTION.paint(document.getElementById('display'), "
                      "{slots:[{position:1,target_type:'owned_item',available:true,item}]})", public_item)
        self.assert_motion_preferences(page)
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
