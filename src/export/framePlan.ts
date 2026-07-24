import { CANVAS_PROFILES } from '../core/catalog';
import type { CanvasProfileId } from '../types';
import { ExportValidationError, type ExportFramePlan, type ExportRequest } from './types';

const MIN_EXPORT_FPS = 1;
const MAX_EXPORT_FPS = 120;
const MAX_EXPORT_DURATION_SECONDS = 3_600;
const MAX_EXPORT_DIMENSION = 8_192;
const MAX_EXPORT_PIXELS = 32_000_000;
const MAX_EXPORT_FRAMES = 500_000;
const FRAME_COUNT_EPSILON = 1e-9;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);
const isCanvasProfileId = (value: unknown): value is CanvasProfileId => typeof value === 'string' && value in CANVAS_PROFILES;

const invalidRequest = (): never => {
  throw new ExportValidationError('INVALID_REQUEST', 'Export request must be an object.');
};

export const validateExportRequest = (input: unknown): ExportRequest => {
  if (!isRecord(input)) return invalidRequest();
  const value = input;

  if (!isCanvasProfileId(value.profileId)) {
    throw new ExportValidationError('INVALID_PROFILE', 'Export profile is not supported.');
  }

  const profile = CANVAS_PROFILES[value.profileId];
  const width = value.width;
  const height = value.height;
  if (!isInteger(width) || !isInteger(height)
    || width <= 0 || height <= 0
    || width > MAX_EXPORT_DIMENSION || height > MAX_EXPORT_DIMENSION
    || width * height > MAX_EXPORT_PIXELS) {
    throw new ExportValidationError('INVALID_DIMENSIONS', 'Export dimensions must be positive bounded integers.');
  }
  if (width !== profile.width || height !== profile.height) {
    throw new ExportValidationError('PROFILE_DIMENSIONS_MISMATCH', 'Export dimensions do not match the selected profile.');
  }

  const fps = value.fps;
  if (!isFiniteNumber(fps) || fps < MIN_EXPORT_FPS || fps > MAX_EXPORT_FPS) {
    throw new ExportValidationError('INVALID_FPS', 'Export FPS must be between 1 and 120.');
  }
  const duration = value.duration;
  if (!isFiniteNumber(duration) || duration <= 0 || duration > MAX_EXPORT_DURATION_SECONDS) {
    throw new ExportValidationError('INVALID_DURATION', 'Export duration must be greater than zero and at most 3600 seconds.');
  }
  const seed = value.seed;
  if (!isInteger(seed)) {
    throw new ExportValidationError('INVALID_SEED', 'Export seed must be a finite integer.');
  }

  const audio = value.audio;
  if (!isRecord(audio)) {
    throw new ExportValidationError('INVALID_AUDIO_IDENTITY', 'Export audio identity must contain a name, size and modification timestamp.');
  }
  const audioName = audio.name;
  const audioSize = audio.size;
  const audioLastModified = audio.lastModified;
  if (typeof audioName !== 'string' || audioName.trim().length === 0
    || !isInteger(audioSize) || audioSize < 0
    || !isInteger(audioLastModified) || audioLastModified < 0) {
    throw new ExportValidationError('INVALID_AUDIO_IDENTITY', 'Export audio identity must contain a name, size and modification timestamp.');
  }

  const totalFrames = Math.ceil(duration * fps - FRAME_COUNT_EPSILON);
  if (totalFrames <= 0 || totalFrames > MAX_EXPORT_FRAMES) {
    throw new ExportValidationError('TOO_MANY_FRAMES', 'Export frame count exceeds the supported limit.');
  }

  return {
    profileId: value.profileId,
    width,
    height,
    fps,
    duration,
    seed,
    audio: {
      name: audioName,
      size: audioSize,
      lastModified: audioLastModified,
    },
  };
};

export const buildExportFramePlan = (input: unknown): ExportFramePlan => {
  const request = validateExportRequest(input);
  const frameDuration = 1 / request.fps;
  const totalFrames = Math.ceil(request.duration * request.fps - FRAME_COUNT_EPSILON);
  const frames = Array.from({ length: totalFrames }, (_, index) => {
    const timestamp = index / request.fps;
    const remainingDuration = request.duration - timestamp;
    const isShortFinalFrame = remainingDuration < frameDuration - FRAME_COUNT_EPSILON;
    return Object.freeze({
      index,
      timestamp,
      duration: isShortFinalFrame ? Number(remainingDuration.toFixed(9)) : frameDuration,
    });
  });

  return Object.freeze({
    fps: request.fps,
    duration: request.duration,
    totalFrames,
    frames: Object.freeze(frames),
  });
};
