from django.conf import settings
from django.db import models


class Doc(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Faol"
        PENDING = "pending", "Tasdiq kutmoqda"

    dept = models.CharField(max_length=40, default="umumiy", db_index=True)  # bo'lim kaliti yoki «umumiy»
    path = models.CharField(max_length=300, blank=True)  # «Mavzu › Kichik mavzu»
    title = models.CharField(max_length=300)
    body = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    source = models.CharField(max_length=10, default="manual")  # manual | pdf | chat
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["dept", "path", "title"]

    def __str__(self) -> str:
        return self.title


class ExtractState(models.Model):
    """Chatlardan ajratish: qaysi xabargacha ko'rib chiqilgan."""

    key = models.CharField(max_length=20, unique=True)
    last_id = models.BigIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.key}:{self.last_id}"


class GraphSource(models.Model):
    """Manba (hujjat yoki xotira bo'lagi) dan ajratilgan obyekt/bog'lanishlar — matn o'zgarmasa qayta ajratilmaydi."""

    key = models.CharField(max_length=60, unique=True)
    scope = models.CharField(max_length=40)
    title = models.CharField(max_length=300, blank=True)
    digest = models.CharField(max_length=40)
    data = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.key


class GraphNode(models.Model):
    scope = models.CharField(max_length=40, db_index=True)
    key = models.CharField(max_length=200)
    label = models.CharField(max_length=200)
    type = models.CharField(max_length=40, blank=True)
    community = models.IntegerField(default=0)
    degree = models.IntegerField(default=0, db_index=True)
    sources = models.JSONField(default=list)

    class Meta:
        unique_together = [("scope", "key")]
        ordering = ["-degree", "label"]

    def __str__(self) -> str:
        return self.label


class GraphEdge(models.Model):
    scope = models.CharField(max_length=40, db_index=True)
    a = models.ForeignKey(GraphNode, on_delete=models.CASCADE, related_name="+")
    b = models.ForeignKey(GraphNode, on_delete=models.CASCADE, related_name="+")
    relation = models.CharField(max_length=120, blank=True)
    confidence = models.CharField(max_length=12, default="EXTRACTED")

    def __str__(self) -> str:
        return f"{self.a_id}-{self.relation}-{self.b_id}"


class GraphMeta(models.Model):
    scope = models.CharField(max_length=40, unique=True)
    built_at = models.DateTimeField(auto_now=True)
    communities = models.JSONField(default=list)
    report = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.scope
