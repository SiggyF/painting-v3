export interface GPUTextures {
  state: GPUTexture[]; // Ping-pong buffers [0, 1]
  source: GPUTexture; // Persistent accumulation buffer
  temp: GPUTexture;    // Intermediate multi-pass buffer
}

export function createSimulationTextures(device: GPUDevice, width: number, height: number): GPUTextures {
  const state = [0, 1].map(() => device.createTexture({
    size: [width, height],
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC
  }));

  const source = device.createTexture({
    size: [width, height],
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
  });

  const temp = device.createTexture({
    size: [width, height],
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
  });

  return { state, source, temp };
}

export function clearAllTextures(device: GPUDevice, textures: GPUTextures) {
  const encoder = device.createCommandEncoder();
  
  // Clear primary simulation state and persistent source
  [...textures.state, textures.source, textures.temp].forEach(tex => {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: tex.createView(),
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store'
      }]
    });
    pass.end();
  });

  device.queue.submit([encoder.finish()]);
}
