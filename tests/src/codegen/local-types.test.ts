/**
 * Test case for type generation bugs with locally-defined types:
 *
 * Issue: RPC Type Generator Missing Type Dependencies and Exports
 *
 * The RpcTypesGenerator generates incomplete type files when RPC controller methods
 * use locally-defined types. It:
 *
 * 1. Misses transitive type dependencies - if CreateDynamicFormRequest references
 *    CreateFormRpcParams, only the former is copied
 * 2. Misses type aliases - type SerializableValue = ... is not copied even though
 *    SerializableObject references it
 * 3. Interfaces missing 'export' keyword in generated output
 * 4. Forward-referenced types not being collected (SerializableObject defined before SerializableValue)
 *
 * This test uses the forms-module example which demonstrates these bugs.
 * The forms-module is structured to mirror the oddjob-contacts pattern where
 * SerializableObject is defined BEFORE SerializableValue (forward reference).
 */

import 'reflect-metadata';
import { RpcTypesGenerator } from '@zdavison/nestjs-rpc-toolkit';
import * as path from 'path';
import * as fs from 'fs';

describe('RPC type generator should include all locally-defined types and their transitive dependencies', () => {
  const rootDir = path.join(__dirname, '../../..');
  const examplesLibRpcDir = path.join(rootDir, 'examples/lib-rpc');
  const configPath = path.join(examplesLibRpcDir, 'nestjs-rpc-toolkit.config.json');
  const outputDir = path.join(examplesLibRpcDir, 'src');

  let generator: RpcTypesGenerator;
  let formsGenContent: string;

  beforeAll(() => {
    generator = new RpcTypesGenerator({
      rootDir,
      configPath
    });
    generator.generate();

    const formsGenFile = path.join(outputDir, 'forms.rpc.gen.ts');
    formsGenContent = fs.readFileSync(formsGenFile, 'utf-8');
  });

  describe('Type Alias Generation', () => {
    it('should include type aliases that are directly referenced by interfaces', () => {
      // SerializableValue is used in SerializableObject's definition
      // It should be defined in the generated file
      expect(formsGenContent).toContain('type SerializableValue');
    });

    it('should export type aliases', () => {
      // Type aliases should be exported so they can be used by consumers
      expect(formsGenContent).toContain('export type SerializableValue');
    });

    it('should include type aliases used by other type aliases', () => {
      // SerializableObject references SerializableValue, so both should be included
      expect(formsGenContent).toContain('type SerializableObject');
      expect(formsGenContent).toContain('export type SerializableObject');
    });

    it('should handle recursive type aliases', () => {
      // SerializableValue references itself (SerializableValue[])
      // The generator should handle this without infinite loops
      expect(formsGenContent).toMatch(/type SerializableValue\s*=.*SerializableValue\[\]/);
    });

    it('should include forward-referenced type aliases', () => {
      // In the source, SerializableObject is defined BEFORE SerializableValue
      // but SerializableObject references SerializableValue
      // Both should still be included
      expect(formsGenContent).toContain('export type SerializableObject');
      expect(formsGenContent).toContain('export type SerializableValue');
    });
  });

  describe('Transitive Interface Dependencies', () => {
    it('should include interfaces that are referenced by other interfaces', () => {
      // CreateDynamicFormRequest references CreateFormRpcParams
      // CreateFormRpcParams should be included
      expect(formsGenContent).toContain('interface CreateFormRpcParams');
    });

    it('should include deeply nested interface dependencies', () => {
      // CreateFormRpcParams references RpcFormFieldDefinition
      // RpcFormFieldDefinition should be included
      expect(formsGenContent).toContain('interface RpcFormFieldDefinition');
    });

    it('should export all transitive interface dependencies', () => {
      // All transitive dependencies should be exported
      expect(formsGenContent).toContain('export interface CreateFormRpcParams');
      expect(formsGenContent).toContain('export interface RpcFormFieldDefinition');
    });

    it('should include response types from all RPC methods', () => {
      // FormDataRpcResponse is returned by loadFormByToken
      // FormStatusResponse is returned by checkFormStatus
      expect(formsGenContent).toContain('export interface FormDataRpcResponse');
      expect(formsGenContent).toContain('export interface FormStatusResponse');
    });
  });

  describe('Generated File Completeness', () => {
    it('should not have any undefined type references', () => {
      // Remove comments from the content before analyzing
      const contentWithoutComments = formsGenContent
        .replace(/\/\/.*$/gm, '') // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

      // Extract all type references from the generated file (property type annotations)
      const typeUsages = contentWithoutComments.match(/:\s*([A-Z][a-zA-Z0-9_$]*)/g) || [];
      const typeDefinitions = contentWithoutComments.match(/(?:type|interface)\s+([A-Z][a-zA-Z0-9_$]*)/g) || [];
      const importStatements = contentWithoutComments.match(/import\s*\{([^}]+)\}/g) || [];

      // Extract type names from definitions
      const definedTypes = new Set<string>();
      typeDefinitions.forEach(def => {
        const match = def.match(/(?:type|interface)\s+([A-Z][a-zA-Z0-9_$]*)/);
        if (match) definedTypes.add(match[1]);
      });

      // Extract type names from imports
      importStatements.forEach(imp => {
        const match = imp.match(/import\s*\{([^}]+)\}/);
        if (match) {
          match[1].split(',').forEach(name => {
            definedTypes.add(name.trim());
          });
        }
      });

      // Add built-in types
      const builtInTypes = new Set([
        'Promise', 'string', 'number', 'boolean', 'null', 'Record', 'Array',
        'Partial', 'Required', 'Readonly', 'Pick', 'Omit'
      ]);

      // Check each used type
      const undefinedTypes: string[] = [];
      typeUsages.forEach(usage => {
        const match = usage.match(/:\s*([A-Z][a-zA-Z0-9_$]*)/);
        if (match) {
          const typeName = match[1];
          if (!definedTypes.has(typeName) && !builtInTypes.has(typeName)) {
            undefinedTypes.push(typeName);
          }
        }
      });

      // Should have no undefined types
      expect(undefinedTypes).toEqual([]);
    });

    it('should generate valid TypeScript that can be compiled', () => {
      // Check for basic TypeScript syntax validity
      // Each interface/type should have proper export keyword

      // Check that interfaces are exported
      const interfaceMatches = formsGenContent.match(/^(export\s+)?interface\s+\w+/gm) || [];
      const nonExportedInterfaces = interfaceMatches.filter(m => !m.startsWith('export'));

      expect(nonExportedInterfaces).toHaveLength(0);
    });
  });

  describe('Specific Bug Reproductions (oddjob-contacts pattern)', () => {
    it('Bug 1: CreateFormRpcParams should be included (transitive dependency of CreateDynamicFormRequest)', () => {
      // CreateDynamicFormRequest.params: CreateFormRpcParams
      // This is a direct property type reference that should be followed
      expect(formsGenContent).toMatch(/export\s+interface\s+CreateFormRpcParams\s*\{/);
    });

    it('Bug 2: SerializableValue type alias should be included even when forward-referenced', () => {
      // In source: SerializableObject is defined before SerializableValue
      // SerializableObject = { [key: string]: SerializableValue } -- forward reference
      // Both must be included
      expect(formsGenContent).toMatch(/export\s+type\s+SerializableValue\s*=/);
    });

    it('Bug 3: SerializableObject type alias should be included (used by FormDataRpcResponse.schema)', () => {
      // FormDataRpcResponse.schema: SerializableObject
      expect(formsGenContent).toMatch(/export\s+type\s+SerializableObject\s*=/);
    });

    it('Bug 4: All interfaces should have export keyword', () => {
      // Check for interfaces without export
      const allInterfaces = formsGenContent.match(/^interface\s+\w+/gm) || [];
      expect(allInterfaces).toHaveLength(0); // Should be no non-exported interfaces
    });

    it('Bug 5: RpcFormFieldDefinition should be included (transitive dependency)', () => {
      // CreateFormRpcParams.fields: RpcFormFieldDefinition[]
      expect(formsGenContent).toMatch(/export\s+interface\s+RpcFormFieldDefinition\s*\{/);
    });
  });

  describe('Type Order and Dependencies', () => {
    it('should define type aliases before interfaces that use them', () => {
      // SerializableValue and SerializableObject should be defined before FormDataRpcResponse
      const serializableValueIndex = formsGenContent.indexOf('type SerializableValue');
      const serializableObjectIndex = formsGenContent.indexOf('type SerializableObject');
      const formDataRpcResponseIndex = formsGenContent.indexOf('interface FormDataRpcResponse');

      // SerializableValue should come before things that use it
      if (serializableValueIndex !== -1 && formDataRpcResponseIndex !== -1) {
        expect(serializableValueIndex).toBeLessThan(formDataRpcResponseIndex);
      }

      // SerializableObject should come before things that use it
      if (serializableObjectIndex !== -1 && formDataRpcResponseIndex !== -1) {
        expect(serializableObjectIndex).toBeLessThan(formDataRpcResponseIndex);
      }
    });

    it('should define CreateFormRpcParams before CreateDynamicFormRequest', () => {
      const paramsIndex = formsGenContent.indexOf('interface CreateFormRpcParams');
      const requestIndex = formsGenContent.indexOf('interface CreateDynamicFormRequest');

      // CreateFormRpcParams should be defined before CreateDynamicFormRequest uses it
      if (paramsIndex !== -1 && requestIndex !== -1) {
        expect(paramsIndex).toBeLessThan(requestIndex);
      }
    });

    it('should define RpcFormFieldDefinition before CreateFormRpcParams', () => {
      const fieldDefIndex = formsGenContent.indexOf('interface RpcFormFieldDefinition');
      const paramsIndex = formsGenContent.indexOf('interface CreateFormRpcParams');

      // RpcFormFieldDefinition should be defined before CreateFormRpcParams uses it
      if (fieldDefIndex !== -1 && paramsIndex !== -1) {
        expect(fieldDefIndex).toBeLessThan(paramsIndex);
      }
    });
  });
});
