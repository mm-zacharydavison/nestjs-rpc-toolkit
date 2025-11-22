import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

describe('Bootstrap Script Integration Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-bootstrap-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function runBootstrapWithInputs(
    config: {
      packagePath: string,
      packageName: string,
      modulePackages: string[]
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // originalCwd is tests directory, go up one level to monorepo root
      const monorepoRoot = path.join(originalCwd, '..');
      const bootstrapScript = path.join(monorepoRoot, 'packages/nestjs-rpc-toolkit/src/bin/bootstrap.ts');

      const proc = spawn('node', [
        '--require', 'ts-node/register',
        '--no-warnings',
        bootstrapScript
      ], {
        cwd: tempDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TS_NODE_TRANSPILE_ONLY: 'true',
          TS_NODE_COMPILER_OPTIONS: JSON.stringify({
            module: 'commonjs',
            target: 'es2020',
            esModuleInterop: true,
            skipLibCheck: true
          })
        }
      });

      let stdout = '';
      let stderr = '';
      let promptCount = 0;

      proc.stdout.on('data', (data) => {
        stdout += data.toString();

        // Respond to prompts in order
        if (promptCount === 0 && stdout.includes('Where would you like to create the RPC package?')) {
          promptCount++;
          // Give it a moment to finish printing the prompt
          setImmediate(() => {
            proc.stdin.write(`${config.packagePath}\n`);
          });
        } else if (promptCount === 1 && stdout.includes('What should the package name be?')) {
          promptCount++;
          setImmediate(() => {
            proc.stdin.write(`${config.packageName}\n`);
          });
        } else if (promptCount === 2 && stdout.includes('Enter module packages to scan')) {
          promptCount++;
          setImmediate(() => {
            proc.stdin.write(`${config.modulePackages.join(',')}\n`);
          });
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Bootstrap script failed with code ${code}\nstderr: ${stderr}\nstdout: ${stdout}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  describe('Directory Structure Creation', () => {
    it('should create the RPC package directory structure', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const packagePath = path.join(tempDir, 'packages/lib-rpc');
      expect(fs.existsSync(packagePath)).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'src'))).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'scripts'))).toBe(true);
    });

    it('should create nested directories with relative paths', async () => {
      const config = {
        packagePath: 'libs/shared/rpc',
        packageName: '@myorg/shared-rpc',
        modulePackages: ['apps/*']
      };

      await runBootstrapWithInputs(config);

      const packagePath = path.join(tempDir, 'libs/shared/rpc');
      expect(fs.existsSync(packagePath)).toBe(true);
      expect(fs.statSync(packagePath).isDirectory()).toBe(true);
    });
  });

  describe('package.json Creation', () => {
    it('should create a valid package.json with correct structure', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const packageJsonPath = path.join(tempDir, 'packages/lib-rpc/package.json');
      expect(fs.existsSync(packageJsonPath)).toBe(true);

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.name).toBe('@test-project/rpc');
      expect(packageJson.version).toBe('1.0.0');
      expect(packageJson.main).toBe('dist/index.js');
      expect(packageJson.types).toBe('dist/index.d.ts');
    });

    it('should include all required scripts', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const packageJsonPath = path.join(tempDir, 'packages/lib-rpc/package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts.build).toBe('npm run generate:types && tsc');
      expect(packageJson.scripts.clean).toBe('rm -rf dist');
      expect(packageJson.scripts.dev).toBe('tsc --watch');
      expect(packageJson.scripts['generate:types']).toBe('ts-node scripts/generate-all-rpc-types.ts');
    });

    it('should include all required dependencies', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const packageJsonPath = path.join(tempDir, 'packages/lib-rpc/package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.dependencies['@zdavison/nestjs-rpc-toolkit']).toBe('^0.1.0');
      expect(packageJson.dependencies['@nestjs/common']).toBe('^11.0.0');
      expect(packageJson.dependencies['@nestjs/microservices']).toBe('^11.0.0');

      expect(packageJson.devDependencies.typescript).toBe('^5.0.0');
      expect(packageJson.devDependencies['ts-node']).toBe('^10.9.0');
      expect(packageJson.devDependencies['ts-morph']).toBe('^20.0.0');
    });
  });

  describe('tsconfig.json Creation', () => {
    it('should create a standalone tsconfig when no root config exists', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const tsconfigPath = path.join(tempDir, 'packages/lib-rpc/tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);

      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));

      expect(tsconfig.compilerOptions.target).toBe('ES2020');
      expect(tsconfig.compilerOptions.module).toBe('commonjs');
      expect(tsconfig.compilerOptions.outDir).toBe('./dist');
      expect(tsconfig.compilerOptions.declaration).toBe(true);
      expect(tsconfig.compilerOptions.experimentalDecorators).toBe(true);
      expect(tsconfig.compilerOptions.emitDecoratorMetadata).toBe(true);
    });

    it('should extend root tsconfig.base.json when it exists', async () => {
      const rootTsConfig = {
        compilerOptions: {
          target: 'ES2021',
          strict: true
        }
      };
      fs.writeFileSync(
        path.join(tempDir, 'tsconfig.base.json'),
        JSON.stringify(rootTsConfig, null, 2)
      );

      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const tsconfigPath = path.join(tempDir, 'packages/lib-rpc/tsconfig.json');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));

      expect(tsconfig.extends).toBeDefined();
      expect(tsconfig.extends).toContain('tsconfig.base.json');
      expect(tsconfig.compilerOptions.outDir).toBe('./dist');
      expect(tsconfig.compilerOptions.declaration).toBe(true);
    });

    it('should extend root tsconfig.json when it exists', async () => {
      const rootTsConfig = {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs'
        }
      };
      fs.writeFileSync(
        path.join(tempDir, 'tsconfig.json'),
        JSON.stringify(rootTsConfig, null, 2)
      );

      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const tsconfigPath = path.join(tempDir, 'packages/lib-rpc/tsconfig.json');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));

      expect(tsconfig.extends).toBeDefined();
      expect(tsconfig.extends).toContain('tsconfig.json');
    });
  });

  describe('RPC Configuration Creation', () => {
    it('should create nestjs-rpc-toolkit.config.json with correct module packages', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*', 'libs/core']
      };

      await runBootstrapWithInputs(config);

      const configPath = path.join(tempDir, 'packages/lib-rpc/nestjs-rpc-toolkit.config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const rpcConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(rpcConfig.packages).toEqual(['packages/modules/*', 'libs/core']);
      expect(rpcConfig.outputDir).toBe('packages/lib-rpc/src');
    });

    it('should handle single module package configuration', async () => {
      const config = {
        packagePath: 'lib-rpc',
        packageName: '@test/rpc',
        modulePackages: ['modules/user']
      };

      await runBootstrapWithInputs(config);

      const configPath = path.join(tempDir, 'lib-rpc/nestjs-rpc-toolkit.config.json');
      const rpcConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(rpcConfig.packages).toEqual(['modules/user']);
    });
  });

  describe('Generate Script Creation', () => {
    it('should create the generate-all-rpc-types.ts script', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const scriptPath = path.join(tempDir, 'packages/lib-rpc/scripts/generate-all-rpc-types.ts');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

      expect(scriptContent).toContain('import { RpcTypesGenerator }');
      expect(scriptContent).toContain('@zdavison/nestjs-rpc-toolkit');
      expect(scriptContent).toContain('const rootDir = path.join(__dirname, \'../../../\')');
      expect(scriptContent).toContain('const configPath = path.join(__dirname, \'../nestjs-rpc-toolkit.config.json\')');
      expect(scriptContent).toContain('generator.generate()');
    });

    it('should reference the correct package name in comments', async () => {
      const config = {
        packagePath: 'libs/shared/rpc',
        packageName: '@myorg/shared-rpc',
        modulePackages: ['apps/*']
      };

      await runBootstrapWithInputs(config);

      const scriptPath = path.join(tempDir, 'libs/shared/rpc/scripts/generate-all-rpc-types.ts');
      const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

      expect(scriptContent).toContain('// Run the generator - we\'re in rpc/scripts');
    });
  });

  describe('Source Files Creation', () => {
    it('should create index.ts with correct exports', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const indexPath = path.join(tempDir, 'packages/lib-rpc/src/index.ts');
      expect(fs.existsSync(indexPath)).toBe(true);

      const indexContent = fs.readFileSync(indexPath, 'utf-8');

      expect(indexContent).toContain('export * from \'./all.rpc.gen\'');
      expect(indexContent).toContain('export * from \'./typed-message-bus\'');
    });

    it('should create typed-message-bus.ts with correct implementation', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const messageBusPath = path.join(tempDir, 'packages/lib-rpc/src/typed-message-bus.ts');
      expect(fs.existsSync(messageBusPath)).toBe(true);

      const messageBusContent = fs.readFileSync(messageBusPath, 'utf-8');

      expect(messageBusContent).toContain('import { MessageBus as BaseMessageBus');
      expect(messageBusContent).toContain('import { AllRpcMethods } from \'./all.rpc.gen\'');
      expect(messageBusContent).toContain('export interface ITypedMessageBus extends IMessageBus<AllRpcMethods>');
      expect(messageBusContent).toContain('export class MessageBus extends BaseMessageBus<AllRpcMethods>');
      expect(messageBusContent).toContain('@Injectable()');
    });

    it('should create placeholder all.rpc.gen.ts', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const genPath = path.join(tempDir, 'packages/lib-rpc/src/all.rpc.gen.ts');
      expect(fs.existsSync(genPath)).toBe(true);

      const genContent = fs.readFileSync(genPath, 'utf-8');

      expect(genContent).toContain('// This file will be generated by the RPC types generator');
      expect(genContent).toContain('export interface AllRpcMethods');
    });
  });

  describe('Default Values and User Input', () => {
    it('should handle custom package paths correctly', async () => {
      const config = {
        packagePath: 'my-custom-path/rpc-lib',
        packageName: '@custom/rpc-package',
        modulePackages: ['src/services/*']
      };

      await runBootstrapWithInputs(config);

      const packagePath = path.join(tempDir, 'my-custom-path/rpc-lib');
      expect(fs.existsSync(packagePath)).toBe(true);

      const packageJsonPath = path.join(packagePath, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.name).toBe('@custom/rpc-package');
    });
  });

  describe('Complete Package Structure', () => {
    it('should create a fully functional RPC package structure', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const packagePath = path.join(tempDir, 'packages/lib-rpc');

      const expectedFiles = [
        'package.json',
        'tsconfig.json',
        'nestjs-rpc-toolkit.config.json',
        'scripts/generate-all-rpc-types.ts',
        'src/index.ts',
        'src/typed-message-bus.ts',
        'src/all.rpc.gen.ts'
      ];

      expectedFiles.forEach(file => {
        const filePath = path.join(packagePath, file);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });

    it('should create valid JSON files that can be parsed', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const packagePath = path.join(tempDir, 'packages/lib-rpc');

      const packageJson = JSON.parse(
        fs.readFileSync(path.join(packagePath, 'package.json'), 'utf-8')
      );
      expect(packageJson).toBeDefined();

      const tsconfig = JSON.parse(
        fs.readFileSync(path.join(packagePath, 'tsconfig.json'), 'utf-8')
      );
      expect(tsconfig).toBeDefined();

      const rpcConfig = JSON.parse(
        fs.readFileSync(path.join(packagePath, 'nestjs-rpc-toolkit.config.json'), 'utf-8')
      );
      expect(rpcConfig).toBeDefined();
    });

    it('should create TypeScript files with valid syntax', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const packagePath = path.join(tempDir, 'packages/lib-rpc');

      const indexContent = fs.readFileSync(path.join(packagePath, 'src/index.ts'), 'utf-8');
      expect(indexContent).not.toContain('undefined');
      expect(indexContent.trim().length).toBeGreaterThan(0);

      const messageBusContent = fs.readFileSync(path.join(packagePath, 'src/typed-message-bus.ts'), 'utf-8');
      expect(messageBusContent).toContain('export');
      expect(messageBusContent).toContain('import');

      const genContent = fs.readFileSync(path.join(packagePath, 'src/all.rpc.gen.ts'), 'utf-8');
      expect(genContent).toContain('export interface AllRpcMethods');
    });
  });

  describe('Git Root Detection', () => {
    it('should handle projects with .git directory for tsconfig resolution', async () => {
      fs.mkdirSync(path.join(tempDir, '.git'));

      const rootTsConfig = {
        compilerOptions: {
          target: 'ES2021'
        }
      };
      fs.writeFileSync(
        path.join(tempDir, 'tsconfig.base.json'),
        JSON.stringify(rootTsConfig, null, 2)
      );

      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const tsconfigPath = path.join(tempDir, 'packages/lib-rpc/tsconfig.json');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));

      expect(tsconfig.extends).toBeDefined();
    });

    it('should work in non-git directories', async () => {
      const config = {
        packagePath: 'packages/lib-rpc',
        packageName: '@test-project/rpc',
        modulePackages: ['packages/modules/*']
      };

      await runBootstrapWithInputs(config);

      const packagePath = path.join(tempDir, 'packages/lib-rpc');
      expect(fs.existsSync(packagePath)).toBe(true);
    });
  });
});
