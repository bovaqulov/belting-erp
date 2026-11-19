from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("erp_crm", "0021_doc_lines"),
    ]

    operations = [
        migrations.AddField(
            model_name="doc",
            name="didox_id",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="doc",
            name="didox_status",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="doc",
            name="didox_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
