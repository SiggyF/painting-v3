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
  particleSize: f32,
  particleOpacity: f32,
  particleColorMode: f32,
  particleColorR: f32,
  particleColorG: f32,
  particleColorB: f32,
  particleColormapId: f32,
  channelU: f32,
  channelV: f32,
  channelMask: f32,
  channelWater: f32,
  pad1: f32,
  pad2: f32,
  pad3: f32,
};

fn get_channel_value(color: vec4<f32>, channel_idx: f32) -> f32 {
  if (channel_idx < 0.5) { return color.r; }
  if (channel_idx < 1.5) { return color.g; }
  if (channel_idx < 2.5) { return color.b; }
  return color.a;
}


@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var uvTex: texture_2d<f32>;
@group(0) @binding(3) var uvSampler: sampler;

// Thomas Wang's 32-bit integer hash function
fn hash_u32(x: u32) -> u32 {
  var a = x;
  a = (a ^ 61u) ^ (a >> 16u);
  a = a + (a << 3u);
  a = a ^ (a >> 4u);
  a = a * 0x27d4eb2du;
  a = a ^ (a >> 15u);
  return a;
}


@compute @workgroup_size(64)
fn compute_main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
  let index = GlobalInvocationID.x;
  if (index >= arrayLength(&particles)) {
    return;
  }

  var p = particles[index];

  // Particle life logic
  // Use a randomized decay scale based on particle index to prevent cohort synchronization (breathing)
  let decay_scale = 0.5 + 1.0 * (f32(hash_u32(index)) / 4294967295.0);
  p.life -= uniforms.dt * 0.5 * decay_scale; // Arbitrary life span decay
  
  // Sample UV video for velocity and mask
  var uv = p.pos;
  // Safety: Ensure UV is within valid range to avoid edge-case NaNs
  uv = saturate(uv);
  
  let vel_raw = textureSampleLevel(uvTex, uvSampler, uv, 0.0);
  
  let raw_mask = get_channel_value(vel_raw, uniforms.channelMask);
  var is_land = 0.0;
  if (uniforms.channelMask > 2.5) {
    // Mask in Alpha: 1.0 is water, 0.0 is land
    is_land = 1.0 - raw_mask;
  } else {
    // Mask in Blue: 0.0 is water, 1.0 is land
    is_land = raw_mask;
  }

  // Safety: Detect if mask is NaN or Infinity
  if (is_land != is_land || is_land > 10.0) { is_land = 1.0; }

  if (p.life <= 0.0 || is_land > 0.5) {
    // Respawn particle randomly using Wang hash (prevents float aliasing columns)
    let t_seed = u32(abs(uniforms.time * 1000.0)) & 0xFFFFu;
    let seed_x = index + t_seed * 1024u + 12345u;
    let seed_y = index * 33u + t_seed * 65536u + 67890u;
    
    let r1 = f32(hash_u32(seed_x)) / 4294967295.0;
    let r2 = f32(hash_u32(seed_y)) / 4294967295.0;
    
    p.pos = vec2<f32>(r1, r2);
    p.life = 1.0;
    p.vel = vec2<f32>(0.0, 0.0);
  } else {
    var v_raw = vec2<f32>(
      get_channel_value(vel_raw, uniforms.channelU),
      get_channel_value(vel_raw, uniforms.channelV)
    );
    // Safety: If texture sample is NaN, default to zero
    if (any(v_raw != v_raw)) { v_raw = vec2<f32>(0.5, 0.5); }

    var vel = (v_raw - vec2<f32>(0.5, 0.5)) * uniforms.uvScale * uniforms.speed;
    if (uniforms.flipv > 0.5) {
      vel.y = -vel.y;
    }

    p.vel = mix(p.vel, vel, 0.1); // Smooth velocity

    // Advect particle
    p.pos += p.vel * uniforms.dt * vec2<f32>(1.0 / uniforms.aspect, 1.0);


    // Safety: check for NaN and reset if poisoned
    if (any(p.pos != p.pos) || any(p.vel != p.vel)) {
        p.pos = vec2<f32>(0.5, 0.5);
        p.vel = vec2<f32>(0.0, 0.0);
        p.life = 0.0;
    }

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
  let size = vec2<f32>(uniforms.particleSize / uniforms.aspect, uniforms.particleSize);

  let ndc_x = pos.x * 2.0 - 1.0;
  let ndc_y = 1.0 - pos.y * 2.0; // Map simulation space (y=0 top, 1 bottom) to NDC y (1 top, -1 bottom)
  let final_pos = vec2<f32>(ndc_x, ndc_y) + offset * size;

  output.position = vec4<f32>(final_pos, 0.0, 1.0);
  output.vel = vel;
  output.life = life;
  output.uv = offset;
  return output;
}

