// Lenta chizmasi — sahifa holati va amallari (eski lenta.html global o'zgaruvchilari va funksiyalari: S, past/future, LAST, PRICE,
// CUR, ZOOM, AUTO_SIG, META, set/changed/undo/redo, scheduleRender/doRender, doParse, doSend, doSave, openProject, doNew, boot …).
// Mantiq va vaqt (debounce 380 ms, tarix 450 ms, rSeq) eskidagidek imperativ — React faqat `emit()` dan keyin qayta chizadi.
// Sof funksiyalar — lib/lenta/*.
import type { ReactNode } from "react";

import { api, ApiError } from "@/shared/api/client";
import { DRAFT, draftValue, LANG_KEY, loadLang, loadMeta, LS, META_KEY, OPEN_KEY, restore, type Draft } from "@/conveyor/lib/draft";
import { fieldPatch, History, kindSig, normBent, recommendKey, SHEET_RATIO, sheetWidth, sized, tr, xPatch, type Val } from "@/conveyor/lib/logic";
import type {
  Catalog,
  CatalogResp,
  Enums,
  Lang,
  LentaState,
  MeResp,
  Meta,
  ParseResp,
  PriceResp,
  ProjectResp,
  RenderResp,
} from "@/conveyor/lib/types";
import { backOff, backShow, confirmDo, haptic, initData } from "@/shared/telegram/telegram";

export type Mode = { kind: "loading" } | { kind: "app" } | { kind: "err"; msg: string } | { kind: "login"; msg: string };
/** #vscroll ichida nima: none — bo'sh (buildApp), empty — namunalar, skel — skelet, sheet — drawSheet() */
export type ViewMode = "none" | "empty" | "skel" | "sheet";
export type ToastKind = "ok" | "err";
export interface SheetItem {
  id: number;
  render: () => ReactNode;
  closing: boolean;
  /** oyna yopilganda (fon, "Orqaga", Esc yoki dasturiy) — bir marta */
  onClose?: () => void;
}
/** askMeta natijasi: Meta — to'ldirildi; null — "Keyinroq" (ma'lumotsiz davom); "cancel" — oyna yopildi, amal bekor */
export type MetaAnswer = Meta | null | "cancel";

const CHAT_KEY = "lenta.chat";
const EMPTY_LAST = (): RenderResp => ({ issues: [], blocked: false, sheets: [], hints: {} });

export const isDesk = (): boolean => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

export class Lenta {
  LANG: Lang = "uz";
  CAT: Catalog | null = null;
  EN: Enums | null = null;
  INIT: LentaState | null = null;
  ME: MeResp["user"] | null = null;
  S: LentaState | null = null;
  hist = new History();
  projectId: number | string | null = null;
  LAST: RenderResp = EMPTY_LAST();
  PRICE: PriceResp | null = null;
  CUR: string | null = null;
  ZOOM = 1;
  AUTO_SIG = "";
  META: Meta = { customer: "", application: "", contact: "" };
  OPEN: Record<string, boolean> = {};
  QUESTIONS: string[] = [];
  NOTES: string[] = [];

  mode: Mode = { kind: "loading" };
  who = "…";
  showBack = false;
  busy = false; // #viewer.loading — holat o'zgargan zahoti (debounce paytida ham): ekrandagi varaq hali eski
  /** oxirgi chizish so'rovi muvaffaqiyatsiz: ekrandagi varaq joriy holatga mos emas ("Qayta urinish" ko'rsatiladi) */
  renderFail = false;
  view: ViewMode = "none";
  /** eski drawTabs() / drawIssues() buildApp'dan keyin chaqirilganmi (undan oldin .vhead ko'rinadi, tablar bo'sh) */
  tabsDrawn = false;
  issuesDrawn = false;
  /** doSend: tugma o'chirilgan (eski b.disabled = true; keyingi updActions() qayta hisoblaydi) */
  sendLock = false;
  /** PDF yuborish jarayonda (faqat doSend boshqaradi) */
  sending = false;
  parsing = false;
  saving = false;
  popOpen = false;
  fsIndex: number | null = null;
  /** to'liq ekran ochilgan paytdagi listlar (eski openViewer: `const sheets = LAST.sheets`) */
  fsSheets: RenderResp["sheets"] = [];
  fsKey = 0;
  sheets: SheetItem[] = [];
  toastSt: { msg: string; kind: ToastKind; shown: boolean } | null = null;
  /** buildApp paytida zakaz matni (qoralamadan) — textarea hali ulanmagan bo'lsa saveDraft shu qiymatni yozadi */
  draftText = "";
  buildSeq = 0;
  /** chat uslubi: shu chizma uchun yuborilgan zakaz matnlari (eng eskisi birinchi) — "lenta.chat" */
  CHAT: string[] = [];

