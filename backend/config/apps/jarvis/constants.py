"""Frontend src/ai/agents/{model.ts, agents.lib.ts} bilan bir xil ro'yxatlar — o'zgarsa ikkalasida."""

KINDS = ("dept", "staff", "free")

# vosita kalitlari (departments.yaml izohlari). Bajaruvchilari applarda ulanganda runtime.TOOL_REGISTRY ga qo'shiladi.
TOOLS = (
    "web", "memory", "kb", "reminders", "weather", "currency", "ask_departments", "calls", "crm", "site",
    "belts", "lenta", "geomap", "onec", "erp", "wb", "computer",
)  # fmt: skip
DEFAULT_TOOLS = ["web", "memory", "kb", "reminders", "weather", "currency"]

MODELS = ("claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-fable-5-2")
DEFAULT_MODEL = "claude-sonnet-5-5"

SCOPE_AREAS = ("calls", "crm", "leads", "orders", "tasks", "finance", "treasury", "cost")
SCOPE_LEVELS = ("all", "team", "own", "none")  # "inherit" — kalit yo'q

CHANNEL_TYPES = ("telegram_group", "telegram_bot", "instagram_direct", "instagram_comments", "web")
CHANNEL_MODES = ("auto", "approve")

REPEATS = ("daily", "weekly", "monthly", "once")
TASK_STATUSES = ("new", "doing", "done", "failed")

KEY_RE = r"^[a-z][a-z0-9_]{1,31}$"
