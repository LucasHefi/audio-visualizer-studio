import { isValidSettingDefinition } from '../core/settingsSchema';
import {
  MODULE_API_VERSION,
  type EntitlementTier,
  type ModuleLifecycle,
  type ModuleManifest,
  type ModuleQuality,
  type ModuleCreateContext,
  type RendererBackend,
  type RendererModuleCreateContext,
  type SceneModule,
  type Canvas2DModuleCreateContext,
  type Canvas2DSceneModule,
  type WebGL2ModuleCreateContext,
  type WebGL2ModuleUpdateInput,
} from '../types';

export interface EntitlementProvider {
  canUse: (manifest: ModuleManifest) => boolean;
  reason?: (manifest: ModuleManifest) => string;
}

export const CORE_FREE_ENTITLEMENT_PROVIDER: EntitlementProvider = {
  canUse: (manifest) => manifest.entitlement === 'core' || manifest.entitlement === 'free',
  reason: (manifest) => `Module ${manifest.id} requires the ${manifest.entitlement} entitlement.`,
};

export class ModuleContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ModuleContractError';
  }
}

export class RendererBackendMismatchError extends ModuleContractError {
  public readonly expected: RendererBackend;
  public readonly actual: RendererBackend;

  public constructor(moduleId: string, expected: RendererBackend, actual: RendererBackend) {
    super(`Module ${moduleId} backend mismatch: expected ${expected}, received ${actual}.`);
    this.name = 'RendererBackendMismatchError';
    this.expected = expected;
    this.actual = actual;
  }
}

const isSemver = (value: string): boolean => /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
const VALID_ENTITLEMENTS: readonly EntitlementTier[] = ['core', 'free', 'paid'];
const VALID_CAPABILITIES = new Set(['audio-frame', 'canvas', 'settings']);

export const validateModuleManifest = (manifest: ModuleManifest): void => {
  if (!manifest || typeof manifest !== 'object') throw new ModuleContractError('Module manifest is required.');
  if (typeof manifest.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id)) throw new ModuleContractError('Module manifest id must be kebab-case.');
  if (manifest.kind !== 'visualizer') throw new ModuleContractError(`Module ${manifest.id} has an unsupported kind.`);
  if (manifest.apiVersion !== MODULE_API_VERSION) throw new ModuleContractError(`Module ${manifest.id} requires unsupported API version ${String(manifest.apiVersion)}.`);
  if (manifest.backend !== 'canvas2d' && manifest.backend !== 'webgl2') throw new ModuleContractError(`Module ${manifest.id} must declare a renderer backend.`);
  if (typeof manifest.version !== 'string' || !isSemver(manifest.version)) throw new ModuleContractError(`Module ${manifest.id} must use a semantic version.`);
  if (typeof manifest.name !== 'string' || typeof manifest.description !== 'string' || !manifest.name.trim() || !manifest.description.trim()) throw new ModuleContractError(`Module ${manifest.id} needs a name and description.`);
  if (!Array.isArray(manifest.capabilities) || !manifest.capabilities.length || manifest.capabilities.some((capability) => !VALID_CAPABILITIES.has(capability))) {
    throw new ModuleContractError(`Module ${manifest.id} has invalid capabilities.`);
  }
  if (!manifest.capabilities.includes('audio-frame') || !manifest.capabilities.includes('canvas')) {
    throw new ModuleContractError(`Module ${manifest.id} must declare audio-frame and canvas capabilities.`);
  }
  if (!VALID_ENTITLEMENTS.includes(manifest.entitlement)) throw new ModuleContractError(`Module ${manifest.id} has an invalid entitlement.`);
  if (!manifest.settingsSchema || !Number.isInteger(manifest.settingsSchema.version) || manifest.settingsSchema.version < 1 || !manifest.settingsSchema.fields) {
    throw new ModuleContractError(`Module ${manifest.id} has an invalid settings schema version.`);
  }
  for (const definition of Object.values(manifest.settingsSchema.fields)) {
    if (!isValidSettingDefinition(definition)) throw new ModuleContractError(`Module ${manifest.id} has an invalid settings definition.`);
  }
};

const isCanvas2DModule = (module: SceneModule): module is Canvas2DSceneModule => module.manifest.backend === 'canvas2d';

