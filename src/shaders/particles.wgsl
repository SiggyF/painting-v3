struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  life: f32,
  padding: vec3<f32>,
};

struct Uniforms {
  time: f32,
  speed: f32,
  aspect: f32,
  flipv: f32,
  uvScale: f32,
  dt: f32,
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var uvTex: texture_2d<f32>;
@group(0) @binding(3) var uvSampler: sampler;

// Hash function for random number generation
fn hash12(p: vec2<f32>) -> f32 {
  let q = fract(p * vec2<f32>(12.9898, 78.233));
  return fract(q.x * q.y * 43758.5453);
}

@compute @workgroup_size(64)
fn compute_main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
  let index = GlobalInvocationID.x;
  if (index >= arrayLength(&particles)) {
    return;
  }

  var p = particles[index];

  // Particle life logic
  p.life -= uniforms.dt * 0.5; // Arbitrary life span decay
  if (p.life <= 0.0) {
    // Respawn particle randomly
    let r1 = hash12(vec2<f32>(f32(index), uniforms.time));
    let r2 = hash12(vec2<f32>(uniforms.time, f32(index)));
    p.pos = vec2<f32>(r1, r2);
    p.life = 1.0;
    p.vel = vec2<f32>(0.0, 0.0);
  }

  // Sample UV video for velocity
  var uv = p.pos;
  if (uniforms.flipv > 0.5) {
    uv.y = 1.0 - uv.y;
  }
  
  // Apply uv scale to match the background video logic if necessary
  // Currently, we just sample directly from the UV texture using the particle's position [0,1]
  let vel_raw = textureSampleLevel(uvTex, uvSampler, uv, 0.0);
  
  // Decode velocity from rg channel (assuming 0.5 is zero velocity)
  // Scale it up based on the same logic in fluid.wgsl
  let vel = (vel_raw.xy - vec2<f32>(0.5, 0.5)) * 2.0 * uniforms.uvScale * uniforms.speed;

  p.vel = mix(p.vel, vel, 0.1); // Smooth velocity

  // Advect particle
  p.pos += p.vel * uniforms.dt * vec2<f32>(1.0 / uniforms.aspect, 1.0);

  // Wrap around boundaries (or bounce)
  if (p.pos.x < 0.0) { p.pos.x += 1.0; }
  if (p.pos.x > 1.0) { p.pos.x -= 1.0; }
  if (p.pos.y < 0.0) { p.pos.y += 1.0; }
  if (p.pos.y > 1.0) { p.pos.y -= 1.0; }

  particles[index] = p;
}

// Render Pipeline
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @builtin(point_size) size: f32,
  @location(0) vel: vec2<f32>,
  @location(1) life: f32,
};

@vertex
fn vertex_main(
  @location(0) pos: vec2<f32>,
  @location(1) vel: vec2<f32>,
  @location(2) life: f32
) -> VertexOutput {
  var output: VertexOutput;
  // Convert [0, 1] to NDC [-1, 1]
  // Y axis in WebGPU NDC is up, but pos.y=0 might be top depending on canvas setup
  // Let's assume standard WebGPU: y=1 is top
  // In typical UV mapping: y=0 is top.
  // We'll flip Y to match WebGPU NDC
  let ndc_x = pos.x * 2.0 - 1.0;
  let ndc_y = 1.0 - pos.y * 2.0;

  output.position = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);
  output.size = 3.0; // Point size
  output.vel = vel;
  output.life = life;
  return output;
}

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Speed-based color
  let speed = length(in.vel);
  let color = mix(vec3<f32>(0.2, 0.6, 1.0), vec3<f32>(1.0, 0.2, 0.2), clamp(speed * 20.0, 0.0, 1.0));
  
  // Fade out based on life
  let alpha = smoothstep(0.0, 0.2, in.life) * smoothstep(1.0, 0.8, in.life) * 0.8;

  return vec4<f32>(color, alpha);
}