  els: {
    orderText?: HTMLTextAreaElement | null;
    vscroll?: HTMLDivElement | null;
    vpaper?: HTMLDivElement | null;
    viewer?: HTMLDivElement | null;
    params?: HTMLDetailsElement | null;
    center?: HTMLElement | null;
    mq?: HTMLDivElement | null;
  } = {};

  private refCbs: Partial<Record<keyof Lenta["els"], (el: never) => void>> = {};
  /** barqaror ref callback: <div ref={L.refFor("viewer")}> → L.els.viewer */
  refFor<K extends keyof Lenta["els"]>(k: K): (el: Lenta["els"][K]) => void {
    return (this.refCbs[k] ||= ((el: Lenta["els"][K]) => {
      this.els[k] = el;
    }) as (el: never) => void) as (el: Lenta["els"][K]) => void;
  }
  attachOrderText(ta: HTMLTextAreaElement) {
    this.els.orderText = ta;
  }
  detachOrderText(ta: HTMLTextAreaElement) {
    if (this.els.orderText !== ta) return;
    this.draftText = ta.value;
    this.els.orderText = null;
  }
  /** "Tushunilgan parametrlar" (refFor("params") ulangach): kompyuterda doim ochiq; mobil — ochildi/yopildi eski
   *  OPEN.params ga yoziladi (faqat yoziladi). Qaytaradi — uzish. */
  bindParams(): () => void {
    const d = this.els.params;
    if (!d) return () => {};
    if (isDesk()) d.open = true;
    const onToggle = () => {
      if (isDesk()) return;
      this.OPEN.params = d.open;
      this.saveOpen();
    };
    d.addEventListener("toggle", onToggle);
    return () => d.removeEventListener("toggle", onToggle);
  }
  /** #mqBtn: parametrlar ochiladi va ko'rinadigan joyga */
  openParams() {
    const p = this.els.params;
    if (!p) return;
    p.open = true;
    setTimeout(() => p.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  /** kompyuterda varaq bosilsa: 1× ↔ 2× */
  toggleDeskZoom() {
    this.ZOOM = this.ZOOM > 1 ? 1 : 2;
    this.layoutSheet();
  }
  setAskMeta(fn: () => Promise<MetaAnswer>) {
    this.askMeta = fn;
  }

  private rTimer = 0;
  private rSeq = 0;
  private toastTimer = 0;
  private sheetSeq = 0;
  private liveSheets: number[] = [];
  version = 0;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  emit = () => {
    this.version++;
    this.listeners.forEach((f) => f());
  };

  t = (uz: string, ru: string) => tr(this.LANG)(uz, ru);

  /** brauzerda, birinchi chizishdan keyin (prerender'da localStorage yo'q) */
  init() {
    this.LANG = loadLang();
    this.META = loadMeta();
    this.OPEN = LS.get<Record<string, boolean>>(OPEN_KEY) || {};
    this.emit();
  }

  // ---------------- holat ----------------
  orderTextValue(): string {
    return this.els.orderText ? this.els.orderText.value : this.draftText;
  }
  /** bo'sh holatdagi namuna: zakaz matniga yozib, darhol tahlil qilinadi */
  pickExample(text: string) {
    const ta = this.els.orderText;
    if (!ta || this.parsing) return;
    ta.value = text;
    this.saveDraft();
    this.fitOrder();
    void this.doParse();
  }
  saveDraft() {
    LS.set(DRAFT, draftValue(this.S, this.projectId, this.orderTextValue() || ""));
  }
  pushHist() {
    if (this.S) this.hist.push(this.S, Date.now());
  }
  /** butun holat almashadi (loyiha ochish, yangi chizma): oldingisi tarixga, keyingi o'zgarish alohida qadam */
  private resetHist() {
    this.pushHist();
    this.hist.lastPush = 0;
  }
  private applyHist(r: LentaState | null) {
    if (!r) return;
    this.S = r;
    this.changed();
  }
  set = (patch: Partial<LentaState>, hist = true) => {
    if (hist) this.pushHist();
    this.S = { ...(this.S as LentaState), ...patch };
    this.changed();
  };
  changed() {
    this.S = normBent(this.S as LentaState);
    this.saveDraft();
    this.scheduleRender();
    this.emit(); // syncForm()
  }
  undo = () => this.applyHist(this.S && this.hist.undo(this.S));
  redo = () => this.applyHist(this.S && this.hist.redo(this.S));
  onField = (k: string, v: Val) => this.set(fieldPatch(k, v, this.S as LentaState, this.EN as Enums, this.CAT as Catalog));
  onX = (x: string, v: number) => {
    const p = xPatch(x, v, this.S as LentaState, this.EN as Enums);
    if (p) this.set(p);
  };
  private saveMeta(m: Meta) {
    this.META = m;
    LS.set(META_KEY, m);
  }
  setMetaApplication(v: string) {
    this.saveMeta({ ...this.META, application: v });
  }
  saveOpen() {
    LS.set(OPEN_KEY, this.OPEN);
  }

  // ---------------- toast / sheet ----------------
  toast = (m: string, kind: ToastKind = "ok") => {
    this.toastSt = { msg: m, kind, shown: true };
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      if (this.toastSt) this.toastSt = { ...this.toastSt, shown: false };
      this.emit();
    }, 3200);
    haptic(kind === "err" ? "error" : "success");
    this.emit();
  };
  /** server xabari — o'zicha; tarmoq uzilishi (fetch TypeError: "Failed to fetch" / "Load failed") — tushunarli matn bilan */
  errText = (e: unknown): string =>
    e instanceof ApiError ? e.message : e instanceof TypeError ? this.t("Aloqa yo'q — internetni tekshiring", "Нет связи — проверьте интернет") : (e as Error).message;
  toastErr = (e: unknown) => this.toast(this.errText(e), "err");
  closeSheet = () => {
    const ids = this.liveSheets;
    this.liveSheets = [];
    if (ids.length) {
      const closed = this.sheets.filter((x) => ids.includes(x.id));
      this.sheets = this.sheets.map((x) => (ids.includes(x.id) ? { ...x, closing: true } : x));
      closed.forEach((x) => x.onClose?.());
      setTimeout(() => {
        this.sheets = this.sheets.filter((x) => !ids.includes(x.id));
        this.emit();
      }, 250);
      this.emit();
    }
    backOff(this.closeSheet, this.fsIndex === null); // to'liq ekran ochiq bo'lsa — "Orqaga" unga qoladi
  };
  /** oyna yopilib (animatsiya 250 ms) bo'lgach — keyingi amal (boshqa oyna, tasdiq) */
  closeThen = (fn: () => unknown) => {
    this.closeSheet();
    setTimeout(() => void fn(), 260);
  };
  openSheet = (render: () => ReactNode, onClose?: () => void) => {
    const id = ++this.sheetSeq;
    this.liveSheets = [...this.liveSheets, id];
    this.sheets = [...this.sheets, { id, render, closing: false, onClose }];
    backShow(this.closeSheet);
    this.emit();
  };

