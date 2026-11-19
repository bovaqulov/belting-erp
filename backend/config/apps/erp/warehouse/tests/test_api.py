"""Ombor API (docs/api/warehouse.md): frontend demo testlari (`demo/server.lib.test.ts`) bilan bir xil ssenariylar —
haqiqiy baza ustida: skaner, panel, qoldiq jadvali, kesish, sanash, yig'ish, qabul, ko'chirish, kesish rejasi,
joylashtirish, versiya to'qnashuvi, stikerlar, ruxsat."""

import pytest

from config.apps.erp.warehouse import demo, services
from config.apps.erp.warehouse.models import Cell, Doc, Incoming, ItemMeta, Pick, Unit

pytestmark = pytest.mark.django_db
A = "/app/api/erp"


@pytest.fixture
def seed(db):
    return demo.seed()


@pytest.fixture
def c(admin_client, seed):
    return admin_client


def post(c, path, body=None):
    return c.post(path, body or {}, content_type="application/json")


def unit(c, code):
    r = c.get(f"{A}/scan", {"code": code}).json()
    assert r["type"] == "unit", r
    return r


def new_doc(c, kind, wh, lines, firm="BLT", **header):
    r = post(c, f"{A}/docs", {"kind": kind, "firm": firm, "header": {"warehouse_id": wh, **header}, "lines": lines})
    assert r.status_code == 200, r.json()
    return r.json()


def post_doc(c, d):
    return post(c, f"{A}/docs/{d['id']}/post", {"version": d["version"]})


def post_ok(c, d, reason):
    """Sanash: toleransdan katta farq — rahbar tasdig'i va sabab bilan o'tkazish (admin — rahbar)."""
    return post(c, f"{A}/docs/{d['id']}/post", {"version": d["version"], "approve": True, "reason": reason})


def test_me_has_warehouses_firms_kinds(c, seed):
    me = c.get(f"{A}/me").json()
    assert {w["name"] for w in me["warehouses"]} >= {"Asosiy ombor", "Yo'lda"}
    assert {f["code"] for f in me["firms"]} >= {"BLT", "RMN"}
    assert {k["code"] for k in me["kinds"]} >= {"inventory", "cut"} and me["kinds"][0]["can"] == ["create", "post"]


def test_scan_unit_cell_barcode_legacy_unknown(c, seed):
    u = unit(c, "p00000101")
    assert (
        u["width_mm"] == 800 and u["length_mm"] == 40000 and u["stock"][0]["qty"] == 32 and u["loc"] == "AO1-A-01-01-A"
    )
    assert c.get(f"{A}/scan", {"code": "AO1-A-01-01-A"}).json()["type"] == "cell"
    hit = c.get(f"{A}/scan", {"code": "4780100000042"}).json()
    assert hit["type"] == "item" and hit["item_id"] == seed["items"][4]
    assert c.get(f"{A}/scan", {"code": "00123"}).json()["type"] == "choice"  # ikki bazada bir xil 1C kodi
    assert c.get(f"{A}/scan", {"code": "INV-26-0011"}).json() == {"type": "doc", "number": "INV-26-0011"}
    assert c.get(f"{A}/scan", {"code": "xyz"}).json() == {"type": "unknown"}


def test_dashboard_low_no_loc_pending(c, seed):
    d = c.get(f"{A}/stock/dashboard").json()
    assert d["pending_units"] == 1 and d["picks"] == 3
    assert d["stock"]["no_loc"] >= 2 and d["stock"]["value"] > 0
    low = {x["name"] for x in d["low"]}
    assert "Ремень 1040-8M-30" not in low and "Ремень SPB 1650 Lw" in low  # 8 < 20
    assert d["counts"][0]["number"] == "INV-26-0012"


def test_stock_table_filters(c, seed):
    t = c.get(f"{A}/stock/table").json()
    assert t["see_cost"] and t["total"]["items"] == 8
    assert {r["name"] for r in c.get(f"{A}/stock/table", {"kind": "measured"}).json()["rows"]} == {
        "Konveyer lenta EP 400/3 4+2",
        "Konveyer lenta EP 200/2 2+1",
        "Rukav PU T10 (ochiq)",
        "Tishli remen T10 (ochiq, rulon)",
    }
    assert [r["name"] for r in c.get(f"{A}/stock/table", {"q": "spb"}).json()["rows"]] == ["Ремень SPB 1650 Lw"]
    assert all(r["qty"] < r["min_qty"] for r in c.get(f"{A}/stock/table", {"low": "true"}).json()["rows"])


def test_cut_wl_roll_shrinks_piece_and_side_rest(c, seed):
    u = unit(c, "P00000101")  # 800 × 40000
    d = new_doc(
        c,
        "cut",
        seed["warehouses"]["main"],
        [{"item_id": u["item_id"], "batch_id": u["id"], "qty": "0", "data": {"width_mm": 600, "length_mm": 2000}}],
    )
    r = post_doc(c, d).json()
    assert r["status"] == "posted" and r["number"].startswith("KS-")
    ln = r["lines"][0]["data"]
    assert len(ln["pieces"]) == 1 and len(ln["rests"]) == 2 and ln["scrap"] == 0
    assert unit(c, "P00000101")["length_mm"] == 38000
    piece = Unit.objects.get(pk=ln["pieces"][0])
    assert (piece.width_mm, piece.length_mm, float(piece.qty)) == (600, 2000, 1.2) and piece.parent_code == "P00000101"
    side = Unit.objects.get(pk=ln["rests"][1])
    assert (side.width_mm, side.length_mm) == (200, 2000)
    assert unit(c, "P00000101")["cuts"][-1]["number"] == r["number"]


def test_cut_too_big_is_400_and_nothing_changes(c, seed):
    u = unit(c, "P00000102")  # 800 × 12500
    d = new_doc(
        c,
        "cut",
        seed["warehouses"]["main"],
        [{"item_id": u["item_id"], "batch_id": u["id"], "qty": "0", "data": {"width_mm": 900, "length_mm": 100}}],
    )
    r = post_doc(c, d)
    assert r.status_code == 400 and "sig'maydi" in r.json()["detail"]
    assert unit(c, "P00000102")["width_mm"] == 800 and c.get(f"{A}/docs/{d['id']}").json()["status"] == "draft"


