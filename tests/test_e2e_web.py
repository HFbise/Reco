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
        page.get_by_text('Start', exact=True).click()

    for page in (dave, erin):
        page.get_by_text('You both like: Music').wait_for(timeout=10000)
    assert dave.get_by_text('Erin').count() == 0  # anonymous until both agree

    dave.get_by_placeholder('Type a message...').fill('hi stranger')
    dave.get_by_placeholder('Type a message...').press('Enter')
    erin.get_by_text('hi stranger').wait_for(timeout=10000)

    dave.get_by_text('Keep in touch').click()
    dave.get_by_text('Waiting for them to agree').wait_for()
    erin.get_by_text('Keep in touch').click()
    dave.get_by_text("You're now connected with Erin", exact=False).wait_for(timeout=10000)
    erin.get_by_text("You're now connected with Dave", exact=False).wait_for(timeout=10000)


def test_guest_cannot_see_random_match(server, browser, demo_room, shots):
    page = new_page(browser)
    shots.append(page)
    page.goto(URL)
    page.get_by_text('Take a look first').click()
    page.get_by_text('Reco Demo', exact=True).first.wait_for()
    assert page.get_by_role('tab', name='Match').count() == 0
