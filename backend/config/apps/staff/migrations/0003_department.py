"""Bo'limlar jarvis.Agent(kind=dept) dan staff.Department ga ko'chadi; User.departments endi Department ga ishora qiladi.

Ma'lumot saqlanadi: bo'lim agentlari → Department (kalit, nom, daraxt, sees_all), a'zoliklar → yangi M2M.
"""

from django.db import migrations, models
import django.db.models.deletion


def copy_departments(apps, schema_editor):
    Agent = apps.get_model("jarvis", "Agent")
    Department = apps.get_model("staff", "Department")
    User = apps.get_model("staff", "User")
    agents = list(Agent.objects.filter(kind="dept").order_by("position", "id"))
    made = {}
    for a in agents:
        made[a.pk] = Department.objects.create(
            key=a.key, name=a.name, name_ru=a.name_ru, icon=a.icon, color=a.color,
            sees_all=a.sees_all, position=a.position,
        )
    for a in agents:
        if a.parent_id in made:
            Department.objects.filter(pk=made[a.pk].pk).update(parent=made[a.parent_id])
    for u in User.objects.all():
        old = [made[pk] for pk in u.departments.values_list("pk", flat=True) if pk in made]
        if old:
            u.depts.set(old)


def back(apps, schema_editor):
    Agent = apps.get_model("jarvis", "Agent")
    User = apps.get_model("staff", "User")
    by_key = {a.key: a for a in Agent.objects.filter(kind="dept")}
    for u in User.objects.all():
        u.departments.set([by_key[k] for k in u.depts.values_list("key", flat=True) if k in by_key])


class Migration(migrations.Migration):

    dependencies = [
        ("staff", "0002_invites"),
        ("jarvis", "0002_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Department",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.CharField(max_length=32, unique=True)),
                ("name", models.CharField(max_length=120)),
                ("name_ru", models.CharField(blank=True, max_length=120)),
                ("icon", models.CharField(default="bot", max_length=40)),
                ("color", models.CharField(default="#3e88f7", max_length=9)),
                ("sees_all", models.BooleanField(default=False)),
                ("position", models.PositiveIntegerField(default=0)),
                (
                    "parent",
                    models.ForeignKey(
                        blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                        related_name="children", to="staff.department",
                    ),
                ),
            ],
            options={"ordering": ["position", "id"]},
        ),
        migrations.AddField(
            model_name="user",
            name="depts",
            field=models.ManyToManyField(blank=True, related_name="+", to="staff.department"),
        ),
        migrations.RunPython(copy_departments, back),
        migrations.RemoveField(model_name="user", name="departments"),
        migrations.RenameField(model_name="user", old_name="depts", new_name="departments"),
        migrations.AlterField(
            model_name="user",
            name="departments",
            field=models.ManyToManyField(blank=True, related_name="members", to="staff.department"),
        ),
    ]
