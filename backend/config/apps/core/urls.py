from django.urls import path

from . import views

urlpatterns = [
    path("me", views.me),
    path("erp/me", views.erp_me),
    path("login/start", views.login_start),
    path("login/poll", views.login_poll),
    path("login/magic", views.login_magic),
    path("logout", views.logout_view),
]