def test_inventory_partial_and_full(c, seed):
    main = seed["warehouses"]["main"]
    u = unit(c, "P00000104")
    d = new_doc(
        c, "inventory", main, [{"item_id": u["item_id"], "batch_id": u["id"], "qty": "14"}], data={"scope": "partial"}
    )
    assert post_doc(c, d).status_code == 409  # A sinf: har qanday farq — tasdiq talab qiladi
    r = post_ok(c, d, "count_error").json()
    assert r["data"]["result"][0]["diff"] == -1 and r["data"]["positions"] == 1
    assert r["data"]["approval"]["reason"] == "count_error"
    assert unit(c, "P00000101")["stock"][0]["qty"] == 32  # sanalmagani tegilmadi
    d2 = new_doc(
        c, "inventory", main, [{"item_id": u["item_id"], "batch_id": u["id"], "qty": "14"}], data={"scope": "full"}
    )
    assert post_ok(c, d2, "loss").status_code == 200
    assert unit(c, "P00000101")["stock"] == []  # to'liq sanoq: sanalmagani hisobdan chiqdi


def test_count_unit_pending_then_counted(c, seed):
    main = seed["warehouses"]["main"]
    item = seed["items"][2]
    r = post(
        c, f"{A}/units", {"item_id": item, "firm": "BLT", "warehouse_id": main, "width_mm": 500, "length_mm": 3000}
    ).json()
    assert unit(c, r["code"])["pending"] is True and r["qty"] == 1.5
    assert c.delete(f"{A}/units/{unit(c, 'P00000101')['id']}").status_code == 400
    d = new_doc(c, "inventory", main, [{"item_id": item, "batch_id": r["batch_id"], "qty": "1.5"}])
    post_ok(c, d, "unrecorded_in")
    assert unit(c, r["code"])["pending"] is False and unit(c, r["code"])["stock"][0]["qty"] == 1.5
    r2 = post(
        c, f"{A}/units", {"item_id": item, "firm": "BLT", "warehouse_id": main, "width_mm": 100, "length_mm": 100}
    ).json()
    assert c.delete(f"{A}/units/{r2['batch_id']}").status_code == 200


def test_abc_cycle(c, seed):
    cy = c.get(f"{A}/stock/cycle", {"warehouse_id": seed["warehouses"]["main"]}).json()
    names = [r["name"] for r in cy["due"]]
    assert "Konveyer lenta EP 200/2 2+1" in names  # A, 41 kun > 7
    assert "Konveyer lenta EP 400/3 4+2" in names  # A, 12 kun > 7 (haftalik)
    assert (cy["summary"]["A"]["days"], cy["summary"]["B"]["days"], cy["summary"]["C"]["days"]) == (7, 30, 90)
    assert cy["due_total"] == len(names)


def test_pick_ship_unit_and_lot(c, seed):
    picks = c.get(f"{A}/picks").json()
    p = next(x for x in picks if x["number"] == "BR-BU-26-00031")
    po = c.get(f"{A}/picks/{p['id']}").json()
    l1 = next(x for x in po["lines"] if x["line_no"] == 1)
    # o'lchamli: kerakdan katta bo'lganlarning eng kichigi birinchi (kesishda chiqindi kam), keyin qolganlari
    fit = [u for u in l1["units"] if u["qty"] >= l1["left"]]
    assert l1["units"][0] == min(fit, key=lambda u: u["qty"]) and l1["units"][0]["tip"] in ("kam chiqindi", "aniq mos")
    assert [x["stop"] for x in po["lines"]] == list(range(1, len(po["lines"]) + 1))
    piece = unit(c, "P00000102")
    r = post(
        c,
        f"{A}/picks/{p['id']}/ship",
        {
            "picks": [
                {"line_no": 1, "batch_id": piece["id"], "qty": "4.8", "scan": "P00000102"},
                {"line_no": 2, "batch_id": None, "qty": "2"},
            ]
        },
    )
    assert r.status_code == 200 and r.json()["number"].startswith("JN-")
    assert unit(c, "P00000102")["stock"][0]["qty"] == pytest.approx(5.2)
    assert Pick.objects.get(pk=p["id"]).done
    assert post(c, f"{A}/picks/{p['id']}/ship", {"picks": [{"line_no": 1, "qty": "1"}]}).status_code == 404


def test_pick_too_much_is_400(c, seed):
    p = next(x for x in c.get(f"{A}/picks").json() if x["number"] == "BR-BU-26-00034")
    r = post(c, f"{A}/picks/{p['id']}/ship", {"picks": [{"line_no": 1, "batch_id": None, "qty": "4"}]})
    assert r.status_code == 400 and "ko'p" in r.json()["detail"]


def test_acceptance_partial_rest_on_road(c, seed):
    inc = next(x for x in c.get(f"{A}/purchase/incoming").json() if x["number"] == "PO-26-0007")
    lines = [{"item_id": inc["items"][0]["item_id"], "char_id": None, "qty": "20"}]
    d = new_doc(
        c,
        "acceptance",
        inc["warehouse_id"],
        lines,
        firm="RMN",
        warehouse_to=seed["warehouses"]["main"],
        base_id=inc["id"],
        data={"final": False},
    )
    r = post_doc(c, d).json()
    assert r["status"] == "posted"
    left = Incoming.objects.get(pk=inc["id"])
    assert not left.done and [i["qty"] for i in left.items] == [30]
    unpl = c.get(f"{A}/wh/unplaced", {"store_id": seed["warehouses"]["main"]}).json()
    assert any(x["doc"] == r["number"] for x in unpl)


