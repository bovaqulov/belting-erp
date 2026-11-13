from django.contrib import admin

from .models import User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("name", "tg_id", "username", "role")
    list_filter = ("role",)
    search_fields = ("name", "username", "tg_id")
    filter_horizontal = ("departments",)
    exclude = ("password", "groups", "user_permissions", "last_login", "is_superuser")
