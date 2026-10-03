"""End-to-end: the real web build in a real browser against a real server.

Starts the Flask dev server on the test database and drives app/dist with
Playwright (Chromium). Skipped when Playwright isn't installed.
"""

import os
import re
import socket
import subprocess
import sys
import time
from urllib.parse import quote

import pytest

sync_api = pytest.importorskip('playwright.sync_api')

from conftest import ROOT, SERVER, create_room, create_user, get_db, query  # noqa: E402

import demo  # noqa: E402

PORT = 5077
URL = f'http://127.0.0.1:{PORT}'


@pytest.fixture(scope='module')
def server():
    # GitHub credentials make the server offer 'Continue with GitHub' (github.com itself is stubbed)
    env = dict(
        os.environ,
        PORT=str(PORT),
        SECRET_KEY='e2e',
        GITHUB_CLIENT_ID='e2e-gh',
        GITHUB_CLIENT_SECRET='e2e',
        VAPID_PUBLIC_KEY='e2e-push-key',
        VAPID_PRIVATE_KEY='e2e',
    )
    proc = subprocess.Popen(
        [sys.executable, 'app.py'], cwd=SERVER, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    deadline = time.time() + 60
    while time.time() < deadline:
        try:
            socket.create_connection(('127.0.0.1', PORT), timeout=1).close()
            break
        except OSError:
            time.sleep(0.3)
    else:
        proc.kill()
        pytest.fail('server did not start')
    yield URL
    proc.terminate()
    proc.wait(timeout=10)


@pytest.fixture(scope='module')
def browser():
    with sync_api.sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def new_page(browser, locale='en-US'):
    context = browser.new_context(locale=locale, viewport={'width': 1280, 'height': 800})
    return context.new_page()


def log_in(page, username, password='secret123'):
    page.goto(URL)
    page.get_by_placeholder('Username').fill(username)
    page.get_by_placeholder('Password').fill(password)
    page.get_by_placeholder('Password').press('Enter')
    page.get_by_text('Lobby').first.wait_for()


def open_room(page, label):
    page.get_by_text(label, exact=True).first.click()
    page.get_by_placeholder('Type a message...').wait_for()


@pytest.fixture
def demo_room():
    with get_db() as conn:
        demo.seed(conn.cursor())
        conn.commit()


@pytest.fixture
def shots(request):
    """Screenshots of every page a test opened, kept when it fails (e2e-failures/)."""
    pages = []
    yield pages
    if request.node.rep_call.failed if hasattr(request.node, 'rep_call') else False:
        os.makedirs(os.path.join(ROOT, 'e2e-failures'), exist_ok=True)
        for i, page in enumerate(pages):
            page.screenshot(path=os.path.join(ROOT, 'e2e-failures', f'{request.node.name}-{i}.png'))


def test_guest_demo_is_read_only(server, browser, demo_room, shots):
    page = new_page(browser)
    shots.append(page)
    page.goto(URL)
    page.get_by_text('Take a look first').click()
    page.get_by_text('Reco Demo', exact=True).first.click()
    page.get_by_text('Welcome to the Reco demo', exact=False).wait_for()
    assert page.get_by_text("You're viewing a read-only demo", exact=False).is_visible()
    assert page.get_by_placeholder('Type a message...').count() == 0
    assert page.get_by_text('Lobby', exact=True).count() == 0  # real chats stay private


def test_send_a_message_and_another_user_sees_it_live(server, browser, shots):
    create_user('alice', screenname='Alice')
    create_user('bob', screenname='Bob')
    alice, bob = new_page(browser), new_page(browser)
    shots.extend([alice, bob])
    log_in(alice, 'alice')
    log_in(bob, 'bob')
    open_room(alice, 'Lobby')
    open_room(bob, 'Lobby')

    alice.get_by_placeholder('Type a message...').fill('hello from the browser')
    alice.get_by_placeholder('Type a message...').press('Enter')
    alice.get_by_text('hello from the browser').wait_for()
    bob.get_by_text('hello from the browser').wait_for(timeout=10000)


def test_dm_list_shows_last_message_and_online_dot_live(server, browser, shots):
    create_user('ivy', screenname='Ivy')
    create_user('jack', screenname='Jack')
    with get_db() as conn:
        conn.cursor().execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('dm:ivy:jack', 'ivy', 'Ivy', 'see you at 8')"
        )
        conn.commit()
    ivy, jack = new_page(browser), new_page(browser)
    shots.extend([ivy, jack])
    log_in(jack, 'jack')
    jack.get_by_text('see you at 8').wait_for()
    assert jack.get_by_label('Online').count() == 0  # Ivy isn't here yet

    log_in(ivy, 'ivy')
    jack.get_by_label('Online').wait_for(timeout=10000)
    ivy.get_by_text('You: see you at 8').wait_for()

    open_room(ivy, 'Jack')
    ivy.get_by_placeholder('Type a message...').fill('on my way')
    ivy.get_by_placeholder('Type a message...').press('Enter')
    jack.get_by_text('on my way').wait_for(timeout=10000)
    ivy.get_by_text('You: on my way').wait_for()

    ivy.context.close()
    jack.get_by_label('Online').wait_for(state='detached', timeout=10000)


def test_reply_quotes_the_message_it_answers(server, browser, shots):
    create_user('nora', screenname='Nora')
    create_user('omar', screenname='Omar')
    nora, omar = new_page(browser), new_page(browser)
    shots.extend([nora, omar])
    for page, name in ((nora, 'nora'), (omar, 'omar')):
        log_in(page, name)
        open_room(page, 'Lobby')
    omar.get_by_placeholder('Type a message...').fill('pizza tonight?')
    omar.get_by_placeholder('Type a message...').press('Enter')

    original = nora.get_by_text('pizza tonight?')
    original.hover()
    nora.get_by_label('Reply', exact=True).click()
    nora.get_by_text('Replying to Omar').wait_for()
    nora.get_by_placeholder('Type a message...').fill('yes!')
    nora.get_by_placeholder('Type a message...').press('Enter')
    nora.get_by_text('Replying to Omar').wait_for(state='detached')

    # Omar sees the quote of his own message (as "You"), and it jumps back to it when tapped
    quote = omar.get_by_label('Reply to You: pizza tonight?')
    quote.wait_for(timeout=10000)
    quote.click()


def test_others_see_who_is_typing(server, browser, shots):
    create_user('pia', screenname='Pia')
    create_user('quinn', screenname='Quinn')
    pia, quinn = new_page(browser), new_page(browser)
    shots.extend([pia, quinn])
    for page, name in ((pia, 'pia'), (quinn, 'quinn')):
        log_in(page, name)
        open_room(page, 'Lobby')
    box = quinn.get_by_placeholder('Type a message...')
    box.press_sequentially('on my way', delay=40)
    pia.get_by_text('Quinn is typing…').wait_for(timeout=10000)
    box.press('Enter')
    pia.get_by_text('on my way').wait_for(timeout=10000)
    pia.get_by_text('Quinn is typing…').wait_for(state='detached')  # the message ends it


def test_unread_counts_follow_you_to_another_device(server, browser, shots):
    create_user('rhea', screenname='Rhea')
    create_user('sam', screenname='Sam')
    with get_db() as conn:
        conn.cursor().execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('dm:rhea:sam', 'rhea', 'Rhea', 'ping')"
        )
        conn.commit()
    phone = new_page(browser)
    shots.append(phone)
    log_in(phone, 'sam')
    badge = phone.get_by_label('1', exact=True)
    badge.wait_for()  # a DM that arrived while away

    phone.get_by_text('Rhea', exact=True).first.click()
    phone.get_by_text('ping').last.wait_for()
    # Rhea writes again while Sam is looking at the DM: that one is read too
    rhea = new_page(browser)
    shots.append(rhea)
    log_in(rhea, 'rhea')
    rhea.get_by_text('Sam', exact=True).first.click()
    rhea.get_by_placeholder('Type a message...').fill('still there?')
    rhea.get_by_placeholder('Type a message...').press('Enter')
    phone.get_by_text('still there?').last.wait_for(timeout=10000)
    phone.wait_for_timeout(2500)  # read marks are reported every couple of seconds

    laptop = new_page(browser)
    shots.append(laptop)
    log_in(laptop, 'sam')
    laptop.get_by_text('still there?').first.wait_for()  # the DM preview has loaded
    assert laptop.get_by_label('1', exact=True).count() == 0
    assert laptop.get_by_label('2', exact=True).count() == 0


