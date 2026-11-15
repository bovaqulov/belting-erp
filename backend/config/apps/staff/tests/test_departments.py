"""Bo'limlar staff.Department da: jarvis bo'lim agenti yaratilsa/o'zgarsa/o'chsa — sinxronlanadi, a'zolik saqlanadi."""

from config.apps.jarvis.models import Agent
from config.apps.jarvis.services import delete_agent
from config.apps.staff.models import Department
from config.apps.staff.services import member_counts, set_departments


def test_dept_agents_mirror_to_departments(depts, make_user):
    tree = {d.key: (d.parent.key if d.parent else None, d.sees_all) for d in Department.objects.all()}
    assert tree == {"rahbariyat": (None, True), "it": ("rahbariyat", False), "sotuv": ("rahbariyat", False)}
    Agent.objects.create(key="bot1", kind="free", name="Bot", persona="p" * 25)  # bo'lim emas
    assert not Department.objects.filter(key="bot1").exists()

    u = make_user(9, "employee", depts["sotuv"])
    a = depts["sotuv"]
    a.name = "Sotuv bo'limi"
    a.save()
    assert Department.objects.get(key="sotuv").name == "Sotuv bo'limi"
    assert u.dept_keys() == ["sotuv"] and member_counts()["sotuv"] == 1  # nom o'zgarsa a'zolik saqlanadi

    sub = Agent.objects.create(key="b2b", kind="dept", name="B2B", persona="p" * 25, parent=a)
    assert getattr(Department.objects.get(key="b2b").parent, "key", None) == "sotuv"
    delete_agent(a)  # bola bir daraja yuqoriga, bo'lim a'zoligi uziladi
    assert not Department.objects.filter(key="sotuv").exists()
    assert getattr(Department.objects.get(key=sub.key).parent, "key", None) == "rahbariyat"
    assert u.dept_keys() == []


def test_set_departments_ignores_unknown(depts, make_user):
    u = make_user(8, "employee")
    set_departments(u, ["it", "yoq"])
    assert u.dept_keys() == ["it"]
