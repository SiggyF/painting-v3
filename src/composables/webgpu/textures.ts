export interface GPUTextures {
  state: GPUTexture[]; // Ping-pong buffers [0, 1]
  source: GPUTexture; // Persistent accumulation buffer
  paint: GPUTexture;  // Raw 2D canvas texture
  uv: GPUTexture;     // Velocity/Mask texture
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

  const paint = device.createTexture({
    size: [1, 1], // Initial size, will be updated
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });

  const uv = device.createTexture({
    size: [1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
  });

  const temp = device.createTexture({
    size: [width, height],
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
  });

  return { state, source, paint, uv, temp };
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

  // Clear UV to neutral velocity (0.5, 0.5)
  const uvPass = encoder.beginRenderPass({
    colorAttachments: [{
      view: textures.uv.createView(),
      loadOp: 'clear',
      clearValue: { r: 0.5, g: 0.5, b: 0, a: 0 },
      storeOp: 'store'
    }]
  });
  uvPass.end();

  device.queue.submit([encoder.finish()]);
}
