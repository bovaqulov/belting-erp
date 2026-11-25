"""4-bosqich: media — yuklab olish (kesh, eskiz), yuborish (fayl, ovoz → OGG/Opus), kesh tozalash, API xavfsizligi."""

import os
import shutil
import subprocess
import time
from typing import Any, cast

import pytest
from telethon.tl import types

from config.apps.tgcrm import files
from config.apps.tgcrm.gateway import media as gmedia
from config.apps.tgcrm.gateway.errors import GatewayError
from config.apps.tgcrm.models import Message

from .fakes import FakeClient
from .test_sync import (
    _connected,
    _fast,  # noqa: F401
)
from .tl import T0, msg


@pytest.fixture(autouse=True)
def _media_dir(settings, tmp_path):
    settings.TGCRM_MEDIA_DIR = tmp_path / "tgcrm"
    return settings.TGCRM_MEDIA_DIR


def _photo_msg(mid: int, peer: Any) -> types.Message:
    photo = types.Photo(
        id=1, access_hash=1, file_reference=b"", date=T0, dc_id=2,
        sizes=[types.PhotoSize("m", 320, 240, 100), types.PhotoSize("x", 800, 600, 1000), types.PhotoSize("y", 1280, 960, 5000)],
    )  # fmt: skip
    return msg(mid, peer, "", media=types.MessageMediaPhoto(photo=photo))


@pytest.mark.django_db(transaction=True)
async def test_download_thumb_and_cache():
    w, c, _ = await _connected()
    p = types.PeerUser(1000)
    c.stored[77] = _photo_msg(77, p)
    r = await w.media.download(1000, 77, thumb=True)
    assert r["path"].endswith("1000_77_t.jpg") and r["mime"] == "image/jpeg"
    assert c.downloads[-1][1].type == "x"  # ~800px — ro'yxat uchun yetarli, to'liq rasm emas
    await w.media.download(1000, 77, thumb=True)
    assert len(c.downloads) == 1  # keshdan — Telegram'ga qayta bormaydi
    full = await w.media.download(1000, 77, thumb=False)
    assert c.downloads[-1] == (77, None) and full["path"].endswith("1000_77.jpg")
    c.stored[78] = msg(78, p, "matn")  # media yo'q
    with pytest.raises(GatewayError) as e:
        await w.media.download(1000, 78, thumb=False)
    assert e.value.status == 404
    await w.close()


@pytest.mark.django_db(transaction=True)
async def test_send_file_moves_to_cache_and_audits():
    w, c, a = await _connected()
    up = files.uploads_dir() / "abc.pdf"
    up.write_bytes(b"%PDF-1.4 test")
    r = await w.media.send_file(1000, "abc.pdf", "Narxlar 2026.pdf", "file", "Yangi narxlar", None, 201)
    sent = c.files[-1]
    assert (
        sent["exists"] and sent["force_document"] and sent["caption"] == "Yangi narxlar" and sent["parse_mode"] is None
    )
    assert os.path.basename(sent["file"]) == "Narxlar 2026.pdf"  # asl nom Telegram'da ko'rinadi
    m = await Message.objects.aget(peer__peer_id=1000, msg_id=r["msg_id"])
    assert m.sent_by == 201 and m.media and m.media["kind"] == "file"
    assert files.cached(a.pk, 1000, r["msg_id"], False) is not None  # yuborgan odam qayta yuklamaydi
    assert not list(files.uploads_dir().iterdir())
    # yo'l bilan chiqib ketish urinishi — faqat uploads ichidagi nom olinadi
    with pytest.raises(GatewayError) as e:
        await w.media.send_file(1000, "../../etc/passwd", "x", "file", "", None, 201)
    assert e.value.status == 404
    with pytest.raises(GatewayError, match="Izoh juda uzun"):
        (files.uploads_dir() / "b.pdf").write_bytes(b"x")
        await w.media.send_file(1000, "b.pdf", "b.pdf", "file", "x" * 1025, None, 201)
    await w.close()


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg yo'q")
@pytest.mark.django_db(transaction=True)
async def test_voice_converted_to_ogg_opus():
    w, c, _ = await _connected()
    src = files.uploads_dir() / "rec.webm"
    subprocess.run(
        [
            shutil.which("ffmpeg") or "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "sine=f=440:d=2",
            "-c:a",
            "libopus",
            str(src),
        ],
        check=True,
    )
    await w.media.send_file(1000, "rec.webm", "rec.webm", "voice", "", None, 201)
    sent = c.files[-1]
    assert sent["file"].endswith(".ogg") and sent["voice_note"]
    attr = sent["attributes"][0]
    assert attr.voice and attr.duration == 2
    await w.close()


