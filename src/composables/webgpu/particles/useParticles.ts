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
  let renderBG: GPUBindGroup;
  let hasLoggedCreate = false;

  let particleAccumTex: GPUTexture | null = null;
  let particleAccumView: GPUTextureView | null = null;
  let copyBG: GPUBindGroup | null = null;
  let width = 0;
  let height = 0;

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
      
      // time, speed, aspect, flipv, uvScale, dt, particleSize, particleOpacity
      uniformBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

      createBindGroups();

      isInitialized.value = true;
    } catch (e: any) {
      error.value = e.message;
      console.error("Particle System Init Error:", e);
    }
  }

  function createCopyBindGroup() {
    if (!core || !pipes || !particleAccumView) return;
    const { device } = core;
    try {
      copyBG = device.createBindGroup({
        layout: pipes.copyBindGroupLayout,
        entries: [
          { binding: 4, resource: particleAccumView },
          { binding: 5, resource: uvSampler }
        ]
      });
    } catch (err) {
      console.error("Error creating particle copy bind group:", err);
    }
  }

  function createBindGroups() {
    if (!hasLoggedCreate) {
      console.log("createBindGroups called in useParticles.ts (first execution)");
    }
    if (!core || !pipes || !buffers) {
      if (!hasLoggedCreate) {
        console.warn("createBindGroups early return: core, pipes, or buffers not ready", { core: !!core, pipes: !!pipes, buffers: !!buffers });
      }
      return;
    }
    const { device } = core;
    const shared = getShared();
    if (!shared) {
      if (!hasLoggedCreate) {
        console.warn("createBindGroups early return: getShared() returned null");
      }
      return;
    }
    if (!shared.uv) {
      if (!hasLoggedCreate) {
        console.warn("createBindGroups early return: shared.uv is missing");
      }
      return;
    }

    try {
      if (!hasLoggedCreate) {
        console.log("Creating computeBG...");
      }
      computeBG = device.createBindGroup({
        layout: pipes.computeBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: buffers.particleBuffer } },
          { binding: 1, resource: { buffer: uniformBuf } },
          { binding: 2, resource: shared.uv.createView() },
          { binding: 3, resource: uvSampler },
        ]
      });
      if (!hasLoggedCreate) {
        console.log("computeBG created successfully:", !!computeBG);
      }

      if (!hasLoggedCreate) {
        console.log("Creating renderBG...");
      }
      renderBG = device.createBindGroup({
        layout: pipes.renderBindGroupLayout,
        entries: [
          { binding: 1, resource: { buffer: uniformBuf } }
        ]
      });
      if (!hasLoggedCreate) {
        console.log("renderBG created successfully:", !!renderBG);
      }

      createCopyBindGroup();

      if (!hasLoggedCreate) {
        hasLoggedCreate = true;
      }
    } catch (err) {
      console.error("Error creating particle bind groups:", err);
    }
  }

  // Exposed so it can be called if shared textures are resized/recreated
  function rebind() {
    createBindGroups();
  }

  function resize(w: number, h: number) {
    if (!core) return;
    const { device, format } = core;
    
    // Standardize bounds and fail fast on invalid dimensions
    const roundedW = Math.max(1, Math.floor(w));
    const roundedH = Math.max(1, Math.floor(h));
    
    if (roundedW === width && roundedH === height && particleAccumTex) return;
    
    width = roundedW;
    height = roundedH;

    if (particleAccumTex) {
      particleAccumTex.destroy();
    }

    particleAccumTex = device.createTexture({
      label: 'Particle Trail Accumulation Texture',
      size: [width, height],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
    });
    particleAccumView = particleAccumTex.createView();

    // Clear the newly created texture to transparent
    const commandEncoder = device.createCommandEncoder();
    const rp = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: particleAccumView,
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store'
      }]
    });
    rp.end();
    device.queue.submit([commandEncoder.finish()]);

    createCopyBindGroup();
  }

  function render(params: any, dt: number) {
    if (!isInitialized.value || !context || !core) {
      return;
    }
    const { device } = core;

    const activeCount = Math.min(params.particleCount ?? 65536, buffers.particleCount);
    if (activeCount <= 0) {
      // If trails are active, we still need to fade and copy the background, 
      // but if trails are off, we can skip everything.
      if (!(params.particleTrail && params.particleTrail > 0.0)) {
        // Clear canvas if needed (if this is the only layer drawing)
        // But usually particles are additive over something else.
        return;
      }
    }

    // Safety checks for bind groups to fail fast and log clear warnings
    if (!computeBG || !renderBG) {
      console.error("Skipping particle render: bind groups are not ready!", { computeBG: !!computeBG, renderBG: !!renderBG });
      return;
    }

    // Update uniforms
    const uniformData = new Float32Array([
      params.time, params.speed, params.aspect, params.flipv,
      params.uvScale, dt,
      params.particleSize ?? 0.003, params.particleOpacity ?? 0.25,
      params.particleColorMode ?? 0.0,
      params.particleColorR ?? 1.0,
      params.particleColorG ?? 1.0,
      params.particleColorB ?? 1.0,
      params.particleColormapId ?? 0.0, 0.0, 0.0, 0.0
    ]);
    device.queue.writeBuffer(uniformBuf, 0, uniformData);


    const commandEncoder = device.createCommandEncoder();

    // 1. Compute Pass: Advect particles (skip if count is 0)
    if (activeCount > 0) {
      const cp = commandEncoder.beginComputePass();
      cp.setPipeline(pipes.compute);
      cp.setBindGroup(0, computeBG);
      const workgroupCount = Math.ceil(activeCount / 64);
      cp.dispatchWorkgroups(workgroupCount);
      cp.end();
    }

    const canvasView = context.getCurrentTexture().createView();
    const hasTrail = params.particleTrail && params.particleTrail > 0.0;

    if (hasTrail) {
      // Ensure accumulation texture is resized and created
      if (!particleAccumTex || width !== context.canvas.width || height !== context.canvas.height) {
        resize(context.canvas.width, context.canvas.height);
      }

      if (particleAccumView && copyBG) {
        // 2a. Fade & Render Pass on Accumulation Texture
        const rp = commandEncoder.beginRenderPass({
          colorAttachments: [{
            view: particleAccumView,
            loadOp: 'load',
            storeOp: 'store'
          }]
        });
        
        // Multiply previous frames' particles by decay factor
        rp.setPipeline(pipes.fade);
        const decay = params.particleTrail;
        rp.setBlendConstant([decay, decay, decay, decay]);
        rp.draw(3);

        // Draw new particles with additive blending (if any)
        if (activeCount > 0) {
          rp.setPipeline(pipes.render);
          rp.setBindGroup(0, renderBG);
          rp.setVertexBuffer(0, buffers.particleBuffer);
          rp.draw(6, activeCount);
        }
        rp.end();

        // 3a. Copy Pass: Render accumulation texture to canvas swapchain
        const copyRp = commandEncoder.beginRenderPass({
          colorAttachments: [{
            view: canvasView,
            loadOp: 'clear',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            storeOp: 'store'
          }]
        });
        copyRp.setPipeline(pipes.copy);
        copyRp.setBindGroup(0, copyBG);
        copyRp.draw(3);
        copyRp.end();
      }
    } else {
      // 2b. Draw directly to canvas (standard rendering, no trails)
      const rp = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: canvasView,
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, // Transparent background
          storeOp: 'store'
        }]
      });
      if (activeCount > 0) {
        rp.setPipeline(pipes.render);
        rp.setBindGroup(0, renderBG);
        rp.setVertexBuffer(0, buffers.particleBuffer);
        rp.draw(6, activeCount);
      }
      rp.end();
    }

    device.queue.submit([commandEncoder.finish()]);
  }

  async function inspectPixel(x: number, y: number) {
    if (!core || !particleAccumTex) return null;
    const { device } = core;
    
    const readBuffer = device.createBuffer({
      size: 16, // 4 floats (RGBA16float is 8 bytes, but let's read as float32 for simplicity or just 16 bytes)
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      { texture: particleAccumTex, origin: [Math.floor(x), Math.floor(y), 0] },
      { buffer: readBuffer, bytesPerRow: 256 }, // bytesPerRow must be multiple of 256 for some operations, but for 1x1 it depends.
      { width: 1, height: 1 }
    );
    device.queue.submit([commandEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const result = new Uint16Array(readBuffer.getMappedRange()); // It's rgba16float
    const values = [
      decodeFloat16(result[0]),
      decodeFloat16(result[1]),
      decodeFloat16(result[2]),
      decodeFloat16(result[3])
    ];
    readBuffer.unmap();
    readBuffer.destroy();
    return values;
  }

  function decodeFloat16(h: number) {
    const s = (h & 0x8000) >> 15;
    const e = (h & 0x7C00) >> 10;
    const f = h & 0x03FF;
    if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
    if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
  }

  async function runDiagnostics() {
    if (!core || !pipes || !particleAccumView) return;
    const { device } = core;
    console.log("Starting Particle Trail Diagnostic...");

    // 1. Clear to opaque white
    const commandEncoder = device.createCommandEncoder();
    const rp = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: particleAccumView,
        loadOp: 'clear',
        clearValue: { r: 1, g: 1, b: 1, a: 1 },
        storeOp: 'store'
      }]
    });
    rp.end();
    device.queue.submit([commandEncoder.finish()]);

    // 2. Run fade 60 times with 0.95 decay
    const decay = 0.95;
    for (let i = 0; i < 60; i++) {
      const enc = device.createCommandEncoder();
      const fadeRp = enc.beginRenderPass({
        colorAttachments: [{
          view: particleAccumView,
          loadOp: 'load',
          storeOp: 'store'
        }]
      });
      fadeRp.setPipeline(pipes.fade);
      fadeRp.setBlendConstant([decay, decay, decay, decay]);
      fadeRp.draw(3);
      fadeRp.end();
      device.queue.submit([enc.finish()]);
    }

    // 3. Inspect result
    const values = await inspectPixel(0, 0);
    console.log("Diagnostic Results (after 60 steps at 0.95 decay):", values);
    const isZero = values?.every(v => v < 0.001);
    console.log(isZero ? "✅ TEST PASSED: Trails fade to zero." : "❌ TEST FAILED: Trails are ghosting.");
  }

  return {
    init,
    render,
    rebind,
    resize,
    inspectPixel,
    runDiagnostics,
    isInitialized,
    error
  };
}


