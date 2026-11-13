# API: Jarvis chat (veb)

Frontend tayyor: `frontend/src/ai/chat/` (Chat.tsx, stream.ts, chat.lib.ts). Backend 2-bosqichda. Hozir agent ("miya",
`office/bots/brain.py` — `Brain`, sessiya har (chat, bo'lim)) faqat Telegram orqali ishlaydi.

## POST `/app/api/chat`

Ruxsat: panel foydalanuvchisi (owner/admin, `can_view`) — `agent` ga yozish huquqi tekshiriladi
(agentning «Kim foydalanadi» ro'yxati; owner/admin, IT, Rahbariyat — hammasi). Kirish: `X-Init-Data` (Telegram) yoki cookie.

So'rov:
```json
{ "agent": "rahbariyat", "message": "Bugungi savdo qanday?", "session_id": "…" }
```
`session_id` yo'q — yangi suhbat. Veb sessiyasi Telegram chatidan alohida: kalit `(web:<tg_id>, agent)`.

Javob: `Content-Type: text/event-stream`, har hodisa — `data: <json>\n\n`:

| type | maydonlar | ma'no |
|---|---|---|
| `text` | `delta` | javob matnining navbatdagi bo'lagi (`TextBlock`) |
| `tool` | `name` | agent vosita ishlatdi (`ToolUseBlock` → vosita guruhi kaliti: crm, onec, erp …) |
| `done` | `session_id` | tugadi; keyingi xabarda shu `session_id` yuboriladi |
| `error` | `detail` | xato (limit, ruxsat …) — foydalanuvchiga ko'rsatiladi |

Zaxira: oqimsiz `application/json` `{ "reply": "…", "session_id": "…" }` ham qabul qilinadi.
Xatolar (oqim boshlanishidan oldin): 403 ruxsat yo'q, 404 agent yo'q — `{ "detail": "matn" }`.

To'xtatish: mijoz ulanishni uzadi (AbortController) — backend so'rovni bekor qilsin (inflight).

## Keyin (ixtiyoriy)

`GET /app/api/chat/history?dept=` — oxirgi veb suhbat (sahifa yangilansa tiklash uchun).
