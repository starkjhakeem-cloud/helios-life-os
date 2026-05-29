from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared rate limiter — mounted on app.state.limiter in main.py.
# Auth routes apply per-IP limits to slow brute-force attempts.
limiter = Limiter(key_func=get_remote_address)
