import { describe, expect, it } from 'vitest';
import { waitForEncoderCapacity } from './encoderBackpressure';

describe('waitForEncoderCapacity', () => {
  it('waits until the encoder queue drops below the high-water mark', async () => {
    let reads = 0;
    const encoder = {
      get encodeQueueSize() {
        reads += 1;
        return reads < 3 ? 3 : 1;
      },
    };

    await waitForEncoderCapacity(encoder);

    expect(reads).toBe(3);
  });

  it('stops waiting when cancellation is requested', async () => {
    const controller = new AbortController();
    controller.abort();
    const encoder = { encodeQueueSize: 3 };

    await expect(waitForEncoderCapacity(encoder, controller.signal)).rejects.toThrow('Export was cancelled.');
  });
});
