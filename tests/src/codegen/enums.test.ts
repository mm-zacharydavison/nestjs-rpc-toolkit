import 'reflect-metadata';
import { RpcTypesGenerator } from '@zdavison/nestjs-rpc-toolkit';
import * as path from 'path';
import * as fs from 'fs';

describe('Enums will be included in generated RPC interfaces.', () => {
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

  describe('Enum Export in Generated Types', () => {
    it('should export enums used in RPC method parameters', () => {
      const messagingGenFile = path.join(outputDir, 'messaging.rpc.gen.ts');
      const content = fs.readFileSync(messagingGenFile, 'utf-8');

      // Check that MessageSource enum is exported
      expect(content).toMatch(/export enum MessageSource/);
    });

    it('should include all enum values in the exported enum', () => {
      const messagingGenFile = path.join(outputDir, 'messaging.rpc.gen.ts');
      const content = fs.readFileSync(messagingGenFile, 'utf-8');

      // Check that enum values are included
      expect(content).toContain('TELEGRAM');
      expect(content).toContain('WHATSAPP');
      expect(content).toContain('SMS');
    });

    it('should preserve enum value assignments', () => {
      const messagingGenFile = path.join(outputDir, 'messaging.rpc.gen.ts');
      const content = fs.readFileSync(messagingGenFile, 'utf-8');

      // Check that enum values have their string assignments
      expect(content).toMatch(/TELEGRAM\s*=\s*['"]telegram['"]/);
      expect(content).toMatch(/WHATSAPP\s*=\s*['"]whatsapp['"]/);
      expect(content).toMatch(/SMS\s*=\s*['"]sms['"]/);
    });

    it('should include enum in interfaces that use it', () => {
      const messagingGenFile = path.join(outputDir, 'messaging.rpc.gen.ts');
      const content = fs.readFileSync(messagingGenFile, 'utf-8');

      // Check that IncomingMessage interface uses MessageSource
      expect(content).toMatch(/export interface IncomingMessage/);
      expect(content).toMatch(/source:\s*MessageSource/);
    });

    it('should preserve enum JSDoc comments if present', () => {
      const messagingGenFile = path.join(outputDir, 'messaging.rpc.gen.ts');
      const content = fs.readFileSync(messagingGenFile, 'utf-8');

      // Check for JSDoc on the enum
      const enumPattern = /\/\*\*[\s\S]*?Source of a message[\s\S]*?\*\/\s*export enum MessageSource/;
      expect(content).toMatch(enumPattern);
    });

    it('should place enum definitions before interfaces that use them', () => {
      const messagingGenFile = path.join(outputDir, 'messaging.rpc.gen.ts');
      const content = fs.readFileSync(messagingGenFile, 'utf-8');

      // Find positions of enum and interface declarations
      const enumPos = content.indexOf('export enum MessageSource');
      const interfacePos = content.indexOf('export interface IncomingMessage');

      // Enum should come before the interface that uses it
      expect(enumPos).toBeGreaterThan(-1);
      expect(interfacePos).toBeGreaterThan(-1);
      expect(enumPos).toBeLessThan(interfacePos);
    });
  });

  describe('Enum Usage in Method Signatures', () => {
    it('should include enums in method parameter types', () => {
      const messagingGenFile = path.join(outputDir, 'messaging.rpc.gen.ts');
      const content = fs.readFileSync(messagingGenFile, 'utf-8');

      // Check that queueMessage method parameter uses IncomingMessage which contains MessageSource
      expect(content).toMatch(/queueMessage\(params: \{ message: IncomingMessage \}\)/);
    });

    it('should include enums in method return types', () => {
      const messagingGenFile = path.join(outputDir, 'messaging.rpc.gen.ts');
      const content = fs.readFileSync(messagingGenFile, 'utf-8');

      // Check that return type includes QueuedMessage which extends IncomingMessage (with MessageSource)
      expect(content).toMatch(/Promise<QueuedMessage>/);
    });
  });

  describe('Enum Preservation Across Modules', () => {
    it('should generate enum types for all modules that use enums', () => {
      const messagingGenFile = path.join(outputDir, 'messaging.rpc.gen.ts');
      expect(fs.existsSync(messagingGenFile)).toBe(true);

      const content = fs.readFileSync(messagingGenFile, 'utf-8');

      // Verify the module has the enum
      const hasEnum = content.includes('export enum MessageSource');
      expect(hasEnum).toBe(true);
    });

    it('should include enums in the aggregated all.rpc.gen.ts file', () => {
      const allGenFile = path.join(outputDir, 'all.rpc.gen.ts');
      const content = fs.readFileSync(allGenFile, 'utf-8');

      // The all file should either export or re-export the enum
      const hasMessagingModule = content.includes('messaging') || content.includes('MessagingDomain');
      expect(hasMessagingModule).toBe(true);
    });
  });

  describe('Enum Type Safety', () => {
    it('should export enum as a proper TypeScript enum (not a type alias)', () => {
      const messagingGenFile = path.join(outputDir, 'messaging.rpc.gen.ts');
      const content = fs.readFileSync(messagingGenFile, 'utf-8');

      // Should be "export enum" not "export type"
      expect(content).toMatch(/export enum MessageSource \{/);
      expect(content).not.toMatch(/export type MessageSource = /);
    });

    it('should maintain enum structure for runtime and type checking', () => {
      const messagingGenFile = path.join(outputDir, 'messaging.rpc.gen.ts');
      const content = fs.readFileSync(messagingGenFile, 'utf-8');

      // Enum should have proper structure with curly braces and values
      const enumPattern = /export enum MessageSource \{[\s\S]*?TELEGRAM[\s\S]*?WHATSAPP[\s\S]*?SMS[\s\S]*?\}/;
      expect(content).toMatch(enumPattern);
    });
  });
});
