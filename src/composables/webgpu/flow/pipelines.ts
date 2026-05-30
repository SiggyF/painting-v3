export interface GPUPipelines {
  advect: GPURenderPipeline;
  advect2: GPURenderPipeline | null;
  render: GPURenderPipeline;
  source: GPURenderPipeline;
  stats: GPUComputePipeline;
}

export function createSimulationPipelines(
  device: GPUDevice, 
  shaderModule: GPUShaderModule, 
  format: GPUTextureFormat
): GPUPipelines {
  const render = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: shaderModule, entryPoint: 'vertex_main' },
    fragment: { module: shaderModule, entryPoint: 'render_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' }
  });

  const source = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: shaderModule, entryPoint: 'vertex_main' },
    fragment: { 
      module: shaderModule, 
      entryPoint: 'source_main', 
      targets: [{ 
        format: 'rgba16float',
        blend: {
          color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
          alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' }
        }
      }] 
    },
    primitive: { topology: 'triangle-list' }
  });

  const stats = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shaderModule, entryPoint: 'stats_main' }
  });

  // These will be properly set by schemes module
  const advect = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shaderModule, entryPoint: 'vertex_main' },
      fragment: { module: shaderModule, entryPoint: 'advect_main', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' }
  });

  return { advect, advect2: null, render, source, stats };
}
