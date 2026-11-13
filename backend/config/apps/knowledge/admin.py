from django.contrib import admin

from .models import Doc, GraphMeta


@admin.register(Doc)
class DocAdmin(admin.ModelAdmin):
    list_display = ("title", "dept", "path", "status", "source", "updated_at")
    list_filter = ("dept", "status", "source")
    search_fields = ("title", "body")


admin.site.register(GraphMeta)
