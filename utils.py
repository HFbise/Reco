from werkzeug.security import generate_password_hash, check_password_hash

# Stored as ids; clients show them in the user's language (i18n keys `secq-<id>`).
SECURITY_QUESTIONS = ['birth_city', 'primary_school', 'pet_name', 'mother_maiden_name', 'first_car', 'favorite_teacher']
# Accounts created before ids were used store the Chinese question text itself.
_LEGACY_QUESTIONS = dict(zip([
    "你的出生城市是？", "你的小学名字是？", "你最喜欢的宠物名字是？",
    "你母亲的娘家姓是？", "你的第一辆车的品牌是？", "你最喜欢的老师叫什么？",
], SECURITY_QUESTIONS))


def security_question_id(value: str):
    """Normalise a stored or submitted question to its id, or None if unknown."""
    if value in SECURITY_QUESTIONS:
        return value
    return _LEGACY_QUESTIONS.get(value)


def hash_password(pw: str) -> str:
    return generate_password_hash(pw)


def verify_password(stored: str, provided: str):
    """Returns (ok, needs_migrate). Supports lazy migration from plaintext."""
    if stored.startswith('pbkdf2:') or stored.startswith('scrypt:'):
        return check_password_hash(stored, provided), False
    return stored == provided, stored == provided
