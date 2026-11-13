from datetime import UTC, date, datetime

from config.apps.jarvis.schedule import next_run

# 2026-11-13 juma 10:00 Toshkent = 05:00 UTC (frontend schedule.lib.test.ts bilan bir xil holatlar)
NOW = datetime(2026, 11, 13, 5, 0, tzinfo=UTC)


def nr(repeat="daily", at="09:00", days=(), day=1, on=None, enabled=True):
    t = next_run(repeat=repeat, at=at, days=list(days), day=day, on=on, enabled=enabled, now=NOW)
    return t.astimezone(UTC).isoformat() if t else None


def test_daily():
    assert nr(at="09:00") == "2026-11-14T04:00:00+00:00"
    assert nr(at="18:30") == "2026-11-13T13:30:00+00:00"


def test_weekly_monthly_once_disabled():
    assert nr(repeat="weekly", days=[1, 5]) == "2026-11-16T04:00:00+00:00"
    assert nr(repeat="monthly", day=1) == "2026-12-01T04:00:00+00:00"
    assert nr(repeat="once", on=date(2026, 11, 12)) is None
    assert nr(repeat="once", on=date(2026, 11, 20)) == "2026-11-20T04:00:00+00:00"
    assert nr(enabled=False) is None
