from django.urls import path

from . import views

urlpatterns = [
    path("users", views.users),
    path("users/<int:tg_id>", views.user_edit),
    path("heads", views.heads),
    path("heads/<int:pk>", views.head_del),
    path("invites", views.invites),
    path("invites/<str:code>/revoke", views.invite_revoke),
    path("phone/options", views.phone_options),
    path("roles", views.roles),
    path("roles/<int:pk>", views.role_edit),
    path("roles/<int:pk>/delete", views.role_delete),
]
