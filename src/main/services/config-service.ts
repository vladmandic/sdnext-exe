import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { SdNextConfig } from '../../shared/types';
import { validatePath } from '../../shared/types';
import { getConfigPath, getDefaultInstallationPath, getDefaultModelsPath } from './runtime-paths';

const ConfigSchema = z.object({
  autoLaunch: z.boolean(),
  upgrade: z.boolean().default(false),
  wipe: z.boolean().default(false),
  useUv: z.boolean().default(false),
  backend: z.enum(['autodetect', 'cuda', 'rocm', 'zluda', 'directml', 'ipex', 'openvino']).default('autodetect'),
  repositoryBranch: z.enum(['master', 'dev']),
  installationPath: z.string().min(1).refine(
    (val) => {
      try {
        validatePath(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid installation path' },
  ),
  modelsPath: z.string().min(1).refine(
    (val) => {
      try {
        validatePath(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid models path' },
  ),
  public: z.boolean(),
  customParameters: z.string(),
  customEnvironment: z.string(),
  gitRetryCount: z.number().int().min(0).max(10).default(3).optional(),
  theme: z.enum(['system', 'dark', 'light']).default('system').optional(),
  showTutorial: z.boolean().default(true).optional(),
  windowState: z.object({
    width: z.number().int().min(720),
    height: z.number().int().min(480),
    x: z.number().int().optional(),
    y: z.number().int().optional(),
  }).optional(),
});

function defaults(): SdNextConfig {
  const installationPath = getDefaultInstallationPath();
  return {
    autoLaunch: false,
    upgrade: false,
    wipe: false,
    useUv: false,
    backend: 'autodetect',
    repositoryBranch: 'dev',
    installationPath,
    modelsPath: getDefaultModelsPath(installationPath),
    public: false,
    customParameters: '',
    customEnvironment: '',
    gitRetryCount: 3,
    theme: 'system',
    showTutorial: true,
    windowState: undefined,
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

  // Ensure containing directory exists before writing.  If the executable
  // happens to live at a drive root (e.g. `D:\launcher.exe`) the dirname is
  // the root itself; attempting mkdirSync on a root path fails with EPERM on
  // Windows, so skip the operation in that case.  A failure here is non‑fatal
  // because the file write below will succeed if the directory is already
  // present.
  const dir = path.dirname(filePath);
  try {
    const root = path.parse(dir).root;
    if (dir && dir !== root) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    // ignore EPERM/other errors; writeFileSync below will report them if
    // necessary.  This helps avoid crashes when running from a protected
    // location such as the volume root.
    console.debug('saveConfig: mkdir failed, continuing', err);
  }

  fs.writeFileSync(tempPath, JSON.stringify(validated, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);

  return validated;
}
