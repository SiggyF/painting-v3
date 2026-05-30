export interface ParticlePipelines {
  compute: GPUComputePipeline;
  render: GPURenderPipeline;
}

export function createParticlePipelines(
  device: GPUDevice,
  shaderModule: GPUShaderModule,
  format: GPUTextureFormat
): ParticlePipelines {
  const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 32, // 32 bytes per particle
    stepMode: 'vertex',
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

  const compute = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shaderModule,
      entryPoint: 'compute_main',
    },
  });

  const render = device.createRenderPipeline({
    layout: 'auto',
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
      topology: 'point-list',
    },
  });

  return { compute, render };
}