fn romaO(t: f32) -> vec3<f32> {
  let c0 = vec3<f32>(0.612, 0.059, 0.098); // red
  let c1 = vec3<f32>(0.851, 0.443, 0.176); // orange
  let c2 = vec3<f32>(0.965, 0.835, 0.380); // yellow
  let c3 = vec3<f32>(0.851, 0.914, 0.855); // greenish-white
  let c4 = vec3<f32>(0.439, 0.690, 0.816); // teal-blue
  let c5 = vec3<f32>(0.247, 0.314, 0.612); // purple
  let c6 = vec3<f32>(0.612, 0.059, 0.098); // red (loop)
  
  if (t < 0.167) {
    return mix(c0, c1, t * 6.0);
  } else if (t < 0.333) {
    return mix(c1, c2, (t - 0.167) * 6.0);
  } else if (t < 0.5) {
    return mix(c2, c3, (t - 0.333) * 6.0);
  } else if (t < 0.667) {
    return mix(c3, c4, (t - 0.5) * 6.0);
  } else if (t < 0.833) {
    return mix(c4, c5, (t - 0.667) * 6.0);
  } else {
    return mix(c5, c6, (t - 0.833) * 6.0);
  }
}

fn oleron(t: f32) -> vec3<f32> {
  let c0 = vec3<f32>(0.122, 0.353, 0.651); // blue
  let c1 = vec3<f32>(0.553, 0.200, 0.553); // purple
  let c2 = vec3<f32>(0.851, 0.451, 0.451); // peach
  let c3 = vec3<f32>(0.902, 0.851, 0.553); // yellow
  let c4 = vec3<f32>(0.353, 0.651, 0.451); // green
  let c5 = vec3<f32>(0.122, 0.353, 0.651); // blue (loop)
  
  if (t < 0.2) {
    return mix(c0, c1, t * 5.0);
  } else if (t < 0.4) {
    return mix(c1, c2, (t - 0.2) * 5.0);
  } else if (t < 0.6) {
    return mix(c2, c3, (t - 0.4) * 5.0);
  } else if (t < 0.8) {
    return mix(c3, c4, (t - 0.6) * 5.0);
  } else {
    return mix(c4, c5, (t - 0.8) * 5.0);
  }
}

fn batlow(t: f32) -> vec3<f32> {
  let c0 = vec3<f32>(0.012, 0.153, 0.447);
  let c1 = vec3<f32>(0.180, 0.380, 0.384);
  let c2 = vec3<f32>(0.486, 0.584, 0.286);
  let c3 = vec3<f32>(0.871, 0.608, 0.314);
  let c4 = vec3<f32>(0.949, 0.773, 0.812);
  if (t < 0.25) {
    return mix(c0, c1, t * 4.0);
  } else if (t < 0.5) {
    return mix(c1, c2, (t - 0.25) * 4.0);
  } else if (t < 0.75) {
    return mix(c2, c3, (t - 0.5) * 4.0);
  } else {
    return mix(c3, c4, (t - 0.75) * 4.0);
  }
}

fn viridis(t: f32) -> vec3<f32> {
  let c0 = vec3<f32>(0.267, 0.004, 0.329);
  let c1 = vec3<f32>(0.224, 0.231, 0.512);
  let c2 = vec3<f32>(0.128, 0.431, 0.549);
  let c3 = vec3<f32>(0.153, 0.682, 0.502);
  let c4 = vec3<f32>(0.993, 0.906, 0.144);
  if (t < 0.25) {
    return mix(c0, c1, t * 4.0);
  } else if (t < 0.5) {
    return mix(c1, c2, (t - 0.25) * 4.0);
  } else if (t < 0.75) {
    return mix(c2, c3, (t - 0.5) * 4.0);
  } else {
    return mix(c3, c4, (t - 0.75) * 4.0);
  }
}

fn plasma(t: f32) -> vec3<f32> {
  let c0 = vec3<f32>(0.051, 0.024, 0.529);
  let c1 = vec3<f32>(0.478, 0.012, 0.663);
  let c2 = vec3<f32>(0.792, 0.157, 0.482);
  let c3 = vec3<f32>(0.965, 0.475, 0.259);
  let c4 = vec3<f32>(0.941, 0.894, 0.259);
  if (t < 0.25) {
    return mix(c0, c1, t * 4.0);
  } else if (t < 0.5) {
    return mix(c1, c2, (t - 0.25) * 4.0);
  } else if (t < 0.75) {
    return mix(c2, c3, (t - 0.5) * 4.0);
  } else {
    return mix(c3, c4, (t - 0.75) * 4.0);
  }
}

