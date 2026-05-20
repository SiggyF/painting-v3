import { ref } from 'vue';
import fluidShaderSource from '../shaders/fluid.wgsl?raw';

export interface GPUParams {
  speed: number;
  blend: number;
  time: number;
  aspect: number;
  scale: number;
  mouseX: number;
  mouseY: number;
  isDrawing: number;
  mouseDirX: number;
  mouseDirY: number;
  uvScale: number;
  flipv: number;
  mouseRadius: number;
  decay: number;
}

export function useWebGPU() {
  const isInitialized = ref(false);
  const error = ref<string | null>(null);

  let device: GPUDevice;
  let context: GPUCanvasContext;
  let format: GPUTextureFormat;
  let advectPipe: GPURenderPipeline;
  let renderPipe: GPURenderPipeline;
  let sourcePipe: GPURenderPipeline; // New: pipeline for persistent sources
  let statsPipe: GPUComputePipeline;
  let sampler: GPUSampler;
  let uniformBuf: GPUBuffer;
  let statsBuf: GPUBuffer;
  let readBuf: GPUBuffer;
  
  let uvTex: GPUTexture;
  let sourceTex: GPUTexture; // New: persistent source texture
  let uvSampler: GPUSampler;

  let textures: GPUTexture[] = [];
  let advectBGs: GPUBindGroup[] = [];
  let renderBGs: GPUBindGroup[] = [];
  let sourceBGs: GPUBindGroup[] = []; // New: bind groups for source pass
  let statsBGs: GPUBindGroup[] = [];
  
  let frame = 0;
  let simW = 0, simH = 0;

  const activeColor = ref([1.0, 0.1, 0.4]); // Default Pink

  function updateActiveColor(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    activeColor.value = [r, g, b];
  }

  async function init(canvas: HTMLCanvasElement) {
    try {
      if (!navigator.gpu) throw new Error("WebGPU Not Supported");
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("No GPU adapter found");
      device = await adapter.requestDevice();
      context = canvas.getContext('webgpu') as GPUCanvasContext;
      format = navigator.gpu.getPreferredCanvasFormat();

      simW = canvas.width;
      simH = canvas.height;

      context.configure({ device, format, alphaMode: 'premultiplied' });

      sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
      uvSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
      
      // Default empty UV texture (1x1)
      uvTex = device.createTexture({
          size: [1, 1],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
      });

      uniformBuf = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      statsBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
      readBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

      createResources();
      clearTextures(); // Added: ensure textures are empty on start

      const shaderModule = device.createShaderModule({ code: fluidShaderSource });

      sourcePipe = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vertex_main' },
        fragment: { module: shaderModule, entryPoint: 'source_main', targets: [{ format: 'rgba16float', blend: {
          color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
        } }] },
        primitive: { topology: 'triangle-list' }
      });

      advectPipe = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vertex_main' },
        fragment: { module: shaderModule, entryPoint: 'advect_main', targets: [{ format: 'rgba16float' }] },
        primitive: { topology: 'triangle-list' }
      });

      renderPipe = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vertex_main' },
        fragment: { module: shaderModule, entryPoint: 'render_main', targets: [{ format }] },
        primitive: { topology: 'triangle-list' }
      });

      statsPipe = device.createComputePipeline({
        layout: 'auto',
        compute: { module: shaderModule, entryPoint: 'stats_main' }
      });

      createBindGroups();
      isInitialized.value = true;
    } catch (e: any) {
      error.value = e.message;
      console.error("WebGPU Init Error:", e);
    }
  }

  function createResources() {
    textures = [0, 1].map(() => device.createTexture({
      size: [simW, simH], format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING
    }));
    sourceTex = device.createTexture({
      size: [simW, simH], format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
    });
  }

  function createBindGroups() {
    advectBGs = []; renderBGs = []; statsBGs = []; sourceBGs = [];
    [0, 1].forEach(i => {
      const read = i, write = (i + 1) % 2;
      
      sourceBGs.push(device.createBindGroup({
        layout: sourcePipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: { buffer: uniformBuf } }
        ]
      }));

      advectBGs.push(device.createBindGroup({
        layout: advectPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: textures[read].createView() },
          { binding: 2, resource: { buffer: uniformBuf } },
          { binding: 3, resource: uvSampler },
          { binding: 4, resource: uvTex.createView() },
          { binding: 5, resource: sourceTex.createView() } // Add sourceTex binding
        ]
      }));
      renderBGs.push(device.createBindGroup({
        layout: renderPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: textures[write].createView() },
          { binding: 2, resource: { buffer: uniformBuf } }
        ]
      }));
      statsBGs.push(device.createBindGroup({
        layout: statsPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: textures[write].createView() },
          { binding: 1, resource: { buffer: statsBuf } }
        ]
      }));
    });
  }

  function updateUVTexture(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
    if (!device || !isInitialized.value) return;
    
    // Safety check for video readiness
    if (source instanceof HTMLVideoElement && source.readyState < 2) return;

    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    
    if (width <= 0 || height <= 0) return;

    if (uvTex.width !== width || uvTex.height !== height) {
        uvTex = device.createTexture({
            size: [width, height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        createBindGroups(); 
    }
    
    try {
      device.queue.copyExternalImageToTexture(
          { source, flipY: false },
          { texture: uvTex },
          [width, height]
      );
    } catch (e) {
      if (Math.random() < 0.01) console.warn('UV Texture copy failed:', e);
    }
  }

  function clearTextures() {
    if (!device || !isInitialized.value) return;
    
    const commandEncoder = device.createCommandEncoder();
    [...textures, sourceTex].forEach(texture => {
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: texture.createView(),
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: 'store',
        }]
      });
      passEncoder.end();
    });
    device.queue.submit([commandEncoder.finish()]);
  }

  function resize(width: number, height: number) {
    if (!isInitialized.value) return;
    simW = width;
    simH = height;
    createResources();
    createBindGroups();
  }

  function render(params: GPUParams, persistent: boolean = false) {
    if (!isInitialized.value) return;

    device.queue.writeBuffer(uniformBuf, 0, new Float32Array([
      params.speed, params.blend, params.time, params.aspect,
      params.scale, params.mouseX, params.mouseY, params.isDrawing, 
      params.mouseDirX, params.mouseDirY, params.uvScale, params.flipv,
      params.mouseRadius, params.decay, 0.0, 0.0,
      activeColor.value[0], activeColor.value[1], activeColor.value[2], 1.0 // Add color
    ]));

    const idx = frame % 2;
    const encoder = device.createCommandEncoder();

    // 0. Source Pass (Draw into persistent sourceTex)
    // If not persistent, we clear the texture first
    const sp = encoder.beginRenderPass({ 
      colorAttachments: [{ 
        view: sourceTex.createView(), 
        loadOp: persistent ? 'load' : 'clear', 
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store' 
      }] 
    });
    sp.setPipeline(sourcePipe); 
    sp.setBindGroup(0, sourceBGs[idx]); 
    sp.draw(3); 
    sp.end();

    // 1. Advection Pass
    const ap = encoder.beginRenderPass({ 
      colorAttachments: [{ view: textures[(frame+1)%2].createView(), loadOp: 'load', storeOp: 'store' }] 
    });
    ap.setPipeline(advectPipe); 
    ap.setBindGroup(0, advectBGs[idx]); 
    ap.draw(3); 
    ap.end();

    // 2. Stats Compute Pass (Optional every N frames)
    if (frame % 5 === 0) {
      encoder.clearBuffer(statsBuf);
      const cp = encoder.beginComputePass();
      cp.setPipeline(statsPipe); 
      cp.setBindGroup(0, statsBGs[idx]);
      cp.dispatchWorkgroups(Math.ceil(simW/16), Math.ceil(simH/16)); 
      cp.end();
      encoder.copyBufferToBuffer(statsBuf, 0, readBuf, 0, 64);
    }

    // 3. Final Render Pass
    const rp = encoder.beginRenderPass({ 
      colorAttachments: [{ 
        view: context.getCurrentTexture().createView(), 
        loadOp: 'clear', 
        clearValue: {r:0,g:0,b:0,a:1}, 
        storeOp: 'store' 
      }] 
    });
    rp.setPipeline(renderPipe); 
    rp.setBindGroup(0, renderBGs[idx]); 
    rp.draw(3); 
    rp.end();

    device.queue.submit([encoder.finish()]);
    frame++;
  }

  async function getStats() {
    if (!isInitialized.value) return null;
    await readBuf.mapAsync(GPUMapMode.READ);
    const data = new Uint32Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();
    return data;
  }

  function clearSource() {
    if (!device || !isInitialized.value) return;
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: sourceTex.createView(),
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store',
      }]
    });
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  return { init, render, resize, getStats, updateUVTexture, clearTextures, clearSource, updateActiveColor, isInitialized, error };
}
