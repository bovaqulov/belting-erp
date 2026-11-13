from django.urls import path

from . import chat, views

urlpatterns = [
    path("overview", views.overview),
    path("agents", views.agents),
    path("agents/<str:key>", views.agent),
    path("agents/<str:key>/schedules", views.schedules),
    path("agents/<str:key>/schedules/<str:uid>", views.schedule),
    path("agents/<str:key>/tasks", views.tasks),
    path("agents/<str:key>/tasks/<str:uid>", views.task),
    path("chat", chat.chat),
]
