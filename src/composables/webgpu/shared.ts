import { ref } from 'vue';
import type { GPUCore } from './core';

export interface SharedTextures {
  uv: GPUTexture;
  paint: GPUTexture;
}

export function useSharedResources(core: GPUCore) {
  const { device } = core;

  // Create initial dummy 1x1 textures to avoid null references
  const dummyUV = device.createTexture({
    size: [1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });

  const dummyPaint = device.createTexture({
    size: [1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });

  const textures = ref<SharedTextures | null>({
    uv: dummyUV,
    paint: dummyPaint
  });

  function updateUVTexture(source: any, flipY: boolean = false) {
    if (!core) return;
    const { device } = core;

    if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement && source.readyState < 2) return;

    let width = source.videoWidth || source.naturalWidth || source.width;
    let height = source.videoHeight || source.naturalHeight || source.height;
    if (width <= 0 || height <= 0) return;

    let uvTexture = textures.value?.uv;

    if (!uvTexture || uvTexture.width !== width || uvTexture.height !== height) {
      if (uvTexture) uvTexture.destroy();
      uvTexture = device.createTexture({
        size: [width, height], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      textures.value = {
        ...textures.value,
        uv: uvTexture,
        paint: textures.value?.paint || device.createTexture({
          size: [width, height], format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        })
      };
    }
    device.queue.copyExternalImageToTexture({ source, flipY }, { texture: uvTexture }, [width, height]);
  }

  function updatePaintTexture(source: HTMLCanvasElement) {
    if (!core) return;
    const { device } = core;
    const width = source.width;
    const height = source.height;
    if (width <= 0 || height <= 0) return;

    let paintTexture = textures.value?.paint;

    if (!paintTexture || paintTexture.width !== width || paintTexture.height !== height) {
      if (paintTexture) paintTexture.destroy();
      paintTexture = device.createTexture({
        size: [width, height], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      textures.value = {
        ...(textures.value as SharedTextures),
        paint: paintTexture
      };
    }
    device.queue.copyExternalImageToTexture({ source, flipY: false }, { texture: paintTexture }, [width, height]);
  }

  return {
    textures,
    updateUVTexture,
    updatePaintTexture
  };
}
