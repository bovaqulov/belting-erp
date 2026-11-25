// Xodimlar (faqat ko'rinish): daraxt (org chart) / ro'yxat, tasdiq kutayotganlar, bloklanganlar, faol taklif havolalari;
// boshliq belgisi va huquq ikonkalari, xodimga biriktirilgan agentlar.
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";

import s from "@/shared/ui/panel/styles";
import { Avatar, avColor, Icon, initials, PERM_ICONS, ROLE_NAMES, SectionHeader, Sq, tapProps } from "@/shared/ui/panel/ui";
import type { Agent } from "@/ai/agents/model";
import OrgChart from "@/ai/org";
import { buildDeptTree, flatten, pruneTree } from "@/ai/org/dept-tree";

import {
  buildTree,
  deptMembers,
  deptOf,
  deptPendingHeads,
  groupUsers,
  headRow,
  type AdminUser,
  type HeadRow,
  type Invite,
  type TreeNode,
  type UDept,
  type UsersCtx,
  type UsersResp,
} from "./users.lib";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

function PermIcons({ h, PERMS }: { h: HeadRow; PERMS: Record<string, string> }) {
  return (
    <span className={s.perms}>
      {Object.keys(PERM_ICONS).map((k) => (
        <span key={k} className={h.perms[k] ? "" : s.off} title={PERMS[k]}>
          <Icon name={PERM_ICONS[k]} />
        </span>
      ))}
    </span>
  );
}

