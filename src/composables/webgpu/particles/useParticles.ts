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
  let particleBG: GPUBindGroup;

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
    console.log("createBindGroups called in useParticles.ts");
    if (!core || !pipes || !buffers) {
      console.warn("createBindGroups early return: core, pipes, or buffers not ready", { core: !!core, pipes: !!pipes, buffers: !!buffers });
      return;
    }
    const { device } = core;
    const shared = getShared();
    if (!shared) {
      console.warn("createBindGroups early return: getShared() returned null");
      return;
    }
    if (!shared.uv) {
      console.warn("createBindGroups early return: shared.uv is missing");
      return;
    }

    try {
      console.log("Creating particleBG...");
      particleBG = device.createBindGroup({
        layout: pipes.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: buffers.particleBuffer } },
          { binding: 1, resource: { buffer: uniformBuf } },
          { binding: 2, resource: shared.uv.createView() },
          { binding: 3, resource: uvSampler },
        ]
      });
      console.log("particleBG created successfully:", !!particleBG);
    } catch (err) {
      console.error("Error creating particle bind group:", err);
    }
  }

  // Exposed so it can be called if shared textures are resized/recreated
  function rebind() {
    createBindGroups();
  }

  function render(params: any, dt: number) {
    if (!isInitialized.value || !context || !core) {
      return;
    }
    const { device } = core;

    // Safety checks for bind groups to fail fast and log clear warnings
    if (!particleBG) {
      console.error("Skipping particle render: bind group is not ready!");
      return;
    }

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
    cp.setBindGroup(0, particleBG);
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
    rp.setBindGroup(0, particleBG);
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
