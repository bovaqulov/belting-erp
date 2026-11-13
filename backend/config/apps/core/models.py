"""Brauzerda Telegram orqali kirish: /app/api/login/start token beradi, bot (yoki `manage.py confirm_login`) tasdiqlaydi,
frontend /app/api/login/poll bilan kutadi. Token 5 daqiqa amal qiladi, bir marta ishlatiladi."""

import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

LOGIN_TTL = timedelta(minutes=5)


def _token() -> str:
    return secrets.token_urlsafe(24)


class LoginToken(models.Model):
    token = models.CharField(max_length=64, unique=True, default=_token)
    created_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return self.token[:8]

    @property
    def expired(self) -> bool:
        return timezone.now() - self.created_at > LOGIN_TTL
