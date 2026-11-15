"""Bo'lim agenti yaratilsa/o'zgarsa/o'chsa — staff.Department yangilanadi (bo'limlar daraxti staff'da saqlanadi)."""

from __future__ import annotations

from typing import Any

from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Agent


@receiver([post_save, post_delete], sender=Agent, dispatch_uid="jarvis.sync_departments")
def _agent_changed(sender: type[Agent], instance: Agent, **kw: Any) -> None:
    if instance.kind != Agent.Kind.DEPT or kw.get("raw"):
        return
    from .services import sync_departments

    sync_departments()  # bir necha o'nlab bo'lim — to'liq sinxronlash arzon va doim to'g'ri
