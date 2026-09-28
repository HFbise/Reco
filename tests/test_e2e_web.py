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

from conftest import ROOT, create_user, get_db  # noqa: E402

import demo  # noqa: E402

PORT = 5077
URL = f'http://127.0.0.1:{PORT}'


@pytest.fixture(scope='module')
def server():
    env = dict(os.environ, PORT=str(PORT), SECRET_KEY='e2e')
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


def test_guest_cannot_see_random_match(server, browser, demo_room, shots):
    page = new_page(browser)
    shots.append(page)
    page.goto(URL)
    page.get_by_text('Take a look first').click()
    page.get_by_text('Reco Demo', exact=True).first.wait_for()
    assert page.get_by_role('tab', name='Match').count() == 0


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
        page.get_by_label('Settings').first.click()
        page.get_by_text('Audio', exact=True).click()
        # The device pickers load a moment later and resize the dialog: click after that
        page.get_by_role('combobox').first.wait_for()
        to_max(page, page.get_by_role('slider').nth(index))
        page.get_by_text('150%').first.wait_for()
        page.get_by_text('Close', exact=True).last.click()

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
