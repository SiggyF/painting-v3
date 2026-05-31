import { ref } from 'vue';
import type { GPUCore } from '../core';
import waterLevelShaderSource from '../../../shaders/waterlevel.wgsl?raw';

export function useWaterLevel() {
  const isInitialized = ref(false);
  const error = ref<string | null>(null);

  let core: GPUCore;
  let context: GPUCanvasContext | undefined;
  let sharedTextures: any = null;
  let pipeline: GPURenderPipeline;
  let sampler: GPUSampler;
  let uniformBuf: GPUBuffer;
  let bindGroup: GPUBindGroup;

  async function init(
    coreInstance: GPUCore,
    sharedTex: any,
    canvasContext?: GPUCanvasContext
  ) {
    try {
      core = coreInstance;
      context = canvasContext;
      sharedTextures = sharedTex;
      const { device, format } = core;

      const shaderModule = device.createShaderModule({ code: waterLevelShaderSource });

      sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

      // Uniforms struct: 8 floats = 32 bytes
      uniformBuf = device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });

      // Bind group layout
      const bindGroupLayout = device.createBindGroupLayout({
        label: 'Water Level Bind Group Layout',
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }
        ]
      });

      pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
        vertex: {
          module: shaderModule,
          entryPoint: 'vertex_main'
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fragment_main',
          targets: [{ format }]
        },
        primitive: {
          topology: 'triangle-list'
        }
      });

      isInitialized.value = true;
    } catch (e: any) {
      error.value = e.message;
      console.error("Water Level Init Error:", e);
    }
  }

  function render(params: any) {
    if (!isInitialized.value || !context || !core) return;
    const { device } = core;
    const shared = 'value' in sharedTextures ? sharedTextures.value : sharedTextures;
    if (!shared || !shared.uv) return;

    const hasWaterLevel = params.channelWater !== undefined && params.channelWater >= 0;
    const enabled = params.waterLevelEnabled && hasWaterLevel;

    const commandEncoder = device.createCommandEncoder();
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        storeOp: 'store'
      }]
    };

    if (enabled) {
      // Update uniforms: 8 floats = 32 bytes
      const uniformData = new Float32Array([
        params.channelWater ?? -1.0,
        params.waterLevelMin ?? 0.0,
        params.waterLevelMax ?? 1.0,
        params.waterLevelOpacity ?? 0.6,
        params.channelMask ?? 2.0,
        params.aspect ?? 1.0,
        params.waterLevelContours ? 1.0 : 0.0,
        0.0 // Padding
      ]);
      device.queue.writeBuffer(uniformBuf, 0, uniformData);

      // Create bind group dynamically
      bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuf } },
          { binding: 1, resource: sampler },
          { binding: 2, resource: shared.uv.createView() }
        ]
      });

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.draw(3); // One full screen triangle
      passEncoder.end();
    } else {
      // Just clear
      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.end();
    }

    device.queue.submit([commandEncoder.finish()]);
  }

  return {
    init,
    render,
    isInitialized
  };
}
