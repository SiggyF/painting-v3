import fluidShaderSource from '../../shaders/fluid.wgsl?raw';
import semiLagrangianPredictor from '../../shaders/semi_lagrangian_predictor.wgsl?raw';
import maccormackCorrector from '../../shaders/maccormack_corrector.wgsl?raw';
import bfeccCorrector from '../../shaders/bfecc_corrector.wgsl?raw';
import rk4MaccormackPredictor from '../../shaders/rk4_maccormack_predictor.wgsl?raw';
import rk4MaccormackCorrector from '../../shaders/rk4_maccormack_corrector.wgsl?raw';
import tvdCorrector from '../../shaders/tvd_corrector.wgsl?raw';
import upwindPredictor from '../../shaders/upwind_predictor.wgsl?raw';
import fctCorrector from '../../shaders/fct_corrector.wgsl?raw';
import bicubicSource from '../../shaders/bicubic.wgsl?raw';
import bilinearSource from '../../shaders/bilinear.wgsl?raw';
import roeSource from '../../shaders/roe.wgsl?raw';

export interface SchemeInfo {
  id: string;
  name: string;
  mainAppName?: string;
  predictor: string;
  corrector: string;
  schemeId: number;
  docs?: string;
}

export const predictorShaders: Record<string, string> = {
  'bilinear': bilinearSource,
  'semi-lagrangian': semiLagrangianPredictor,
  'rk4': rk4MaccormackPredictor,
  'upwind': upwindPredictor,
  'bicubic': bicubicSource,
  'roe': roeSource
};

export const correctorShaders: Record<string, string> = {
  'none': `fn sampleAdvectionCorrector(uv: vec2<f32>, prevUV: vec2<f32>, vel: vec2<f32>, fp: vec4<f32>, f_curr: vec4<f32>, aspect: vec2<f32>) -> vec4<f32> {\n    return fp;\n}`,
  'maccormack': maccormackCorrector,
  'bfecc': bfeccCorrector,
  'tvd': tvdCorrector,
  'fct': fctCorrector
};

export function buildCustomAdvectCode(predictorId: string, correctorId: string): string {
  const predictorCode = predictorShaders[predictorId] || '';
  const correctorCode = correctorShaders[correctorId] || '';
  return predictorCode + '\n\n' + correctorCode;
}

export const presets: Record<string, string> = {
  'bilinear-none': bilinearSource + '\n\n' + correctorShaders.none,
  'semi-lagrangian-maccormack': semiLagrangianPredictor + '\n\n' + maccormackCorrector,
  'semi-lagrangian-bfecc': semiLagrangianPredictor + '\n\n' + bfeccCorrector,
  'rk4-maccormack': rk4MaccormackPredictor + '\n\n' + rk4MaccormackCorrector,
  'semi-lagrangian-tvd': semiLagrangianPredictor + '\n\n' + tvdCorrector,
  'upwind-none': upwindPredictor + '\n\n' + correctorShaders.none,
  'upwind-fct': upwindPredictor + '\n\n' + fctCorrector,
  'bicubic-none': bicubicSource + '\n\n' + correctorShaders.none,
  'roe-none': roeSource + '\n\n' + correctorShaders.none
};

export async function buildAdvectShader(
  device: GPUDevice,
  customAdvectCode?: string
): Promise<{ shaderModule: GPUShaderModule; success: boolean; messages: string[] }> {
  let finalShaderSource = fluidShaderSource;
  
  if (customAdvectCode) {
    const startTag = '// ADVECTION_SOLVER_START';
    const endTag = '// ADVECTION_SOLVER_END';
    const startIndex = fluidShaderSource.indexOf(startTag);
    const endIndex = fluidShaderSource.indexOf(endTag);

    if (startIndex !== -1 && endIndex !== -1) {
      finalShaderSource = 
        fluidShaderSource.substring(0, startIndex + startTag.length) + '\n' +
        customAdvectCode + '\n' +
        fluidShaderSource.substring(endIndex);
    }
  }

  try {
    const shaderModule = device.createShaderModule({ code: finalShaderSource });
    const info = await shaderModule.getCompilationInfo();
    const errorMsgs = info.messages.filter(m => m.type === 'error').map(m => `Line ${m.lineNum}:${m.linePos} - ${m.message}`);
    
    if (errorMsgs.length > 0) {
      return { shaderModule, success: false, messages: errorMsgs };
    }
    
    return { shaderModule, success: true, messages: [] };
  } catch (e: any) {
    return { 
      shaderModule: null as any, 
      success: false, 
      messages: [e.message] 
    };
  }
}
