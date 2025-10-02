import { RpcTypesGenerator } from '@zdavison/nestjs-rpc-toolkit';
import * as path from 'path';
import * as fs from 'fs';

describe('Generic types will be supported for all RPC interfaces.', () => {
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
  });

  describe('Generic Type Parameters in Generated Interfaces', () => {
    it('should generate generic type parameters for DTO interfaces', () => {
      generator.generate();

      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that LookupUsersQuery has generic type parameter
      expect(content).toMatch(/export interface LookupUsersQuery<Select extends UserSelect/);
    });

    it('should generate generic type parameters for result interfaces', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that LookupUsersResult has generic type parameter
      expect(content).toMatch(/export interface LookupUsersResult<Select extends UserSelect/);
    });

    it('should use Pick utility type with generic constraints for field selection', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that the result uses Pick with generic type parameter
      expect(content).toContain('Pick<');
      expect(content).toContain('Extract<');
      // Should have the generic field selection pattern
      expect(content).toMatch(/Pick<\s*User,\s*Extract</);
    });

    it('should generate UserSelect type mapping', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check for the UserSelect mapped type
      expect(content).toMatch(/export type UserSelect = \{/);
      expect(content).toMatch(/\[K in keyof User\]\?: boolean;/);
    });
  });

  describe('Generic RPC Method Signatures', () => {
    it('should generate RPC method with generic type parameter in UserDomain', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that lookupUsers method has generic type parameter
      expect(content).toMatch(/lookupUsers<Select extends UserSelect>/);
    });

    it('should use generic type in method parameters', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that the method parameter uses the generic type
      expect(content).toMatch(/params: \{ query: LookupUsersQuery<Select> \}/);
    });

    it('should use generic type in method return type', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that the return type uses the generic type
      expect(content).toMatch(/Promise<LookupUsersResult<Select>>/);
    });

    it('should have default generic constraints', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check that generic constraints have defaults
      expect(content).toMatch(/<Select extends UserSelect = UserSelect>/);
    });
  });

  describe('Generic Type Preservation Across Modules', () => {
    it('should generate generic types for all modules with generic RPC methods', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      expect(fs.existsSync(userGenFile)).toBe(true);

      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Verify the module has at least one generic method
      const hasGenericMethod = content.includes('<Select extends UserSelect>');
      expect(hasGenericMethod).toBe(true);
    });

    it('should include generic types in the domain interface', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check the UserDomain interface includes the generic method
      expect(content).toMatch(/export interface UserDomain \{[\s\S]*lookupUsers<Select extends UserSelect>/);
    });
  });

  describe('Type Safety with Generics', () => {
    it('should generate Extract utility type for proper field selection', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Should use Extract to get only the selected keys
      expect(content).toMatch(/Extract<\{[^}]*\}[^,]*, keyof User>/);
    });

    it('should constrain generic parameter to UserSelect', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // All generic parameters should extend UserSelect
      const genericMatches = content.match(/<Select extends UserSelect/g);
      expect(genericMatches).toBeTruthy();
      expect(genericMatches!.length).toBeGreaterThan(0);
    });

    it('should use conditional types for field mapping', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Check for conditional type pattern: K extends true ? K : never
      expect(content).toMatch(/Select\[K\] extends true \? K : never/);
    });
  });

  describe('Generated Type Structure', () => {
    it('should export all necessary generic types', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // All these should be exported
      expect(content).toContain('export interface LookupUsersQuery');
      expect(content).toContain('export interface LookupUsersResult');
      expect(content).toContain('export type UserSelect');
      expect(content).toContain('export interface UserDomain');
    });

    it('should maintain proper TypeScript syntax for generic types', () => {
      const userGenFile = path.join(outputDir, 'user.rpc.gen.ts');
      const content = fs.readFileSync(userGenFile, 'utf-8');

      // Basic validation that it's valid TypeScript syntax
      // Check for proper generic syntax patterns
      expect(content).toMatch(/<[A-Za-z]+ extends [A-Za-z]+>/); // Generic constraint
      expect(content).toMatch(/\[K in keyof [A-Za-z]+\]/); // Mapped type
    });
  });
});
