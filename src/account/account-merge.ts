/**
 * account-merge.ts — 同期の重ね方 (docs/spec/account.md A-41)。localStorage にも fetch にも触らない純粋な関数だけ (見張りが node でそのまま読む)
 */
/** 端末の 1 件 (中身は文字のまま運ぶ) */
export interface LocalItem { id: string; updatedAt: number; name?: string; body: string }
export interface SyncItem { kind: string; id: string; updatedAt: number; deleted?: boolean; name?: string; body?: string }

/** 上げる物: 前回から変わった物と、この端末で消した物の印 */
export function changes(kind: string, local: readonly LocalItem[], snap: Readonly<Record<string, number>>, now: number): SyncItem[] {
  const ids = new Set(local.map((l) => l.id));
  return [
    ...local.filter((l) => snap[l.id] !== l.updatedAt).map((l) => ({ kind, id: l.id, updatedAt: l.updatedAt, name: l.name, body: l.body })),
    ...Object.keys(snap).filter((id) => !ids.has(id)).map((id) => ({ kind, id, updatedAt: now, deleted: true })),
  ];
}

/** 下ろした物を端末の物に重ねる。同じ id は新しい方 (同じ時刻なら端末のまま) */
export function merge(local: readonly LocalItem[], remote: readonly SyncItem[]): { next: LocalItem[]; lost: LocalItem[] } {
  const by = new Map(local.map((l) => [l.id, l]));
  const lost: LocalItem[] = [];
  for (const r of remote) {
    const mine = by.get(r.id);
    if (mine && mine.updatedAt >= r.updatedAt) continue;
    if (mine) lost.push(mine);
    if (r.deleted) by.delete(r.id);
    else by.set(r.id, { id: r.id, updatedAt: r.updatedAt, name: r.name, body: r.body ?? "" });
  }
  return { next: [...by.values()], lost };
}
