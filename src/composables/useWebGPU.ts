import { initWebGPU, type GPUCore } from './webgpu/core';
import { useSharedResources, type SharedTextures } from './webgpu/shared';
import { useWebGPU as useFlow } from './webgpu/flow/useFlow';
import { useParticles } from './webgpu/particles/useParticles';
import { useWaterLevel } from './webgpu/waterlevel/useWaterLevel';

export { initWebGPU, useSharedResources, useFlow, useParticles, useWaterLevel, useFlow as useWebGPU };
export type { GPUCore, SharedTextures };
export type { GPUParams } from './webgpu/types';
