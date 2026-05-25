let forwardUV = uv + vel * 0.005 * aspect;
let fc = textureSample(prevStateTex, samp, forwardUV);
let clampCenter = prevUV;
let f_base = fp;
let f_final = fp + 0.5 * (f_curr - fc);