def test_sending_a_photo(server, browser, shots, tmp_path):
    from test_images import png

    create_user('tara', screenname='Tara')
    create_user('uma', screenname='Uma')
    photo = tmp_path / 'sunset.png'
    photo.write_bytes(png(40, 30))
    tara, uma = new_page(browser), new_page(browser)
    shots.extend([tara, uma])
    for page, name in ((tara, 'tara'), (uma, 'uma')):
        log_in(page, name)
        open_room(page, 'Lobby')

    with tara.expect_file_chooser() as chooser:
        tara.get_by_label('Send a photo').click()
    chooser.value.set_files(str(photo))

    # Uma sees it load (shrunk and re-encoded in Tara's browser, stored and served by the server)
    shown = uma.get_by_label('Photo', exact=True)
    shown.wait_for(timeout=15000)
    uma.wait_for_function(
        "() => [...document.querySelectorAll('img')].some(i => i.src.includes('/img/') && i.naturalWidth > 0)",
        timeout=15000,
    )
    shown.click()  # opens the viewer
    uma.get_by_label('Close').first.wait_for()
    # Chromium writes WebP: about half the size of the JPEG it used to be
    assert query('SELECT mime FROM images') == [{'mime': 'image/webp'}]


def test_chinese_browser_gets_chinese_ui(server, browser, shots):
    create_user('carol')
    page = new_page(browser, locale='zh-CN')
    shots.append(page)
    page.goto(URL)
    page.get_by_placeholder('用户名').fill('carol')
    page.get_by_placeholder('密码').fill('secret123')
    page.get_by_placeholder('密码').press('Enter')
    page.get_by_text('大厅').first.wait_for()


def test_random_match_text_chat_then_both_keep_in_touch(server, browser, shots):
    create_user('dave', screenname='Dave')
    create_user('erin', screenname='Erin')
    dave, erin = new_page(browser), new_page(browser)
    shots.extend([dave, erin])
    for page, name in ((dave, 'dave'), (erin, 'erin')):
        log_in(page, name)
        page.get_by_role('tab', name='Match').click()
        page.get_by_role('tab', name='Entertainment').click()
        page.get_by_role('checkbox', name='Music').click()
        page.get_by_text('Start matching', exact=True).click()

    for page in (dave, erin):
        page.get_by_label('You both like: Music').wait_for(timeout=10000)
    assert dave.get_by_text('Erin').count() == 0  # anonymous until both agree

    dave.get_by_placeholder('Type a message...').fill('hi stranger')
    dave.get_by_placeholder('Type a message...').press('Enter')
    erin.get_by_text('hi stranger').wait_for(timeout=10000)

    dave.get_by_role('button', name='Keep in touch', exact=True).click()
    dave.get_by_text('Waiting for them to agree').wait_for()
    erin.get_by_role('button', name='Keep in touch', exact=True).click()
    dave.get_by_text("You're now connected with Erin", exact=False).wait_for(timeout=10000)
    erin.get_by_text("You're now connected with Dave", exact=False).wait_for(timeout=10000)


def test_a_stranger_who_left_can_still_be_reported(server, browser, shots):
    create_user('fay', screenname='Fay')
    create_user('gus', screenname='Gus')
    fay, gus = new_page(browser), new_page(browser)
    shots.extend([fay, gus])
    for page, name in ((fay, 'fay'), (gus, 'gus')):
        log_in(page, name)
        page.get_by_role('tab', name='Match').click()
        page.get_by_role('tab', name='Entertainment').click()
        page.get_by_role('checkbox', name='Music').click()
        page.get_by_text('Start matching', exact=True).click()
    for page in (fay, gus):
        page.get_by_label('You both like: Music').wait_for(timeout=10000)

    gus.get_by_placeholder('Type a message...').fill('something rude')
    gus.get_by_placeholder('Type a message...').press('Enter')
    fay.get_by_text('something rude').wait_for(timeout=10000)
    gus.get_by_role('tab', name='Chats').click()  # and gone

    fay.on('dialog', lambda d: d.accept())  # "Report and block this person?"
    fay.get_by_role('button', name='Report this person').click(timeout=10000)
    fay.get_by_text("Reported. You won't be matched with them again.").wait_for()
    assert query('SELECT reporter, reported FROM reports') == [{'reporter': 'fay', 'reported': 'gus'}]


def test_guest_sees_matching_as_a_preview_that_asks_to_sign_up(server, browser, demo_room, shots):
    page = new_page(browser)
    shots.append(page)
    page.goto(URL)
    page.get_by_text('Take a look first').click()
    page.get_by_text('Reco Demo', exact=True).first.wait_for()
    page.get_by_role('tab', name='Match').click()
    page.get_by_role('checkbox', name='Just chatting').click()  # the page can be explored
    assert page.get_by_text('Start matching', exact=True).count() == 0
    page.get_by_text('Sign up to start matching', exact=True).click()
    page.get_by_placeholder('Display name').wait_for()  # the demo ends on the sign-up form


def test_long_messages_wrap_on_a_phone(server, browser, demo_room, shots):
    context = browser.new_context(
        viewport={'width': 320, 'height': 640}, has_touch=True, is_mobile=True, locale='en-US'
    )
    page = context.new_page()
    shots.append(page)
    page.goto(URL)
    page.get_by_text('Take a look first').click()
    page.get_by_text('Reco Demo', exact=True).first.click()
    page.get_by_text('Welcome to the Reco demo', exact=False).wait_for()
    page.wait_for_timeout(1000)  # screen transition
    too_wide = page.evaluate(
        "() => [...document.querySelectorAll('div')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).length"
    )
    assert too_wide == 0


def test_language_can_be_switched_before_logging_in(server, browser, shots):
    page = new_page(browser, locale='zh-CN')
    shots.append(page)
    page.goto(URL)
    page.get_by_placeholder('用户名').wait_for()
    page.get_by_label('语言').click()
    page.get_by_placeholder('Username').wait_for()


def test_back_on_a_phone_closes_the_chat_instead_of_leaving(server, browser, shots):
    create_user('frank')
    context = browser.new_context(
        viewport={'width': 390, 'height': 780}, has_touch=True, is_mobile=True, locale='en-US'
    )
    page = context.new_page()
    shots.append(page)
    log_in(page, 'frank')
    page.get_by_text('Lobby', exact=True).first.click()
    page.get_by_placeholder('Type a message...').wait_for()
    page.go_back()
    page.wait_for_timeout(800)  # slide-out animation
    assert page.url.startswith(URL)
    assert page.get_by_placeholder('Search chats').is_visible()
    assert not page.get_by_placeholder('Type a message...').is_visible()


def _swipe(page, x0, y0, x1, y1, steps=12):
    """A real finger drag (touchstart, touchmove..., touchend) through the DevTools protocol."""
    cdp = page.context.new_cdp_session(page)
    point = lambda x, y: [{'x': x, 'y': y}]  # noqa: E731
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': point(x0, y0)})
    for i in range(1, steps + 1):
        cdp.send(
            'Input.dispatchTouchEvent',
            {
                'type': 'touchMove',
                'touchPoints': point(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps),
            },
        )
        page.wait_for_timeout(16)
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    page.wait_for_timeout(800)  # slide animation


def test_swiping_right_in_a_chat_goes_back_to_the_list(server, browser, shots):
    create_user('hana')
    context = browser.new_context(
        viewport={'width': 390, 'height': 780}, has_touch=True, is_mobile=True, locale='en-US'
    )
    page = context.new_page()
    shots.append(page)
    log_in(page, 'hana')
    page.get_by_text('Lobby', exact=True).first.click()
    composer = page.get_by_placeholder('Type a message...')
    composer.wait_for()
    _wait_until_still(page, composer)  # the chat slides in from the right

    _swipe(page, 60, 400, 60, 250)  # scrolling up and down is not a swipe back
    assert composer.is_visible()
    _swipe(page, 40, 400, 110, 405)  # a short drag springs back
    assert composer.is_visible()
    _swipe(page, 40, 400, 320, 410)  # a real swipe closes the chat
    assert page.get_by_placeholder('Search chats').is_visible()
    assert not composer.is_visible()


