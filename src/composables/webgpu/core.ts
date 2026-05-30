export interface GPUCore {
  device: GPUDevice;
  context?: GPUCanvasContext;
  format: GPUTextureFormat;
  simW: number;
  simH: number;
}

export async function initWebGPU(
  canvas?: HTMLCanvasElement,
  options?: { width?: number; height?: number }
): Promise<GPUCore> {
  if (!navigator.gpu) throw new Error("WebGPU Not Supported");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No GPU adapter found");
  const device = await adapter.requestDevice();

  let context: GPUCanvasContext | undefined = undefined;
  let format: GPUTextureFormat = 'rgba8unorm';
  let simW = options?.width || 512;
  let simH = options?.height || 512;

  if (canvas) {
    context = canvas.getContext('webgpu') as GPUCanvasContext;
    format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });
    simW = canvas.width;
    simH = canvas.height;
  }

  return {
    device,
    context,
    format,
    simW,
    simH
  };
}
