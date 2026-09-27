import hmac

from werkzeug.security import check_password_hash, generate_password_hash

# Stored as ids; clients show them in the user's language (i18n keys `secq-<id>`).
SECURITY_QUESTIONS = ['birth_city', 'primary_school', 'pet_name', 'mother_maiden_name', 'first_car', 'favorite_teacher']
# Accounts created before ids were used store the Chinese question text itself.
_LEGACY_QUESTIONS = dict(
    zip(
        [
            '你的出生城市是？',
            '你的小学名字是？',
            '你最喜欢的宠物名字是？',
            '你母亲的娘家姓是？',
            '你的第一辆车的品牌是？',
            '你最喜欢的老师叫什么？',
        ],
        SECURITY_QUESTIONS,
        strict=True,
    )
)


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
    ok = hmac.compare_digest(stored.encode(), provided.encode())
    return ok, ok


def str_field(data, key: str) -> str:
    """data[key] if it is a string, else ''. Event payloads come straight from
    clients, so anything may be missing or of the wrong type."""
    value = data.get(key) if isinstance(data, dict) else None
    return value if isinstance(value, str) else ''


def int_field(data, key: str, default: int = 0) -> int:
    value = data.get(key) if isinstance(data, dict) else None
    return value if isinstance(value, int) and not isinstance(value, bool) else default
