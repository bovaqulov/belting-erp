from django.urls import path

from . import views

urlpatterns = [path("memory", views.memory), path("memory/<int:pk>/<str:act>", views.memory_act)]