def test_transfer_and_writeoff(c, seed):
    """Ko'chirish — avval «Yo'lda» (in-transit), qabul qiluvchi ombor skanerlab / «hammasi keldi» bilan qabul qiladi;
    hisobdan chiqarish — sabab majburiy."""
    main, shop, road = seed["warehouses"]["main"], seed["warehouses"]["shop"], seed["warehouses"]["road"]
    u = unit(c, "P00000104")
    lot_item = seed["items"][6]
    lines = [{"item_id": u["item_id"], "batch_id": u["id"], "qty": "15"}]
    d = post_doc(c, new_doc(c, "transfer", main, lines, warehouse_to=shop)).json()
    assert d["data"]["transit"] and d["data"]["units"] == [u["id"]]
    assert unit(c, "P00000104")["stock"][0]["warehouse_id"] == road  # yo'lda (skanerda ko'rinadi)
    inc = c.get(f"{A}/transfers/incoming", {"store_id": shop}).json()
    assert [x["number"] for x in inc] == [d["number"]] and inc[0]["units"][0]["received"] is False
    assert post(c, f"{A}/docs/{d['id']}/receive", {"batch_ids": [999]}).status_code == 400
    r = post(c, f"{A}/docs/{d['id']}/receive", {"batch_ids": [u["id"]]}).json()
    assert r["done"] and r["units"][0]["received"]
    assert unit(c, "P00000104")["stock"][0]["warehouse_id"] == shop and unit(c, "P00000104")["loc"] is None
    assert any(x["code"] == "P00000104" for x in c.get(f"{A}/wh/unplaced", {"store_id": shop}).json())
    assert c.get(f"{A}/transfers/incoming", {"store_id": shop}).json() == []
    assert post(c, f"{A}/docs/{d['id']}/receive", {"all": True}).status_code == 400  # allaqachon

    lot_lines = [{"item_id": lot_item, "qty": "2"}]
    d2 = post_doc(c, new_doc(c, "transfer", main, lot_lines, firm="RMN", warehouse_to=shop)).json()
    assert (
        d2["data"]["lots"][0]["qty"] == 2 and Unit.objects.filter(warehouse_id=road, item_id=lot_item, qty=2).exists()
    )
    assert post(c, f"{A}/docs/{d2['id']}/receive", {"all": True}).json()["done"]
    assert services.stock_of(lot_item) == 33  # 1 asosiy + 32 do'kon (yo'lda — 0)

    one = [{"item_id": lot_item, "qty": "1"}]
    assert post_doc(c, new_doc(c, "writeoff", main, one, firm="RMN")).status_code == 400  # sabab yo'q
    five = [{"item_id": lot_item, "qty": "5"}]
    r = post_doc(c, new_doc(c, "writeoff", main, five, firm="RMN", data={"reason": "Brak"}))
    assert r.status_code == 400 and "bor, kerak" in r.json()["detail"]  # asosiyda 1 ta
    r = post_doc(c, new_doc(c, "writeoff", main, one, firm="RMN", data={"reason": "Brak"}))
    assert r.status_code == 200 and services.stock_of(lot_item) == 32


def test_writeoff_approval_and_replenish(c, seed):
    """Hisobdan chiqarish summasi chegaradan katta — rahbar tasdig'i; to'ldirish me'yori va taklif."""
    main, shop = seed["warehouses"]["main"], seed["warehouses"]["shop"]
    u = unit(c, "P00000101")  # 32 m² × tannarx — 500 000 dan katta
    lines = [{"item_id": u["item_id"], "batch_id": u["id"], "qty": "32"}]
    d = new_doc(c, "writeoff", main, lines, data={"reason": "Brak"})
    r = post_doc(c, d)
    assert r.status_code == 409 and "rahbar" in r.json()["detail"]
    r = post(c, f"{A}/docs/{d['id']}/post", {"version": d["version"], "approve": True}).json()
    assert r["data"]["approval"]["value"] > 500_000 and r["data"]["reason"] == "Brak"

    lot = seed["items"][5]  # SPB: asosiyda 8 dona, do'konda yo'q
    lv = post(c, f"{A}/wh/levels", {"store_id": shop, "item_id": lot, "min_qty": 5, "max_qty": 12}).json()
    assert (lv["min_qty"], lv["max_qty"], lv["have"]) == (5, 12, 0)
    bad = {"store_id": shop, "item_id": lot, "min_qty": 5, "max_qty": 2}
    assert post(c, f"{A}/wh/levels", bad).status_code == 400
    rp = c.get(f"{A}/replenish", {"store_id": shop}).json()
    row = next(x for x in rp["rows"] if x["item_id"] == lot)
    assert rp["from_id"] == main and (row["need"], row["available"], row["suggest"]) == (12, 8, 8)
    assert c.delete(f"{A}/wh/levels/{lv['id']}").json() == {"ok": True}
    assert c.get(f"{A}/replenish", {"store_id": shop}).json()["rows"] == []


def test_transfer_same_wh_is_400(c, seed):
    main = seed["warehouses"]["main"]
    r = post(
        c,
        f"{A}/docs",
        {"kind": "transfer", "firm": "BLT", "header": {"warehouse_id": main, "warehouse_to": main}, "lines": []},
    )
    assert r.status_code == 400


def test_cutplan_rest_first_and_missing(c, seed):
    r = post(
        c,
        f"{A}/stock/cutplan",
        {
            "item_id": seed["items"][1],
            "warehouse_id": seed["warehouses"]["main"],
            "needs": [{"w": 600, "l": 2500, "n": 2}, {"w": 1200, "l": 100, "n": 1}],
        },
    ).json()
    assert len(r["missing"]) == 1 and r["missing"][0]["width_mm"] == 1200
    assert r["units"][0]["kind"] == "piece"  # avval qoldiq bo'lak
    assert r["pieces"] == 2 and r["opened"] == 0


def test_place_undo_and_tree(c, seed):
    tree = c.get(f"{A}/wh/tree", {"store_id": seed["warehouses"]["main"]}).json()
    assert [b["code"] for b in tree["blocks"]] == ["A", "B"] and tree["loose"]
    cell = next(x for x in c.get(f"{A}/cells").json() if x["code"] == "C-01-1")
    r = post(
        c,
        f"{A}/place",
        {
            "loc_id": cell["id"],
            "item_id": seed["items"][1],
            "firm": "BLT",
            "units": [{"w": 800, "l": 3000}, {"w": 650, "l": 1000}],
        },
    ).json()
    assert r["number"].startswith("BQ-") and len(r["units"]) == 2 and r["qty"] == pytest.approx(3.05)
    assert c.get(r["label"]["url"]).status_code == 200
    rec = c.get(f"{A}/place/recent").json()
    assert rec[0]["number"] == r["number"]
    assert post(c, f"{A}/place/{rec[0]['id']}/undo").status_code == 200
    assert all(Unit.objects.get(pk=i).qty == 0 for i in r["units"])


def test_version_conflict_409(c, seed):
    d = new_doc(c, "inventory", seed["warehouses"]["main"], [])
    s = post(c, f"{A}/docs/{d['id']}/save", {"version": d["version"], "lines": []}).json()
    assert s["version"] == 2
    assert post(c, f"{A}/docs/{d['id']}/save", {"version": 1, "lines": []}).status_code == 409


def test_labels_pdf(c, seed):
    u = unit(c, "P00000101")
    r = post(c, f"{A}/labels/pdf", {"batch_ids": [u["id"]]})
    assert r.status_code == 200 and r["Content-Type"] == "application/pdf" and r.content[:4] == b"%PDF"
    cells = [x["id"] for x in c.get(f"{A}/cells").json()[:3]]
    assert post(c, f"{A}/labels/pdf", {"cell_ids": cells}).content[:4] == b"%PDF"
    assert post(c, f"{A}/labels/print", {"batch_ids": [u["id"]]}).status_code == 400


