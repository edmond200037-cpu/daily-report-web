import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindWorkGestures } from '../../src/daily/work-gestures';

afterEach(() => vi.unstubAllGlobals());

function setup(save: () => Promise<void>) {
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  const handlers: Record<string, (event: unknown) => Promise<void> | void> = {};
  const root = { addEventListener: (type: string, fn: (event: unknown) => void) => { handlers[type] ??= fn; }, prepend: vi.fn(), querySelector: () => null, querySelectorAll: () => [] };
  const row: Record<string, unknown> = { dataset: { work: 'w1' }, closest: () => ({ dataset: { trade: 't1' } }), parentElement: { querySelectorAll: () => [row] } };
  const button = { disabled: false, dataset: { workMove: '1' }, hasAttribute: (name: string) => name === 'data-work-delete' ? false : false, closest: () => row };
  const undo = vi.fn();
  const actions = { editable: () => true, move: vi.fn(() => undo), remove: vi.fn(), save: vi.fn(save), render: vi.fn(async () => undefined), error: vi.fn() };
  bindWorkGestures(root as unknown as HTMLElement, actions);
  const click = () => handlers.click({ target: { closest: () => button } });
  return { actions, undo, click };
}

describe('工項移動儲存失敗時還原順序', () => {
  it('儲存失敗：呼叫 undo、重新繪製並回報錯誤', async () => {
    const { actions, undo, click } = setup(async () => { throw new Error('儲存失敗'); });
    await click();
    expect(actions.move).toHaveBeenCalledWith('t1', 'w1', 1);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(actions.render).toHaveBeenCalled();
    expect(actions.error).toHaveBeenCalledWith(expect.objectContaining({ message: '儲存失敗' }));
  });
});
