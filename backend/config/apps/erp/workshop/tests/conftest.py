import pytest


@pytest.fixture
def team(depts):
    """CRM sotuvchilari (crm testlaridagi bilan bir xil): rahbar va ikki sotuvchi."""
    from config.apps.erp.crm.tests.test_api import HEAD, S1, S2
    from config.apps.staff.models import User
    from config.apps.staff.services import set_departments

    head = User.objects.create_user(HEAD, "Rahbar", "employee")
    set_departments(head, [depts["sotuv"].key])
    out = {"head": head}
    for key, tg, name in (("s1", S1, "Akmal"), ("s2", S2, "Dilshod")):
        u = User.objects.create_user(tg, name, "employee", manager=head)
        set_departments(u, [depts["sotuv"].key])
        out[key] = u
    return out
