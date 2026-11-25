"""Media fayllari yo'llari (Django va gateway uchun umumiy; Telethon import qilinmaydi).

TGCRM_MEDIA_DIR/<akkaunt>/<peer>_<msg_id>[_t].<ext> — nom faqat butun sonlardan, shuning uchun yo'l in'ektsiyasi yo'q.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

from django.conf import settings


def root() -> Path:
    return Path(settings.TGCRM_MEDIA_DIR)


def uploads_dir() -> Path:
    d = root() / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def base_path(account: int, peer: int, msg_id: int, thumb: bool) -> Path:
    return root() / str(int(account)) / f"{int(peer)}_{int(msg_id)}{'_t' if thumb else ''}"


def cached(account: int, peer: int, msg_id: int, thumb: bool) -> Path | None:
    base = base_path(account, peer, msg_id, thumb)
    if not base.parent.is_dir():
        return None
    for p in base.parent.glob(f"{base.name}.*"):
        if p.is_file() and p.stat().st_size > 0:
            return p
    return None


def guess_mime(p: Path, fallback: str = "application/octet-stream") -> str:
    return mimetypes.guess_type(p.name)[0] or fallback


def avatar_path(account: int, peer: int, photo_id: int) -> Path:
    """Profil rasmi: photo_id nomda — rasm almashsa, eski kesh avtomatik eskiradi."""
    return root() / str(int(account)) / "avatars" / f"{int(peer)}_{int(photo_id)}.jpg"


def inside(p: Path) -> bool:
    """Yo'l media ildizi ichidami (gateway javobidagi nisbiy yo'l uchun himoya)."""
    try:
        return p.resolve().is_relative_to(root().resolve())
    except OSError:
        return False