def test_permissions(client, make_user, depts, seed):
    client.force_login(make_user(77, "employee", depts["sotuv"]))
    assert client.get(f"{A}/stock/dashboard").status_code == 403
    client.logout()
    assert client.get(f"{A}/stock/dashboard").status_code == 401


def test_services_free_minus_reserved_and_produce(seed):
    i = seed["items"][5]  # SPB: 8 dona, navbatda 3
    assert services.free([i])[(i, None)] == 5
    r = services.produce(item_id=i, char_id=None, qty="2", firm=None, by="Ali", tg_id=1, job="SX-1")
    assert r["code"].startswith("P") and services.stock_of(i) == 10


def test_structure_buildings_blocks_cells(c, seed):
    """Tuzilma: ombor (AO) → bino (AO1) → xona (AO1-A) → stellaj (AO1-A-01); xona harfi — bino ichida yagona."""
    main = seed["warehouses"]["main"]
    st = c.get(f"{A}/wh/structure", {"store_id": main}).json()
    assert st["store"]["code"] == "AO"
    assert [(x["name"], x["code"]) for x in st["buildings"]] == [("1-bino", "AO1")]
    assert {x["code"]: x["full"] for x in st["blocks"]} == {"A": "AO1-A", "B": "AO1-B"}
    bld = post(c, f"{A}/wh/buildings", {"store_id": main, "name": "Sovuq ombor"}).json()
    assert (bld["number"], bld["code"]) == (2, "AO2")  # keyingi bo'sh raqam
    assert post(c, f"{A}/wh/buildings", {"store_id": main, "name": "SOVUQ OMBOR"}).status_code == 400  # takror nom
    assert post(c, f"{A}/wh/buildings", {"store_id": main, "number": 1}).status_code == 400  # band raqam
    blk = post(
        c, f"{A}/wh/blocks", {"store_id": main, "building_id": bld["id"], "code": "a", "name": "Muzlatgich"}
    ).json()
    assert (blk["code"], blk["full"]) == ("A", "AO2-A")  # boshqa binoda A — mumkin
    assert post(c, f"{A}/wh/blocks", {"store_id": main, "building_id": bld["id"], "code": "A"}).status_code == 400
    assert post(c, f"{A}/wh/blocks", {"store_id": main, "building_id": bld["id"], "code": "1"}).status_code == 400
    r = post(c, f"{A}/cells", {"parent_id": main, "block_id": blk["id"], "codes": ["A-05-1"]}).json()  # erkin joy
    assert [x["code"] for x in r] == ["A-05-1"]
    assert post(c, f"{A}/cells", {"parent_id": main, "block_id": blk["id"], "codes": ["B-09-1"]}).status_code == 400


def test_store_edit_and_drop(c, seed):
    """Omborni tahrirlash va o'chirish: qoldiq bo'lsa — 409, tarixi bo'lsa — arxiv, bo'sh — butunlay."""
    from django.utils import timezone

    from config.apps.erp.warehouse.models import Warehouse, WhKind

    w = seed["warehouses"]
    r = post(c, f"{A}/wh/stores/{w['sex']}", {"name": "Sex 1", "kind": "production"}).json()
    assert (r["name"], r["kind"]) == ("Sex 1", "production")
    assert post(c, f"{A}/wh/stores/{w['sex']}", {"name": "asosiy ombor"}).status_code == 400  # takror nom
    assert post(c, f"{A}/wh/stores/{w['sex']}", {"name": "X", "kind": "transit"}).status_code == 400
    assert post(c, f"{A}/wh/stores/{w['road']}", {"name": "Y"}).status_code == 404  # yo'ldagi — tahrirlanmaydi
    assert c.delete(f"{A}/wh/stores/{w['main']}").status_code == 409  # qoldiq bor

    empty = Warehouse.objects.create(name="Bo'sh", kind=WhKind.STORE)
    post(c, f"{A}/wh/buildings", {"store_id": empty.pk, "name": "1-bino"})
    assert c.delete(f"{A}/wh/stores/{empty.pk}").json() == {"ok": True, "archived": False}
    assert not Warehouse.objects.filter(pk=empty.pk).exists()

    used = Warehouse.objects.create(name="Eski", kind=WhKind.SHOP)
    Unit.objects.create(item_id=1, firm="BLT", warehouse=used, kind="piece", qty=0, created=timezone.now())
    assert c.delete(f"{A}/wh/stores/{used.pk}").json() == {"ok": True, "archived": True}
    used.refresh_from_db()
    assert not used.active and used.name.startswith("Eski (o'chirilgan")
    assert used.pk not in [x["id"] for x in c.get(f"{A}/me").json()["warehouses"]]
    assert post(c, f"{A}/wh/stores/{w['sex']}", {"name": "Eski"}).status_code == 200  # nom bo'shadi


