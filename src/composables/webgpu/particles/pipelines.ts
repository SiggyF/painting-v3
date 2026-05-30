export interface ParticlePipelines {
  compute: GPUComputePipeline;
  render: GPURenderPipeline;
  fade: GPURenderPipeline;
  copy: GPURenderPipeline;
  computeBindGroupLayout: GPUBindGroupLayout;
  renderBindGroupLayout: GPUBindGroupLayout;
  copyBindGroupLayout: GPUBindGroupLayout;
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

  // Explicit bind group layout for compute stage (all bindings visible to compute)
  const computeBindGroupLayout = device.createBindGroupLayout({
    label: 'Particle Compute Bind Group Layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
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

  // Explicit bind group layout for render stage (only uniforms visible to vertex)
  // This prevents binding the storage/particle buffer in the render pass, avoiding usage collision with the vertex buffer.
  const renderBindGroupLayout = device.createBindGroupLayout({
    label: 'Particle Render Bind Group Layout',
    entries: [
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' }
      }
    ]
  });


  // Explicit bind group layout for copy stage (sampling the accumulation texture)
  const copyBindGroupLayout = device.createBindGroupLayout({
    label: 'Particle Copy Bind Group Layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' }
      }
    ]
  });

  const computePipelineLayout = device.createPipelineLayout({
    label: 'Particle Compute Pipeline Layout',
    bindGroupLayouts: [computeBindGroupLayout]
  });

  const renderPipelineLayout = device.createPipelineLayout({
    label: 'Particle Render Pipeline Layout',
    bindGroupLayouts: [renderBindGroupLayout]
  });

  const fadePipelineLayout = device.createPipelineLayout({
    label: 'Particle Fade Pipeline Layout',
    bindGroupLayouts: []
  });

  const copyPipelineLayout = device.createPipelineLayout({
    label: 'Particle Copy Pipeline Layout',
    bindGroupLayouts: [copyBindGroupLayout]
  });

  const compute = device.createComputePipeline({
    layout: computePipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: 'compute_main',
    },
  });

  const render = device.createRenderPipeline({
    layout: renderPipelineLayout,
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
              srcFactor: 'one',
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

  const fade = device.createRenderPipeline({
    layout: fadePipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'screen_vertex_main',
      buffers: [],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fade_fragment_main',
      targets: [
        {
          format,
          blend: {
            color: {
              srcFactor: 'zero',
              dstFactor: 'constant',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'zero',
              dstFactor: 'constant',
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

  const copy = device.createRenderPipeline({
    layout: copyPipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'screen_vertex_main',
      buffers: [],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'screen_fragment_main',
      targets: [
        {
          format,
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  return { 
    compute, 
    render, 
    fade, 
    copy, 
    computeBindGroupLayout, 
    renderBindGroupLayout, 
    copyBindGroupLayout 
  };
}

