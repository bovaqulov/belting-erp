from django.contrib import admin

from .models import Department, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("name", "tg_id", "username", "role")
    list_filter = ("role",)
    search_fields = ("name", "username", "tg_id")
    filter_horizontal = ("departments",)
    exclude = ("password", "groups", "user_permissions", "last_login", "is_superuser")


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "parent", "sees_all")
    search_fields = ("name", "key")