def test_structure_edit_and_drop(c, seed):
    """Bino/xona/joy: tahrirlash (kod o'zgarsa — joy kodlari qayta quriladi), holat, o'chirish (birlik bor — 409)."""
    main = seed["warehouses"]["main"]
    st = c.get(f"{A}/wh/structure", {"store_id": main}).json()
    b1 = st["buildings"][0]
    blk_a = next(x for x in st["blocks"] if x["code"] == "A")
    codes = lambda: {x["code"] for x in c.get(f"{A}/cells").json()}

    r = post(c, f"{A}/wh/buildings/{b1['id']}", {"name": "Bosh bino", "number": 3}).json()
    assert (r["code"], r["recoded"]) == ("AO3", 12) and "AO3-A-01-01-A" in codes()
    r = post(c, f"{A}/wh/blocks/{blk_a['id']}", {"name": "Lentalar", "code": "K"}).json()
    assert (r["full"], r["recoded"]) == ("AO3-K", 6) and "AO3-K-01-01-A" in codes()
    assert post(c, f"{A}/wh/blocks/{blk_a['id']}", {"code": "B"}).status_code == 400  # binoda B bor
    r = post(c, f"{A}/wh/stores/{main}", {"name": "Asosiy ombor", "code": "as"}).json()
    assert r["code"] == "AS" and "AS3-K-01-01-A" in codes()
    assert post(c, f"{A}/wh/stores/{main}", {"name": "Asosiy ombor", "code": "DC"}).status_code == 400  # band

    cells = c.get(f"{A}/cells").json()
    busy = next(x for x in cells if x["block_id"] == blk_a["id"] and x["units"])
    empty = next(x for x in cells if x["block_id"] == blk_a["id"] and not x["units"])
    assert post(c, f"{A}/cells/{empty['id']}", {"code": "Z-1"}).status_code == 400  # stellaj joyi — kod tuzilmadan
    assert post(c, f"{A}/cells/{empty['id']}", {"status": "nope"}).status_code == 400
    assert post(c, f"{A}/cells/{empty['id']}", {"status": "blocked"}).json()["status"] == "blocked"
    u = c.get(f"{A}/scan", {"code": "P00000101"}).json()
    assert post(c, f"{A}/units/loc", {"batch_ids": [u["id"]], "loc_id": empty["id"]}).status_code == 400  # bloklangan
    post(c, f"{A}/cells/{empty['id']}", {"status": "active"})
    assert c.delete(f"{A}/cells/{busy['id']}").status_code == 409
    assert c.delete(f"{A}/cells/{empty['id']}").json() == {"ok": True}
    assert c.delete(f"{A}/wh/blocks/{blk_a['id']}").status_code == 409
    assert c.delete(f"{A}/wh/buildings/{b1['id']}").status_code == 409

    bld = post(c, f"{A}/wh/buildings", {"store_id": main, "name": "Yangi"}).json()
    w = post(
        c,
        f"{A}/wh/wizard",
        {"store_id": main, "building_id": bld["id"], "block_code": "Q", "racks": 2, "rows": 2, "floors": 3},
    ).json()
    assert [x["code"] for x in w["racks"]] == [f"{bld['code']}-Q-01", f"{bld['code']}-Q-02"] and w["cells"] == 12
    assert c.delete(f"{A}/wh/buildings/{bld['id']}").json() == {"ok": True, "cells": 12}
    assert c.delete(f"{A}/cells/999999").status_code == 404


def test_codes_unique_across_warehouses(c, seed):
    """Har omborning o'z kodi bor (AO, DC, SX) — boshqa omborda ham A xona bo'lishi mumkin, joy kodlari to'qnashmaydi."""
    w = seed["warehouses"]
    sex_bld = post(c, f"{A}/wh/buildings", {"store_id": w["sex"], "name": "Sex binosi"}).json()
    assert sex_bld["code"] == "SX1"
    blk = post(c, f"{A}/wh/blocks", {"store_id": w["sex"], "building_id": sex_bld["id"], "code": "A"}).json()
    r = post(c, f"{A}/wh/racks", {"store_id": w["sex"], "block_id": blk["id"], "rows": 1, "floors": 1}).json()
    assert r["code"] == "SX1-A-01"
    main_cell = next(x["code"] for x in c.get(f"{A}/cells").json() if x["code"] == "C-01-1")
    r = post(c, f"{A}/cells", {"parent_id": w["sex"], "codes": [main_cell]})
    assert r.status_code == 400 and "Asosiy ombor" in r.json()["detail"]


def test_racks(c, seed):
    """Stellaj: qatorlar × qavatlar → joylar AO1-A-02-01-A…; xarakteristika o'zgarsa — qo'shiladi/o'chiriladi; band — 409."""
    main = seed["warehouses"]["main"]
    st = c.get(f"{A}/wh/structure", {"store_id": main}).json()
    blk_a = next(x for x in st["blocks"] if x["code"] == "A")
    assert [(x["code"], x["rows"], x["floors"]) for x in st["racks"] if x["block_id"] == blk_a["id"]] == [
        ("AO1-A-01", 3, 2)
    ]
    r = post(
        c, f"{A}/wh/racks", {"store_id": main, "block_id": blk_a["id"], "rows": 4, "floors": 7, "name": "Devor"}
    ).json()
    assert (r["code"], r["cells"]) == ("AO1-A-02", 28)
    cs = [x for x in c.get(f"{A}/cells").json() if x["rack_id"] == r["id"]]
    assert {"AO1-A-02-01-A", "AO1-A-02-04-G"} <= {x["code"] for x in cs} and len(cs) == 28
    assert all(x["row"] and x["floor"] and x["status"] == "active" for x in cs)
    assert (
        post(c, f"{A}/wh/racks", {"store_id": main, "block_id": blk_a["id"], "rows": 1, "floors": 25}).status_code
        == 400
    )
    e = post(c, f"{A}/wh/racks/{r['id']}", {"rows": 3, "floors": 8}).json()
    assert (e["rows"], e["floors"], e["added"], e["removed"]) == (3, 8, 3, 7)  # +3 (H qavat), −7 (4-qator)
    rack1 = next(x for x in st["racks"] if x["code"] == "AO1-A-01")
    assert post(c, f"{A}/wh/racks/{rack1['id']}", {"rows": 1, "floors": 1}).status_code == 409  # 01-B da birlik
    assert c.delete(f"{A}/wh/racks/{rack1['id']}").status_code == 409
    assert c.delete(f"{A}/wh/racks/{r['id']}").json() == {"ok": True, "cells": 24}
    pdf = post(c, f"{A}/labels/pdf", {"rack_ids": [rack1["id"]]})
    assert pdf.status_code == 200 and pdf["Content-Type"] == "application/pdf"


