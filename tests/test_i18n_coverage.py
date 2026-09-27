"""Every code the server can send has a translation in both client languages."""
import glob
import os
import re

import state
import utils

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I18N = open(os.path.join(ROOT, 'app', 'src', 'lib', 'i18n.ts'), encoding='utf-8').read()
ZH, EN = I18N.split('const en: Record<keyof typeof zh, string> = {')


def keys(block):
    return set(re.findall(r"^\s*'([\w-]+)':", block, re.M))


def server_error_codes():
    codes = set()
    for path in glob.glob(os.path.join(ROOT, 'handlers', '*.py')) + [os.path.join(ROOT, 'moderation.py')]:
        codes |= set(re.findall(r"fail\('\w+', '(\w+)'", open(path, encoding='utf-8').read()))
    return codes


def test_server_error_codes_are_translated():
    codes = server_error_codes()
    assert len(codes) > 15  # the regex still finds them
    for lang, block in (('zh', ZH), ('en', EN)):
        missing = {c for c in codes if f'srv-{c}' not in keys(block)}
        assert not missing, f'{lang} is missing translations for {missing}'


def test_system_message_codes_are_translated():
    for lang, block in (('zh', ZH), ('en', EN)):
        missing = {c for c in state.SYSTEM_TEXT_ZH if f'sys-{c}' not in keys(block)}
        assert not missing, f'{lang} is missing system messages {missing}'


def test_security_questions_are_translated_and_match_the_client_list():
    for lang, block in (('zh', ZH), ('en', EN)):
        assert {f'secq-{q}' for q in utils.SECURITY_QUESTIONS} <= keys(block), lang
    client = open(os.path.join(ROOT, 'app', 'app', '(auth)', 'index.tsx'), encoding='utf-8').read()
    client_ids = re.search(r"const SECURITY_QUESTIONS = \[([^\]]+)\]", client).group(1)
    assert re.findall(r"'(\w+)'", client_ids) == utils.SECURITY_QUESTIONS