def _touch(page, points):
    """Raw touch events: points is a list of ('start'|'move'|'end', x, y, pause_ms)."""
    cdp = page.context.new_cdp_session(page)
    kinds = {'start': 'touchStart', 'move': 'touchMove', 'end': 'touchEnd'}
    for kind, x, y, pause in points:
        cdp.send(
            'Input.dispatchTouchEvent',
            {
                'type': kinds[kind],
                'touchPoints': [] if kind == 'end' else [{'x': x, 'y': y}],
            },
        )
        if pause:
            page.wait_for_timeout(pause)


def _wait_until_still(page, locator, timeout_ms=5000):
    """Wait for an element to stop moving (slide-in animations) before tapping by coordinates."""
    last = None
    for _ in range(timeout_ms // 100):
        box = locator.bounding_box()
        if box and last and abs(box['x'] - last['x']) < 0.5 and abs(box['y'] - last['y']) < 0.5:
            return
        last = box
        page.wait_for_timeout(100)


def _phone(browser):
    context = browser.new_context(
        viewport={'width': 390, 'height': 780}, has_touch=True, is_mobile=True, locale='en-US'
    )
    return context.new_page()


def test_touch_gestures_close_a_dm_like_a_message_and_dismiss_panels(server, browser, shots):
    create_user('kim', screenname='Kim')
    create_user('lee', screenname='Lee')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('dm:kim:lee', 'lee', 'Lee', 'lunch?')"
        )
        cur.execute("UPDATE rooms SET members = array_append(members, 'kim') WHERE name = '大厅'")
        cur.execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('大厅', 'lee', 'Lee', 'double tap me')"
        )
        conn.commit()
    page = _phone(browser)
    shots.append(page)
    log_in(page, 'kim')

    # Slide a DM left: "Close" shows; tapping it closes the DM
    row = page.get_by_text('lunch?').bounding_box()
    y = row['y'] + row['height'] / 2
    _swipe(page, 300, y, 120, y + 4)
    page.get_by_text('Close', exact=True).click()
    page.get_by_text('lunch?').wait_for(state='detached')

    # Double tap someone's message: a 👍 lands, and a second double tap doesn't take it back
    open_room(page, 'Lobby')
    # The chat slides in from the right: measure only once it has stopped (on a slow CI
    # machine the first measurement was mid-slide and both taps landed beside the bubble)
    _wait_until_still(page, page.get_by_text('double tap me'))
    bubble = page.get_by_text('double tap me').bounding_box()
    bx, by = bubble['x'] + bubble['width'] / 2, bubble['y'] + bubble['height'] / 2
    # Quick taps: under load a slow gap could miss the 300 ms double-tap window
    double_tap = [('start', bx, by, 0), ('end', bx, by, 30), ('start', bx, by, 0), ('end', bx, by, 700)]
    _touch(page, double_tap)
    page.get_by_label('👍 1').wait_for()
    _touch(page, double_tap)
    page.wait_for_timeout(500)
    assert page.get_by_label('👍 1').is_visible()

    # Long-press opens the action sheet; dragging it down dismisses it.
    # (The reaction row pushed the bubble up: measure it again.)
    _wait_until_still(page, page.get_by_text('double tap me'))
    bubble = page.get_by_text('double tap me').bounding_box()
    bx, by = bubble['x'] + bubble['width'] / 2, bubble['y'] + bubble['height'] / 2
    _touch(page, [('start', bx, by, 700), ('end', bx, by, 600)])
    sheet_emoji = page.get_by_text('😮', exact=True)
    sheet_emoji.wait_for()
    _wait_until_still(page, sheet_emoji)
    top = sheet_emoji.bounding_box()
    _swipe(page, 200, top['y'] - 20, 200, top['y'] + 200)
    sheet_emoji.wait_for(state='detached')

    # The members drawer: swipe left in the room to pull it out, push it back right to close it
    _swipe(page, 340, 400, 120, 405)
    join = page.get_by_text('Join Voice', exact=False)
    join.wait_for()
    _wait_until_still(page, join)  # while it slides in, the finger would land on the backdrop
    _swipe(page, 150, 500, 380, 505)
    join.wait_for(state='detached')
    assert page.get_by_placeholder('Type a message...').is_visible()  # still in the room

    # The emoji picker is a bottom sheet on a phone: drag its top strip down to close it
    page.get_by_label('Emoji').first.click()
    search = page.get_by_placeholder('Search emoji…')
    search.wait_for()
    _wait_until_still(page, search)  # the sheet slides up first
    box = search.bounding_box()
    _swipe(page, 195, box['y'] - 26, 195, box['y'] + 260)
    search.wait_for(state='detached')


def test_emoji_picker_search_insert_and_recent(server, browser, shots):
    create_user('mona')
    page = new_page(browser)
    shots.append(page)
    log_in(page, 'mona')
    open_room(page, 'Lobby')
    page.get_by_label('Emoji').first.click()
    search = page.get_by_placeholder('Search emoji…')
    search.fill('zzqqxx')
    page.get_by_text('No emoji found').wait_for()
    search.fill('')
    page.get_by_text('😀', exact=True).first.click()
    assert '😀' in page.get_by_placeholder('Type a message...').input_value()
    # Used once, it's first in line next time
    page.get_by_label('Emoji').first.click()
    page.get_by_text('RECENTLY USED').wait_for()


def _speech_level_wav(path):
    """A 300 Hz tone at -20 dBFS: roughly speech level, well under the output limiter."""
    import math
    import struct
    import wave

    rate = 48000
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(
            b''.join(struct.pack('<h', int(3277 * math.sin(2 * math.pi * 300 * i / rate))) for i in range(rate * 10))
        )


# Level of what the page actually plays: its unmuted Web Audio output element
_OUTPUT_LEVEL = """async () => {
  const out = [...document.querySelectorAll('audio')].find(a => !a.muted && a.srcObject);
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  ctx.createMediaStreamSource(out.srcObject).connect(an);
  const buf = new Float32Array(an.fftSize);
  let sum = 0, n = 0;
  const end = performance.now() + 2000;
  while (performance.now() < end) {
    an.getFloatTimeDomainData(buf);
    for (const v of buf) { sum += v * v; n++; }
    await new Promise(r => setTimeout(r, 20));
  }
  ctx.close();
  return Math.sqrt(sum / n);
}"""


def test_voice_volumes_go_up_to_150_percent(server, browser, tmp_path, shots):
    """Two browsers in voice; every volume slider at 150% makes what's heard 1.5x louder."""
    create_user('gina', screenname='Gina')
    create_user('hugo', screenname='Hugo')
    wav = tmp_path / 'voice.wav'
    _speech_level_wav(wav)
    # A second browser with a fake microphone that plays the file (same Playwright instance)
    b = browser.browser_type.launch(
        args=[
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            f'--use-file-for-fake-audio-capture={wav}',
        ]
    )
    pages = []
    for user in ('gina', 'hugo'):
        ctx = b.new_context(locale='en-US', viewport={'width': 1280, 'height': 800}, permissions=['microphone'])
        page = ctx.new_page()
        shots.append(page)
        log_in(page, user)
        open_room(page, 'Lobby')
        page.get_by_text('Join Voice', exact=False).first.click()
        page.wait_for_timeout(1500)
        pages.append(page)
    gina, hugo = pages
    hugo.wait_for_timeout(2500)

    def to_max(page, slider):
        box = slider.bounding_box()
        page.mouse.click(box['x'] + box['width'] - 1, box['y'] + box['height'] / 2)
        page.wait_for_timeout(400)

    def settings_slider(page, index):
        page.get_by_label('Me', exact=True).click()  # settings open from your profile
        page.get_by_text('Settings', exact=True).click()
        page.get_by_role('tab', name='Voice', exact=True).click()
        # The device pickers load a moment later and resize the dialog: click after that
        page.get_by_role('combobox').first.wait_for()
        to_max(page, page.get_by_role('slider').nth(index))
        page.get_by_text('150%').first.wait_for()
        page.get_by_role('button', name='Close').last.click()
        page.get_by_label('Chats', exact=True).click()  # back to the room (voice stays connected)

    def louder_than(level):
        """Hugo's output level once a volume change has taken effect (on a slow machine that can
        lag the slider by a moment), then checked to be about 1.5x the level before."""
        deadline = time.time() + 3
        while True:
            now = hugo.evaluate(_OUTPUT_LEVEL)
            if now / level > 1.35 or time.time() > deadline:
                break
            hugo.wait_for_timeout(200)
        assert 1.35 < now / level < 1.65, now / level
        return now

    level = hugo.evaluate(_OUTPUT_LEVEL)
    assert level > 0.001  # Hugo hears Gina

    settings_slider(gina, 0)  # Gina's microphone
    level = louder_than(level)

    settings_slider(hugo, 1)  # Hugo's speaker
    level = louder_than(level)

    hugo.get_by_text('Gina', exact=True).first.click()  # Gina's volume, for Hugo only
    hugo.get_by_text('User volume').wait_for()
    to_max(hugo, hugo.get_by_role('slider').last)
    louder_than(level)
    b.close()