export function UsersView({
  U,
  invites,
  ctx,
  company,
  agents,
  isList,
  busy,
  onView,
  onOpen,
  onAgent,
  onHeadForm,
  onInvite,
  onRoles,
  onCopyInvite,
  canAdmin,
  onApprove,
  onReject,
  onRevoke,
}: {
  U: UsersResp;
  invites: Invite[];
  ctx: UsersCtx;
  company: string;
  agents: Agent[];
  isList: boolean;
  busy: boolean;
  onView: (v: "tree" | "list") => void;
  /** xodim tahriri */
  onOpen: (id: number) => void;
  onAgent: (ag: Agent) => void;
  onHeadForm: () => void;
  /** xodim taklif qilish oynasi */
  onInvite: () => void;
  onRoles: () => void;
  onCopyInvite: (link: string) => void;
  /** ega/admin — taklif va boshliq tayinlash tugmalari */
  canAdmin: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onRevoke: (code: string) => void;
}) {
  const { users, PERMS, depts, byId } = ctx;
  const roleName = Object.fromEntries((ctx.roles?.roles ?? []).map((r) => [r.key, r.name]));
  const sub = (u: AdminUser) => ["@" + (u.username || "-"), ...(u.roles ?? []).map((k) => roleName[k]).filter(Boolean)].join(" · ");
  const { active, pending, blocked, owner, admins, leaders } = groupUsers(users, depts);

  // eski [data-id] onclick: e.stopPropagation(); openEditor(id)
  const open = (id: number) => (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    onOpen(id);
  };

  // bo'limlar ierarxiyasi — Agentlar daraxti bilan BITTA manba (ai/org/dept-tree); bu yerda xodimi yo'q shoxlar kesiladi
  const pendingOf = (d: UDept) => deptPendingHeads(U.pending_heads, d);
  const deptTree = pruneTree(
    buildDeptTree(depts),
    (d) => !!d.sees_all || deptMembers(active, d.key).length > 0 || pendingOf(d).length > 0,
  );
  const firstLead = depts.find((d) => d.sees_all)?.key;

  // ---- org chart ----
  const tree = () => {
    const box = (u: AdminUser, dk: string) => {
      const h = headRow(u, dk, depts);
      return (
        <div className={cx(s.ob, s.person, h && s.head)} {...tapProps(open(u.tg_id))}>
          <Avatar u={u} crown={!!h} />
          <div className={s.t}>{u.name || u.tg_id}</div>
          <div className={s.s}>{sub(u)}</div>
          {h && <PermIcons h={h} PERMS={PERMS} />}
          {/* xodimga biriktirilgan agentlar (Jarvis → Agentlar, kind=staff) */}
          {agents
            .filter((ag) => ag.kind === "staff" && ag.owner_tg === u.tg_id)
            .map((ag) => (
              <button
                key={ag.key}
                className={s.agchip}
                title={`${ag.name} — xodim agenti`}
                style={{ "--dc": ag.color } as CSSProperties}
                onClick={(e) => {
                  e.stopPropagation();
                  onAgent(ag);
                }}
              >
                <Icon name="bot" />
                {ag.name}
              </button>
            ))}
        </div>
      );
    };
    
    const leadBox = (d: UDept) => {
      const first = d.key === firstLead;
      const lead = first && owner ? owner : undefined;
      const minis = [...leaders.filter((u) => u.departments.includes(d.key)), ...(first ? admins : [])];
      return (
        <div className={cx(s.ob, lead && s.person)} onClick={lead ? open(lead.tg_id) : undefined}>
          <Sq icon={d.icon} color={d.color} />
          <div className={s.t}>{d.name}</div>
          <div className={s.s}>{lead ? lead.name : "—"}</div>
          {minis.length > 0 && (
            <>
              <div className={s.mini}>
                {minis.map((a) => (
                  <div
                    key={a.tg_id}
                    className={s.av}
                    title={`${a.name} (${a.role === "admin" ? "admin" : "rahbar"})`}
                    style={{ background: avColor(a) }}
                    onClick={open(a.tg_id)}
                  >
                    {initials(a.name)}
                  </div>
                ))}
              </div>
              <div className={s.s}>
                {[
                  minis.length - (first ? admins.length : 0) ? minis.length - (first ? admins.length : 0) + " rahbar" : "",
                  first && admins.length ? admins.length + " admin" : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </>
          )}
        </div>
      );
    };
    return (
      <OrgChart
        root={
          <div className={cx(s.ob, s.root)}>
            <Sq icon="building-2" color="rgba(255,255,255,.2)" />
            <div className={s.t}>{company}</div>
            <div className={s.s}>
              {active.length} xodim · {depts.length} bo&apos;lim
            </div>
          </div>
        }
        tree={deptTree}
        renderDept={(d) =>
          d.sees_all ? (
            leadBox(d)
          ) : (
            <div className={cx(s.ob, s.dept)} style={{ "--dc": d.color } as CSSProperties}>
              <Sq icon={d.icon} color={d.color} />
              <div className={s.t}>{d.name}</div>
              <div className={s.s}>{deptMembers(active, d.key).length} kishi</div>
            </div>
          )
        }
        renderInside={(d) => {
          if (d.sees_all) return [];
          const li = (n: TreeNode<AdminUser>) => (
            <li key={n.m.tg_id}>
              {box(n.m, d.key)}
              {n.children.length > 0 && <ul>{n.children.map(li)}</ul>}
            </li>
          );
          const kids = buildTree(deptMembers(active, d.key), (u) => !!headRow(u, d.key, depts)).map(li);
          const ph = pendingOf(d).map((p) => (
            <li key={`p${p.id}`}>
              <div className={cx(s.ob, s.head)} style={{ opacity: 0.75 }}>
                <div className={s.av} style={{ background: "#8e8e93" }}>
                  <Icon name="clock" />
                </div>
                <div className={s.t}>@{p.username}</div>
                <div className={s.s}>botga kirmagan</div>
              </div>
            </li>
          ));
          return [...kids, ...ph];
        }}
      />
    );
  };

  // ---- ro'yxat (Telegram kontaktlar uslubi) ----
  const list = () => {
    const row = (u: AdminUser, dk: string | null, lvl = 0) => {
      const h = dk ? headRow(u, dk, depts) : undefined;
      const lead = !dk && leaders.includes(u);
      return (
        <div
          key={u.tg_id}
          className={cx(s.item, s.tap)}
          style={{ paddingLeft: 16 + lvl * 26 }}
          {...tapProps(open(u.tg_id))}
        >
          <Avatar u={u} crown={!!h} />
          <div className={s.main}>
            <div className={s.t}>{u.name || u.tg_id}</div>
            <div className={s.s}>{sub(u)}</div>
            {h && <PermIcons h={h} PERMS={PERMS} />}
          </div>
          <span className={cx(s.badge, h ? s.head : lead ? s.rahbar : s[u.role])}>
            {h ? "boshliq" : lead ? "rahbar" : ROLE_NAMES[u.role]}
          </span>
        </div>
      );
    };
    const top = [owner, ...leaders, ...admins].filter((x): x is AdminUser => !!x);
    return (
      <>
        <SectionHeader>Rahbariyat va adminlar</SectionHeader>
        <div className={s.list}>{top.map((u) => row(u, null))}</div>
        {flatten(deptTree).filter((x) => !x.d.sees_all).map(({ d, path }) => {
          const members = deptMembers(active, d.key);
          const walk = (n: TreeNode<AdminUser>, lvl: number): ReactNode[] => [
            row(n.m, d.key, lvl),
            ...n.children.flatMap((c) => walk(c, lvl + 1)),
          ];
          return (
            <div key={d.key}>
              <div className={s.sh} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {[...path.filter((x) => !x.sees_all), d].map((x) => x.name).join(" › ")} · {members.length}
              </div>
              <div className={s.list}>
                {members.length ? (
                  buildTree(members, (u) => !!headRow(u, d.key, depts)).flatMap((n) => walk(n, 0))
                ) : (
                  <div className={s.item}>
                    <div className={cx(s.main, s.s)} style={{ color: "var(--hint)" }}>
                      Hali xodim yo&apos;q
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <>
      <div className={s.toolbar}>
        <div className={s.seg} style={{ flex: 1 }}>
          <button className={!isList ? s.on : ""} onClick={() => onView("tree")}>
            <Icon name="network" /> Daraxt
          </button>
          <button className={isList ? s.on : ""} onClick={() => onView("list")}>
            <Icon name="list" /> Ro&apos;yxat
          </button>
        </div>
        <button className={s.fab} title="Rollar va ruxsatlar" aria-label="Rollar va ruxsatlar" onClick={onRoles}>
          <Icon name="shield-check" />
        </button>
        {canAdmin && (
          <>
            <button className={s.fab} title="Xodim taklif qilish" aria-label="Xodim taklif qilish" onClick={onInvite}>
              <Icon name="user-plus" />
            </button>
            <button className={s.fab} title="Boshliq tayinlash" aria-label="Boshliq tayinlash" onClick={onHeadForm}>
              <Icon name="crown" />
            </button>
          </>
        )}
      </div>

      {pending.length > 0 && (
        <>
          <SectionHeader>Tasdiq kutayotganlar</SectionHeader>
          <div className={s.list}>
            {pending.map((u) => (
              <div key={u.tg_id} className={s.item}>
                <Avatar u={u} />
                <div className={s.main}>
                  <div className={s.t}>{u.name}</div>
                  <div className={s.s}>@{u.username || "-"}</div>
                </div>
                <button
                  className={cx(s["mini-btn"], s.papprove)}
                  title="Tasdiqlash"
                  aria-label="Tasdiqlash"
                  disabled={busy}
                  onClick={() => onApprove(u.tg_id)}
                >
                  <Icon name="check" />
                </button>
                <button
                  className={cx(s["mini-btn"], s.danger, s.preject)}
                  title="Rad etish"
                  aria-label="Rad etish"
                  disabled={busy}
                  onClick={() => onReject(u.tg_id)}
                >
                  <Icon name="x" />
                </button>
              </div>
            ))}
          </div>
          <div className={s.sf}>Tasdiqlashda bo&apos;lim tanlanadi.</div>
        </>
      )}

      {isList ? list() : tree()}

      {blocked.length > 0 && (
        <>
          <SectionHeader>Bloklanganlar</SectionHeader>
          <div className={s.list}>
            {blocked.map((u) => (
              <div key={u.tg_id} className={cx(s.item, s.tap)} {...tapProps(open(u.tg_id))}>
                <Avatar u={u} />
                <div className={s.main}>
                  <div className={s.t}>{u.name}</div>
                </div>
                <span className={cx(s.badge, s.blocked)}>bloklangan</span>
              </div>
            ))}
          </div>
        </>
      )}

      {invites.length > 0 && (
        <>
          <SectionHeader>Faol taklif havolalari</SectionHeader>
          <div className={s.list}>
            {invites.map((i) => {
              const d = deptOf(depts, i.dept);
              return (
                <div key={i.code} className={s.item}>
                  <Sq icon="link" color={d.color} />
                  <div className={s.main}>
                    <div className={s.t}>{[d.name, ...(i.roles ?? []).map((k) => roleName[k]).filter(Boolean)].join(" · ")}</div>
                    <div className={s.s}>
                      {i.name || byId[i.created_by]?.name || i.created_by} · {i.uses}/{i.max_uses} ·{" "}
                      {i.expires.slice(0, 10)} gacha
                    </div>
                  </div>
                  {i.link && (
                    <button className={s.lnk} disabled={busy} onClick={() => onCopyInvite(i.link!)}>
                      Nusxa
                    </button>
                  )}
                  <button className={cx(s.lnk, s.danger, s.irev)} disabled={busy} onClick={() => onRevoke(i.code)}>
                    Bekor
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/** xato yoki yuklanmoqda */
export const UsersStatus = ({ err }: { err?: string | null }) =>
  err != null ? <div className={s.err}>{err}</div> : <div className={s.empty}>Yuklanmoqda…</div>;

