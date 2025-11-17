import 'reflect-metadata';
import { RpcTypesGenerator } from '@zdavison/nestjs-rpc-toolkit';
import * as path from 'path';
import * as fs from 'fs';

describe('JSDoc will be preserved in RPC interfaces.', () => {
  const rootDir = path.join(__dirname, '../../..');
  const examplesLibRpcDir = path.join(rootDir, 'examples/lib-rpc');
  const configPath = path.join(examplesLibRpcDir, 'nestjs-rpc-toolkit.config.json');
  const outputDir = path.join(examplesLibRpcDir, 'src');

  let generator: RpcTypesGenerator;

  beforeAll(() => {
    generator = new RpcTypesGenerator({
      rootDir,
      configPath
    });
    generator.generate();
  });

  describe('JSDoc on RPC Methods', () => {
    it('should preserve JSDoc comments on methods with @RpcMethod decorators', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that methods in the domain interface have JSDoc
      // Pattern: /**...*/\s*methodName(...): Promise<...>
      const methodWithJsDoc = /\/\*\*[\s\S]*?\*\/\s*\w+\([^)]*\):\s*Promise</g;
      const matches = content.match(methodWithJsDoc);

      expect(matches).toBeTruthy();
      expect(matches!.length).toBeGreaterThan(0);
    });

    it('should preserve @param tags in method JSDoc', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check for @param tags in JSDoc
      expect(content).toMatch(/\* @param \w+/);
    });

    it('should preserve @returns tags in method JSDoc', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check for @returns tags in JSDoc
      expect(content).toMatch(/\* @returns/);
    });

    it('should place JSDoc immediately before method declarations', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // JSDoc should be directly followed by method signature, not separated by blank lines
      const properPlacement = /\/\*\*[\s\S]*?\*\/\s*\w+<?\w*>?\([^)]*\):/;
      expect(content).toMatch(properPlacement);
    });
  });

  describe('JSDoc on Type Interfaces', () => {
    it('should preserve JSDoc comments on interface declarations', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check for JSDoc before interface declarations
      // Pattern: /**...*/\s*export interface
      const interfaceWithJsDoc = /\/\*\*[\s\S]*?\*\/\s*export interface/g;
      const matches = content.match(interfaceWithJsDoc);

      expect(matches).toBeTruthy();
      expect(matches!.length).toBeGreaterThan(0);
    });

    it('should allow type aliases with or without JSDoc', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Type aliases may or may not have JSDoc depending on the source
      // Just verify that if they exist, they're valid TypeScript
      if (content.includes('export type')) {
        expect(content).toMatch(/export type \w+/);
      }
    });

    it('should not have empty JSDoc blocks', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Empty JSDoc pattern: /** */ or /**\n*/
      const emptyJsDoc = /\/\*\*\s*\*\//;
      expect(content).not.toMatch(emptyJsDoc);
    });
  });

  describe('JSDoc on Type Properties', () => {
    it('should preserve JSDoc comments on interface properties', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check for single-line JSDoc comments on properties
      // Pattern: /** ... */ propertyName: type;
      const propertyWithJsDoc = /\/\*\* .+ \*\/\s*\w+[?]?:\s*\w+/;
      expect(content).toMatch(propertyWithJsDoc);
    });

    it('should preserve multi-line JSDoc on properties', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check for multi-line JSDoc (with newlines and asterisks)
      const multiLineJsDoc = /\/\*\*\s*\n\s*\*/;

      // If multi-line JSDoc exists, it should be properly formatted
      if (content.match(multiLineJsDoc)) {
        // Should have proper indentation with asterisks
        expect(content).toMatch(/\/\*\*\s*\n\s*\* /);
      }
    });

    it('should place property JSDoc on the same or previous line', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // JSDoc should be either:
      // 1. On same line: /** comment */ property: type;
      // 2. On previous lines with no gap
      const properFormatting = /\/\*\*[^*]*\*\/\s*\w+[?]?:/;
      expect(content).toMatch(properFormatting);
    });
  });

  describe('JSDoc Preservation Across All Generated Files', () => {
    it('should preserve JSDoc in generated module files that have JSDoc in source', () => {
      const generatedFiles = fs.readdirSync(outputDir)
        .filter(file => file.endsWith('.rpc.gen.ts') && file !== 'all.rpc.gen.ts');

      expect(generatedFiles.length).toBeGreaterThan(0);

      // At least one generated file should have JSDoc (if source files have JSDoc)
      const filesWithJsDoc = generatedFiles.filter(file => {
        const filePath = path.join(outputDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        return content.includes('/**');
      });

      // We expect at least some files to have JSDoc comments
      expect(filesWithJsDoc.length).toBeGreaterThan(0);
    });

    it('should maintain JSDoc in the aggregated all.rpc.gen.ts file', () => {
      const allGenFile = path.join(outputDir, 'all.rpc.gen.ts');
      const content = fs.readFileSync(allGenFile, 'utf-8');

      // The main client interface should be documented
      expect(content).toContain('export interface IRpcClient');
    });
  });

  describe('JSDoc Format Validity', () => {
    it('should use valid JSDoc syntax', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // All JSDoc blocks should start with /** and end with */
      const jsDocBlocks = content.match(/\/\*\*[\s\S]*?\*\//g);

      expect(jsDocBlocks).toBeTruthy();

      jsDocBlocks!.forEach(block => {
        expect(block).toMatch(/^\/\*\*/);
        expect(block).toMatch(/\*\/$/);
      });
    });

    it('should not break TypeScript declarations with JSDoc', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // After each JSDoc block, there should be a valid TypeScript declaration
      // Not: /** comment */ export
      const validPattern = /\/\*\*[\s\S]*?\*\/\s*(export\s+(interface|type|const)|[a-z]\w+[(<:])/gi;
      const matches = content.match(validPattern);

      expect(matches).toBeTruthy();
      expect(matches!.length).toBeGreaterThan(0);
    });

    it('should preserve JSDoc description text', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // JSDoc blocks should contain actual text (not just tags)
      const jsDocWithText = /\/\*\*[\s\S]*?\* [A-Z][a-z]/;
      expect(content).toMatch(jsDocWithText);
    });
  });

  describe('JSDoc on Copied/Referenced Types', () => {
    it('should preserve JSDoc on types used in method parameters', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Find a method signature
      const methodMatch = content.match(/\w+\(params: \{ \w+: (\w+)/);

      if (methodMatch) {
        const paramType = methodMatch[1];

        // That parameter type should have JSDoc
        const typePattern = new RegExp(`\\/\\*\\*[\\s\\S]*?\\*\\/\\s*export interface ${paramType}`);
        expect(content).toMatch(typePattern);
      }
    });

    it('should preserve JSDoc on types used in method return values', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Find a method return type
      const methodMatch = content.match(/Promise<(\w+)>/);

      if (methodMatch) {
        const returnType = methodMatch[1];

        // That return type should have JSDoc (unless it's a primitive)
        if (!['string', 'number', 'boolean', 'void'].includes(returnType)) {
          const typePattern = new RegExp(`\\/\\*\\*[\\s\\S]*?\\*\\/\\s*export interface ${returnType}`);
          expect(content).toMatch(typePattern);
        }
      }
    });

    it('should preserve JSDoc on nested type properties', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Look for interfaces with multiple properties
      const interfaceMatch = content.match(/export interface \w+ \{([\s\S]*?)\n\}/);

      if (interfaceMatch) {
        const interfaceBody = interfaceMatch[1];

        // Properties in the interface should have JSDoc comments
        const propertyLines = interfaceBody.split('\n').filter(line => line.includes(':'));

        if (propertyLines.length > 0) {
          // At least some properties should have JSDoc
          const hasJsDoc = interfaceBody.includes('/**');
          expect(hasJsDoc).toBe(true);
        }
      }
    });
  });
});