def test_github_sign_in_makes_an_account_that_can_add_a_password(server, browser, shots):
    from itsdangerous import URLSafeTimedSerializer

    page = new_page(browser)
    shots.append(page)
    # The button goes to our server, which redirects to GitHub; stop there instead of leaving
    # (Playwright doesn't intercept redirect targets, so stub our own route)
    sent_to = []

    def to_github(route):
        sent_to.append(route.fetch(max_redirects=0).headers['location'])
        route.fulfill(body='off to GitHub')

    page.route(f'{URL}/auth/github', to_github)
    page.goto(URL)
    page.get_by_text('Continue with GitHub').click()
    page.get_by_text('off to GitHub').wait_for()
    assert sent_to[0].startswith('https://github.com/login/oauth/authorize?') and 'client_id=e2e-gh' in sent_to[0]

    # Back from GitHub as someone new (the round trip itself is covered in test_oauth.py)
    ticket = URLSafeTimedSerializer('e2e', salt='oauth').dumps({'pv': 'github', 'id': '777'}, salt='oauth-signup')
    page.goto(f'{URL}/oauth#signup={ticket}&provider=github&username=octo_cat&screenname=Octo')
    page.get_by_text('One last step').wait_for()
    assert page.get_by_placeholder('Username').input_value() == 'octo_cat'
    page.get_by_text('Create account').click()
    page.get_by_text('Lobby').first.wait_for()
    assert 'signup=' not in page.url  # the ticket doesn't stay in the address bar

    page.goto(f'{URL}/me')
    page.get_by_text('Sign-in methods').wait_for()
    page.get_by_text('Connected', exact=True).wait_for()  # loaded after the page
    assert page.get_by_text('Not set', exact=True).is_visible()
    page.get_by_label('Set a password Password').click()
    page.get_by_placeholder('New password', exact=True).fill('octopass1')
    page.get_by_placeholder('Confirm new password').fill('octopass1')
    page.get_by_text('Save', exact=True).click()
    page.get_by_text('Sign in with your username and password').wait_for()

    other = new_page(browser)
    shots.append(other)
    log_in(other, 'octo_cat', 'octopass1')


def test_a_cancelled_github_sign_in_says_so_on_the_login_screen(server, browser, shots):
    page = new_page(browser)
    shots.append(page)
    page.goto(f'{URL}/oauth#error=oauth_cancelled')
    page.get_by_text('Sign-in was cancelled').wait_for()
    assert page.get_by_placeholder('Password').is_visible()


def test_every_log_out_button_signs_out(server, browser, shots):
    create_user('lou')
    desktop, phone = new_page(browser), _phone(browser)
    shots.extend([desktop, phone])

    log_in(desktop, 'lou')
    desktop.get_by_label('Log out').first.click()  # the nav rail's
    desktop.get_by_placeholder('Password').wait_for()

    log_in(desktop, 'lou')
    desktop.goto(f'{URL}/me')
    desktop.get_by_text('Log out', exact=True).click()  # the profile's
    desktop.get_by_placeholder('Password').wait_for()
    desktop.reload()  # and the session is really gone
    desktop.get_by_placeholder('Password').wait_for()

    log_in(phone, 'lou')
    phone.goto(f'{URL}/me')
    phone.get_by_text('Log out', exact=True).click()
    phone.get_by_placeholder('Password').wait_for()


# The browser's notification permission, as a page script sees it. Headless Chromium can't
# grant it, and a real subscription needs Google's push service (tests/test_webpush.py fakes
# that side); this covers what the page does with the answer.
_NOTIFICATION_STUB = """
window.Notification = class {
  static get permission() { return sessionStorage.getItem('stubPermission') || 'default'; }
  static async requestPermission() {
    sessionStorage.setItem('asked', '1');
    sessionStorage.setItem('stubPermission', 'denied');
    return 'denied';
  }
};
"""


def test_notifications_are_offered_in_the_app_before_the_browser_asks(server, browser, shots):
    create_user('nia')
    page = new_page(browser)
    shots.append(page)
    page.add_init_script(_NOTIFICATION_STUB)
    log_in(page, 'nia')
    page.get_by_text('Turn on notifications?').wait_for()
    assert not page.evaluate("sessionStorage.getItem('asked')")  # nothing until asked
    page.get_by_text('Turn on', exact=True).click()
    page.get_by_text('Turn on notifications?').wait_for(state='detached')
    assert page.evaluate("sessionStorage.getItem('asked')")
    page.goto(f'{URL}/me')
    page.get_by_text('Settings', exact=True).click()  # opens on notifications
    page.get_by_text('Blocked in this browser', exact=False).wait_for()


def test_not_now_keeps_the_notification_card_away(server, browser, shots):
    create_user('noa')
    page = new_page(browser)
    shots.append(page)
    page.add_init_script(_NOTIFICATION_STUB)
    log_in(page, 'noa')
    page.get_by_text('Not now', exact=True).click()
    page.get_by_text('Turn on notifications?').wait_for(state='detached')
    page.reload()
    page.get_by_text('Lobby').first.wait_for()
    page.wait_for_timeout(1000)
    assert page.get_by_text('Turn on notifications?').count() == 0


def test_a_notification_link_opens_that_dm(server, browser, shots):
    create_user('olga', screenname='Olga')
    create_user('pete', screenname='Pete')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('dm:olga:pete', 'olga', 'Olga', 'see you')"
        )
        conn.commit()
    link = '/room/dm%3Aolga%3Apete?otherUsername=olga&displayName=Olga'  # as webpush.notify builds it
    desktop, phone = new_page(browser), _phone(browser)
    shots.extend([desktop, phone])
    for page in (desktop, phone):
        log_in(page, 'pete')
        page.goto(URL + link)
        page.get_by_placeholder('Type a message...').wait_for()  # the DM is open
        page.get_by_text('see you').last.wait_for()
        assert page.get_by_text('Olga').first.is_visible()


def _dms_in_order(page):
    """Names in the list's DIRECT MESSAGES section, top to bottom."""
    return page.evaluate(
        """(names) => names
            .map((n) => [n, [...document.querySelectorAll('div[dir=auto]')].find((e) => e.textContent === n)])
            .filter(([, el]) => el)
            .sort((a, b) => a[1].getBoundingClientRect().top - b[1].getBoundingClientRect().top)
            .map(([n]) => n)""",
        ['Rae', 'Sol'],
    )


def test_pinning_and_muting_chats_from_the_list(server, browser, shots):
    create_user('quin')
    create_user('rae', screenname='Rae')
    create_user('sol', screenname='Sol')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO messages (room, username, screenname, text, created_at)'
            " VALUES ('dm:quin:rae', 'rae', 'Rae', 'old news', NOW() - INTERVAL '1 hour')"
        )
        cur.execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('dm:quin:sol', 'sol', 'Sol', 'newer')"
        )
        conn.commit()
    desktop, phone = new_page(browser), _phone(browser)
    shots.extend([desktop, phone])
    log_in(desktop, 'quin')
    desktop.get_by_text('old news').wait_for()
    assert _dms_in_order(desktop) == ['Sol', 'Rae']

    # Mouse: hover a row, ⋯, Pin: Rae goes to the top, here and on the phone
    desktop.get_by_text('Rae', exact=True).hover()
    desktop.get_by_label('More', exact=True).click()
    desktop.get_by_text('Pin', exact=True).click()
    desktop.get_by_label('Pinned').wait_for()
    assert _dms_in_order(desktop) == ['Rae', 'Sol']
    log_in(phone, 'quin')
    phone.get_by_label('Pinned').wait_for()
    assert _dms_in_order(phone) == ['Rae', 'Sol']

    # Touch: slide Sol's row left, Mute; the desktop hears about it too
    row = phone.get_by_text('newer').bounding_box()
    y = row['y'] + row['height'] / 2
    _swipe(phone, 300, y, 60, y + 4)
    phone.get_by_role('button', name='Mute', exact=True).click()  # (closed rows hide theirs)
    phone.get_by_label('Muted', exact=True).wait_for()
    desktop.get_by_label('Muted', exact=True).wait_for()