def test_ledger_moves_idempotency(c, seed):
    """Jurnal: joy o'zgarishi — 0 delta bilan yozuv (qayerdan → qayerga, kim); o'zgarmaydi; Idempotency-Key — takror yo'q."""
    from config.apps.erp.warehouse.models import StockMove

    u = unit(c, "P00000101")
    cells = [
        x for x in c.get(f"{A}/cells").json() if x["parent_id"] == seed["warehouses"]["main"] and x["code"] != u["loc"]
    ]
    r = c.post(f"{A}/units/loc", {"batch_ids": [u["id"]], "loc_id": cells[0]["id"]}, content_type="application/json")
    assert r.status_code == 200
    m = c.get(f"{A}/moves", {"unit_id": u["id"], "limit": 1}).json()[0]
    assert (m["op"], m["op_title"], m["delta"], m["loc_from"], m["loc_to"]) == (
        "units_loc",
        "Joyni o'zgartirish",
        0.0,
        u["loc"],
        cells[0]["code"],
    )
    sm = StockMove.objects.get(pk=m["id"])
    with pytest.raises(ValueError):
        sm.save()
    with pytest.raises(ValueError):
        sm.delete()

    n = StockMove.objects.count()
    h = {"HTTP_IDEMPOTENCY_KEY": "k-123"}
    body = {"batch_ids": [u["id"]], "loc_id": cells[1]["id"]}
    r1 = c.post(f"{A}/units/loc", body, content_type="application/json", **h)
    r2 = c.post(f"{A}/units/loc", {**body, "loc_id": cells[2]["id"]}, content_type="application/json", **h)
    assert r1.status_code == r2.status_code == 200 and r1.json() == r2.json()
    assert StockMove.objects.count() == n + 1  # ikkinchisi bajarilmadi
    assert unit(c, "P00000101")["loc"] == cells[1]["code"]

    lines = [{"item_id": u["item_id"], "batch_id": u["id"], "qty": "32"}]
    d = new_doc(c, "writeoff", seed["warehouses"]["main"], lines, data={"reason": "Brak"})
    assert post(c, f"{A}/docs/{d['id']}/post", {"version": d["version"], "approve": True}).status_code == 200
    w = c.get(f"{A}/moves", {"unit_id": u["id"], "limit": 1}).json()[0]
    assert (w["op"], w["delta"], w["qty_after"], w["reason"]) == ("writeoff", -32, 0, "Brak") and w["doc_number"]


def test_zones_capacity_putaway(c, seed):
    """Xona vazifasi va guruhlari, stellaj turi/sig'imi/eni; to'la yoki eni sig'maydigan joy — 400; tavsiya tartibi."""
    main = seed["warehouses"]["main"]
    st = c.get(f"{A}/wh/structure", {"store_id": main}).json()
    blk = {x["code"]: x for x in st["blocks"]}
    rack_a = next(x for x in st["racks"] if x["code"] == "AO1-A-01")
    assert (blk["A"]["purpose"], blk["A"]["groups"], rack_a["cell_kind"], rack_a["capacity"]) == (
        "storage",
        [],
        "shelf",
        None,
    )
    assert "Konveyer lentalar" in c.get(f"{A}/cat/groups").json()
    r = post(c, f"{A}/wh/blocks/{blk['A']['id']}", {"groups": ["Konveyer lentalar"], "purpose": "storage"}).json()
    assert r["groups"] == ["Konveyer lentalar"]
    assert post(c, f"{A}/wh/blocks/{blk['A']['id']}", {"purpose": "nope"}).status_code == 400
    item1 = seed["items"][1]  # konveyer lenta EP 400/3 (P00000101 — AO1-A-01-01-A)

    tips = c.get(f"{A}/putaway", {"store_id": main, "item_id": item1}).json()
    assert tips[0]["reason"].startswith("shu tovar") and tips[0]["code"].startswith("AO1-A-01-01")

    r = post(c, f"{A}/wh/racks/{rack_a['id']}", {"rows": 3, "floors": 2, "cell_kind": "roll", "capacity": 1}).json()
    assert (r["cell_kind"], r["capacity"], r["rows"]) == ("roll", 1, 3)
    tips = c.get(f"{A}/putaway", {"store_id": main, "item_id": item1}).json()
    assert tips and all(t["units"] == 0 for t in tips)  # to'la joylar — tavsiya etilmaydi
    assert tips[0]["reason"] == "«Konveyer lentalar» xonasi, bo'sh" and tips[0]["code"].startswith("AO1-A")
    u = unit(c, "P00000104")  # AO1-A-01-02-A da; AO1-A-01-01-A — to'la (P00000101)
    full = next(x for x in c.get(f"{A}/cells").json() if x["code"] == "AO1-A-01-01-A")
    r = post(c, f"{A}/units/loc", {"batch_ids": [u["id"]], "loc_id": full["id"]})
    assert r.status_code == 400 and "to'la" in r.json()["detail"]

    post(c, f"{A}/wh/racks/{rack_a['id']}", {"rows": 3, "floors": 2, "capacity": None, "max_width_mm": 400})
    r = post(c, f"{A}/units/loc", {"batch_ids": [u["id"]], "loc_id": full["id"]})  # eni 500 > 400
    assert r.status_code == 400 and "sig'maydi" in r.json()["detail"]
    tips = c.get(f"{A}/putaway", {"store_id": main, "item_id": item1, "width_mm": 800}).json()
    assert tips and not any(t["code"].startswith("AO1-A") for t in tips)  # A stellajga 800 mm sig'maydi
    post(c, f"{A}/wh/blocks/{blk['B']['id']}", {"purpose": "quarantine"})
    tips = c.get(f"{A}/putaway", {"store_id": main, "item_id": item1, "width_mm": 800}).json()
    assert not any(t["code"].startswith("AO1-B") for t in tips)  # karantin — tavsiya etilmaydi


def test_receiving_asn_extra_dock(c, seed):
    """Kutilgan kirim (ASN) yaratish → qabul (rejadan tashqari tovar bilan) → farqlar → joylash navbati (kutish vaqti)
    → joyga qo'yish → dock-to-stock; boshlanmagan kirimni bekor qilish."""
    main = seed["warehouses"]["main"]
    lot, other = seed["items"][4], seed["items"][5]
    assert post(c, f"{A}/purchase/incoming", {"firm": "RMN", "items": []}).status_code == 400
    assert post(c, f"{A}/purchase/incoming", {"firm": "RMN", "items": [{"item_id": lot, "qty": 0}]}).status_code == 400
    inc = post(
        c,
        f"{A}/purchase/incoming",
        {"supplier": "Bando", "firm": "RMN", "expected": "2026-11-20", "items": [{"item_id": lot, "qty": "10"}]},
    ).json()
    assert inc["number"].startswith("KR-") and inc["supplier"] == "Bando" and inc["items"][0]["qty"] == 10
    assert any(x["id"] == inc["id"] for x in c.get(f"{A}/purchase/incoming").json())

    lines = [{"item_id": lot, "qty": "8"}, {"item_id": other, "qty": "2"}]  # 2 kam + rejada yo'q tovar
    d = new_doc(c, "acceptance", inc["warehouse_id"], lines, firm="RMN", warehouse_to=main, base_id=inc["id"])
    r = post_doc(c, d).json()
    res = {x["item_id"]: x for x in r["data"]["result"]}
    assert (res[lot]["diff"], res[other]["diff"], res[other].get("extra")) == (-2, 2, True) and res[other]["name"]

    q = [x for x in c.get(f"{A}/wh/unplaced", {"store_id": main}).json() if x["doc"] == r["number"]]
    assert len(q) == 2 and all(x["since"] and x["item_id"] for x in q)
    k0 = c.get(f"{A}/kpi/dock", {"store_id": main}).json()
    assert k0["waiting"] >= 2 and k0["oldest_h"] is not None
    cell = c.get(f"{A}/putaway", {"store_id": main, "item_id": lot}).json()[0]
    assert post(c, f"{A}/units/loc", {"batch_ids": [q[0]["batch_id"]], "loc_id": cell["id"]}).status_code == 200
    k1 = c.get(f"{A}/kpi/dock", {"store_id": main}).json()
    assert k1["placed"] >= 1 and k1["within_2h"] == 100 and k1["waiting"] == k0["waiting"] - 1

    inc2 = post(c, f"{A}/purchase/incoming", {"firm": "BLT", "items": [{"item_id": lot, "qty": 1}]}).json()
    assert c.delete(f"{A}/purchase/incoming/{inc2['id']}").json() == {"ok": True}
    assert c.delete(f"{A}/purchase/incoming/{inc2['id']}").status_code == 404


