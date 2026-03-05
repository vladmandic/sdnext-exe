import { spawnSync } from 'node:child_process';
import { debugLog } from './debug';

export interface DetectedGPU {
  name: string;
  vendor: 'nvidia' | 'amd' | 'intel' | 'unknown';
}

export interface GPUDetectionResult {
  gpus: DetectedGPU[];
  recommendedBackend: 'autodetect' | 'cuda' | 'rocm' | 'zluda' | 'ipex';
}

function parseGPUVendor(gpuName: string): 'nvidia' | 'amd' | 'intel' | 'unknown' {
  const nameLower = gpuName.toLowerCase();
  if (nameLower.includes('nvidia') || nameLower.includes('geforce') || nameLower.includes('quadro') || nameLower.includes('tesla')) {
    return 'nvidia';
  }
  if (nameLower.includes('amd') || nameLower.includes('radeon') || nameLower.includes('ryzen')) {
    return 'amd';
  }
  if (nameLower.includes('intel') || nameLower.includes('arc') || nameLower.includes('iris') || nameLower.includes('uhd')) {
    return 'intel';
  }
  return 'unknown';
}

export function detectGPUs(): GPUDetectionResult {
  try {
    debugLog('gpu-detection', 'Starting GPU detection');

    const result = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'Get-CimInstance Win32_VideoController | Select-Object -Property Name',
    ], {
      encoding: 'utf8',
      windowsHide: true,
    });

    const gpus: DetectedGPU[] = [];
    if (result.stdout) {
      const lines = result.stdout.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip header and empty lines
        if (trimmed && trimmed !== 'Name' && !trimmed.startsWith('----')) {
          const vendor = parseGPUVendor(trimmed);
          gpus.push({ name: trimmed, vendor });
          debugLog('gpu-detection', 'Detected GPU', { name: trimmed, vendor });
        }
      }
    }

    // Determine recommended backend based on detected GPUs
    // Prefer NVIDIA > AMD > Intel, fallback to autodetect
    let recommendedBackend: 'autodetect' | 'cuda' | 'rocm' | 'zluda' | 'ipex' = 'autodetect';
    const hasNvidia = gpus.some(g => g.vendor === 'nvidia');
    const hasAmd = gpus.some(g => g.vendor === 'amd');
    const hasIntel = gpus.some(g => g.vendor === 'intel');

    if (hasNvidia) {
      recommendedBackend = 'cuda';
    } else if (hasAmd) {
      recommendedBackend = 'rocm';
    } else if (hasIntel) {
      recommendedBackend = 'ipex';
    }

    debugLog('gpu-detection', 'GPU detection complete', { gpuCount: gpus.length, recommendedBackend });

    return { gpus, recommendedBackend };
  } catch (error) {
    debugLog('gpu-detection', 'GPU detection failed', error);
    return { gpus: [], recommendedBackend: 'autodetect' };
  }
}
