from werkzeug.security import generate_password_hash, check_password_hash

SECURITY_QUESTIONS = [
    "你的出生城市是？",
    "你的小学名字是？",
    "你最喜欢的宠物名字是？",
    "你母亲的娘家姓是？",
    "你的第一辆车的品牌是？",
    "你最喜欢的老师叫什么？",
]

DEFAULT_PASSWORD = "reco1234"


def hash_password(pw: str) -> str:
    return generate_password_hash(pw)


def verify_password(stored: str, provided: str):
    """Returns (ok, needs_migrate). Supports lazy migration from plaintext."""
    if stored.startswith('pbkdf2:') or stored.startswith('scrypt:'):
        return check_password_hash(stored, provided), False
    return stored == provided, stored == provided
