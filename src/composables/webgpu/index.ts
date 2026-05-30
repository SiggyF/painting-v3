import { ref } from 'vue';
import type { GPUParams } from './types';
import { initWebGPU, type GPUCore } from './core';
import { createSimulationTextures, clearAllTextures, type GPUTextures } from './textures';
import { createSimulationPipelines, type GPUPipelines } from './pipelines';
import { buildAdvectShader } from './schemes';
import fluidShaderSource from '../../shaders/fluid.wgsl?raw';

export type { GPUParams };

export function useWebGPU() {
  const isInitialized = ref(false);
  const error = ref<string | null>(null);

  let core: GPUCore;
  let textures: GPUTextures;
  let pipes: GPUPipelines;

  let sampler: GPUSampler;
  let uvSampler: GPUSampler;
  let uniformBuf: GPUBuffer;
  let statsBuf: GPUBuffer;
  let readBuf: GPUBuffer;

  let advectBGs: GPUBindGroup[] = [];
  let advectBGs2: GPUBindGroup[] = [];
  let renderBGs: GPUBindGroup[] = [];
  let sourceBGs: GPUBindGroup[] = [];
  let statsBGs: GPUBindGroup[] = [];

  let stateIdx = 0;
  const activeColor = ref([1.0, 0.1, 0.4]);

  function updateActiveColor(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    activeColor.value = [r, g, b];
  }

  async function init(canvas?: HTMLCanvasElement, options?: { width?: number; height?: number }) {
    try {
      core = await initWebGPU(canvas, options);
      const { device, format } = core;

      sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
      uvSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

      textures = createSimulationTextures(device, core.simW, core.simH);
      
      uniformBuf = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      statsBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      readBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

      const shaderModule = device.createShaderModule({ code: fluidShaderSource });
      pipes = createSimulationPipelines(device, shaderModule, format);

      await compileAdvectPipeline();
      isInitialized.value = true;
    } catch (e: any) {
      error.value = e.message;
      console.error("WebGPU Init Error:", e);
    }
  }

  function createBindGroups() {
    const { device } = core;
    advectBGs = []; advectBGs2 = []; renderBGs = []; statsBGs = []; sourceBGs = [];

    [0, 1].forEach(i => {
      const read = i, write = (i + 1) % 2;
      
      sourceBGs.push(device.createBindGroup({
        layout: pipes.source.getBindGroupLayout(0),
        entries: [
          { binding: 3, resource: uvSampler },
          { binding: 6, resource: textures.paint.createView() }
        ]
      }));

      advectBGs.push(device.createBindGroup({
        layout: pipes.advect.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: textures.state[read].createView() },
          { binding: 2, resource: { buffer: uniformBuf } },
          { binding: 3, resource: uvSampler },
          { binding: 4, resource: textures.uv.createView() },
          { binding: 5, resource: textures.source.createView() } 
        ]
      }));

      if (pipes.advect2) {
        advectBGs2.push(device.createBindGroup({
          layout: pipes.advect2.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: textures.temp.createView() },
            { binding: 2, resource: { buffer: uniformBuf } },
            { binding: 3, resource: uvSampler },
            { binding: 4, resource: textures.uv.createView() },
            { binding: 5, resource: textures.source.createView() },
            { binding: 7, resource: textures.state[read].createView() }
          ]
        }));
      }

      renderBGs.push(device.createBindGroup({
        layout: pipes.render.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: textures.state[write].createView() },
          { binding: 2, resource: { buffer: uniformBuf } },
          { binding: 3, resource: uvSampler },
          { binding: 4, resource: textures.uv.createView() }
        ]
      }));

      statsBGs.push(device.createBindGroup({
        layout: pipes.stats.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: textures.state[write].createView() },
          { binding: 1, resource: { buffer: statsBuf } }
        ]
      }));
    });
  }

  async function compileAdvectPipeline(customAdvectCode?: string) {
    const { device } = core;
    const { shaderModule, success, messages } = await buildAdvectShader(device, customAdvectCode);
    
    if (!success) return { success, messages };

    pipes.advect = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: shaderModule, entryPoint: 'vertex_main' },
      fragment: { module: shaderModule, entryPoint: 'advect_main', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' }
    });

    if (customAdvectCode?.includes('fn sampleAdvectionCorrector')) {
      pipes.advect2 = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vertex_main' },
        fragment: { module: shaderModule, entryPoint: 'advect_main2', targets: [{ format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list' }
      });
    } else {
      pipes.advect2 = null;
    }

    createBindGroups();
    return { success, messages };
  }

  function updateUVTexture(source: any, flipY: boolean = false) {
    if (!core || !isInitialized.value) return;
    const { device } = core;
    
    if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement && source.readyState < 2) return;

    let width = source.videoWidth || source.naturalWidth || source.width;
    let height = source.videoHeight || source.naturalHeight || source.height;
    if (width <= 0 || height <= 0) return;

    if (textures.uv.width !== width || textures.uv.height !== height) {
      textures.uv = device.createTexture({
        size: [width, height], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      createBindGroups();
    }
    device.queue.copyExternalImageToTexture({ source, flipY }, { texture: textures.uv }, [width, height]);
  }

  function updatePaintTexture(source: any) {
    if (!core || !isInitialized.value) return;
    const { device } = core;
    const width = source.width;
    const height = source.height;
    if (width <= 0 || height <= 0) return;

    if (textures.paint.width !== width || textures.paint.height !== height) {
      textures.paint = device.createTexture({
        size: [width, height], format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      createBindGroups();
    }
    device.queue.copyExternalImageToTexture({ source, flipY: false }, { texture: textures.paint }, [width, height]);
  }

  function render(params: GPUParams) {
    if (!isInitialized.value) return;
    const { device, context } = core;

    const uniformData = new Float32Array([
      params.speed, params.blend, params.time, params.aspect,
      params.noiseScale, params.mouseX, params.mouseY, params.isDrawing,
      params.mouseDirX, params.mouseDirY, params.uvScale, params.flipv,
      params.mouseRadius, params.decay, params.viscosity, params.scheme,
      activeColor.value[0], activeColor.value[1], activeColor.value[2], params.analytical || 0.0
    ]);
    device.queue.writeBuffer(uniformBuf, 0, uniformData);

    const commandEncoder = device.createCommandEncoder();

    // 1. Source injection
    const sp = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textures.source.createView(),
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store'
      }]
    });
    sp.setPipeline(pipes.source);
    sp.setBindGroup(0, sourceBGs[stateIdx]);
    sp.draw(3);
    sp.end();

    // 2. Advection (Explicit Finite Volume or Semi-Lagrangian)
    const advectSteps = (params.scheme >= 4.0 && params.scheme <= 8.0) ? 4 : 1;
    for (let s = 0; s < advectSteps; s++) {
        const nextStateIdx = (stateIdx + 1) % 2;
        const ap = commandEncoder.beginRenderPass({
          colorAttachments: [{
            view: (pipes.advect2 ? textures.temp : textures.state[nextStateIdx]).createView(),
            loadOp: 'clear',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            storeOp: 'store'
          }]
        });
        ap.setPipeline(pipes.advect);
        ap.setBindGroup(0, advectBGs[stateIdx]);
        ap.draw(3);
        ap.end();

        if (pipes.advect2) {
          const ap2 = commandEncoder.beginRenderPass({
            colorAttachments: [{
              view: textures.state[nextStateIdx].createView(),
              loadOp: 'clear',
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              storeOp: 'store'
            }]
          });
          ap2.setPipeline(pipes.advect2);
          ap2.setBindGroup(0, advectBGs2[stateIdx]);
          ap2.draw(3);
          ap2.end();
        }
        stateIdx = nextStateIdx;
    }

    // 3. Stats
    commandEncoder.clearBuffer(statsBuf);
    const cp = commandEncoder.beginComputePass();
    cp.setPipeline(pipes.stats);
    cp.setBindGroup(0, statsBGs[(stateIdx + 1) % 2]);
    cp.dispatchWorkgroups(Math.ceil(core.simW / 16), Math.ceil(core.simH / 16));
    cp.end();
    commandEncoder.copyBufferToBuffer(statsBuf, 0, readBuf, 0, 64);

    // 4. Final Render
    if (context) {
      const rp = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: 'store'
        }]
      });
      rp.setPipeline(pipes.render);
      rp.setBindGroup(0, renderBGs[(stateIdx + 1) % 2]);
      rp.draw(3);
      rp.end();
    }

    device.queue.submit([commandEncoder.finish()]);
  }

  function loadPaintCanvasToSimulation(shouldClear = false) {
    if (!core || !isInitialized.value) return;
    const { device } = core;
    const commandEncoder = device.createCommandEncoder();
    
    for (let i = 0; i < 2; i++) {
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textures.state[i].createView(),
          loadOp: shouldClear ? 'clear' : 'load',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: 'store'
        }]
      });
      passEncoder.setPipeline(pipes.source);
      passEncoder.setBindGroup(0, sourceBGs[i]);
      passEncoder.draw(3);
      passEncoder.end();
    }
    device.queue.submit([commandEncoder.finish()]);
  }

  async function getStats() {
    if (!isInitialized.value) return null;
    await readBuf.mapAsync(GPUMapMode.READ);
    const data = new Uint32Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();
    return data;
  }

  function resize(width: number, height: number) {
    if (!isInitialized.value || width <= 0 || height <= 0) return;
    const { device } = core;
    core.simW = width; core.simH = height;

    // Destroy simulation-sized textures
    textures.state.forEach(t => t.destroy());
    textures.source.destroy();
    textures.temp.destroy();

    // Recreate only simulation-sized textures
    textures.state = [0, 1].map(() => device.createTexture({
      size: [width, height],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC
    }));

    textures.source = device.createTexture({
      size: [width, height],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
    });

    textures.temp = device.createTexture({
      size: [width, height],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    });

    createBindGroups();
  }

  return {
    init, render, resize,
    updateUVTexture, updatePaintTexture,
    clearTextures: () => clearAllTextures(core.device, textures),
    clearSource: () => {
      const enc = core.device.createCommandEncoder();
      const pass = enc.beginRenderPass({ colorAttachments: [{ view: textures.source.createView(), loadOp: 'clear', clearValue: {r:0,g:0,b:0,a:0}, storeOp: 'store' }] });
      pass.end();
      core.device.queue.submit([enc.finish()]);
    },
    updateActiveColor, activeColor,
    loadPaintCanvasToSimulation,
    compileAdvectPipeline, getStats,
    isInitialized, error
  };
}