  // ---------------- chizma va narx ----------------
  /** Chaqiruvchi keyin emit() qiladi. Debounce (380 ms) boshlanishidanoq busy: ekrandagi varaq va narx endi eski —
   *  ko'ruvchi "yangilanmoqda" holatida, yuborish tugmasi yangi chizma kelguncha o'chiq. */
  scheduleRender = () => {
    clearTimeout(this.rTimer);
    // holat o'zgardi: uchib ketgan eski so'rov javobi (380 ms oynada qaytsa) yangi holat ustiga yozilmasin
    this.rSeq++;
    this.renderFail = false;
    this.busy = sized(this.S);
    // o'lcham yo'q (yangi chizma, maydon tozalandi) — so'rov ketmaydi, kutishning hojati yo'q
    this.rTimer = window.setTimeout(() => void this.doRender(), this.busy ? 380 : 0);
  };
  /** aloqa xatosidan keyin: kutmasdan qayta chizish */
  retryRender = () => {
    clearTimeout(this.rTimer);
    void this.doRender();
  };
  async doRender() {
    const seq = ++this.rSeq;
    this.renderFail = false;
    if (!this.els.viewer) {
      this.busy = false;
      this.emit();
      return;
    }
    const S = this.S as LentaState;
    if (!sized(S)) {
      this.busy = false; // oldingi so'rov javobi endi e'tiborsiz — "yuklanmoqda" qatlami qotib qolmasin
      this.LAST = { ...EMPTY_LAST(), blocked: true };
      this.PRICE = null;
      this.popOpen = false; // drawBar(): !PRICE → closePop()
      this.markDrawn("empty");
      this.sendLock = false;
      this.emit();
      return;
    }
    this.busy = true;
    if (!(this.LAST.sheets || []).length) this.view = "skel";
    this.sendLock = false;
    this.emit();
    try {
      const body = { state: S, lang: this.LANG };
      const [r, p] = await Promise.all([
        api<RenderResp>("/app/api/lenta/render", { body }),
        api<PriceResp>("/app/api/lenta/price", { body }),
      ]);
      if (seq !== this.rSeq) return;
      this.LAST = r;
      this.PRICE = p.blocked || !p.totals ? null : p;
      if (!this.PRICE) this.popOpen = false;
      const keys = r.sheets.map((s) => s.key);
      const cur = this.S as LentaState;
      if (!keys.includes(this.CUR as string) || kindSig(cur) !== this.AUTO_SIG) {
        this.CUR = r.sheets.length ? recommendKey(r.sheets, cur) : null;
        this.AUTO_SIG = kindSig(cur);
        this.ZOOM = 1;
      }
      this.markDrawn("sheet");
      this.emit();
    } catch (e) {
      if (seq === this.rSeq) {
        this.renderFail = true;
        if (this.view === "skel") this.view = "none"; // skelet abadiy miltillamasin — xato qatori va "Qayta urinish" ko'rinadi
        this.toastErr(e);
      }
    } finally {
      if (seq === this.rSeq) {
        this.busy = false;
        this.sendLock = false;
        this.emit();
      }
    }
  }
  /** eski drawSheet/drawTabs/drawIssues chizildi */
  private markDrawn(view: ViewMode) {
    this.view = view;
    this.tabsDrawn = true;
    this.issuesDrawn = true;
  }
  curIndex = () => (this.LAST.sheets || []).findIndex((s) => s.key === this.CUR);
  selectTab = (key: string) => {
    this.CUR = key;
    this.ZOOM = 1;
    this.emit();
  };
  step = (d: number) => {
    const sh = this.LAST.sheets || [],
      i = this.curIndex();
    if (i < 0) return;
    const j = Math.max(0, Math.min(sh.length - 1, i + d));
    if (j !== i) this.selectTab(sh[j].key);
  };
  /** varaqni ko'ruvchiga sig'diradi (ZOOM=1) yoki kattalashtiradi */
  layoutSheet = () => {
    const p = this.els.vpaper,
      box = this.els.vscroll;
    if (!p || !box) return;
    const desk = isDesk();
    // butun pikselga pastga yaxlitlanadi: kasr ortig'i qutidan chiqib, aylantirish chizig'ini paydo qilmasin
    const w = Math.floor(sheetWidth(box.clientWidth, box.clientHeight, desk, this.ZOOM));
    p.style.width = w + "px";
    p.style.height = Math.floor(w / SHEET_RATIO) + "px";
    p.style.cursor = !desk ? "pointer" : this.ZOOM > 1 ? "zoom-out" : "zoom-in";
    box.style.placeItems = this.ZOOM > 1 ? "start" : "center";
  };
  zoomBy = (f: number) => {
    const box = this.els.vscroll;
    if (!box) return;
    const cx = (box.scrollLeft + box.clientWidth / 2) / Math.max(1, box.scrollWidth),
      cy = (box.scrollTop + box.clientHeight / 2) / Math.max(1, box.scrollHeight);
    this.ZOOM = Math.max(1, Math.min(5, this.ZOOM * f));
    this.layoutSheet();
    box.scrollLeft = cx * box.scrollWidth - box.clientWidth / 2;
    box.scrollTop = cy * box.scrollHeight - box.clientHeight / 2;
  };
  zoomFit = () => {
    this.ZOOM = 1;
    this.layoutSheet();
  };
  openViewer = (i: number) => {
    if (!(this.LAST.sheets || []).length) return;
    this.fsIndex = i;
    this.fsSheets = this.LAST.sheets;
    this.fsKey++;
    this.emit();
  };
  closeViewer = () => {
    this.fsIndex = null;
    this.emit();
  };
  togglePrice = () => {
    if (this.popOpen) return this.closePop();
    if (!this.PRICE) return;
    this.popOpen = true;
    this.emit();
  };
  closePop = () => {
    this.popOpen = false;
    this.emit();
  };

