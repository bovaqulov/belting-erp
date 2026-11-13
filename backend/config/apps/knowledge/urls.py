from django.urls import path

from . import views

urlpatterns = [
    path("kb", views.kb),
    path("kb/pdf", views.kb_pdf),
    path("kb/<int:pk>", views.kb_doc),
    path("kb/<int:pk>/<str:act>", views.kb_act),
    path("knowledge/extract", views.extract),
    path("graph", views.graph_summary),
    path("graph/data", views.graph_data),
    path("graph/chunk", views.graph_chunk),
    path("graph/search", views.graph_search),
    path("graph/explain", views.graph_explain),
    path("graph/rebuild", views.graph_rebuild),
]
