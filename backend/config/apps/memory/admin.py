from django.contrib import admin

from .models import Fact


@admin.register(Fact)
class FactAdmin(admin.ModelAdmin):
    list_display = ("text", "scope", "scope_key", "status", "source", "created_at")
    list_filter = ("scope", "status", "source")
    search_fields = ("text",)