  // ---------------- zakaz matni ----------------
  private setChat(list: string[]) {
    this.CHAT = list.slice(-20);
    LS.set(CHAT_KEY, this.CHAT);
  }
  drawParseMsgs(notes: string[], unknown: string[]) {
    this.QUESTIONS = unknown;
    this.NOTES = notes;
    this.emit();
  }
  doParse = async () => {
    const ta = this.els.orderText;
    if (!ta || this.parsing) return; // Enter / namuna ikki marta bosilsa — bitta so'rov
    const t = this.t;
    const text = ta.value.trim();
    if (!text) {
      ta.focus();
      return this.toast(t("Zakaz matnini yozing", "Введите текст заказа"), "err");
    }
    this.parsing = true;
    this.emit();
    try {
      const S = this.S as LentaState;
      const hasState = S.width > 0 || S.length > 0 || this.projectId;
      const r = await api<ParseResp>("/app/api/lenta/parse", { body: { text, state: hasState ? S : null, lang: this.LANG } });
      this.AUTO_SIG = ""; // yangi zakaz — eng foydali list qayta tanlansin
      this.set({ ...r.state });
      this.drawParseMsgs(r.notes || [], r.unknown || []);
      // chat: yuborilgan matn — xabar pufagi; maydon tozalanadi (keyingi xabar joriy chizmani to'ldiradi)
      this.setChat([...this.CHAT, text]);
      // tahlil davomida (bir necha soniya) yozilgan yangi matn o'chib ketmasin — faqat yuborilgan matn tozalanadi
      if (this.els.orderText === ta && ta.value.trim() === text) ta.value = "";
      this.saveDraft();
      this.fitOrder();
      this.toast(r.unknown?.length ? t("Chizildi — savollarga javob bering", "Готово — ответьте на вопросы") : t("Chizildi", "Готово"));
      // mobil: chizma — ekranning asosiy qismi; savollar bo'lsa, ularning tasmasi chizma ustida ko'rinadi
      if (!isDesk()) {
        this.els.orderText?.blur();
        setTimeout(() => (this.QUESTIONS.length ? this.els.mq : this.els.center)?.scrollIntoView({ behavior: "smooth", block: "start" }), 450);
      }
    } catch (e) {
      this.toastErr(e);
    } finally {
      this.parsing = false;
      this.emit();
    }
  };

