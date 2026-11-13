# Graph Report - belting_erp  (2026-11-13)

## Corpus Check
- 287 files · ~98,556 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 26 file(s) not represented in the graph (top: (none) 14, .css 11, .example 1)

## Summary
- 1822 nodes · 4951 edges · 141 communities (54 shown, 87 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 218 edges (avg confidence: 0.93)
- Token cost: 102,113 input · 0 output

## Community Hubs (Navigation)
- ERP Sex Page & Env
- Admin Sheets & Profile
- Agent Editor & Access
- Report Graph View
- Core LLM & API Utils
- Conveyor Lenta Controller
- API Errors & Agent Models
- Conveyor Fullscreen & Math
- Telegram Bot Login
- Frontend Dependencies
- Webhook & Request Auth
- Lenta App Shell
- Agent Admin & Seeding
- Geo Share Map
- Lenta Order Form
- Lenta Draft & History
- Geo App State
- Geo Route & Telegram
- Admin Context
- Geo Filter Panel
- Jarvis Chat UI
- Home & Login
- Agents List & Staff
- Memory API
- Telegram InitData Auth
- Knowledge API Views
- Webhook Commands
- Report Templates
- Login & Session Views
- Knowledge Base UI
- Jarvis Pages
- Memory UI
- TS Config
- Knowledge Graph Builder
- Audit UI
- ERP Layouts
- Django Settings & ASGI
- Geo Widgets & Stats
- Jarvis API Tests
- Geo Checkin Queue
- Territory Panel
- Agent Schedule Timing
- Knowledge Models
- Backend Architecture Docs
- Icon System
- Telegram WebApp Type
- Celery Tasks
- Project Rules & Checks
- Frontend Architecture Docs
- Test Fixtures
- Admin API Interface
- Agent Runtime & Tasks
- Chat Auth & SSE
- Agent Tree & Scopes
- Graph Rebuild Pipeline
- Management Command
- Legacy Jarvis References
- Root Layout
- Lenta Layout
- Analytics App Config
- Frontend Layering Rules
- Analytics Page
- Audit App Config
- Bots App Config
- Conveyor App Config
- Core App Config
- ErpCatalog App Config
- ErpCrm App Config
- ErpFinance App Config
- ErpMarketplace App Config
- ErpPicking App Config
- ErpPurchasing App Config
- ErpSales App Config
- ErpWarehouse App Config
- ErpWorkshop App Config
- Geomap App Config
- Jarvis App Config
- Knowledge App Config
- Graph Community Detection
- Memory App Config
- Reports App Config
- Staff App Config
- System App Config
- API URL Mounting
- Agent Storage & Seed
- Tunnel Script
- Templates Page
- Graphify Usage Rules
- check.sh Script
- dev.sh Script
- release.sh Script
- shpjs.d.ts
- belting-backend

## God Nodes (most connected - your core abstractions)
1. `User` - 78 edges
2. `Lenta` - 78 edges
3. `api()` - 62 edges
4. `Icon()` - 52 edges
5. `Agent` - 47 edges
6. `react` - 44 edges
7. `GeoApp()` - 42 edges
8. `c()` - 41 edges
9. `useAdmin()` - 38 edges
10. `ok()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Storage tables: agents, agent_schedules, agent_tasks` --conceptually_related_to--> `Backend (Django + SQLite + Celery/Redis)`  [AMBIGUOUS]
  docs/api/agents.md → backend/README.md
- `graphify usage rules (root)` --semantically_similar_to--> `graphify usage rules (backend)`  [INFERRED] [semantically similar]
  CLAUDE.md → backend/CLAUDE.md
- `Litestar backend on :8770 (legacy reference)` --conceptually_related_to--> `Backend (Django + SQLite + Celery/Redis)`  [AMBIGUOUS]
  frontend/README.md → backend/README.md
- `Active roles (owner, admin, employee; panel: Rahbariyat, IT)` --semantically_similar_to--> `Agent management rights (owner, admin, IT, Rahbariyat)`  [INFERRED] [semantically similar]
  backend/README.md → docs/api/agents.md
- `Frontend check (tsc, eslint, test, build, import grep)` --semantically_similar_to--> `scripts/check.sh (ruff + ty + pytest-testmon)`  [INFERRED] [semantically similar]
  frontend/ARCHITECTURE.md → backend/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Jarvis agent runtime (LLM + memory + knowledge + schedules + tasks)** — backend_readme_jarvis_app, backend_readme_jarvis_llm, backend_readme_memory_app, backend_readme_knowledge_app, backend_readme_schedule_tick, backend_readme_run_task [EXTRACTED 1.00]
- **Frontend layering rules (thin app/, shared <- domains <- app)** — frontend_architecture_thin_route_wrapper, frontend_architecture_dependency_direction, frontend_architecture_naming_rules, frontend_architecture_shared [EXTRACTED 1.00]
- **Authorization model across login, roles, agent rights, chat** — backend_readme_login_flow, backend_readme_roles, docs_api_agents_management_rights, docs_api_agents_scopes, docs_api_chat_post_chat [INFERRED 0.85]

## Communities (141 total, 87 thin omitted)

### Community 0 - "ERP Sex Page & Env"
Cohesion: 0.06
Nodes (88): SexPage(), api(), beep(), confirm(), download(), etg(), hap, iconSvg() (+80 more)

### Community 1 - "Admin Sheets & Profile"
Cohesion: 0.07
Nodes (75): ApproveSheet(), Editor(), EditorSheet(), errMsg(), HeadFormSheet(), initPrefs(), PhoneLoad, PhoneSel (+67 more)

### Community 2 - "Agent Editor & Access"
Cohesion: 0.08
Nodes (66): AccessFields(), Props, AgentEditor(), save(), KIND_DESC, Part, PARTS, AgentForm (+58 more)

### Community 3 - "Report Graph View"
Cohesion: 0.06
Nodes (47): ReportPage(), Ctrl, Graph(), GraphProps, bigCommunities(), commColor(), confPct(), countText() (+39 more)

### Community 4 - "Core LLM & API Utils"
Cohesion: 0.06
Nodes (33): complete(), _complete(), complete_json(), parse_json(), ChatMessage, Meta, collect(), _collect() (+25 more)

### Community 5 - "Conveyor Lenta Controller"
Cohesion: 0.07
Nodes (6): EMPTY_LAST(), Lenta, draftValue(), kindSig(), recommendKey(), sheetWidth()

### Community 6 - "API Errors & Agent Models"
Cohesion: 0.10
Nodes (35): ApiError, json_body(), Agent, Kind, Meta, AgentTask, Meta, Status (+27 more)

### Community 7 - "Conveyor Fullscreen & Math"
Cohesion: 0.07
Nodes (39): FsBtn(), Fullscreen(), BASE, CAT, EN, fieldNum(), fmtN(), addCls() (+31 more)

### Community 8 - "Telegram Bot Login"
Cohesion: 0.07
Nodes (15): register(), start(), confirm_login(), test_bad_token(), test_confirm_known_user_then_poll(), test_unknown_user_becomes_pending(), Command, LoginToken (+7 more)

### Community 9 - "Frontend Dependencies"
Cohesion: 0.06
Nodes (42): eslintConfig, dependencies, h3-js@^4.5.0, next@16.4.5, react@19.3.0, react-dom@19.3.0, shpjs@^6.2.0, @tmcw/togeojson@^7.1.3 (+34 more)

### Community 10 - "Webhook & Request Auth"
Cohesion: 0.07
Nodes (12): resolve_user(), api(), deco(), view(), chat(), events(), _finish(), _prepare() (+4 more)

### Community 11 - "Lenta App Shell"
Cohesion: 0.11
Nodes (35): LentaPage(), LentaContext, isDesk(), MetaAnswer, ActBar(), ConveyorApp(), LoginMsg, LoginView() (+27 more)

### Community 12 - "Agent Admin & Seeding"
Cohesion: 0.08
Nodes (17): send_message(), AgentAdmin, AgentRunAdmin, AgentTaskAdmin, ScheduleInline, AgentRun, Meta, Source (+9 more)

### Community 14 - "Geo Share Map"
Cohesion: 0.08
Nodes (33): GeoSharePage(), maplibre-gl@^5.24.0, STATUS_COLOR, SEQ, ColorBy, Layers, Metric, Style (+25 more)

### Community 15 - "Lenta Order Form"
Cohesion: 0.18
Nodes (37): useLenta(), askTitle(), ChatLog(), CustCard(), Essentials(), fieldCls(), FieldMsg(), FNum() (+29 more)

### Community 16 - "Lenta Draft & History"
Cohesion: 0.10
Nodes (30): Mode, SheetItem, ToastKind, ViewMode, defaultMeta(), DRAFT, Draft, LANG_KEY (+22 more)

### Community 17 - "Geo App State"
Cohesion: 0.13
Nodes (33): GeoPage(), bbox(), DEFAULT_LAYERS, DEFAULT_STYLE, EMPTY, ENUM_FIELDS, GeoApp(), geomCoords() (+25 more)

### Community 18 - "Geo Route & Telegram"
Cohesion: 0.15
Nodes (30): api(), dateUz(), duration(), km(), num(), haptic(), inTelegram(), openExternal() (+22 more)

### Community 19 - "Admin Context"
Cohesion: 0.09
Nodes (28): ADMIN_ONLY_TABS, AdminContext, Area, AREAS, DeptChat, DeptStat, Me, MeUser (+20 more)

### Community 20 - "Geo Filter Panel"
Cohesion: 0.12
Nodes (28): CondEditor(), defaultOp(), EnumOptions, FilterPanel(), newCond(), PRESETS, RulesEditor(), daysAgo() (+20 more)

### Community 21 - "Jarvis Chat UI"
Cohesion: 0.17
Nodes (18): toolName(), Chat(), send(), applyEvent(), chatError(), ChatEvent, ChatMsg, defaultAgent() (+10 more)

### Community 22 - "Home & Login"
Cohesion: 0.10
Nodes (13): HomePage(), metadata, LoginView(), ART, allowed(), Card, CARDS, Launcher() (+5 more)

### Community 23 - "Agents List & Staff"
Cohesion: 0.18
Nodes (20): Agents(), AgentSheet(), canManage(), loadStaff(), staffName(), useStaff(), buildDeptTree(), childCount() (+12 more)

### Community 24 - "Memory API"
Cohesion: 0.13
Nodes (6): _can_view(), memory(), memory_act(), User, Meta, UserManager

### Community 25 - "Telegram InitData Auth"
Cohesion: 0.13
Nodes (10): telegram_webhook(), verify_init_data(), Command, _init_data(), test_blocked_user_denied(), test_login_start_poll(), test_magic_login(), test_me_initdata_and_session() (+2 more)

### Community 26 - "Knowledge API Views"
Cohesion: 0.26
Nodes (16): ok(), _can_manage(), _clean_doc(), _doc_row(), extract(), graph_chunk(), graph_data(), graph_explain() (+8 more)

### Community 27 - "Webhook Commands"
Cohesion: 0.15
Nodes (9): Command, Command, post(), sent(), test_plain_start_greets(), test_secret_required(), test_start_login_confirms(), update() (+1 more)

### Community 28 - "Report Templates"
Cohesion: 0.23
Nodes (17): deptOf(), editableDepts(), editorInit(), groupByDept(), pendingOf(), savePayload(), STATUS_NAMES, Template (+9 more)

### Community 29 - "Login & Session Views"
Cohesion: 0.17
Nodes (6): api_not_found(), login_magic(), login_poll(), login_start(), logout_view(), me()

### Community 30 - "Knowledge Base UI"
Cohesion: 0.25
Nodes (16): AddSheet(), cx(), deptColor(), deptName(), DocSheet(), Kb(), KbFull, buildKbTree() (+8 more)

### Community 31 - "Jarvis Pages"
Cohesion: 0.14
Nodes (14): DevPage(), metadata, JarvisPage(), metadata, metadata, StaffPage(), fromDept(), isFullscreen() (+6 more)

### Community 32 - "Memory UI"
Cohesion: 0.20
Nodes (14): KbSeg(), Act, deptNameOf(), groupMemory(), MemGroup, MemGroupKind, MemoryItem, MemScope (+6 more)

### Community 33 - "TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 34 - "Knowledge Graph Builder"
Cohesion: 0.23
Nodes (11): chunk(), _gnode(), _links(), _norm(), _report(), _save_scope(), search(), summary() (+3 more)

### Community 35 - "Audit UI"
Cohesion: 0.27
Nodes (15): Audit(), cx(), EventRow(), hint, AUDIT_ICONS, auditIcon(), AuditRow, auditToolInfo() (+7 more)

### Community 36 - "ERP Layouts"
Cohesion: 0.12
Nodes (6): metadata, metadata, metadata, metadata, nextConfig, next

### Community 38 - "Geo Widgets & Stats"
Cohesion: 0.22
Nodes (12): money(), QUALITY_COLOR, QUALITY_LABEL, STATUS_LABEL, Summary, RecDetail, Bars(), Spin() (+4 more)

### Community 39 - "Jarvis API Tests"
Cohesion: 0.27
Nodes (11): patch(), post(), test_create_agent_and_subagent(), test_create_validation(), test_dept_parent_must_be_dept_and_no_cycle(), test_patch_and_delete_reparents(), test_permissions(), test_schedule_crud() (+3 more)

### Community 40 - "Geo Checkin Queue"
Cohesion: 0.25
Nodes (11): addCheckin(), ApiError, BASE, flushCheckins(), loginPoll(), loginStart(), pendingCheckins(), QueuedCheckin (+3 more)

### Community 41 - "Territory Panel"
Cohesion: 0.19
Nodes (10): Meta, Owner, Territory, AutoT, ColorInput(), fileToGeoJSON(), Nearby, Props (+2 more)

### Community 42 - "Agent Schedule Timing"
Cohesion: 0.29
Nodes (4): next_run(), nr(), test_daily(), test_weekly_monthly_once_disabled()

### Community 43 - "Knowledge Models"
Cohesion: 0.22
Nodes (4): explain(), ExtractState, GraphMeta, GraphSource

### Community 44 - "Backend Architecture Docs"
Cohesion: 0.27
Nodes (10): Backend (Django + SQLite + Celery/Redis), bots app (pyTelegramBotAPI webhook, login confirmation), core app (Telegram initData auth, sessions, JSON API helpers), scripts/dev.sh (uvicorn + celery worker + beat), JARVIS_LLM (Claude Agent SDK / echo for tests), knowledge app (docs, PDF, chat extraction, LLM graph), Login flow (X-Init-Data HMAC / browser login start-poll via bot), memory app (memory facts, approval, injected into agent prompt) (+2 more)

### Community 45 - "Icon System"
Cohesion: 0.31
Nodes (5): ICONS, ICONS, IconEl, IconSet, SvgIcon()

### Community 48 - "Project Rules & Checks"
Cohesion: 0.25
Nodes (7): scripts/check.sh (ruff + ty + pytest-testmon), DOMAIN_APPS registration and auto /app/api/ URL mounting, belting-design skill (project design system), Belting ERP (project), Next.js agent rules (read node_modules/next/dist/docs), Frontend check (tsc, eslint, test, build, import grep), Next 16 static export (basePath /app, trailingSlash)

### Community 49 - "Frontend Architecture Docs"
Cohesion: 0.25
Nodes (7): Skeleton apps (reports, audit, system, erp/*, conveyor, geomap, analytics), src/erp (kit, workshop migrated; others pending), Frontend architecture, Legacy static erp_*.html pages in jarvis backend, Frontend (Next.js static export) README, JARVIS_UI_NEXT page switch flag, frontend/scripts/release.sh (atomic symlink release)

### Community 50 - "Test Fixtures"
Cohesion: 0.43
Nodes (5): admin_client(), depts(), _env(), make_user(), _user()

### Community 52 - "Agent Runtime & Tasks"
Cohesion: 0.38
Nodes (6): jarvis app (agents tree, permissions, schedules, tasks, SSE chat), run_task Celery task (doing -> done/failed), Beat tick -> run_schedule (per-minute), AgentTask, Agents endpoints (/app/api/overview, /app/api/agents CRUD, schedules, tasks), Schedule

### Community 53 - "Chat Auth & SSE"
Cohesion: 0.29
Nodes (7): Active roles (owner, admin, employee; panel: Rahbariyat, IT), runtime.TOOL_REGISTRY (empty; CRM/1C/ERP tools not connected), Agent management rights (owner, admin, IT, Rahbariyat), Client abort via AbortController (backend cancels inflight), POST /app/api/chat (SSE stream), SSE event types (text, tool, done, error), Web session key (web:<tg_id>, agent)

### Community 54 - "Agent Tree & Scopes"
Cohesion: 0.38
Nodes (6): AgentInput, Agent channels (telegram/instagram/web; auto|approve mode), API: Jarvis agents, Single agent tree (dept | staff | free kinds), src/ai (Jarvis: agents, chat, org, shell, memory, kb ...), src/ai/org single tree (dept-tree, OrgChart)

### Community 55 - "Graph Rebuild Pipeline"
Cohesion: 0.33
Nodes (3): _extract(), rebuild(), _sources()

### Community 57 - "Legacy Jarvis References"
Cohesion: 0.40
Nodes (5): Jarvis original project (read-only source), Brain (office/bots/brain.py, Telegram-only agent), GET /app/api/chat/history (optional, later), API: Jarvis chat (web), Litestar backend on :8770 (legacy reference)

### Community 62 - "Analytics Page"
Cohesion: 0.67
Nodes (3): AnalyticsPage(), metadata, AnalyticsApp()

### Community 85 - "Agent Storage & Seed"
Cohesion: 0.67
Nodes (3): seed_agents management command (from departments.yaml), departments.yaml (initial dept agent seed), Storage tables: agents, agent_schedules, agent_tasks

## Ambiguous Edges - Review These
- `Backend (Django + SQLite + Celery/Redis)` → `Storage tables: agents, agent_schedules, agent_tasks`  [AMBIGUOUS]
  docs/api/agents.md · relation: conceptually_related_to
- `Backend (Django + SQLite + Celery/Redis)` → `Litestar backend on :8770 (legacy reference)`  [AMBIGUOUS]
  frontend/README.md · relation: conceptually_related_to

## Knowledge Gaps
- **13 isolated node(s):** `belting-backend`, `belting-design skill (project design system)`, `graphify usage rules (root)`, `graphify usage rules (backend)`, `staff app (user model: tg_id, role, departments)` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 560 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **87 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Geo Widgets & Stats` to `ERP Sex Page & Env`, `Admin Sheets & Profile`, `Agent Editor & Access`, `Report Graph View`, `Conveyor Fullscreen & Math`, `Frontend Dependencies`, `Lenta App Shell`, `Geo Share Map`, `Lenta Order Form`, `Lenta Draft & History`, `Geo App State`, `Geo Route & Telegram`, `Admin Context`, `Jarvis Chat UI`, `Home & Login`, `Agents List & Staff`, `Report Templates`, `Knowledge Base UI`, `Memory UI`, `Audit UI`, `Geo Checkin Queue`, `Territory Panel`, `Icon System`?**
  _High betweenness centrality (0.118) - this node is a cross-community bridge._
- **Are the 46 inferred relationships involving `User` (e.g. with `confirm_login()` and `test_confirm_known_user_then_poll()`) actually correct?**
  _`User` has 46 INFERRED edges - model-reasoned connections that need verification._
- **What connects `belting-backend`, `belting-design skill (project design system)`, `graphify usage rules (root)` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ERP Sex Page & Env` be split into smaller, more focused modules?**
  _Cohesion score 0.06293859649122807 - nodes in this community are weakly interconnected._
- **Why does `api()` connect `Agent Editor & Access` to `Memory UI`, `Admin Sheets & Profile`, `ERP Sex Page & Env`, `Report Graph View`, `Audit UI`, `Conveyor Lenta Controller`, `Lenta App Shell`, `Lenta Draft & History`, `Admin Context`, `Jarvis Chat UI`, `Home & Login`, `Agents List & Staff`, `Report Templates`, `Knowledge Base UI`, `Jarvis Pages`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Backend (Django + SQLite + Celery/Redis)` and `Storage tables: agents, agent_schedules, agent_tasks`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Backend (Django + SQLite + Celery/Redis)` and `Litestar backend on :8770 (legacy reference)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._