export interface ParticlePipelines {
  compute: GPUComputePipeline;
  render: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export function createParticlePipelines(
  device: GPUDevice,
  shaderModule: GPUShaderModule,
  format: GPUTextureFormat
): ParticlePipelines {
  const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 32, // 32 bytes per particle
    stepMode: 'instance',
    attributes: [
      {
        shaderLocation: 0,
        offset: 0,
        format: 'float32x2', // pos
      },
      {
        shaderLocation: 1,
        offset: 8,
        format: 'float32x2', // vel
      },
      {
        shaderLocation: 2,
        offset: 16,
        format: 'float32', // life
      }
    ],
  };

  // Explicit bind group layout for particles
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'Particle Bind Group Layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
        buffer: { type: 'uniform' }
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'float' }
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        sampler: { type: 'filtering' }
      }
    ]
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'Particle Pipeline Layout',
    bindGroupLayouts: [bindGroupLayout]
  });

  const compute = device.createComputePipeline({
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: 'compute_main',
    },
  });

  const render = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vertex_main',
      buffers: [vertexBufferLayout],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fragment_main',
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  return { compute, render, bindGroupLayout };
}
