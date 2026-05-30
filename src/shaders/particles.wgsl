struct Particle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  life: f32,
  p1: f32,
  p2: f32,
  p3: f32,
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
  
  // Sample UV video for velocity and mask
  let uv = p.pos;
  
  let vel_raw = textureSampleLevel(uvTex, uvSampler, uv, 0.0);
  let mask = vel_raw.z; // Blue channel of UV video texture contains the land mask

  if (p.life <= 0.0 || mask > 0.01) {
    // Respawn particle randomly
    let r1 = hash12(vec2<f32>(f32(index), uniforms.time));
    let r2 = hash12(vec2<f32>(uniforms.time, f32(index)));
    p.pos = vec2<f32>(r1, r2);
    p.life = 1.0;
    p.vel = vec2<f32>(0.0, 0.0);
  } else {
    var vel = (vel_raw.xy - vec2<f32>(0.5, 0.5)) * uniforms.uvScale * uniforms.speed;
    if (uniforms.flipv > 0.5) {
      vel.y = -vel.y;
    }

    p.vel = mix(p.vel, vel, 0.1); // Smooth velocity

    // Advect particle
    p.pos += p.vel * uniforms.dt * vec2<f32>(1.0 / uniforms.aspect, 1.0);

    // Wrap around boundaries (or bounce)
    if (p.pos.x < 0.0) { p.pos.x += 1.0; }
    if (p.pos.x > 1.0) { p.pos.x -= 1.0; }
    if (p.pos.y < 0.0) { p.pos.y += 1.0; }
    if (p.pos.y > 1.0) { p.pos.y -= 1.0; }
  }

  particles[index] = p;
}

// Render Pipeline
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) vel: vec2<f32>,
  @location(1) life: f32,
  @location(2) uv: vec2<f32>,
};

@vertex
fn vertex_main(
  @builtin(vertex_index) vertexIndex: u32,
  @location(0) pos: vec2<f32>,
  @location(1) vel: vec2<f32>,
  @location(2) life: f32
) -> VertexOutput {
  var output: VertexOutput;
  
  // A quad billboard made of two triangles
  var quadOffsets = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );

  let offset = quadOffsets[vertexIndex];
  
  // Particle size in NDC, corrected for aspect ratio (e.g. 3px size equivalent)
  let baseSize = 0.003;
  let size = vec2<f32>(baseSize / uniforms.aspect, baseSize);

  let ndc_x = pos.x * 2.0 - 1.0;
  let ndc_y = 1.0 - pos.y * 2.0; // Map simulation space (y=0 top, 1 bottom) to NDC y (1 top, -1 bottom)
  let final_pos = vec2<f32>(ndc_x, ndc_y) + offset * size;

  output.position = vec4<f32>(final_pos, 0.0, 1.0);
  output.vel = vel;
  output.life = life;
  output.uv = offset;
  return output;
}

fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
  let k = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
  return c.z * mix(k.xxx, clamp(p - k.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Distance from center of the billboard quad
  let r = length(in.uv);
  if (r > 1.0) {
    discard; // Cut off corners to form a perfect circle
  }

  // Soft radial falloff for glowing circular particles
  let intensity = smoothstep(1.0, 0.0, r);

  // Flow direction dependent color (using HSV color wheel)
  let speed = length(in.vel);
  let angle = atan2(in.vel.y, in.vel.x);
  let hue = (angle + 3.14159265359) / (2.0 * 3.14159265359);
  
  // HSV parameters: Hue from direction, Saturation 0.85, Value 1.0
  let wheelColor = hsv2rgb(vec3<f32>(hue, 0.85, 1.0));
  
  // Blend stationary/slow particles to a neutral white-grey so we focus on active streams
  let speed_factor = clamp(speed * 30.0, 0.0, 1.0);
  let color = mix(vec3<f32>(0.7, 0.7, 0.7), wheelColor, speed_factor);
  
  // Fade out based on life (transparent with soft alpha and radial intensity)
  let alpha = smoothstep(0.0, 0.15, in.life) * smoothstep(1.0, 0.85, in.life) * 0.25 * intensity;

  // Return premultiplied color for additive blending
  return vec4<f32>(color * alpha, alpha);
}
