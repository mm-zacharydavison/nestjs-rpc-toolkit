/**
 * Test case for external type re-export bug:
 *
 * Issue: External Type Re-exports Not Handled Correctly
 *
 * When an RPC controller uses types imported from external packages (like JsonValue from type-fest),
 * the generator:
 *
 * 1. Correctly imports the type in the module's generated file (forms.rpc.gen.ts)
 * 2. Incorrectly tries to re-export it from all.rpc.gen.ts as if it were defined locally
 *
 * Expected behavior - either:
 * - Option A: Re-export external types from module file
 * - Option B: Import external types directly in all.rpc.gen.ts from original source
 *
 * Additional issue:
 * - Unused imports: If JsonObject is imported but not used, it should not be in the import statement
 */

import 'reflect-metadata';
import { RpcTypesGenerator } from '@zdavison/nestjs-rpc-toolkit';
import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';

describe('External type re-exports from npm packages (e.g., type-fest)', () => {
  const rootDir = path.join(__dirname, '../../..');
  const examplesLibRpcDir = path.join(rootDir, 'examples/lib-rpc');
  const configPath = path.join(examplesLibRpcDir, 'nestjs-rpc-toolkit.config.json');
  const outputDir = path.join(examplesLibRpcDir, 'src');

  let formsGenContent: string;
  let allGenContent: string;

  beforeAll(() => {
    const generator = new RpcTypesGenerator({
      rootDir,
      configPath
    });
    generator.generate();

    const formsGenFile = path.join(outputDir, 'forms.rpc.gen.ts');
    const allGenFile = path.join(outputDir, 'all.rpc.gen.ts');
    formsGenContent = fs.readFileSync(formsGenFile, 'utf-8');
    allGenContent = fs.readFileSync(allGenFile, 'utf-8');
  });

  describe('Module file generation (forms.rpc.gen.ts)', () => {
    it('should import JsonValue from type-fest', () => {
      // The forms.rpc.gen.ts should have an import for JsonValue from type-fest
      expect(formsGenContent).toContain("from 'type-fest'");
      expect(formsGenContent).toContain('JsonValue');
    });

    it('should use JsonValue in the submitForm method signature', () => {
      // The submitForm method should use JsonValue type
      expect(formsGenContent).toMatch(/submitForm.*JsonValue/);
    });

    it('should only import types that are actually used (no unused imports)', () => {
      // If JsonObject is not used in any RPC method, it should not be imported
      // Check if JsonObject appears in the module interface methods
      const domainInterfaceMatch = formsGenContent.match(/export interface FormsDomain \{[\s\S]*?\}/);
      const domainInterface = domainInterfaceMatch ? domainInterfaceMatch[0] : '';

      // If JsonObject is not used in the domain interface, it should not be imported
      if (!domainInterface.includes('JsonObject')) {
        // Check if JsonObject is in the imports - it should NOT be if unused
        const importLine = formsGenContent.match(/import \{[^}]*\} from 'type-fest'/);
        const importsJsonObject = importLine && importLine[0].includes('JsonObject');

        // JsonObject should NOT be imported if it's not used
        expect(importsJsonObject).toBeFalsy();
      }
    });
  });

  describe('Aggregated file generation (all.rpc.gen.ts)', () => {
    it('should NOT try to import external types (JsonValue) from module files unless they are re-exported', () => {
      // The all.rpc.gen.ts should NOT have JsonValue in imports from forms.rpc.gen
      // unless forms.rpc.gen.ts actually exports JsonValue
      const formsImportMatch = allGenContent.match(/import \{([^}]+)\} from '\.\/forms\.rpc\.gen'/);

      if (formsImportMatch) {
        const importedTypes = formsImportMatch[1];

        // Check if forms.rpc.gen.ts actually exports JsonValue
        const formsExportsJsonValue = formsGenContent.includes('export { JsonValue }') ||
                                       formsGenContent.includes('export type { JsonValue }') ||
                                       formsGenContent.match(/export \{[^}]*JsonValue[^}]*\} from 'type-fest'/);

        // If all.rpc.gen.ts tries to import JsonValue from forms.rpc.gen,
        // then forms.rpc.gen MUST export it
        if (importedTypes.includes('JsonValue')) {
          expect(formsExportsJsonValue).toBeTruthy();
        }
      }
    });

    it('should compile without errors', () => {
      // Try to compile all.rpc.gen.ts to check for import errors
      const allGenFile = path.join(outputDir, 'all.rpc.gen.ts');

      const program = ts.createProgram([allGenFile], {
        noEmit: true,
        skipLibCheck: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        strict: false,
        baseUrl: rootDir,
        paths: {
          '@shared/types': ['./examples/shared/types/src/index.ts']
        }
      });

      const diagnostics = ts.getPreEmitDiagnostics(program);
      const errors = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);

      // Filter for import-related errors
      const importErrors = errors.filter(e => {
        const message = ts.flattenDiagnosticMessageText(e.messageText, '\n');
        return message.includes('is not exported') ||
               message.includes('has no exported member') ||
               message.includes('cannot find');
      });

      // There should be no import-related compilation errors
      const errorMessages = importErrors.map(e =>
        ts.flattenDiagnosticMessageText(e.messageText, '\n')
      );
      expect(importErrors).toHaveLength(0);
    });
  });

  describe('Correct handling options', () => {
    it('Option A: Module file should re-export external types for all.rpc.gen.ts to import', () => {
      // If the generator chooses Option A, forms.rpc.gen.ts should re-export JsonValue
      const reExportsJsonValue = formsGenContent.includes('export { JsonValue }') ||
                                  formsGenContent.includes('export type { JsonValue }') ||
                                  formsGenContent.match(/export \{[^}]*JsonValue[^}]*\} from 'type-fest'/);

      // Check if all.rpc.gen.ts imports JsonValue from forms.rpc.gen
      const allImportsFromForms = allGenContent.match(/import \{([^}]+)\} from '\.\/forms\.rpc\.gen'/);
      const allImportsJsonValueFromForms = allImportsFromForms &&
                                            allImportsFromForms[1].includes('JsonValue');

      // If all.rpc.gen.ts imports JsonValue from forms, then forms MUST re-export it
      if (allImportsJsonValueFromForms) {
        expect(reExportsJsonValue).toBeTruthy();
      }
    });

    it('Option B: all.rpc.gen.ts should import external types directly from source package', () => {
      // If the generator chooses Option B, all.rpc.gen.ts should import JsonValue from type-fest directly
      const directImport = allGenContent.includes("import { JsonValue } from 'type-fest'") ||
                           allGenContent.includes("import type { JsonValue } from 'type-fest'");

      // Check if all.rpc.gen.ts tries to import JsonValue from forms.rpc.gen
      const formsImportMatch = allGenContent.match(/import \{([^}]+)\} from '\.\/forms\.rpc\.gen'/);
      const importedFromForms = formsImportMatch ? formsImportMatch[1] : '';

      // Check if forms.rpc.gen.ts exports JsonValue
      const formsExportsJsonValue = formsGenContent.includes('export { JsonValue }') ||
                                     formsGenContent.includes('export type { JsonValue }') ||
                                     formsGenContent.match(/export \{[^}]*JsonValue[^}]*\} from 'type-fest'/);

      // If imported from forms.rpc.gen but not exported, it should use direct import instead
      if (importedFromForms.includes('JsonValue') && !formsExportsJsonValue) {
        // Bug: should either re-export from forms or import directly from type-fest
        expect(directImport || formsExportsJsonValue).toBeTruthy();
      }
    });
  });
});