def test_cleanup_oldest_first(_media_dir):
    d = files.root() / "1"
    d.mkdir(parents=True)
    for i in range(5):
        p = d / f"5_{i}.jpg"
        p.write_bytes(b"x" * 1000)
        t = time.time() - (5 - i) * 100
        os.utime(p, (t, t))
    old = files.uploads_dir() / "old.bin"
    old.write_bytes(b"x")
    t_old = time.time() - 2 * 86400
    os.utime(old, (t_old, t_old))
    r = gmedia.cleanup(3000)
    left = sorted(p.name for p in d.iterdir())
    assert left == ["5_3.jpg", "5_4.jpg"] and r["bytes"] == 2000  # 80% gacha, eng eskilari ketdi
    assert not old.exists()


# ------------------------------------------------------------------ API
@pytest.mark.django_db
def test_media_api_security(client, settings, _media_dir):
    from django.utils import timezone

    from config.apps.staff.models import User
    from config.apps.tgcrm.models import Account, Dialog, Kind, Peer

    u = User.objects.create_user(1, "Admin", "admin")
    a = Account.objects.create(kind=Kind.PERSONAL, owner_tg=1, status="active")
    p = Peer.objects.create(account=a, peer_id=5)
    Dialog.objects.create(account=a, peer=p, top_msg_id=3, last_date=timezone.now())
    Message.objects.create(account=a, peer=p, msg_id=1, date=timezone.now(), media={"kind": "photo", "thumb": True})
    Message.objects.create(
        account=a, peer=p, msg_id=2, date=timezone.now(), media={"kind": "file", "mime": "text/html", "name": "x.html"}
    )
    Message.objects.create(account=a, peer=p, msg_id=3, date=timezone.now(), text="matn")
    t = files.base_path(a.pk, 5, 1, True).with_suffix(".jpg")
    t.parent.mkdir(parents=True)
    t.write_bytes(b"\xff\xd8")
    files.base_path(a.pk, 5, 2, False).with_suffix(".html").write_bytes(b"<script>alert(1)</script>")
    client.force_login(u)
    base = f"/app/api/tgcrm/accounts/{a.pk}/chats/5"
    r = client.get(f"{base}/media/1?thumb=1")
    assert r.status_code == 200 and r["Content-Type"] == "image/jpeg" and r["X-Content-Type-Options"] == "nosniff"
    r = client.get(f"{base}/media/2")
    assert (
        r["Content-Type"] == "application/octet-stream" and "attachment" in r["Content-Disposition"]
    )  # HTML — sahifada ochilmaydi
    assert client.get(f"{base}/media/3").status_code == 404
    assert client.get(f"{base}/media/1").status_code == 503  # to'liq rasm keshda yo'q, shlyuz ishlamayapti

    from django.core.files.uploadedfile import SimpleUploadedFile

    up = SimpleUploadedFile("a.pdf", b"%PDF", content_type="application/pdf")
    r = client.post(f"{base}/send-file", {"file": up, "kind": "file"})
    assert r.status_code == 403  # X-Requested-With yo'q — boshqa saytdagi forma
    up = SimpleUploadedFile("a.pdf", b"%PDF", content_type="application/pdf")
    r = client.post(f"{base}/send-file", {"file": up, "kind": "hack"}, headers={"X-Requested-With": "tgcrm"})
    assert r.status_code == 400
    a.limits = {"file_bytes": 3}
    a.save()
    up = SimpleUploadedFile("a.pdf", b"%PDF", content_type="application/pdf")
    r = client.post(f"{base}/send-file", {"file": up, "kind": "file"}, headers={"X-Requested-With": "tgcrm"})
    assert r.status_code == 413
    assert not list(files.uploads_dir().iterdir())
    assert cast(Any, FakeClient)  # import ishlatiladi
