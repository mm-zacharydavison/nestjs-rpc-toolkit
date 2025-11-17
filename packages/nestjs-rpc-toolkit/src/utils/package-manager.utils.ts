import * as fs from 'fs';
import * as path from 'path';

/**
 * Detects the package manager being used in the project
 * @param rootDir The root directory of the project
 * @returns The package manager name (pnpm, npm, yarn, or bun)
 */
export function detectPackageManager(rootDir: string): string {
  // Check for packageManager field in root package.json
  const rootPackageJsonPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(rootPackageJsonPath)) {
    try {
      const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf-8'));
      if (rootPackageJson.packageManager) {
        // Format: "pnpm@8.0.0" or "npm@9.0.0" or "bun@1.0.0"
        const pm = rootPackageJson.packageManager.split('@')[0];
        if (['pnpm', 'npm', 'yarn', 'bun'].includes(pm)) {
          return pm;
        }
      }
    } catch (error) {
      // Ignore and fall back to lock file detection
    }
  }

  // Check for lock files in order of preference
  if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(rootDir, 'bun.lockb'))) {
    return 'bun';
  }
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) {
    return 'npm';
  }

  // Default to npm if nothing detected
  return 'npm';
}