  // ---------------- "Kimga tegishli? Nimaga ishlatiladi?" ----------------
  metaReady() {
    const S = this.S as LentaState;
    return !!(String(S.projectName || "").trim() && String(this.META.application || "").trim());
  }
  /** askMeta — oynani ConveyorApp ochadi (MetaAsk); null — "Keyinroq"; "cancel" — oyna yopildi */
  askMeta: () => Promise<MetaAnswer> = () => Promise.resolve(null);
  /** null — foydalanuvchi oynani yopdi: amal (yuborish / saqlash) bekor qilinadi */
  async withMeta(): Promise<Meta | null> {
    // har safar tekshiriladi; "Keyinroq" -> bu safar so'ralmaydi, keyingi safar yana so'raladi
    const S = this.S as LentaState;
    if (this.metaReady()) return { customer: S.projectName, application: this.META.application, contact: this.META.contact || "" };
    const v = await this.askMeta();
    if (v === "cancel") return null;
    if (!v) return { customer: "", application: "", contact: "" };
    this.saveMeta(v);
    if (v.customer && v.customer !== (this.S as LentaState).projectName) {
      this.S = { ...(this.S as LentaState), projectName: v.customer };
      this.saveDraft();
      this.emit();
    }
    return v;
  }
  doSend = async () => {
    const t = this.t;
    if (this.sending) return; // render sendLock'ni bo'shatadi — yuborish davomida ikkinchi bosish PDF'ni qayta jo'natmasin
    this.sending = true;
    this.sendLock = true;
    this.emit();
    try {
      const meta = await this.withMeta();
      if (!meta) return;
      const r = await api<{ file_name: string }>("/app/api/lenta/send", {
        body: { state: this.S, lang: this.LANG, ...meta, project_id: this.projectId },
      });
      this.toast(t("PDF Telegramga yuborildi: ", "PDF отправлен в Telegram: ") + r.file_name);
    } catch (e) {
      const d = (e as ApiError).detail as { issues?: { level: string; message: string }[] } | undefined;
      const iss = d?.issues;
      this.toast(iss?.find((i) => i.level === "error")?.message || this.errText(e), "err");
    } finally {
      this.sending = false;
      this.sendLock = false;
      this.emit();
    }
  };
  doSave = async (): Promise<void> => {
    const t = this.t;
    // ikki marta bosish (menyu + Ctrl+S): yangi loyihada ikkita so'rov ikkita nusxa yaratardi
    if (this.saving) return;
    if (!sized(this.S)) return this.toast(t("Avval lenta turi va o'lchamlarini kiriting", "Сначала укажите тип ленты и размеры"), "err");
    this.saving = true;
    try {
      const meta = await this.withMeta();
      if (!meta) return;
      const save = () => {
        const S = this.S as LentaState;
        return api<{ id: number | string }>("/app/api/lenta/projects", {
          body: { state: S, name: S.projectName || "", id: this.projectId, ...meta },
        });
      };
      let r: { id: number | string };
      try {
        r = await save();
      } catch (e) {
        if ((e as ApiError).status !== 404 || !this.projectId) throw e;
        this.projectId = null; // loyiha o'chirilgan — yangisi sifatida saqlanadi
        r = await save();
      }
      this.projectId = r.id;
      this.saveDraft();
      this.setUrl();
      this.toast(t("Loyiha saqlandi", "Проект сохранён"));
    } catch (e) {
      this.toastErr(e);
    } finally {
      this.saving = false;
    }
  };
  setUrl() {
    const u = new URL(location.href);
    if (this.projectId) u.searchParams.set("p", String(this.projectId));
    else u.searchParams.delete("p");
    history.replaceState(null, "", u);
  }
  openProject = async (id: string | number) => {
    const t = this.t;
    const p = await api<ProjectResp>(`/app/api/lenta/projects/${id}`);
    this.resetHist();
    this.setChat([]);
    this.S = { ...(this.INIT as LentaState), ...p.state };
    this.projectId = p.own ? p.id : null;
    this.setUrl();
    this.changed();
    if (p.application || p.customer) {
      this.saveMeta({ customer: p.customer || this.S.projectName || "", application: p.application || "", contact: p.contact || "" });
      this.emit();
    }
    this.toast((p.own ? "" : t("Faqat ko'rish (nusxa): ", "Копия: ")) + (p.name || ""));
  };
  /** O'chirish: true — o'chirildi (qator ro'yxatdan olinadi) */
  deleteProject = async (id: string): Promise<boolean> => {
    const t = this.t;
    if (!(await confirmDo(t("Loyihani o'chirasizmi?", "Удалить проект?")))) return false;
    try {
      await api(`/app/api/lenta/projects/${id}`, { method: "DELETE" });
      if (String(this.projectId) === id) {
        this.projectId = null;
        this.setUrl();
        this.saveDraft();
      }
      this.toast(t("O'chirildi", "Удалено"));
      return true;
    } catch (err) {
      this.toastErr(err);
      return false;
    }
  };
  doNew = async () => {
    const t = this.t;
    if (!(await confirmDo(t("Yangi chizma boshlansinmi? Saqlanmagan o'zgarishlar yo'qoladi.", "Начать новый чертёж? Несохранённые изменения пропадут.")))) return;
    this.resetHist();
    this.S = JSON.parse(JSON.stringify(this.INIT)) as LentaState;
    this.projectId = null;
    this.setUrl();
    if (this.els.orderText) this.els.orderText.value = "";
    this.draftText = "";
    this.setChat([]);
    this.drawParseMsgs([], []);
    this.fitOrder();
    this.changed();
  };
  fitOrder = () => {
    const ta = this.els.orderText;
    if (!ta) return;
    const max = window.innerHeight * 0.3;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight + 2, max) + "px";
    ta.style.overflowY = ta.scrollHeight + 2 > max ? "auto" : "hidden";
  };

  // ---------------- til, kirish, boot ----------------
  /** eski buildApp(): #side/#center qaytadan (forma, bo'sh ko'ruvchi, bo'sh tablar va izohlar) */
  private rebuild() {
    if (this.els.orderText) this.draftText = this.els.orderText.value;
    this.view = "none";
    this.tabsDrawn = false;
    this.issuesDrawn = false;
    this.NOTES = [];
    this.buildSeq++;
  }
  setLang = (l: Lang) => {
    this.LANG = l;
    LS.set(LANG_KEY, this.LANG);
    if (this.S) {
      this.rebuild(); // eski buildApp(): forma qayta quriladi
      this.scheduleRender();
    }
    this.emit();
  };
  logout = async () => {
    await api("/app/api/logout", { method: "POST" }).catch(() => {});
    this.mode = { kind: "login", msg: this.t("Chiqdingiz.", "Вы вышли.") };
    this.emit();
  };
  boot = async () => {
    const t = this.t;
    try {
      const me = await api<MeResp>("/app/api/me");
      this.ME = me.user;
      this.who = `${me.company} · ${me.user.name}`;
      if (me.can_view || me.can_admin) this.showBack = true;
      if (!me.can_lenta && !me.can_admin) {
        this.mode = { kind: "err", msg: t("Lenta chizmasi sizning bo'limingiz uchun ochilmagan.", "Чертёж ленты недоступен для вашего отдела.") };
        this.emit();
        return;
      }
      if (!LS.get(LANG_KEY) && me.user.lang === "ru") this.LANG = "ru";
      this.emit();
      const c = await api<CatalogResp>("/app/api/lenta/catalog");
      this.CAT = c.catalog;
      this.EN = c.enums;
      this.INIT = c.initial;
      const d = LS.get<Draft>(DRAFT) || {};
      const r = restore(this.INIT, d);
      this.S = r.state;
      this.projectId = r.projectId;
      // buildApp()
      this.draftText = d.text || "";
      this.CHAT = (LS.get<string[]>(CHAT_KEY) || []).filter((x) => typeof x === "string");
      this.rebuild();
      this.mode = { kind: "app" };
      this.emit();
      const pid = new URLSearchParams(location.search).get("p");
      if (pid && String(pid) !== String(this.projectId)) {
        try {
          await this.openProject(pid);
        } catch (e) {
          this.toastErr(e);
        }
      }
      this.sendLock = false; // drawBar()
      this.scheduleRender();
      this.emit();
    } catch (e) {
      const err = e as ApiError;
      if (!initData() && (err.status === 401 || /Kirish/.test(err.message))) {
        this.mode = { kind: "login", msg: "" };
        this.emit();
        return;
      }
      // lenta API (backend) hali ulanmagan — "Not Found" o'rniga tushunarli matn
      const msg =
        err.status === 404 || err.status >= 500
          ? t("Lenta chizmasi serveri hali ulanmagan — ulangach shu yerda ishlaydi.", "Сервер чертежа ленты ещё не подключён — после подключения заработает здесь.")
          : err.message;
      this.mode = { kind: "err", msg };
      this.emit();
    }
  };

  dispose() {
    clearTimeout(this.rTimer);
    clearTimeout(this.toastTimer);
  }
}