def test_searching_a_room_jumps_to_the_message(server, browser, shots):
    create_user('tara', screenname='Tara')
    create_room('trivia', 'tara', members=['tara'])
    with get_db() as conn:
        cur = conn.cursor()
        # Far enough back that the chat has to load older pages to reach it
        cur.execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('trivia', 'tara', 'Tara', 'the capital is Canberra')"
        )
        for i in range(120):
            cur.execute(
                "INSERT INTO messages (room, username, screenname, text) VALUES ('trivia', 'tara', 'Tara', %s)",
                (f'filler {i}',),
            )
        conn.commit()
    page = new_page(browser)
    shots.append(page)
    log_in(page, 'tara')
    open_room(page, 'trivia')
    page.get_by_text('filler 119').wait_for()
    assert page.get_by_text('the capital is Canberra').count() == 0  # not loaded yet
    page.get_by_label('Room info').click()
    page.get_by_label('Search', exact=True).click()
    page.get_by_placeholder('Search messages').fill('canberra')
    page.get_by_text('the capital is', exact=False).last.click()
    page.get_by_text('the capital is Canberra').wait_for()
    page.wait_for_timeout(800)
    assert page.get_by_text('the capital is Canberra').is_visible()  # scrolled into view


def test_a_dm_card_mutes_the_chat_and_shows_its_photos(server, browser, shots):
    create_user('uma', screenname='Uma')
    create_user('vic', screenname='Vic')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('dm:uma:vic', 'vic', 'Vic', 'hey')"
        )
        conn.commit()
    page = new_page(browser)
    shots.append(page)
    log_in(page, 'uma')
    page.get_by_text('hey').first.click()
    page.get_by_placeholder('Type a message...').wait_for()
    page.get_by_label('Chat info').click()
    page.get_by_text('Mute notifications').wait_for()
    page.get_by_label('Mute notifications').click()
    page.get_by_label('Muted', exact=True).first.wait_for()  # the list row shows it
    page.get_by_label('Photos', exact=True).click()
    page.get_by_text('No photos here yet').wait_for()


def test_an_owner_posts_an_announcement_and_makes_the_room_invite_only(server, browser, shots):
    create_user('wren', screenname='Wren')
    create_user('xavi', screenname='Xavi')
    create_user('yara', screenname='Yara')
    create_room('garden', 'wren', members=['wren', 'xavi'])
    code = query_code('garden')
    owner, member, stranger = new_page(browser), new_page(browser), new_page(browser)
    shots.extend([owner, member, stranger])

    log_in(owner, 'wren')
    open_room(owner, 'garden')
    owner.get_by_label('Room info').click()
    owner.get_by_label('Description and announcement', exact=True).click()
    owner.get_by_label('Announcement', exact=True).fill('Seed swap on Saturday')
    owner.get_by_text('Save', exact=True).click()
    owner.get_by_text('Seed swap on Saturday').wait_for()  # back on the card
    owner.get_by_label('Who can join', exact=True).click()
    owner.get_by_label('Invited only', exact=True).click()
    owner.get_by_text('Save', exact=True).click()
    owner.get_by_text('Invited only').wait_for()

    log_in(member, 'xavi')
    open_room(member, 'garden')
    member.get_by_text('Wren updated the announcement').wait_for()
    member.get_by_label('Room info').click()
    member.get_by_text('Seed swap on Saturday').wait_for()
    assert member.get_by_text('Room settings').count() == 0  # members don't get the admin pages

    log_in(stranger, 'yara')
    stranger.get_by_label('Create Room / Find Room').click()
    stranger.get_by_text('Find Room', exact=True).click()
    stranger.get_by_placeholder('Enter 6-digit room code').fill(code)
    stranger.get_by_placeholder('Enter 6-digit room code').press('Enter')
    stranger.get_by_text('This room is invite-only').wait_for()


def query_code(room):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute('SELECT code FROM rooms WHERE name = %s', (room,))
        return cur.fetchone()['code']


def test_a_long_chinese_message_fills_its_bubble_and_the_box_shrinks_back(server, browser, shots):
    create_user('zhou', screenname='Zhou')
    page = new_page(browser, locale='zh-CN')
    shots.append(page)
    page.goto(URL)
    page.get_by_placeholder('用户名').fill('zhou')
    page.get_by_placeholder('密码').fill('secret123')
    page.get_by_placeholder('密码').press('Enter')
    page.get_by_text('大厅', exact=True).first.click()
    box = page.get_by_placeholder('输入消息...')
    box.wait_for()
    text = '这本书我读了两遍，第一次觉得节奏太慢，第二次才发现每一章其实都在为结尾铺垫，越想越有意思。'
    box.fill(text)
    assert box.bounding_box()['height'] > 50  # grew to fit
    box.press('Enter')
    bubble = page.get_by_text(text).last
    bubble.wait_for()
    # Chinese may break between any two characters: a bubble narrower than it should be showed up as
    # early wrapping, down to one character a line. It should use the room it has (72% of the row).
    assert bubble.bounding_box()['width'] > 350
    page.wait_for_timeout(300)
    assert box.bounding_box()['height'] < 45  # back to one line once sent

    # A sentence that fits on one line stays on one line (it used to wrap at 85% of its own width)
    short = '周日下午四点见，记得带零食过来'
    box.fill(short)
    box.press('Enter')
    page.get_by_text(short).last.wait_for()
    assert page.get_by_text(short).last.bounding_box()['height'] < 30


def test_create_a_room_with_a_password_and_join_it_by_code(server, browser, shots):
    create_user('abby')
    create_user('ben')
    owner, guest = new_page(browser), new_page(browser)
    shots.extend([owner, guest])
    codes = []
    owner.on('dialog', lambda d: (codes.append(d.message), d.accept()))  # "Room code: 123456"
    log_in(owner, 'abby')
    owner.get_by_label('Create Room / Find Room').click()
    owner.get_by_text('Create Room', exact=True).last.click()
    owner.get_by_placeholder('Room name').fill('darkroom')
    owner.get_by_placeholder('Password (optional)').fill('shutter')
    owner.get_by_placeholder('Password (optional)').press('Enter')
    owner.get_by_placeholder('Type a message...').wait_for()  # the creator is let straight in
    code = codes[0].split(':')[-1].strip()

    log_in(guest, 'ben')
    guest.get_by_label('Create Room / Find Room').click()
    guest.get_by_text('Find Room', exact=True).click()
    guest.get_by_placeholder('Enter 6-digit room code').fill(code)
    guest.get_by_placeholder('Enter 6-digit room code').press('Enter')
    guest.get_by_placeholder('Password', exact=True).fill('wrong')
    with guest.expect_event('dialog') as refused:  # "Wrong password": listed, but not let in
        guest.get_by_placeholder('Password', exact=True).press('Enter')
    refused.value.dismiss()
    # The alert paused the page; let the find dialog finish closing before asking again
    guest.get_by_placeholder('Password', exact=True).wait_for(state='detached')
    guest.get_by_text('darkroom', exact=True).first.click()
    guest.get_by_placeholder('Password', exact=True).fill('shutter')
    guest.get_by_placeholder('Password', exact=True).press('Enter')
    guest.get_by_placeholder('Type a message...').wait_for()


def test_the_reaction_bar_opens_next_to_its_message(server, browser, shots):
    create_user('cara', screenname='Cara')
    create_user('dov', screenname='Dov')
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE rooms SET members = array_append(members, 'cara') WHERE name = '大厅'")
        for i in range(8):
            cur.execute(
                "INSERT INTO messages (room, username, screenname, text) VALUES ('大厅', 'dov', 'Dov', %s)",
                (f'line {i}',),
            )
        conn.commit()
    page = new_page(browser)
    shots.append(page)
    log_in(page, 'cara')
    open_room(page, 'Lobby')
    page.get_by_text('line 1', exact=True).hover()
    button = page.get_by_label('Emoji', exact=True).first
    at = button.bounding_box()
    button.click()
    bar = page.get_by_label('👍', exact=True).first.bounding_box()
    # Just above (or below) the button: the message list is drawn upside down (scaleY(-1)) and
    # react-native-web's measure() ignores that, which used to put the bar at the mirrored height
    assert -75 < bar['y'] - at['y'] < 45, (bar, at)  # the bar's buttons sit ~55 px above, or just below


