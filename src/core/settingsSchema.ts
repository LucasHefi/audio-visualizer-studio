import type { SceneSettings, SettingDefinition, SettingsSchema } from '../types';

export const SCENE_SETTINGS_SCHEMA: SettingsSchema = {
  version: 1,
  fields: {
    energy: { type: 'number', default: 0.72, min: 0, max: 1, step: 0.01 },
    sensitivity: { type: 'number', default: 0.68, min: 0, max: 1, step: 0.01 },
    motion: { type: 'number', default: 0.52, min: 0, max: 1, step: 0.01 },
    density: { type: 'number', default: 0.58, min: 0, max: 1, step: 0.01 },
    glow: { type: 'number', default: 0.7, min: 0, max: 1, step: 0.01 },
    background: { type: 'number', default: 0.45, min: 0, max: 1, step: 0.01 },
  },
};

export interface SettingsValidationResult<T = Record<string, unknown>> {
  value: T;
  errors: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const validateSettings = <T = Record<string, unknown>>(
  schema: SettingsSchema,
  input: unknown,
): SettingsValidationResult<T> => {
  const source = isRecord(input) ? input : {};
  const value: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [key, definition] of Object.entries(schema.fields)) {
    const candidate = source[key];
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
      value[key] = definition.default;
      if (candidate !== undefined) errors.push(`${key} must be a finite number`);
      continue;
    }
    if (candidate < definition.min || candidate > definition.max) {
      value[key] = Math.min(definition.max, Math.max(definition.min, candidate));
      errors.push(`${key} was clamped to ${definition.min}-${definition.max}`);
      continue;
    }
    value[key] = candidate;
  }

  return { value: value as T, errors };
};

export const sanitizeSettings = (schema: SettingsSchema, input: unknown): SceneSettings => {
  const result = validateSettings<SceneSettings>(schema, input);
  return result.value;
};

export const settingsSchemaToDefaults = (schema: SettingsSchema): Record<string, number> =>
  Object.fromEntries(Object.entries(schema.fields).map(([key, definition]) => [key, definition.default]));

export const isValidSettingDefinition = (definition: SettingDefinition): boolean =>
  definition.type === 'number'
  && Number.isFinite(definition.default)
  && Number.isFinite(definition.min)
  && Number.isFinite(definition.max)
  && Number.isFinite(definition.step)
  && definition.min <= definition.default
  && definition.default <= definition.max
  && definition.min <= definition.max
  && definition.step > 0;

export const migrateSettings = (schema: SettingsSchema, input: unknown, fromVersion = schema.version): unknown => {
  if (fromVersion >= schema.version || !schema.migrate) return input;
  return schema.migrate(input, fromVersion);
};
