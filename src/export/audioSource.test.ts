import { describe, expect, it, vi } from 'vitest';
import { snapshotAudioFile } from './audioSource';

describe('snapshotAudioFile', () => {
  it('copies bytes and preserves the audio identity for delayed export', async () => {
    const source = new Uint8Array([1, 2, 3, 4]).buffer;
    const file = {
      name: 'demo.mp3',
      size: source.byteLength,
      lastModified: 123,
      arrayBuffer: vi.fn().mockResolvedValue(source),
    };

    const snapshot = await snapshotAudioFile(file);
    new Uint8Array(source)[0] = 99;

    expect(file.arrayBuffer).toHaveBeenCalledOnce();
    expect(snapshot).toMatchObject({ name: 'demo.mp3', size: 4, lastModified: 123 });
    expect(Array.from(new Uint8Array(snapshot.bytes))).toEqual([1, 2, 3, 4]);
  });

  it('fails closed when the browser cannot read the selected file', async () => {
    const file = {
      name: 'locked.mp3',
      size: 10,
      lastModified: 456,
      arrayBuffer: vi.fn().mockRejectedValue(new DOMException('The requested file could not be read.', 'NotReadableError')),
    };

    await expect(snapshotAudioFile(file)).rejects.toThrow('The local audio file could not be read.');
  });

  it('rejects empty bytes instead of creating a silent export', async () => {
    const file = {
      name: 'empty.mp3',
      size: 0,
      lastModified: 789,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    };

    await expect(snapshotAudioFile(file)).rejects.toThrow('The local audio file could not be read.');
  });
});