# ── voice: what the voice code must keep doing (written before its rewrite) ──


def _voice_pages(browser, tmp_path, shots, users, room='Lobby'):
    """Pages for `users` in `room`, each in voice with a fake microphone playing a tone."""
    wav = tmp_path / 'voice.wav'
    _speech_level_wav(wav)
    b = browser.browser_type.launch(
        args=[
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            f'--use-file-for-fake-audio-capture={wav}',
        ]
    )
    pages = []
    for user in users:
        ctx = b.new_context(locale='en-US', viewport={'width': 1280, 'height': 800}, permissions=['microphone'])
        page = ctx.new_page()
        shots.append(page)
        log_in(page, user)
        open_room(page, room)
        page.get_by_text('Join Voice', exact=False).first.click()
        page.get_by_label('Leave Voice').wait_for()
        pages.append(page)
    pages[-1].wait_for_timeout(2500)  # connections settle
    return b, pages


def _level_until(page, check, seconds=15):
    """Measure the page's output until `check(level)` holds (or time runs out); the last level."""
    deadline = time.time() + seconds
    while True:
        level = page.evaluate(_OUTPUT_LEVEL)
        if check(level) or time.time() > deadline:
            return level


def test_voice_mute_deafen_leave_and_rejoin(server, browser, tmp_path, shots):
    create_user('ivy', screenname='Ivy')
    create_user('jon', screenname='Jon')
    b, (ivy, jon) = _voice_pages(browser, tmp_path, shots, ['ivy', 'jon'])
    heard = _level_until(jon, lambda v: v > 0.001)
    assert heard > 0.001  # Jon hears Ivy

    ivy.get_by_role('button', name='Mute mic').click()
    assert _level_until(jon, lambda v: v < heard * 0.1) < heard * 0.1
    ivy.get_by_role('button', name='Unmute mic').click()
    assert _level_until(jon, lambda v: v > heard * 0.6) > heard * 0.6

    jon.get_by_role('button', name='Deafen').click()
    assert _level_until(jon, lambda v: v < heard * 0.1) < heard * 0.1
    jon.get_by_role('button', name='Undeafen').click()
    assert _level_until(jon, lambda v: v > heard * 0.6) > heard * 0.6

    # Ivy leaves: gone from Jon's voice card; she comes back and is heard again
    ivy.get_by_label('Leave Voice').click()
    jon.get_by_label('Voice Chat').get_by_label('Ivy', exact=True).wait_for(state='detached')
    ivy.get_by_text('Join Voice', exact=False).first.click()
    jon.get_by_label('Voice Chat').get_by_label('Ivy', exact=True).wait_for()
    assert _level_until(jon, lambda v: v > heard * 0.6) > heard * 0.6
    b.close()


def test_sharing_a_screen_shows_you_a_preview(server, browser, tmp_path, shots):
    create_user('mo', screenname='Mo')
    create_user('nia', screenname='Nia')
    b, (mo, nia) = _voice_pages(browser, tmp_path, shots, ['mo', 'nia'])
    mo.get_by_role('button', name='Share Screen').click()

    playing = "() => [...document.querySelectorAll('video')].some(v => v.videoWidth > 0 && !v.paused)"
    # Mo sees his own screen, silent (he'd hear what he shares twice), with a way to stop it
    mo.get_by_text('Your screen').wait_for(timeout=15000)
    mo.wait_for_function(playing, timeout=15000)
    assert mo.evaluate("() => [...document.querySelectorAll('video')].every(v => v.muted)")
    # and Nia sees it as Mo's
    nia.get_by_text('Mo', exact=True).last.wait_for()
    nia.wait_for_function(playing, timeout=15000)
    assert nia.get_by_text('Your screen').count() == 0

    # The strip of screens is as tall as you drag it, and stays that way on this device
    def drag(handle, dx, dy):
        box = handle.bounding_box()
        mo.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        mo.mouse.down()
        mo.mouse.move(box['x'] + box['width'] / 2 + dx, box['y'] + box['height'] / 2 + dy, steps=5)
        mo.mouse.up()

    resize = mo.get_by_role('separator', name='Drag to resize (double-click to reset)')
    strip = resize.locator('xpath=..')
    before = strip.bounding_box()['height']
    drag(resize, 0, 100)
    mo.wait_for_function(
        '([e, h]) => Math.abs(e.getBoundingClientRect().height - h) <= 2', arg=[strip.element_handle(), before + 100]
    )
    saved = "() => JSON.parse(localStorage.getItem('chat-prefs')).state"
    assert abs(mo.evaluate(saved)['streamHeight'] - (before + 100)) <= 2

    # Popped out, its window is resized from the corner
    mo.get_by_role('button', name='Pop out').click()
    corner = mo.get_by_role('separator', name='Drag to resize (double-click to reset)')
    window = corner.locator('xpath=..')
    drag(corner, 80, 60)
    mo.wait_for_function('e => e.offsetWidth === 400 && e.offsetHeight === 270', arg=window.element_handle())
    assert mo.evaluate(saved)['floaterSize'] == {'width': 400, 'height': 270}

    mo.get_by_role('button', name='Stop Sharing Screen').first.click()
    mo.get_by_text('Your screen').wait_for(state='detached')
    assert mo.locator('video').count() == 0
    b.close()


def test_voice_comes_back_after_the_connection_drops(server, browser, tmp_path, shots):
    create_user('kai', screenname='Kai')
    create_user('lia', screenname='Lia')
    b, (kai, lia) = _voice_pages(browser, tmp_path, shots, ['kai', 'lia'])
    heard = _level_until(lia, lambda v: v > 0.001)
    assert heard > 0.001
    # Kai's network drops and returns: the socket reconnects, rejoins voice, and is heard again
    kai.context.set_offline(True)
    kai.wait_for_timeout(3000)
    kai.context.set_offline(False)
    assert _level_until(lia, lambda v: v > heard * 0.6, seconds=30) > heard * 0.6
    b.close()


def test_an_admin_takes_someone_off_voice(server, browser, tmp_path, shots):
    create_user('mae', screenname='Mae')
    create_user('ned', screenname='Ned')
    b, (mae, ned) = _voice_pages(browser, tmp_path, shots, ['mae', 'ned'])
    # The site admin panel (the e2e server shares the tests' ADMIN_PASSWORD). Its requests go
    # through Playwright: a blocking urllib call would keep Ned's dialog listener from reaching
    # the browser in time, and the alert would be dismissed unseen.
    admin = b.new_context().request
    admin.post(URL + '/admin/login', form={'password': os.environ['ADMIN_PASSWORD']})
    with ned.expect_event('dialog') as told:
        admin.post(
            URL + '/admin/rooms/' + quote('大厅') + '/restrict',
            form={'username': 'ned', 'kind': 'voice', 'duration': '0'},
        )
    assert 'Removed from Voice' in told.value.message
    told.value.dismiss()
    ned.get_by_text('Join Voice', exact=False).first.wait_for()
    mae.get_by_label('Voice Chat').get_by_label('Ned', exact=True).wait_for(state='detached')
    b.close()


# ── personal settings ─────────────────────────────────────────


def _open_settings(page, section):
    page.get_by_label('Me', exact=True).click()
    page.get_by_text('Settings', exact=True).click()
    page.get_by_role('tab', name=section, exact=True).click()


def test_settings_change_the_theme_text_size_and_clock(server, browser, shots):
    create_user('rae', screenname='Rae')
    with get_db() as conn:
        conn.cursor().execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('大厅', 'rae', 'Rae', 'evening all')"
        )
        conn.commit()
    page = new_page(browser)
    shots.append(page)
    page.emulate_media(color_scheme='light')
    log_in(page, 'rae')
    ground = lambda: page.evaluate('getComputedStyle(document.body).backgroundColor')  # noqa: E731
    light = ground()

    _open_settings(page, 'Appearance')
    page.get_by_role('radio', name='Dark', exact=True).click()
    page.wait_for_function(f'getComputedStyle(document.body).backgroundColor !== {light!r}')
    page.get_by_role('radio', name='System', exact=True).click()  # follows the device, which is light
    page.wait_for_function(f'getComputedStyle(document.body).backgroundColor === {light!r}')
    page.emulate_media(color_scheme='dark')  # ...and keeps following it
    page.wait_for_function(f'getComputedStyle(document.body).backgroundColor !== {light!r}')

    page.get_by_role('tab', name='Chat', exact=True).click()
    page.get_by_role('radio', name='Large', exact=True).click()
    page.get_by_role('radio', name='12-hour', exact=True).click()
    page.get_by_role('button', name='Close').last.click()

    page.get_by_label('Chats', exact=True).click()
    open_room(page, 'Lobby')
    bubble = page.get_by_text('evening all', exact=True).last
    assert bubble.evaluate('e => getComputedStyle(e).fontSize') == '17px'
    page.get_by_text(re.compile(r'^\d{1,2}:\d{2} [AP]M$')).first.wait_for()  # the time separator
    page.reload()  # kept on this device
    open_room(page, 'Lobby')
    page.get_by_text('evening all', exact=True).last.wait_for()
    assert page.get_by_text('evening all', exact=True).last.evaluate('e => getComputedStyle(e).fontSize') == '17px'