def test_count_tolerance_review_ira(c, seed):
    """Sanash: oldindan ko'rish (o'zgartirmaydi) → toleransdan katta farq — tasdiqsiz o'tmaydi (rahbar + sabab);
    kichik farq (C sinf, 5% ichida) — avtomatik; IRA ko'rsatkichi."""
    from types import SimpleNamespace

    from config.apps.erp.warehouse import stock
    from config.apps.erp.warehouse.models import ItemMeta

    main = seed["warehouses"]["main"]
    u = unit(c, "P00000101")  # A sinf, 32 m²
    d = new_doc(c, "inventory", main, [{"item_id": u["item_id"], "batch_id": u["id"], "qty": "0"}])
    rv = post(c, f"{A}/docs/{d['id']}/review").json()
    ln = rv["lines"][0]
    assert (ln["book"], ln["counted"], ln["ok"], ln["cls"], rv["need"], rv["can_approve"]) == (
        32,
        0,
        False,
        "A",
        1,
        True,
    )
    assert ln["value"] > 0 and {"count_error", "loss"} <= {r["code"] for r in rv["reasons"]}
    assert unit(c, "P00000101")["stock"][0]["qty"] == 32  # ko'rish hech narsani o'zgartirmadi
    r = post_doc(c, d)
    assert r.status_code == 409 and "tolerans" in r.json()["detail"]
    worker = SimpleNamespace(role="employee", in_lead_dept=lambda: False, name="Omborchi", tg_id=5)
    with pytest.raises(stock.Conflict):
        stock.doc_post(d["id"], {"version": d["version"], "approve": True, "reason": "loss"}, worker)
    assert post(c, f"{A}/docs/{d['id']}/post", {"version": d["version"], "approve": True}).status_code == 400  # sabab
    assert unit(c, "P00000101")["stock"][0]["qty"] == 32

    lot = seed["items"][6]  # donali, RMN
    ItemMeta.objects.update_or_create(item_id=lot, defaults={"cls": "C", "cost": 1000})
    d2 = new_doc(c, "inventory", main, [{"item_id": lot, "qty": "3"}], firm="RMN")  # asosiyda 3 ta
    assert post(c, f"{A}/docs/{d2['id']}/review").json()["need"] == 0  # farq yo'q
    assert post_doc(c, d2).status_code == 200

    k = c.get(f"{A}/kpi/ira", {"store_id": main}).json()
    assert k["positions"] >= 1 and k["ira"] is not None and "C" in k["by_cls"]


def test_pick_route_short_wrong_unit_quarantine(c, seed):
    from config.apps.erp.warehouse.stock import path_key

    # «ilon izi»: toq stellajda qator o'sadi, juftida kamayadi; joysiz — oxirida
    cs = list(Cell.objects.filter(rack__isnull=False).select_related("block__building", "rack"))
    ks = sorted(cs, key=path_key)
    r1 = [c.row for c in ks if c.rack.number == 1 and c.block == ks[0].block]
    assert r1 == sorted(r1)
    assert path_key(None) > path_key(ks[-1])

    p = next(x for x in c.get(f"{A}/picks").json() if x["number"] == "BR-BU-26-00031")
    po = c.get(f"{A}/picks/{p['id']}").json()
    routed = [x["at"] for x in po["lines"] if x["at"]]
    assert po["route"] == routed
    l1 = next(x for x in po["lines"] if x["line_no"] == 1)
    l2 = next(x for x in po["lines"] if x["line_no"] == 2)

    # boshqa tovarning birligi — 400, hech narsa o'zgarmaydi
    piece = unit(c, "P00000102")
    other = Unit.objects.exclude(item_id=piece["item_id"]).filter(code__isnull=False, qty__gt=0).first()
    assert other is not None
    r = post(c, f"{A}/picks/{p['id']}/ship", {"picks": [{"line_no": 1, "batch_id": other.pk, "qty": "1"}]})
    assert r.status_code == 400 and "tovar emas" in r.json()["detail"]
    assert Unit.objects.get(pk=other.pk).qty == other.qty and not Doc.objects.filter(kind="sale").exists()

    # karantindagi birlik taklif qilinmaydi va jo'natilmaydi
    u = Unit.objects.get(code=l1["units"][0]["code"])
    loc = u.loc
    assert loc is not None
    loc.status = "quarantine"
    loc.save()
    po2 = c.get(f"{A}/picks/{p['id']}").json()
    assert u.code not in [x["code"] for ln in po2["lines"] for x in ln["units"]]
    r = post(c, f"{A}/picks/{p['id']}/ship", {"picks": [{"line_no": 1, "batch_id": u.pk, "qty": "1"}]})
    assert r.status_code == 400 and "karantin" in r.json()["detail"]
    loc.status = "active"
    loc.save()

    # topilmadi: qatorga yoziladi, tovar sanash navbatining boshiga tushadi
    ItemMeta.objects.update_or_create(item_id=l2["item_id"], defaults={"last_count": "2026-01-01T00:00:00Z"})
    assert post(c, f"{A}/picks/{p['id']}/short", {"line_no": 2, "reason": "xyz"}).status_code == 400
    r = post(c, f"{A}/picks/{p['id']}/short", {"line_no": 2, "reason": "missing", "loc": l2["at"]})
    assert r.status_code == 200
    assert next(x for x in r.json()["lines"] if x["line_no"] == 2)["short"] == 1
    assert ItemMeta.objects.get(item_id=l2["item_id"]).last_count is None
    assert next(x for x in c.get(f"{A}/picks").json() if x["id"] == p["id"])["short"] == 1


