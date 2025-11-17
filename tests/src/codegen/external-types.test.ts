import 'reflect-metadata';
import { RpcTypesGenerator } from '@zdavison/nestjs-rpc-toolkit';
import * as path from 'path';
import * as fs from 'fs';

describe('External types imported from other packages will be included in generated RPC interfaces', () => {
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

  describe('External Type Import Detection', () => {
    it('should include external types in generated output when used in RPC methods', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // The user.rpc.gen.ts should reference the ContactInfo type
      // because UpdateUserContactResponse uses it
      expect(content).toContain('ContactInfo');
    });

    it('should import external types from their source packages', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // The ContactInfo type should be imported from @shared/types
      expect(content).toContain("import { ContactInfo } from '@shared/types'");
    });

    it('should generate the UpdateUserContactDto interface with external type reference', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that UpdateUserContactDto is generated
      expect(content).toContain('export interface UpdateUserContactDto');

      // It should reference ContactInfo
      expect(content).toMatch(/UpdateUserContactDto[\s\S]*contactInfo:\s*ContactInfo/);
    });

    it('should generate the UpdateUserContactResponse interface with external type reference', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that UpdateUserContactResponse is generated
      expect(content).toContain('export interface UpdateUserContactResponse');

      // It should reference ContactInfo
      expect(content).toMatch(/UpdateUserContactResponse[\s\S]*contactInfo:\s*ContactInfo/);
    });

    it('should not duplicate type definitions for imported types', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // External types should be imported, not defined in the generated file
      expect(content).not.toMatch(/export interface ContactInfo \{/);
      expect(content).not.toMatch(/export interface Address \{/);
    });
  });

  describe('External Type Import Handling', () => {
    it('should import external types rather than duplicate definitions', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Verify the import is at the top of the file
      const lines = content.split('\n');
      const importLine = lines.find(line => line.includes('import') && line.includes('@shared/types'));
      expect(importLine).toBeTruthy();
      expect(importLine).toContain('ContactInfo');
    });

    it('should maintain type safety by importing from source packages', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // The import should come before the type usage
      const importIndex = content.indexOf("import { ContactInfo }");
      const usageIndex = content.indexOf("contactInfo: ContactInfo");

      expect(importIndex).toBeGreaterThan(-1);
      expect(usageIndex).toBeGreaterThan(-1);
      expect(importIndex).toBeLessThan(usageIndex);
    });

    it('should handle multiple external types from the same package', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // If multiple types from same package are used, they should be in one import
      const importMatches = content.match(/import \{[^}]+\} from '@shared\/types'/g);

      // Should have at most one import statement for @shared/types
      if (importMatches) {
        expect(importMatches.length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('External Type Source Preservation', () => {
    it('should preserve JSDoc in the DTO interfaces that use external types', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that the DTOs themselves have JSDoc
      expect(content).toMatch(/\/\*\*[\s\S]*?DTO for updating user contact information[\s\S]*?\*\//);
    });

    it('should preserve property-level JSDoc in DTOs', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Property JSDoc in our local DTOs should be preserved
      const hasPropertyJsDoc = content.includes('User ID to update') ||
                               content.includes('Contact information from external package');

      expect(hasPropertyJsDoc).toBe(true);
    });
  });

  describe('RPC Method with External Types', () => {
    it('should generate the updateContact RPC method in UserDomain interface', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that the updateContact method is in the UserDomain interface
      expect(content).toMatch(/updateContact\s*\(/);
    });

    it('should use UpdateUserContactDto in the method signature', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // The method should accept UpdateUserContactDto
      expect(content).toMatch(/updateContact\(params: \{ dto: UpdateUserContactDto \}/);
    });

    it('should return Promise<UpdateUserContactResponse>', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // The method should return the response type
      expect(content).toMatch(/updateContact[\s\S]*Promise<UpdateUserContactResponse>/);
    });
  });

  describe('Generated File Imports', () => {
    it('should have import statements for external packages in generated files', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Generated files should import external types from their packages
      expect(content).toContain("import { ContactInfo } from '@shared/types'");
    });

    it('should make the generated file compilable with proper imports', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // The file should be compilable with the imports
      // External types should be imported, not defined
      const hasImport = content.includes("import { ContactInfo }");
      const hasLocalContactInfoDefinition = /export interface ContactInfo \{/.test(content);

      expect(hasImport).toBe(true);
      expect(hasLocalContactInfoDefinition).toBe(false);
    });

    it('should reference external types correctly in local interfaces', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // The DTOs should use the imported types
      expect(content).toMatch(/contactInfo:\s*ContactInfo/);
    });
  });
});
