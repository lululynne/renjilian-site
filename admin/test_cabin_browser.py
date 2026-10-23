"""Cabin selection, confirmation, reload and shared rendering in real Chromium."""
import copy
import os
from pathlib import Path
import unittest
import test_card_review_browser as fixture


class CabinBrowser(unittest.TestCase):
    setUpClass = classmethod(fixture.CardReviewBrowser.setUpClass.__func__)
    tearDownClass = classmethod(fixture.CardReviewBrowser.tearDownClass.__func__)
    setUp = fixture.CardReviewBrowser.setUp
    tearDown = fixture.CardReviewBrowser.tearDown
    open = fixture.CardReviewBrowser.open
    click_step = staticmethod(fixture.CardReviewBrowser.click_step)

    def flow(self, width):
        self.backend.own['card']['skin'] = 'polaroid'
        page, errors = self.open('挂上', {'width': width, 'height': 900})
        self.assertEqual(page.locator('[data-style]').count(), 4)
        page.locator('[data-style="cabin"]').click()
        self.assertEqual(page.locator('.final .big [data-skin="cabin"]').count(), 1)
        self.assertEqual(self.backend.own['card']['skin'], 'polaroid')
        page.locator('#reviewDraft').click()
        page.locator('#reviewPanel [data-skin="cabin"]').wait_for(state='visible')
        self.assertEqual(self.backend.confirms, [])
        self.assertEqual(self.backend.patches, [])
        self.assertEqual(self.backend.own['card']['skin'], 'polaroid')
        if os.environ.get('CABIN_SHOTS'):
            dest = Path(os.environ['CABIN_SHOTS']); dest.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(dest / f'cabin-review-{width}.png'), full_page=True, animations='disabled')
        page.locator('#confirmReview').click()
        page.locator('#reviewPanel').wait_for(state='hidden')
        self.assertEqual(len(self.backend.confirms), 1)
        self.assertEqual(self.backend.own['card']['skin'], 'cabin')
        page.reload(wait_until='networkidle')
        page.locator('[data-style="cabin"][aria-pressed="true"]').wait_for()
        self.assertEqual(page.locator('.final .big [data-skin="cabin"]').count(), 1)
        self.assertFalse(page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'))
        self.assertEqual([e for e in errors if not e.startswith('Failed to load resource:')], [])

    def test_mobile_select_review_confirm_reload(self): self.flow(390)
    def test_desktop_select_review_confirm_reload(self): self.flow(1100)

    def test_unknown_saved_skin_can_be_viewed_without_being_silently_rewritten(self):
        self.backend.own['card']['skin'] = 'future-skin'
        page, errors = self.open('挂上')
        self.assertIn('未识别的样式', page.locator('#pv .cap').inner_text())
        self.assertEqual(page.locator('.final .big [data-skin="polaroid"]').count(), 1)
        self.assertEqual(self.backend.own['card']['skin'], 'future-skin')
        self.assertEqual(self.backend.patches, [])
        self.assertEqual(self.backend.confirms, [])
        self.assertEqual([e for e in errors if not e.startswith('Failed to load resource:')], [])

    def test_modes_old_skins_unknown_fallback_and_text_escaping(self):
        context = self.browser.new_context(viewport={'width': 390, 'height': 900}, reduced_motion='reduce')
        self.contexts.append(context); page = context.new_page()
        page.set_content('<!doctype html><html><head></head><body class="rjk" style="margin:0"><main id="stage"></main></body></html>')
        for name in ['style.css', 'rj-card.css', 'avatar-v8.css']: page.add_style_tag(url=self.site + '/' + name)
        for name in ['avatar-v8.js', 'rj-card.js']: page.add_script_tag(url=self.site + '/' + name)
        own = copy.deepcopy(self.backend.own)
        own['card']['bio'] = '<img src=x onerror=alert(1)> & fixture'
        for width in (390, 1100):
            page.set_viewport_size({'width': width, 'height': 900})
            for kind in ('machine', 'human'):
                own['kind'] = kind
                for mode in ('logo', 'character'):
                    own['card']['avatar']['mode'] = mode
                    for skin in ('polaroid', 'rpg', 'holder', 'cabin', 'unknown', '__proto__', 'constructor'):
                        own['card']['skin'] = skin
                        page.evaluate('(d)=>{RJ_CARD.avDefs();document.querySelector("#stage").innerHTML=RJ_CARD.render(RJ_CARD.fromOwn(d));}', own)
                        expected = skin if skin in ('polaroid', 'rpg', 'holder', 'cabin') else 'polaroid'
                        self.assertEqual(page.locator('#stage [data-skin]').get_attribute('data-skin'), expected)
                        self.assertIn(own['card']['bio'], page.locator('#stage').inner_text())
                        self.assertEqual(page.locator('#stage img[onerror]').count(), 0)
                        if skin == 'cabin':
                            self.assertFalse(page.evaluate('document.documentElement.scrollWidth > innerWidth + 1'))
                            if os.environ.get('CABIN_SHOTS') and kind == 'machine':
                                page.screenshot(path=str(Path(os.environ['CABIN_SHOTS']) / f'cabin-{mode}-{width}.png'), full_page=True)


if __name__ == '__main__': unittest.main()
