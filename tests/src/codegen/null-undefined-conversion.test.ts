/**
 * Tests for null/undefined conversion utilities.
 * These utilities help bridge the gap between TypeScript's optional properties (undefined)
 * and RPC's requirement for explicit null values.
 */

import 'reflect-metadata';
import {
  undefinedToNull,
  nullToUndefined,
  UndefinedToNull,
  NullToUndefined,
} from '@zdavison/nestjs-rpc-toolkit/dist/types/serializable';

describe('Null/Undefined conversion utilities', () => {
  describe('undefinedToNull function', () => {
    it('should convert undefined to null', () => {
      expect(undefinedToNull(undefined)).toBe(null);
    });

    it('should preserve null', () => {
      expect(undefinedToNull(null)).toBe(null);
    });

    it('should preserve primitives', () => {
      expect(undefinedToNull('hello')).toBe('hello');
      expect(undefinedToNull(42)).toBe(42);
      expect(undefinedToNull(true)).toBe(true);
      expect(undefinedToNull(false)).toBe(false);
    });

    it('should convert undefined properties in objects', () => {
      const input = { name: 'John', age: undefined };
      const output = undefinedToNull(input);

      expect(output).toEqual({ name: 'John', age: null });
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'John',
          profile: {
            bio: undefined,
            avatar: 'url',
          },
        },
        metadata: undefined,
      };
      const output = undefinedToNull(input);

      expect(output).toEqual({
        user: {
          name: 'John',
          profile: {
            bio: null,
            avatar: 'url',
          },
        },
        metadata: null,
      });
    });

    it('should handle arrays', () => {
      const input = [1, undefined, 3, undefined];
      const output = undefinedToNull(input);

      expect(output).toEqual([1, null, 3, null]);
    });

    it('should handle arrays of objects', () => {
      const input = [
        { id: 1, name: 'Alice', nickname: undefined },
        { id: 2, name: 'Bob', nickname: 'Bobby' },
      ];
      const output = undefinedToNull(input);

      expect(output).toEqual([
        { id: 1, name: 'Alice', nickname: null },
        { id: 2, name: 'Bob', nickname: 'Bobby' },
      ]);
    });

    it('should handle empty objects and arrays', () => {
      expect(undefinedToNull({})).toEqual({});
      expect(undefinedToNull([])).toEqual([]);
    });
  });

  describe('nullToUndefined function', () => {
    it('should convert null to undefined', () => {
      expect(nullToUndefined(null)).toBe(undefined);
    });

    it('should preserve undefined', () => {
      expect(nullToUndefined(undefined)).toBe(undefined);
    });

    it('should preserve primitives', () => {
      expect(nullToUndefined('hello')).toBe('hello');
      expect(nullToUndefined(42)).toBe(42);
      expect(nullToUndefined(true)).toBe(true);
      expect(nullToUndefined(false)).toBe(false);
    });

    it('should convert null properties in objects', () => {
      const input = { name: 'John', age: null };
      const output = nullToUndefined(input);

      expect(output).toEqual({ name: 'John', age: undefined });
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'John',
          profile: {
            bio: null,
            avatar: 'url',
          },
        },
        metadata: null,
      };
      const output = nullToUndefined(input);

      expect(output).toEqual({
        user: {
          name: 'John',
          profile: {
            bio: undefined,
            avatar: 'url',
          },
        },
        metadata: undefined,
      });
    });

    it('should handle arrays', () => {
      const input = [1, null, 3, null];
      const output = nullToUndefined(input);

      expect(output).toEqual([1, undefined, 3, undefined]);
    });

    it('should handle arrays of objects', () => {
      const input = [
        { id: 1, name: 'Alice', nickname: null },
        { id: 2, name: 'Bob', nickname: 'Bobby' },
      ];
      const output = nullToUndefined(input);

      expect(output).toEqual([
        { id: 1, name: 'Alice', nickname: undefined },
        { id: 2, name: 'Bob', nickname: 'Bobby' },
      ]);
    });
  });

  describe('Round-trip conversion', () => {
    it('should round-trip undefined -> null -> undefined', () => {
      const original = { name: 'John', age: undefined, active: true };
      const asNull = undefinedToNull(original);
      const backToUndefined = nullToUndefined(asNull);

      expect(backToUndefined).toEqual(original);
    });

    it('should round-trip null -> undefined -> null', () => {
      const original = { name: 'John', age: null, active: true };
      const asUndefined = nullToUndefined(original);
      const backToNull = undefinedToNull(asUndefined);

      expect(backToNull).toEqual(original);
    });
  });

  describe('UndefinedToNull type utility', () => {
    it('should convert undefined type to null', () => {
      type Input = undefined;
      type Output = UndefinedToNull<Input>;

      const value: Output = null;
      expect(value).toBe(null);
    });

    it('should preserve primitive types', () => {
      type StringType = UndefinedToNull<string>;
      type NumberType = UndefinedToNull<number>;
      type BooleanType = UndefinedToNull<boolean>;
      type NullType = UndefinedToNull<null>;

      const str: StringType = 'test';
      const num: NumberType = 42;
      const bool: BooleanType = true;
      const nul: NullType = null;

      expect(str).toBe('test');
      expect(num).toBe(42);
      expect(bool).toBe(true);
      expect(nul).toBe(null);
    });

    it('should handle object types with optional properties', () => {
      interface Input {
        name: string;
        age: number | undefined;
      }

      type Output = UndefinedToNull<Input>;

      // The type should allow null for the age property
      const obj: Output = { name: 'John', age: null };
      expect(obj.age).toBe(null);
    });
  });

  describe('NullToUndefined type utility', () => {
    it('should convert null type to undefined', () => {
      type Input = null;
      type Output = NullToUndefined<Input>;

      const value: Output = undefined;
      expect(value).toBe(undefined);
    });

    it('should handle object types with nullable properties', () => {
      interface Input {
        name: string;
        age: number | null;
      }

      type Output = NullToUndefined<Input>;

      // The type should allow undefined for the age property
      const obj: Output = { name: 'John', age: undefined };
      expect(obj.age).toBe(undefined);
    });
  });

  describe('Practical RPC usage patterns', () => {
    it('should prepare optional DTO for RPC transport', () => {
      // Simulates a DTO with optional properties
      interface CreateUserInput {
        email: string;
        firstName: string;
        lastName: string;
        nickname?: string;
        bio?: string;
      }

      const userInput: CreateUserInput = {
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        // nickname and bio are undefined (not provided)
      };

      // Convert for RPC transport
      const rpcReady = undefinedToNull(userInput);

      expect(rpcReady).toEqual({
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        // Note: undefined properties are not converted because they don't exist
        // Only explicitly set undefined values are converted
      });
    });

    it('should convert explicit undefined values for RPC', () => {
      interface UpdateUserInput {
        email?: string;
        firstName?: string;
        lastName?: string;
        clearNickname?: boolean;
      }

      // User explicitly sets fields to undefined to clear them
      const updateInput = {
        email: 'new@example.com',
        firstName: undefined as string | undefined, // explicitly clear
        lastName: 'Smith',
      };

      const rpcReady = undefinedToNull(updateInput);

      expect(rpcReady).toEqual({
        email: 'new@example.com',
        firstName: null,
        lastName: 'Smith',
      });
    });

    it('should convert RPC response back to TypeScript-friendly format', () => {
      // Simulates an RPC response with null values
      const rpcResponse = {
        id: 1,
        email: 'john@example.com',
        nickname: null,
        bio: null,
        createdAt: '2025-01-01T00:00:00Z',
      };

      const localFormat = nullToUndefined(rpcResponse);

      expect(localFormat.nickname).toBe(undefined);
      expect(localFormat.bio).toBe(undefined);
      expect(localFormat.email).toBe('john@example.com');
    });
  });
});
