export interface ParticleBuffers {
  particleBuffer: GPUBuffer;
  particleCount: number;
}

export function createParticleBuffers(device: GPUDevice, count: number): ParticleBuffers {
  // Each particle takes 32 bytes:
  // pos (vec2<f32> = 8 bytes)
  // vel (vec2<f32> = 8 bytes)
  // life (f32 = 4 bytes)
  // padding (3 * f32 = 12 bytes)
  const particleBufferSize = count * 32;

  const particleBuffer = device.createBuffer({
    size: particleBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
  });

  // Initialize particles with random positions and life
  const initialData = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    // Random position in [0, 1] x [0, 1]
    initialData[i * 8 + 0] = Math.random(); 
    initialData[i * 8 + 1] = Math.random();
    
    // Velocity
    initialData[i * 8 + 2] = 0;
    initialData[i * 8 + 3] = 0;
    
    // Life
    initialData[i * 8 + 4] = Math.random(); // Start with random life so they don't all die at once
  }

  device.queue.writeBuffer(particleBuffer, 0, initialData);

  return {
    particleBuffer,
    particleCount: count
  };
}
