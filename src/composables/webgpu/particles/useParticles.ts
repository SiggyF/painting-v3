import { ref, type Ref } from 'vue';
import type { GPUCore } from '../core';
import type { SharedTextures } from '../shared';
import { createParticleBuffers, type ParticleBuffers } from './buffers';
import { createParticlePipelines, type ParticlePipelines } from './pipelines';
import particleShaderSource from '../../../shaders/particles.wgsl?raw';

export function useParticles() {
  const isInitialized = ref(false);
  const error = ref<string | null>(null);

  let core: GPUCore;
  let context: GPUCanvasContext | undefined;
  let sharedRef: Ref<SharedTextures | null> | SharedTextures | null = null;
  let buffers: ParticleBuffers;
  let pipes: ParticlePipelines;

  let uvSampler: GPUSampler;
  let uniformBuf: GPUBuffer;
  let computeBG: GPUBindGroup;

  function getShared(): SharedTextures | null {
    if (!sharedRef) return null;
    return ('value' in sharedRef) ? sharedRef.value : sharedRef;
  }

  async function init(
    coreInstance: GPUCore,
    sharedTextures: Ref<SharedTextures | null> | SharedTextures | null,
    canvasContext?: GPUCanvasContext,
    particleCount = 65536
  ) {
    try {
      core = coreInstance;
      context = canvasContext;
      sharedRef = sharedTextures;
      const { device, format } = core;

      const shaderModule = device.createShaderModule({ code: particleShaderSource });
      pipes = createParticlePipelines(device, shaderModule, format);
      buffers = createParticleBuffers(device, particleCount);

      uvSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
      
      // time, speed, aspect, flipv, uvScale, dt
      uniformBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

      createBindGroups();

      isInitialized.value = true;
    } catch (e: any) {
      error.value = e.message;
      console.error("Particle System Init Error:", e);
    }
  }

  function createBindGroups() {
    if (!core || !pipes || !buffers) return;
    const { device } = core;
    const shared = getShared();
    if (!shared || !shared.uv) return;

    computeBG = device.createBindGroup({
      layout: pipes.compute.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buffers.particleBuffer } },
        { binding: 1, resource: { buffer: uniformBuf } },
        { binding: 2, resource: shared.uv.createView() },
        { binding: 3, resource: uvSampler },
      ]
    });
  }

  // Exposed so it can be called if shared textures are resized/recreated
  function rebind() {
    createBindGroups();
  }

  function render(params: any, dt: number) {
    if (!isInitialized.value || !context || !core) return;
    const { device } = core;

    // Update uniforms
    const uniformData = new Float32Array([
      params.time, params.speed, params.aspect, params.flipv,
      params.uvScale, dt
    ]);
    device.queue.writeBuffer(uniformBuf, 0, uniformData);

    const commandEncoder = device.createCommandEncoder();

    // 1. Compute Pass: Advect particles
    const cp = commandEncoder.beginComputePass();
    cp.setPipeline(pipes.compute);
    cp.setBindGroup(0, computeBG);
    const workgroupCount = Math.ceil(buffers.particleCount / 64);
    cp.dispatchWorkgroups(workgroupCount);
    cp.end();

    // 2. Render Pass: Draw particles
    const rp = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 }, // Transparent background
        storeOp: 'store'
      }]
    });
    rp.setPipeline(pipes.render);
    rp.setVertexBuffer(0, buffers.particleBuffer);
    rp.draw(6, buffers.particleCount);
    rp.end();

    device.queue.submit([commandEncoder.finish()]);
  }

  return {
    init,
    render,
    rebind,
    isInitialized,
    error
  };
}