def test_returns(c, seed):
    p = next(x for x in c.get(f"{A}/picks").json() if x["number"] == "BR-BU-26-00031")
    piece = unit(c, "P00000102")
    r = post(
        c,
        f"{A}/picks/{p['id']}/ship",
        {
            "picks": [
                {"line_no": 1, "batch_id": piece["id"], "qty": "4.8"},
                {"line_no": 2, "batch_id": None, "qty": "2"},
            ]
        },
    )
    assert r.status_code == 200
    sale = Doc.objects.get(number=r.json()["number"])
    assert sale.lines[0]["data"]["loc"] and sale.data["customer"]

    # qidiruv: raqam, mijoz, birlik QR
    assert [x["id"] for x in c.get(f"{A}/sales", {"q": sale.number}).json()] == [sale.pk]
    assert sale.pk in [x["id"] for x in c.get(f"{A}/sales", {"q": sale.data["customer"][:4]}).json()]
    s = c.get(f"{A}/sales", {"q": "P00000102"}).json()
    assert [x["id"] for x in s] == [sale.pk]
    lot = next(x for x in s[0]["lines"] if not x["batch_id"])

    assert post(c, f"{A}/returns", {"sale_id": sale.pk, "lines": [{"line": 0, "qty": "1"}]}).status_code == 400  # sabab
    r = post(c, f"{A}/returns", {"sale_id": sale.pk, "reason": "x", "lines": [{"line": lot["line"], "qty": "3"}]})
    assert r.status_code == 400 and "mumkin: 2" in r.json()["detail"]

    # yaroqli lenta — o'sha QR bilan joylash navbatiga; donali brak — karantin joyiga
    q = Cell.objects.filter(warehouse_id=sale.warehouse_id).order_by("code").last()
    assert q is not None
    q.status = "quarantine"
    q.save()
    r = post(
        c,
        f"{A}/returns",
        {
            "sale_id": sale.pk,
            "reason": "Mijoz o'lchamni adashtirgan",
            "lines": [{"line": 0, "qty": "4.8", "grade": "ok"}, {"line": lot["line"], "qty": "1", "grade": "defect"}],
        },
    )
    assert r.status_code == 200, r.json()
    out = r.json()
    assert out["number"].startswith("QT-") and out["ok"] == 1 and out["defect"] == 1 and out["quarantine"] == q.code
    # birlik qisman jo'natilgan (5.2 omborda) — qaytgan qism yangi QR bilan, ota kodi bog'lanadi
    assert unit(c, "P00000102")["stock"][0]["qty"] == pytest.approx(5.2)
    kid = Unit.objects.get(parent_code="P00000102", src=out["number"])
    assert float(kid.qty) == pytest.approx(4.8) and kid.loc is None
    uq = c.get(f"{A}/wh/unplaced", {"store_id": sale.warehouse_id}).json()
    assert any(x["doc"] == out["number"] for x in uq)
    assert Unit.objects.filter(loc=q, qty__gt=0).exists()
    left = c.get(f"{A}/sales", {"q": sale.number}).json()[0]["lines"]
    assert [x["returned"] for x in left] == [4.8, 1]
    r = post(c, f"{A}/returns", {"sale_id": sale.pk, "reason": "x", "lines": [{"line": 0, "qty": "0.1"}]})
    assert r.status_code == 400


def test_kpi_summary(c, seed):
    """8-bosqich: ko'rsatkichlar paneli — chiqim, qaytarish, bandlik, faollik, faol joylar, joylashuv maslahati."""
    main = seed["warehouses"]["main"]
    p = next(x for x in c.get(f"{A}/picks").json() if x["number"] == "BR-BU-26-00031")
    piece = unit(c, "P00000102")
    post(c, f"{A}/picks/{p['id']}/ship", {"picks": [{"line_no": 1, "batch_id": piece["id"], "qty": "4.8"}]})
    sale = Doc.objects.filter(kind="sale").first()
    assert sale is not None
    post(c, f"{A}/returns", {"sale_id": sale.pk, "reason": "x", "lines": [{"line": 0, "qty": "1", "grade": "defect"}]})
    # A-sinf tovar baland qavatda — maslahat
    u = Unit.objects.get(code="P00000101")
    blk = Cell.objects.get(code="AO1-A-01-01-A").block
    assert blk is not None
    assert post(c, f"{A}/wh/racks", {"store_id": main, "block_id": blk.pk, "rows": 1, "floors": 5}).status_code == 200
    hi = Cell.objects.filter(warehouse_id=main, floor__gte=4, status="active").order_by("code").first()
    assert hi is not None
    ItemMeta.objects.update_or_create(item_id=u.item_id, defaults={"cls": "A"})
    assert post(c, f"{A}/units/loc", {"batch_ids": [u.pk], "loc_id": hi.pk}).status_code == 200

    k = c.get(f"{A}/kpi/summary", {"store_id": main, "days": 30}).json()
    o = k["outbound"]
    assert o["orders"] == 1 and o["lines"] == 1 and o["returns"] == 1 and o["return_pct"] == 100 and o["defect"] == 1
    assert o["open"] == len(c.get(f"{A}/picks").json())
    s = k["space"]
    assert s["cells"] == sum(b["cells"] for b in s["by_block"]) and 0 < s["used"] <= s["cells"]
    assert len(k["activity"]) == 14 and sum(d["out"] for d in k["activity"]) >= 1
    assert k["hot"] and k["hot"][0]["moves"] >= k["hot"][-1]["moves"]
    assert any(x["code"] == "P00000101" and x["loc"] == hi.code for x in k["slotting"])
    assert "avg_h" in k["dock"] and "ira" in k["ira"]
    assert c.get(f"{A}/kpi/summary", {"store_id": 99999}).status_code == 400


def test_idem_gc_removes_old_keys(c, seed):
    from datetime import timedelta

    from django.utils import timezone

    from config.apps.erp.warehouse import views
    from config.apps.erp.warehouse.models import IdemKey

    old = IdemKey.objects.create(key="old", path="/x", status=200, body="{}")
    IdemKey.objects.filter(pk=old.pk).update(at=timezone.now() - timedelta(days=8))
    IdemKey.objects.create(key="new", path="/x", status=200, body="{}")
    assert views.idem_gc(every=1) == 1
    assert list(IdemKey.objects.values_list("key", flat=True)) == ["new"]
