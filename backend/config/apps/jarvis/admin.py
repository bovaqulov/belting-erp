from django.contrib import admin

from .models import Agent, AgentRun, AgentSchedule, AgentTask, ChatSession


class ScheduleInline(admin.TabularInline):
    model = AgentSchedule
    extra = 0
    fields = ("title", "repeat", "time", "enabled", "next_run_at")
    readonly_fields = ("next_run_at",)


@admin.register(Agent)
class AgentAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "kind", "parent", "owner", "model")
    list_filter = ("kind", "model")
    search_fields = ("name", "key")
    inlines = [ScheduleInline]


@admin.register(AgentTask)
class AgentTaskAdmin(admin.ModelAdmin):
    list_display = ("title", "agent", "status", "due", "created_by", "created_at")
    list_filter = ("status",)


@admin.register(AgentRun)
class AgentRunAdmin(admin.ModelAdmin):
    list_display = ("agent", "source", "ok", "started_at", "finished_at")
    list_filter = ("source", "ok")


admin.site.register(ChatSession)
