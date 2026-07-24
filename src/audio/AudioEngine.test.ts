import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './AudioEngine';

describe('AudioEngine lifecycle', () => {
  it('resets the local audio session and exposes an empty state after dispose', () => {
    const notify = vi.fn();
    const engine = new AudioEngine(notify);

    engine.dispose();

    expect(engine.getState()).toEqual({
      status: 'empty',
      name: '',
      duration: 0,
      currentTime: 0,
      volume: 0.8,
    });
    expect(notify).toHaveBeenLastCalledWith(engine.getState());
  });
});
