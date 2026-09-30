"""End-to-end: the real web build in a real browser against a real server.

Starts the Flask dev server on the test database and drives app/dist with
Playwright (Chromium). Skipped when Playwright isn't installed.
"""

import os
import socket
import subprocess
import sys
import time

import pytest

sync_api = pytest.importorskip('playwright.sync_api')

from conftest import ROOT, create_room, create_user, get_db  # noqa: E402

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
        [sys.executable, 'app.py'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
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
        page.get_by_text('Audio', exact=True).click()
        # The device pickers load a moment later and resize the dialog: click after that
        page.get_by_role('combobox').first.wait_for()
        to_max(page, page.get_by_role('slider').nth(index))
        page.get_by_text('150%').first.wait_for()
        page.get_by_text('Close', exact=True).last.click()
        page.get_by_label('Chats', exact=True).click()  # back to the room (voice stays connected)

    level = hugo.evaluate(_OUTPUT_LEVEL)
    assert level > 0.001  # Hugo hears Gina

    settings_slider(gina, 0)  # Gina's microphone
    louder = hugo.evaluate(_OUTPUT_LEVEL)
    assert 1.35 < louder / level < 1.65
    level = louder

    settings_slider(hugo, 1)  # Hugo's speaker
    louder = hugo.evaluate(_OUTPUT_LEVEL)
    assert 1.35 < louder / level < 1.65
    level = louder

    hugo.get_by_text('Gina', exact=True).first.click()  # Gina's volume, for Hugo only
    hugo.get_by_text('User volume').wait_for()
    to_max(hugo, hugo.get_by_role('slider').last)
    louder = hugo.evaluate(_OUTPUT_LEVEL)
    assert 1.35 < louder / level < 1.65
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
    guest.get_by_text('darkroom', exact=True).first.click()
    guest.get_by_placeholder('Password', exact=True).fill('shutter')
    guest.get_by_placeholder('Password', exact=True).press('Enter')
    guest.get_by_placeholder('Type a message...').wait_for()
