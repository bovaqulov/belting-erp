"""Logistika — jo'natmalar (qo'lda yuritiladi): EMU, Yandex Go, Bito, Fargo (faqat shu to'rttasi).

Frontend: src/erp/logistics/ (/app/erp/logistics). API: docs/api/logistics.md. Holat: jo'natma yaratish, holat
(yangi → topshirildi → yo'lda → yetkazildi / qaytdi / bekor), trek raqami, narx — tayyor; tashuvchi API'lari (narx
hisoblash, avtomatik kuzatuv) — kalitlar berilgach."""

from django.apps import AppConfig


class ErpLogisticsConfig(AppConfig):
    name = "config.apps.erp.logistics"
    label = "erp_logistics"
    verbose_name = "Logistika"
