import { ref } from 'vue';
import type { GPUCore } from './core';

export interface SharedTextures {
  uv: GPUTexture;
  paint: GPUTexture;
}

export function useSharedResources(core: GPUCore) {
  const { device } = core;

  let uvW = 1, uvH = 1;
  let paintW = 1, paintH = 1;

  // Firefox does not accept an HTMLVideoElement as a copyExternalImageToTexture source
  // (only ImageBitmap/HTMLImageElement/HTMLCanvasElement/OffscreenCanvas). When the direct
  // video copy is rejected we draw the frame onto this 2D canvas and copy that instead.
  let useVideoCanvasFallback = false;
  let videoCanvas: HTMLCanvasElement | null = null;
  let videoCtx: CanvasRenderingContext2D | null = null;

  function videoFrameToCanvas(video: HTMLVideoElement, width: number, height: number): HTMLCanvasElement {
    if (!videoCanvas) {
      videoCanvas = document.createElement('canvas');
      videoCtx = videoCanvas.getContext('2d');
    }
    if (videoCanvas.width !== width || videoCanvas.height !== height) {
      videoCanvas.width = width;
      videoCanvas.height = height;
    }
    videoCtx!.drawImage(video, 0, 0, width, height);
    return videoCanvas;
  }

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

  function updateUVTexture(source: any, flipY: boolean = false): boolean {
    if (!core) return false;
    const { device } = core;

    if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement && source.readyState < 2) return false;

    let width = source.videoWidth || source.naturalWidth || source.width;
    let height = source.videoHeight || source.naturalHeight || source.height;
    if (width <= 0 || height <= 0) return false;

    let uvTexture = textures.value?.uv;
    let recreated = false;

    if (!uvTexture || uvW !== width || uvH !== height) {
      if (uvTexture) uvTexture.destroy();
      uvW = width; uvH = height;
      recreated = true;
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
    const isVideo = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
    let copySource: any = isVideo && useVideoCanvasFallback ? videoFrameToCanvas(source, width, height) : source;
    try {
      device.queue.copyExternalImageToTexture({ source: copySource, flipY }, { texture: uvTexture }, [width, height]);
    } catch (e) {
      // Firefox rejects an unsupported source type with a synchronous TypeError (WebIDL
      // union mismatch). Only that specific failure triggers the 2D-canvas fallback, so a
      // transient/unrelated GPU error doesn't permanently switch us off the fast path.
      if (isVideo && !useVideoCanvasFallback && e instanceof TypeError) {
        useVideoCanvasFallback = true;
        copySource = videoFrameToCanvas(source, width, height);
        device.queue.copyExternalImageToTexture({ source: copySource, flipY }, { texture: uvTexture }, [width, height]);
      } else {
        throw e;
      }
    }
    return recreated;
  }

  function updatePaintTexture(source: HTMLCanvasElement): boolean {
    if (!core) return false;
    const { device } = core;
    const width = source.width;
    const height = source.height;
    if (width <= 0 || height <= 0) return false;

    let paintTexture = textures.value?.paint;
    let recreated = false;

    if (!paintTexture || paintW !== width || paintH !== height) {
      if (paintTexture) paintTexture.destroy();
      paintW = width; paintH = height;
      recreated = true;
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
    return recreated;
  }

  return {
    textures,
    updateUVTexture,
    updatePaintTexture
  };
}