export const validateSceneModule = (module: SceneModule): void => {
  if (!module || typeof module !== 'object') throw new ModuleContractError('Scene module is required.');
  validateModuleManifest(module.manifest);
  if (isCanvas2DModule(module) && typeof module.render !== 'function') {
    throw new ModuleContractError(`Module ${module.manifest.id} must provide a Canvas2D render function.`);
  }
  if (!isCanvas2DModule(module) && typeof module.create !== 'function') {
    throw new ModuleContractError(`Module ${module.manifest.id} must provide a WebGL2 create function.`);
  }
  for (const [key, definition] of Object.entries(module.manifest.settingsSchema.fields)) {
    const value = module.defaults[key as keyof typeof module.defaults];
    if (typeof value !== 'number' || value < definition.min || value > definition.max) {
      throw new ModuleContractError(`Module ${module.manifest.id} has an invalid default for ${key}.`);
    }
  }
};

const createRenderLifecycle = (module: Extract<SceneModule, { manifest: { backend: 'canvas2d' } }>): ModuleLifecycle => {
  let destroyed = false;
  let quality: ModuleQuality = 'high';
  let reducedMotion = false;

  return {
    update: (input) => {
      if (destroyed) throw new ModuleContractError(`Module ${module.manifest.id} was updated after destroy.`);
      const settings = reducedMotion ? { ...input.settings, motion: 0 } : input.settings;
      module.render(input.ctx, input.width, input.height, input.frame, settings, input.palette, input.elapsed, input.seed);
    },
    resize: () => {
      if (destroyed) throw new ModuleContractError(`Module ${module.manifest.id} was resized after destroy.`);
    },
    setQuality: (nextQuality) => {
      if (destroyed) throw new ModuleContractError(`Module ${module.manifest.id} received quality after destroy.`);
      quality = nextQuality;
      void quality;
    },
    setReducedMotion: (enabled) => {
      if (destroyed) throw new ModuleContractError(`Module ${module.manifest.id} received motion settings after destroy.`);
      reducedMotion = enabled;
    },
    destroy: () => {
      destroyed = true;
    },
  };
};

export class SceneModuleRegistry {
  private readonly modules: ReadonlyMap<string, SceneModule>;
  private readonly entitlementProvider: EntitlementProvider;

  public constructor(modules: readonly SceneModule[], entitlementProvider: EntitlementProvider = CORE_FREE_ENTITLEMENT_PROVIDER) {
    const map = new Map<string, SceneModule>();
    for (const module of modules) {
      validateSceneModule(module);
      if (map.has(module.manifest.id)) throw new ModuleContractError(`Duplicate module id: ${module.manifest.id}.`);
      map.set(module.manifest.id, module);
    }
    this.modules = map;
    this.entitlementProvider = entitlementProvider;
  }

  public list(): SceneModule[] {
    return Array.from(this.modules.values()).filter((module) => this.entitlementProvider.canUse(module.manifest));
  }

  public require(id: string): SceneModule {
    const module = this.modules.get(id);
    if (!module) throw new ModuleContractError(`Unknown module: ${id}.`);
    if (!this.entitlementProvider.canUse(module.manifest)) {
      throw new ModuleContractError(this.entitlementProvider.reason?.(module.manifest) ?? `Module ${id} is unavailable.`);
    }
    return module;
  }

  public create(id: string, context: Canvas2DModuleCreateContext): ModuleLifecycle;
  public create(id: string, context: WebGL2ModuleCreateContext): ModuleLifecycle<WebGL2ModuleUpdateInput>;
  public create(id: string, context: ModuleCreateContext): ModuleLifecycle;
  public create(id: string, context: RendererModuleCreateContext | ModuleCreateContext): ModuleLifecycle | ModuleLifecycle<WebGL2ModuleUpdateInput> {
    const module = this.require(id);
    const actualBackend: RendererBackend = 'backend' in context ? context.backend : 'canvas2d';
    if (module.manifest.backend !== actualBackend) {
      throw new RendererBackendMismatchError(module.manifest.id, module.manifest.backend, actualBackend);
    }

    if (isCanvas2DModule(module)) {
      if ('backend' in context) {
        if (context.backend !== 'canvas2d') {
          throw new RendererBackendMismatchError(module.manifest.id, 'canvas2d', context.backend);
        }
        return module.create?.(context) ?? createRenderLifecycle(module);
      }
      return module.create?.({ backend: 'canvas2d', canvas: context.canvas, ctx: context.ctx }) ?? createRenderLifecycle(module);
    }

    if (!('gl' in context)) {
      throw new RendererBackendMismatchError(module.manifest.id, 'webgl2', 'canvas2d');
    }
    return module.create(context);
  }
}

export const createSceneRegistry = (modules: readonly SceneModule[], entitlementProvider?: EntitlementProvider): SceneModuleRegistry =>
  new SceneModuleRegistry(modules, entitlementProvider);
