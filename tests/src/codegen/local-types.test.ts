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
 *
 * This test uses the forms-module example which demonstrates these bugs.
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
      // SerializableValue is used by RpcFormFieldDefinition.defaultValue
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
  });

  describe('Transitive Interface Dependencies', () => {
    it('should include interfaces that are referenced by other interfaces', () => {
      // CreateDynamicFormRequest references CreateFormRpcParams
      // CreateFormRpcParams should be included
      expect(formsGenContent).toContain('interface CreateFormRpcParams');
    });

    it('should include deeply nested interface dependencies', () => {
      // CreateFormRpcParams references RpcFormFieldDefinition
      // RpcFormFieldDefinition should be included (it already is, but we verify)
      expect(formsGenContent).toContain('interface RpcFormFieldDefinition');
    });

    it('should export all transitive interface dependencies', () => {
      // All transitive dependencies should be exported
      expect(formsGenContent).toContain('export interface CreateFormRpcParams');
      expect(formsGenContent).toContain('export interface RpcFormFieldDefinition');
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

  describe('Specific Bug Reproductions', () => {
    it('Bug 1: CreateFormRpcParams should be included (transitive dependency of CreateDynamicFormRequest)', () => {
      // CreateDynamicFormRequest.params: CreateFormRpcParams
      // This is a direct property type reference that should be followed
      expect(formsGenContent).toMatch(/export\s+interface\s+CreateFormRpcParams\s*\{/);
    });

    it('Bug 2: SerializableValue type alias should be included (used by SerializableObject and RpcFormFieldDefinition)', () => {
      // SerializableObject = { [key: string]: SerializableValue }
      // RpcFormFieldDefinition.defaultValue?: SerializableValue
      expect(formsGenContent).toMatch(/export\s+type\s+SerializableValue\s*=/);
    });

    it('Bug 3: SerializableObject type alias should be included (used by CreateDynamicFormResponse.schema)', () => {
      // CreateDynamicFormResponse.schema: SerializableObject
      expect(formsGenContent).toMatch(/export\s+type\s+SerializableObject\s*=/);
    });
  });

  describe('Type Order and Dependencies', () => {
    it('should define type aliases before interfaces that use them', () => {
      // SerializableValue and SerializableObject should be defined before RpcFormFieldDefinition
      const serializableValueIndex = formsGenContent.indexOf('type SerializableValue');
      const serializableObjectIndex = formsGenContent.indexOf('type SerializableObject');
      const rpcFormFieldIndex = formsGenContent.indexOf('interface RpcFormFieldDefinition');

      // SerializableValue should come before things that use it
      if (serializableValueIndex !== -1 && rpcFormFieldIndex !== -1) {
        expect(serializableValueIndex).toBeLessThan(rpcFormFieldIndex);
      }

      // SerializableObject should come before things that use it
      if (serializableObjectIndex !== -1 && formsGenContent.indexOf('interface CreateDynamicFormResponse') !== -1) {
        const responseIndex = formsGenContent.indexOf('interface CreateDynamicFormResponse');
        expect(serializableObjectIndex).toBeLessThan(responseIndex);
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
  });
});
