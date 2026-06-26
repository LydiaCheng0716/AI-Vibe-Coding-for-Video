import { describe, it, expect, vi } from 'vitest';
import { createLocalCollection, type CollectionRecord } from '../../src/services/collections';

interface Item extends CollectionRecord {
  name: string;
  tag?: string;
}

function mk() {
  return createLocalCollection<Item>('testColl');
}

describe('createLocalCollection', () => {
  it('传 normalize 时补齐旧记录元字段，并丢弃脏项', async () => {
    const c = createLocalCollection<Item>('normalizedColl', {
      normalize(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const item = raw as Partial<Item>;
        if (typeof item.name !== 'string') return null;
        return item as Item;
      },
    });
    await chrome.storage.local.set({
      normalizedColl: {
        items: [{ name: 'old' }, { id: 'bad', createdAt: 1, updatedAt: 1 }],
      },
    });

    const list = await c.list();

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'old', createdAt: 0, updatedAt: 0 });
    expect(list[0]?.id).toBeTruthy();
  });

  it('不传 normalize 时维持原样读取', async () => {
    await chrome.storage.local.set({ testColl: { items: [{ name: 'raw' }] } });

    expect(await mk().list()).toEqual([{ name: 'raw' }]);
  });

  it('add 赋 id/时间戳并可 list', async () => {
    const c = mk();
    const r = await c.add({ name: 'a' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.id).toBeTruthy();
      expect(r.data.createdAt).toBeGreaterThan(0);
      expect(r.data.updatedAt).toBe(r.data.createdAt);
    }
    expect(await c.list()).toHaveLength(1);
  });

  it('update 仅改目标 + 刷新 updatedAt；无匹配 → null', async () => {
    const c = mk();
    const a = await c.add({ name: 'a' });
    await c.add({ name: 'b' });
    if (!a.ok) throw new Error('seed');
    const u = await c.update(a.data.id, { tag: 'x' });
    expect(u.ok).toBe(true);
    if (u.ok && u.data) {
      expect(u.data.tag).toBe('x');
      expect(u.data.updatedAt).toBeGreaterThanOrEqual(a.data.createdAt);
    }
    const list = await c.list();
    expect(list.find((i) => i.name === 'b')?.tag).toBeUndefined(); // 其它不变
    const miss = await c.update('nope', { tag: 'y' });
    expect(miss).toMatchObject({ ok: true, data: null });
  });

  it('remove 删除目标', async () => {
    const c = mk();
    const a = await c.add({ name: 'a' });
    if (!a.ok) throw new Error('seed');
    await c.remove(a.data.id);
    expect(await c.list()).toHaveLength(0);
  });

  it('写失败 → STORAGE_WRITE_FAILED', async () => {
    const c = mk();
    const spy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));
    const r = await c.add({ name: 'a' });
    expect(r).toMatchObject({ ok: false, error: { code: 'STORAGE_WRITE_FAILED' } });
    spy.mockRestore();
  });

  it('并发 add 串行不丢（RMW 锁）', async () => {
    const c = mk();
    await Promise.all([c.add({ name: '1' }), c.add({ name: '2' }), c.add({ name: '3' })]);
    expect(await c.list()).toHaveLength(3);
  });

  it('同一 storageKey 的多个实例共享锁，并发不丢更新（Codex P2）', async () => {
    // 两个独立实例操作同一 key：锁按 key 共享 → 两次 add 都保留。
    await Promise.all([
      createLocalCollection<Item>('sharedKey').add({ name: 'a' }),
      createLocalCollection<Item>('sharedKey').add({ name: 'b' }),
    ]);
    const names = (await createLocalCollection<Item>('sharedKey').list()).map((i) => i.name).sort();
    expect(names).toEqual(['a', 'b']);
  });
});
