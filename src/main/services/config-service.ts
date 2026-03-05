import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { SdNextConfig } from '../../shared/types';
import { getConfigPath, getDefaultInstallationPath, getDefaultModelsPath } from './runtime-paths';

const ConfigSchema = z.object({
  autoLaunch: z.boolean(),
  upgrade: z.boolean().default(false),
  reinstall: z.boolean().default(false),
  wipe: z.boolean().default(false),
  backend: z.enum(['autodetect', 'cuda', 'rocm', 'zluda', 'directml', 'ipex', 'openvino']).default('autodetect'),
  repositoryBranch: z.enum(['master', 'dev']),
  installationPath: z.string().min(1),
  modelsPath: z.string().min(1),
  customParameters: z.string(),
  customEnvironment: z.string(),
});

function defaults(): SdNextConfig {
  const installationPath = getDefaultInstallationPath();
  return {
    autoLaunch: false,
    upgrade: false,
    reinstall: false,
    wipe: false,
    backend: 'autodetect',
    repositoryBranch: 'dev',
    installationPath,
    modelsPath: getDefaultModelsPath(installationPath),
    customParameters: '',
    customEnvironment: '',
  };
}

export function loadConfig(): SdNextConfig {
  const filePath = getConfigPath();
  if (!fs.existsSync(filePath)) {
    return defaults();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return ConfigSchema.parse(parsed);
  } catch {
    return defaults();
  }
}

export function saveConfig(config: SdNextConfig): SdNextConfig {
  const validated = ConfigSchema.parse(config);
  const filePath = getConfigPath();
  const tempPath = `${filePath}.tmp`;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(validated, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);

  return validated;
}