def test_nobody_can_message_first_and_blocked_people_can_be_unblocked(server, browser, shots):
    create_user('sal', screenname='Sal')
    create_user('tom', screenname='Tom')
    create_user('uma', screenname='Uma')
    with get_db() as conn:
        conn.cursor().execute("INSERT INTO blocks (blocker, blocked) VALUES ('sal', 'uma')")
        conn.commit()
    sal, tom = new_page(browser), new_page(browser)
    shots.extend([sal, tom])
    log_in(sal, 'sal')
    _open_settings(sal, 'Privacy')
    sal.get_by_role('radio', name='Nobody', exact=True).click()

    sal.get_by_text('Uma', exact=True).wait_for()  # the blocked list
    sal.get_by_role('button', name='Unblock Uma').click()
    sal.get_by_text('blocked anyone', exact=False).wait_for()
    assert query('SELECT * FROM blocks') == []

    # Saved with the account: Tom can't start a DM with Sal
    deadline = time.time() + 5
    while query("SELECT 1 FROM users WHERE username = 'sal' AND dm_from = 'nobody'") == [] and time.time() < deadline:
        time.sleep(0.1)
    log_in(tom, 'tom')
    tom.goto(URL + '/room/dm%3Asal%3Atom?otherUsername=sal&displayName=Sal')
    box = tom.get_by_placeholder('Type a message...')
    box.fill('hi sal')
    box.press('Enter')
    tom.get_by_text('Not sent', exact=False).wait_for()
    assert query("SELECT 1 FROM messages WHERE room = 'dm:sal:tom'") == []


def test_on_a_phone_settings_is_a_page_off_the_me_tab(server, browser, shots):
    create_user('val', screenname='Val')
    phone = _phone(browser)
    shots.append(phone)
    log_in(phone, 'val')
    phone.goto(f'{URL}/me')
    phone.get_by_text('Settings', exact=True).click()
    phone.get_by_text('Who can message me first').wait_for()
    phone.get_by_role('radio', name='People in my rooms', exact=True).click()
    deadline = time.time() + 5
    while query("SELECT 1 FROM users WHERE username = 'val' AND dm_from = 'rooms'") == [] and time.time() < deadline:
        time.sleep(0.1)
    assert query("SELECT 1 FROM users WHERE username = 'val' AND dm_from = 'rooms'")
    phone.get_by_label('Back', exact=True).click()
    phone.get_by_text('Edit Profile').wait_for()


def test_links_new_messages_drafts_and_pins(server, browser, shots):
    create_user('lea', screenname='Lea')
    create_user('max', screenname='Max')
    create_room('club', 'lea', members=['lea', 'max'])
    lea, max_ = new_page(browser), new_page(browser)
    shots.extend([lea, max_])
    for page, name in ((lea, 'lea'), (max_, 'max')):
        log_in(page, name)
    open_room(lea, 'club')
    open_room(max_, 'club')
    max_.get_by_placeholder('Type a message...').fill('hello club')
    max_.get_by_placeholder('Type a message...').press('Enter')
    lea.get_by_text('hello club').wait_for()

    # Max leaves half a sentence in the box and goes to the lobby: it waits there, listed as a draft
    max_.get_by_placeholder('Type a message...').fill('I was going to say')
    open_room(max_, 'Lobby')
    max_.get_by_text('[Draft]', exact=False).wait_for()
    assert max_.get_by_text('I was going to say', exact=False).count() == 1

    # Meanwhile Lea writes, with a link
    box = lea.get_by_placeholder('Type a message...')
    box.fill('the plan is at https://example.com/plan.')
    box.press('Enter')
    for i in range(9):
        box.fill(f'detail {i}')
        box.press('Enter')
        lea.wait_for_timeout(1300)  # under the send rate limit
    # and pins the first one
    lea.get_by_text('the plan is at', exact=False).hover()
    lea.get_by_label('Pin', exact=True).click()
    lea.get_by_label('Pinned message', exact=True).wait_for()

    # Max comes back: his draft, "New messages" above the first one he hasn't seen, the pin
    open_room(max_, 'club')
    assert max_.get_by_placeholder('Type a message...').input_value() == 'I was going to say'
    max_.get_by_label('New messages', exact=True).wait_for()
    max_.get_by_label('Pinned message', exact=True).wait_for()
    link = max_.locator('a[href="https://example.com/plan"]')
    link.wait_for()
    assert link.get_attribute('target') == '_blank' and 'noopener' in link.get_attribute('rel')
    assert link.inner_text() == 'https://example.com/plan'  # the full stop stays outside


def test_a_message_can_be_reported_from_beside_it(server, browser, shots):
    create_user('ivy', screenname='Ivy')
    create_user('kim', screenname='Kim')
    ivy, kim = new_page(browser), new_page(browser)
    shots.extend([ivy, kim])
    for page, name in ((ivy, 'ivy'), (kim, 'kim')):
        log_in(page, name)
        open_room(page, 'Lobby')
    kim.get_by_placeholder('Type a message...').fill('buy followers here')
    kim.get_by_placeholder('Type a message...').press('Enter')

    ivy.get_by_text('buy followers here').hover()
    ivy.on('dialog', lambda d: d.accept())  # "Send this message to the moderators?", then "Report submitted"
    ivy.get_by_label('Report message', exact=True).click()
    deadline = time.time() + 10
    while not query('SELECT 1 FROM reports') and time.time() < deadline:
        time.sleep(0.2)
    assert query('SELECT reporter, reported, message_text FROM reports') == [
        {'reporter': 'ivy', 'reported': 'kim', 'message_text': 'buy followers here'}
    ]
    kim.get_by_text('buy followers here').hover()  # nobody reports their own
    assert kim.get_by_label('Report message', exact=True).count() == 0


def test_mention_someone_and_they_see_it(server, browser, shots):
    create_user('abe', screenname='Abe')
    create_user('bea', screenname='Bea Lee')
    create_user('ben', screenname='Ben')
    create_room('crew', 'abe', members=['abe', 'bea', 'ben'])
    abe, bea = new_page(browser), new_page(browser)
    shots.extend([abe, bea])
    log_in(bea, 'bea')
    bea.get_by_text('crew', exact=True).wait_for()
    log_in(abe, 'abe')
    open_room(abe, 'crew')
    box = abe.get_by_placeholder('Type a message...')
    box.click()
    box.press_sequentially('lunch @b')
    picker = abe.get_by_role('menu', name='Mention someone')
    picker.get_by_role('menuitem').first.wait_for()
    assert picker.get_by_role('menuitem').count() == 2  # Bea and Ben, not Abe himself
    box.press('ArrowDown')
    box.press('ArrowUp')
    box.press('Enter')  # picks Bea (first by name), doesn't send
    assert box.input_value() == 'lunch @bea '
    picker.wait_for(state='detached')
    box.press_sequentially('at 1?')
    box.press('Enter')
    abe.get_by_text('@Bea Lee', exact=True).wait_for()  # shown by display name
    assert box.input_value() == ''

    # Bea, on the list: the room says she was mentioned, and the message stands out
    bea.get_by_text('[Mentioned you]').wait_for()
    open_room(bea, 'crew')
    chip = bea.get_by_text('@Bea Lee', exact=True)
    chip.wait_for()
    assert chip.evaluate('e => getComputedStyle(e).backgroundColor') == 'rgb(255, 176, 32)'  # sunny: it's her
    bea.get_by_label('Chats', exact=True).click()
    assert bea.get_by_text('[Mentioned you]').count() == 0


