# Importing each module registers its Socket.IO event handlers.
from . import auth, dms, feedback, match, messages, oauth, online, push, rooms, voice

__all__ = ['auth', 'dms', 'feedback', 'match', 'messages', 'oauth', 'online', 'push', 'rooms', 'voice']