fn inferno(t: f32) -> vec3<f32> {
  let c0 = vec3<f32>(0.000, 0.000, 0.016);
  let c1 = vec3<f32>(0.243, 0.031, 0.302);
  let c2 = vec3<f32>(0.573, 0.086, 0.365);
  let c3 = vec3<f32>(0.898, 0.314, 0.118);
  let c4 = vec3<f32>(0.988, 0.906, 0.145);
  if (t < 0.25) {
    return mix(c0, c1, t * 4.0);
  } else if (t < 0.5) {
    return mix(c1, c2, (t - 0.25) * 4.0);
  } else if (t < 0.75) {
    return mix(c2, c3, (t - 0.5) * 4.0);
  } else {
    return mix(c3, c4, (t - 0.75) * 4.0);
  }
}

fn magma(t: f32) -> vec3<f32> {
  let c0 = vec3<f32>(0.000, 0.000, 0.027);
  let c1 = vec3<f32>(0.220, 0.047, 0.286);
  let c2 = vec3<f32>(0.573, 0.078, 0.443);
  let c3 = vec3<f32>(0.902, 0.278, 0.314);
  let c4 = vec3<f32>(0.988, 0.906, 0.592);
  if (t < 0.25) {
    return mix(c0, c1, t * 4.0);
  } else if (t < 0.5) {
    return mix(c1, c2, (t - 0.25) * 4.0);
  } else if (t < 0.75) {
    return mix(c2, c3, (t - 0.5) * 4.0);
  } else {
    return mix(c3, c4, (t - 0.75) * 4.0);
  }
}



@fragment
fn fragment_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Distance from center of the billboard quad
  let r = length(in.uv);
  if (r > 1.0) {
    discard; // Cut off corners to form a perfect circle
  }

  // Combined sharp core + soft glow for better visibility and anti-aliasing
  let sharp_mask = smoothstep(1.0, 0.9, r);
  let glow = exp(-3.0 * r * r);
  let intensity = (sharp_mask * 0.5 + glow * 0.5) * 1.5; // Boosted intensity

  let speed = length(in.vel);
  var color: vec3<f32>;

  if (uniforms.particleColorMode < 0.5) {
    // Direction based (color wheel)
    var wheelColor: vec3<f32> = vec3<f32>(0.7, 0.7, 0.7);
    let speed_sq = dot(in.vel, in.vel);
    
    if (speed_sq > 1e-9) {
      let angle = atan2(in.vel.y, in.vel.x);
      let hue = (angle + 3.14159265359) / (2.0 * 3.14159265359);
      if (uniforms.particleColormapId < 0.5) {
        wheelColor = romaO(hue);
      } else {
        wheelColor = oleron(hue);
      }
    }
    
    // Blend stationary/slow particles to a neutral white-grey
    let speed_factor = clamp(sqrt(speed_sq) * 30.0, 0.0, 1.0);
    color = mix(vec3<f32>(0.7, 0.7, 0.7), wheelColor, speed_factor);
  } else if (uniforms.particleColorMode < 1.5) {
    // Speed based (sequential colormap)
    let t = clamp(speed * 30.0, 0.0, 1.0);
    if (uniforms.particleColormapId < 0.5) {
      color = batlow(t);
    } else if (uniforms.particleColormapId < 1.5) {
      color = viridis(t);
    } else if (uniforms.particleColormapId < 2.5) {
      color = plasma(t);
    } else if (uniforms.particleColormapId < 3.5) {
      color = inferno(t);
    } else {
      color = magma(t);
    }
  } else {
    // Constant color
    color = vec3<f32>(uniforms.particleColorR, uniforms.particleColorG, uniforms.particleColorB);
  }

  
  // Fade out based on life (transparent with soft alpha and radial intensity)
  let alpha = smoothstep(0.0, 0.15, in.life) * (1.0 - smoothstep(0.85, 1.0, in.life)) * uniforms.particleOpacity * intensity;
  // Return premultiplied color for additive blending
  return vec4<f32>(color * alpha, alpha);
}

// Trail shader helper structures & entry points
struct ScreenVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn screen_vertex_main(@builtin(vertex_index) vertexIndex: u32) -> ScreenVertexOutput {
  var output: ScreenVertexOutput;
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  let pos = positions[vertexIndex];
  output.position = vec4<f32>(pos, 0.0, 1.0);
  output.uv = vec2<f32>(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
  return output;
}

@fragment
fn fade_fragment_main() -> @location(0) vec4<f32> {
  return vec4<f32>(0.0);
}

@group(0) @binding(4) var accumTex: texture_2d<f32>;
@group(0) @binding(5) var accumSampler: sampler;

@fragment
fn screen_fragment_main(in: ScreenVertexOutput) -> @location(0) vec4<f32> {
  return textureSampleLevel(accumTex, accumSampler, in.uv, 0.0);
}