def test_the_owner_mentions_everyone(server, browser, shots):
    create_user('ada', screenname='Ada')
    create_user('bo', screenname='Bo')
    create_room('crew', 'ada', members=['ada', 'bo'])
    ada, bo = new_page(browser), new_page(browser)
    shots.extend([ada, bo])
    log_in(bo, 'bo')
    open_room(bo, 'crew')
    # A plain member isn't offered @everyone
    box = bo.get_by_placeholder('Type a message...')
    box.click()
    box.press_sequentially('@ev')
    bo.wait_for_timeout(300)
    assert bo.get_by_role('menu', name='Mention someone').count() == 0
    box.fill('')

    log_in(ada, 'ada')
    open_room(ada, 'crew')
    box = ada.get_by_placeholder('Type a message...')
    box.click()
    box.press_sequentially('@ev')
    picker = ada.get_by_role('menu', name='Mention someone')
    picker.get_by_text('Notify everyone in this room').wait_for()
    box.press('Enter')
    assert box.input_value() == '@everyone '
    box.press_sequentially('standup in 5')
    box.press('Enter')

    chip = bo.get_by_text('@everyone', exact=True)
    chip.wait_for()
    assert chip.evaluate('e => getComputedStyle(e).backgroundColor') == 'rgb(255, 176, 32)'  # sunny: it means him


def test_messages_show_right_after_a_reload_both_ways(server, browser, shots):
    """The cached history once shared its list with the screen: after a reload, new messages
    (yours and theirs) were stored but not shown until the next reload."""
    create_user('amy', screenname='Amy')
    create_user('bud', screenname='Bud')
    with get_db() as conn:
        conn.cursor().execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('dm:amy:bud', 'bud', 'Bud', 'old one')"
        )
        conn.commit()
    amy, bud = new_page(browser), new_page(browser)
    shots.extend([amy, bud])
    log_in(amy, 'amy')
    open_room(amy, 'Bud')
    box = amy.get_by_placeholder('Type a message...')
    box.fill('first')
    box.press('Enter')
    amy.get_by_text('first', exact=True).wait_for()
    amy.wait_for_timeout(800)  # the cache is saved
    amy.reload()
    open_room(amy, 'Bud')
    box.fill('after reload')
    box.press('Enter')
    amy.get_by_text('after reload', exact=True).wait_for()
    amy.get_by_label('Sending').wait_for(state='detached')  # confirmed
    log_in(bud, 'bud')
    open_room(bud, 'Amy')
    bud_box = bud.get_by_placeholder('Type a message...')
    bud_box.fill('got it')
    bud_box.press('Enter')
    shown = amy.get_by_text('got it', exact=True)
    deadline = time.time() + 10
    while shown.count() < 2 and time.time() < deadline:  # the list's preview, and the chat
        amy.wait_for_timeout(100)
    assert shown.count() == 2


def test_a_message_that_was_not_sent_can_be_sent_again(server, browser, shots):
    create_user('cal', screenname='Cal')
    create_room('desk', 'cal', members=['cal'])
    page = new_page(browser)
    shots.append(page)
    log_in(page, 'cal')
    open_room(page, 'desk')
    with get_db() as conn:  # muted behind the page's back: it doesn't know yet
        conn.cursor().execute("INSERT INTO room_restrictions (room, username, kind) VALUES ('desk', 'cal', 'text')")
        conn.commit()
    box = page.get_by_placeholder('Type a message...')
    box.fill('can anyone hear me')
    box.press('Enter')
    page.get_by_text('can anyone hear me', exact=True).wait_for()  # shown at once
    retry = page.get_by_role('button', name='Not sent. Tap to send again')
    retry.wait_for()
    assert query('SELECT 1 FROM messages') == []
    with get_db() as conn:
        conn.cursor().execute('DELETE FROM room_restrictions')
        conn.commit()
    retry.click()
    retry.wait_for(state='detached')
    page.get_by_label('Sending').wait_for(state='detached')
    assert [r['text'] for r in query('SELECT text FROM messages')] == ['can anyone hear me']
    assert page.get_by_text('can anyone hear me', exact=True).count() == 1


def test_a_persons_card_opens_from_their_message_and_takes_a_nickname(server, browser, shots):
    create_user('abe', screenname='Abe')
    create_user('bea', screenname='Bea Lee')
    create_room('crew', 'abe', members=['abe', 'bea'])
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("UPDATE users SET bio = 'plays bass' WHERE username = 'bea'")
        cur.execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('crew', 'bea', 'Bea Lee', 'hello crew')"
        )
        conn.commit()
    page = new_page(browser)
    shots.append(page)
    log_in(page, 'abe')
    open_room(page, 'crew')
    page.get_by_text('hello crew').wait_for()
    page.get_by_role('button', name='Bea Lee', exact=True).click()  # her avatar
    card = page.get_by_label("Bea Lee's profile")
    card.get_by_text('plays bass').wait_for()  # the bio shows now
    card.get_by_text('Joined Reco').wait_for()
    card.get_by_text('Rooms in common · 1').wait_for()
    card.get_by_role('button', name='Nickname').click()
    card.get_by_label('Nickname').fill('Bassist')
    card.get_by_role('button', name='Save').click()
    card = page.get_by_label("Bassist's profile")  # it goes by the nickname now
    card.get_by_text('Bea Lee · @bea').wait_for()
    card.get_by_role('button', name='Close').first.click()
    card.wait_for(state='detached')
    page.get_by_text('Bassist', exact=True).first.wait_for()  # her name on the message
    page.reload()
    open_room(page, 'crew')
    page.get_by_text('Bassist', exact=True).first.click()  # the name opens the card too
    page.get_by_label("Bassist's profile").wait_for()


def test_moderation_on_a_card_offers_only_what_applies(server, browser, shots):
    create_user('abe', screenname='Abe')
    create_user('bea', screenname='Bea')
    create_room('crew', 'abe', members=['abe', 'bea'])
    with get_db() as conn:
        conn.cursor().execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('crew', 'bea', 'Bea', 'hi')"
        )
        conn.commit()
    page = new_page(browser)
    shots.append(page)
    log_in(page, 'abe')
    open_room(page, 'crew')
    page.get_by_text('Bea', exact=True).first.click()
    card = page.get_by_label("Bea's profile")
    card.get_by_role('button', name='Mute in chat').wait_for()
    assert card.get_by_role('button', name='Unmute in chat').count() == 0
    assert card.get_by_role('button', name='Ban from voice').count() == 0  # she isn't in voice
    card.get_by_role('button', name='Mute in chat').click()
    card.get_by_text('5 min', exact=False).first.click()
    card.wait_for(state='detached')
    deadline = time.time() + 5
    while not query("SELECT 1 FROM room_restrictions WHERE username = 'bea'") and time.time() < deadline:
        time.sleep(0.1)
    page.get_by_text('Bea', exact=True).first.click()
    card.get_by_text('Muted (until', exact=False).wait_for()
    card.get_by_role('button', name='Unmute in chat').click()
    card.wait_for(state='detached')


def test_headers_open_cards_and_your_own_card_edits_your_profile(server, browser, shots):
    create_user('abe', screenname='Abe')
    create_user('bea', screenname='Bea')
    create_room('crew', 'abe', members=['abe', 'bea'])
    with get_db() as conn:
        conn.cursor().execute(
            "INSERT INTO messages (room, username, screenname, text) VALUES ('dm:abe:bea', 'bea', 'Bea', 'yo')"
        )
        conn.commit()
    page = new_page(browser)
    shots.append(page)
    log_in(page, 'abe')
    open_room(page, 'crew')
    page.get_by_role('button', name='crew', exact=False).filter(has_text='room code').click()  # the room's title
    photos = page.get_by_role('button', name='Photos', exact=True)  # on the room card
    photos.wait_for()
    page.mouse.click(5, 5)  # outside it
    photos.wait_for(state='detached')
    open_room(page, 'Bea')
    page.get_by_role('button', name="Bea's profile").click()  # the DM's title
    page.get_by_label("Bea's profile").last.get_by_text('@bea').wait_for()
    page.get_by_role('button', name='Close').first.click()
    # Your own card, from the members list
    open_room(page, 'crew')
    page.get_by_text('(you)', exact=False).first.click()
    page.get_by_role('button', name='Edit Profile').click()
    page.get_by_role('button', name='Save').wait_for()
