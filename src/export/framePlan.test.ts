import { describe, expect, it } from 'vitest';
import { buildExportFramePlan, validateExportRequest } from './framePlan';
import { ExportValidationError, type ExportRequest } from './types';

const baseRequest: ExportRequest = {
  profileId: 'youtube-landscape',
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 2,
  seed: 42,
  audio: {
    name: 'demo.mp3',
    size: 1024,
    lastModified: 1_700_000_000_000,
  },
};

describe('export request validation', () => {
  it('accepts a complete request without persisting audio bytes or object URLs', () => {
    const request = validateExportRequest(baseRequest);

    expect(request).toEqual(baseRequest);
    expect(request.audio).toEqual({ name: 'demo.mp3', size: 1024, lastModified: 1_700_000_000_000 });
    expect(request).not.toHaveProperty('audioBytes');
    expect(request).not.toHaveProperty('objectUrl');
  });

  it('rejects an unknown profile instead of normalizing it to a fallback', () => {
    expect(() => validateExportRequest({ ...baseRequest, profileId: 'old-profile' })).toThrowError(
      new ExportValidationError('INVALID_PROFILE', 'Export profile is not supported.'),
    );
  });

  it('rejects dimensions that do not match the selected profile', () => {
    expect(() => validateExportRequest({ ...baseRequest, width: 1080 })).toThrowError(
      new ExportValidationError('PROFILE_DIMENSIONS_MISMATCH', 'Export dimensions do not match the selected profile.'),
    );
  });

  it.each([
    ['fps', 0, 'INVALID_FPS', 'Export FPS must be between 1 and 120.'],
    ['fps', 121, 'INVALID_FPS', 'Export FPS must be between 1 and 120.'],
    ['duration', 0, 'INVALID_DURATION', 'Export duration must be greater than zero and at most 3600 seconds.'],
    ['duration', 3601, 'INVALID_DURATION', 'Export duration must be greater than zero and at most 3600 seconds.'],
  ] as const)('rejects invalid %s', (field, value, code, message) => {
    expect(() => validateExportRequest({ ...baseRequest, [field]: value })).toThrowError(new ExportValidationError(code, message));
  });
});

describe('deterministic export frame plan', () => {
  it('creates a stable end-exclusive frame timeline', () => {
    const first = buildExportFramePlan(baseRequest);
    const second = buildExportFramePlan({ ...baseRequest });

    expect(first).toEqual(second);
    expect(first.totalFrames).toBe(60);
    expect(first.frames[0]).toEqual({ index: 0, timestamp: 0, duration: 1 / 30 });
    expect(first.frames[59]).toEqual({ index: 59, timestamp: 59 / 30, duration: 1 / 30 });
    expect(first.frames.some((frame) => frame.timestamp === baseRequest.duration)).toBe(false);
  });

  it('covers a non-integral duration with a shortened final frame', () => {
    const plan = buildExportFramePlan({ ...baseRequest, fps: 24, duration: 1.01, width: 1920, height: 1080 });

    expect(plan.totalFrames).toBe(25);
    expect(plan.frames[plan.frames.length - 1]).toEqual({ index: 24, timestamp: 1, duration: 0.01 });
  });
});
