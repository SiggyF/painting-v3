let forwardUV = uv + vel * 0.005 * aspect;
let fc = textureSample(prevStateTex, samp, forwardUV);
let clampCenter = prevUV;
let f_base = f_curr_prev;
let f_final = f_curr_prev + 0.5 * (f_curr - fc);
