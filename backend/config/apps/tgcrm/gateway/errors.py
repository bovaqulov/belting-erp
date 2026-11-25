"""Telegram (Telethon) xatolari → akkaunt holati va foydalanuvchiga tushunarli matn.

GatewayError — buyruq javobi sifatida Django'ga qaytadi (status — HTTP kodi, detail — nima bo'ldi + nima qilish kerak).
"""

from __future__ import annotations

from dataclasses import dataclass

from telethon import errors as te

from ..models import Status


class GatewayError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass(frozen=True)
class Fatal:
    """Akkauntni to'xtatadigan xato: qaysi holatga o'tadi va nima deb yoziladi."""

    status: str
    detail: str


# sessiya yaroqsiz — qayta ulash kerak (foydalanuvchi telefondan sessiyani o'chirgan, yoki ikki joyda ishlatilgan)
_LOGGED_OUT = (te.AuthKeyUnregisteredError, te.SessionRevokedError, te.SessionExpiredError)


def fatal(exc: BaseException) -> Fatal | None:
    if isinstance(exc, te.AuthKeyDuplicatedError):
        return Fatal(
            Status.LOGGED_OUT,
            "Sessiya bir vaqtda ikki joyda ishlatildi — Telegram uni bekor qildi. Qayta ulang "
            "(dev va prod bitta akkauntni bir vaqtda ishlatmasin).",
        )
    if isinstance(exc, _LOGGED_OUT):
        return Fatal(Status.LOGGED_OUT, "Sessiya tugagan (telefondan chiqarilgan bo'lishi mumkin). Qayta ulang.")
    if isinstance(exc, (te.UserDeactivatedBanError, te.PhoneNumberBannedError)):
        return Fatal(Status.BANNED, "Akkaunt Telegram tomonidan bloklangan. Murojaat: recover@telegram.org.")
    if isinstance(exc, te.UserDeactivatedError):
        return Fatal(Status.BANNED, "Akkaunt o'chirilgan.")
    return None


def is_frozen(exc: BaseException) -> bool:
    return isinstance(exc, (te.FrozenMethodInvalidError, te.FrozenParticipantMissingError))


def login_error(exc: BaseException) -> GatewayError | None:
    """Kirish bosqichidagi xatolar (kod, parol, raqam)."""
    table: list[tuple[type[BaseException] | tuple[type[BaseException], ...], int, str]] = [
        (te.PhoneNumberInvalidError, 400, "Telefon raqami noto'g'ri. Xalqaro formatda kiriting: +998901234567."),
        (te.PhoneNumberBannedError, 403, "Bu raqam Telegram'da bloklangan."),
        (te.PhoneNumberUnoccupiedError, 400, "Bu raqamda Telegram akkaunti yo'q. Avval telefonda ro'yxatdan o'ting."),
        ((te.PhoneCodeInvalidError, te.PhoneCodeEmptyError), 400, "Kod noto'g'ri. Telegram'dagi kodni qayta kiriting."),
        (te.PhoneCodeExpiredError, 400, "Kod eskirgan. Yangi kod so'rang."),
        (te.PasswordHashInvalidError, 400, "2FA parol noto'g'ri."),
        (te.PhoneNumberFloodError, 429, "Bu raqamga kod so'rash juda ko'p bo'ldi. Ertaga qayta urinib ko'ring."),
        (te.PhonePasswordFloodError, 429, "Parol juda ko'p marta noto'g'ri kiritildi. Keyinroq urinib ko'ring."),
        (te.SendCodeUnavailableError, 429, "Kod yuborishning barcha usullari tugadi. Keyinroq urinib ko'ring."),
        (te.AuthRestartError, 409, "Telegram kirishni qaytadan boshlashni so'radi. Raqamni qayta kiriting."),
        (te.ApiIdInvalidError, 500, "TGCRM_API_ID / TGCRM_API_HASH noto'g'ri (my.telegram.org dan tekshiring)."),
        (te.ApiIdPublishedFloodError, 500, "Namuna api_id ishlatilgan — o'z api_id'ingizni oling."),
    ]
    for cls, status, text in table:
        if isinstance(exc, cls):
            return GatewayError(status, text)
    if isinstance(exc, te.FloodWaitError):
        return GatewayError(429, f"Telegram {flood_text(exc.seconds)} kutishni so'radi. Keyin qayta urinib ko'ring.")
    return None


def send_error(exc: BaseException) -> GatewayError | None:
    """Xabar yuborish xatolari (chatga yozish huquqi, blok, slow mode …)."""
    table: list[tuple[type[BaseException] | tuple[type[BaseException], ...], int, str]] = [
        (
            (te.ChatWriteForbiddenError, te.ChatAdminRequiredError, te.ChatSendPlainForbiddenError),
            403,
            "Bu chatga yozish huquqi yo'q.",
        ),
        ((te.UserBannedInChannelError, te.ChatRestrictedError), 403, "Akkaunt bu guruhda cheklangan."),
        (te.UserIsBlockedError, 403, "Foydalanuvchi bu akkauntni bloklagan."),
        (te.YouBlockedUserError, 403, "Bu foydalanuvchi akkauntda bloklangan — avval blokdan chiqaring."),
        (te.InputUserDeactivatedError, 410, "Foydalanuvchi akkaunti o'chirilgan."),
        (te.ChannelPrivateError, 403, "Kanal yopiq yoki akkaunt undan chiqarilgan."),
        (te.MessageTooLongError, 400, "Xabar juda uzun (4096 belgigacha)."),
        (te.MessageEmptyError, 400, "Bo'sh xabar yuborilmaydi."),
        (te.PeerIdInvalidError, 404, "Chat topilmadi."),
    ]
    for cls, status, text in table:
        if isinstance(exc, cls):
            return GatewayError(status, text)
    if isinstance(exc, te.SlowModeWaitError):
        return GatewayError(429, f"Guruhda sekin rejim: {flood_text(exc.seconds)} kuting.")
    return None


def flood_text(seconds: int) -> str:
    if seconds < 90:
        return f"{seconds} soniya"
    if seconds < 3600 * 2:
        return f"{round(seconds / 60)} daqiqa"
    return f"{round(seconds / 3600)} soat"
