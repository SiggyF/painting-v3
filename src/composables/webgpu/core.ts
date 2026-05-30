export interface GPUCore {
  device: GPUDevice;
  format: GPUTextureFormat;
  simW: number;
  simH: number;
}

export async function initWebGPU(simW = 512, simH = 512): Promise<GPUCore> {
  if (!navigator.gpu) throw new Error("WebGPU Not Supported");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No GPU adapter found");
  const device = await adapter.requestDevice();

  const format: GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();

  return {
    device,
    format,
    simW,
    simH
  };
}

