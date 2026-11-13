from django.conf import settings
from django.db import models


class Fact(models.Model):
    class Scope(models.TextChoices):
        FIRM = "firma", "Butun firma"
        DEPT = "bolim", "Bo'lim"
        STAFF = "xodim", "Xodim"

    class Status(models.TextChoices):
        ACTIVE = "active", "Faol"
        PENDING = "pending", "Tasdiq kutmoqda"
        ARCHIVED = "archived", "Arxiv"

    text = models.TextField()
    scope = models.CharField(max_length=8, choices=Scope.choices, default=Scope.FIRM)
    scope_key = models.CharField(max_length=40, blank=True)  # bolim — bo'lim kaliti; xodim — tg_id
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    source = models.CharField(max_length=10, default="manual")  # manual | chat | agent
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.text[:60]
