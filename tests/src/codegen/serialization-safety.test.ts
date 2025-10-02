/**
 * This is required so that if RPC transport moves from being 'in-process' to remote (e.g. TCP),
 * all values can be transmitted across the new transport.
 **/

import { RpcMethod } from '@zdavison/nestjs-rpc-toolkit';
import { AssertSerializable, SerializableJson } from '@zdavison/nestjs-rpc-toolkit/dist/types/serializable';

describe('RPC interfaces will require all arguments and return values to be serializable.', () => {
  describe('Type-level serialization constraints', () => {
    it('should allow serializable primitive types', () => {
      // This test uses TypeScript's type system - if it compiles, the test passes

      type TestString = AssertSerializable<string>;
      type TestNumber = AssertSerializable<number>;
      type TestBoolean = AssertSerializable<boolean>;
      type TestNull = AssertSerializable<null>;

      // These should all be the same as the input type (not 'never')
      const _assertString: TestString = 'test';
      const _assertNumber: TestNumber = 42;
      const _assertBoolean: TestBoolean = true;
      const _assertNull: TestNull = null;

      expect(true).toBe(true); // Jest requires at least one assertion
    });

    it('should allow serializable object types', () => {
      type TestObject = AssertSerializable<{ name: string; age: number }>;

      const _obj: TestObject = { name: 'John', age: 30 };

      expect(true).toBe(true);
    });

    it('should allow serializable array types', () => {
      type TestArray = AssertSerializable<string[]>;
      type TestObjectArray = AssertSerializable<Array<{ id: number }>>;

      const _arr: TestArray = ['a', 'b', 'c'];
      const _objArr: TestObjectArray = [{ id: 1 }, { id: 2 }];

      expect(true).toBe(true);
    });

    it('should allow nested serializable structures', () => {
      type NestedObject = AssertSerializable<{
        user: {
          id: number;
          profile: {
            name: string;
            tags: string[];
          };
        };
      }>;

      const _nested: NestedObject = {
        user: {
          id: 1,
          profile: {
            name: 'Test',
            tags: ['a', 'b']
          }
        }
      };

      expect(true).toBe(true);
    });
  });

  describe('Non-serializable types should result in "never"', () => {
    it('should reject function types', () => {
      // Functions are not serializable
      type TestFunction = AssertSerializable<() => void>;

      // This type should be 'never'
      // Use tuple to prevent distributive conditional
      type IsNever<T> = [T] extends [never] ? true : false;
      type ShouldBeTrue = IsNever<TestFunction>;

      const _check: ShouldBeTrue = true;

      expect(true).toBe(true);
    });

    it('should reject undefined type', () => {
      type TestUndefined = AssertSerializable<undefined>;

      type IsNever<T> = [T] extends [never] ? true : false;
      type ShouldBeTrue = IsNever<TestUndefined>;

      const _check: ShouldBeTrue = true;

      expect(true).toBe(true);
    });

    it('should reject symbol types', () => {
      type TestSymbol = AssertSerializable<symbol>;

      type IsNever<T> = [T] extends [never] ? true : false;
      type ShouldBeTrue = IsNever<TestSymbol>;

      const _check: ShouldBeTrue = true;

      expect(true).toBe(true);
    });

    it('should reject class instances with methods', () => {
      class MyClass {
        method() { return 'test'; }
      }

      type TestClass = AssertSerializable<MyClass>;

      type IsNever<T> = [T] extends [never] ? true : false;
      type ShouldBeTrue = IsNever<TestClass>;

      const _check: ShouldBeTrue = true;

      expect(true).toBe(true);
    });
  });

  describe('RPC method declarations with @RpcMethod decorator', () => {
    it('should compile with serializable parameters and return types', () => {
      class ValidService {
        @RpcMethod()
        async createUser(dto: { email: string; name: string }): Promise<{ id: number; email: string }> {
          return { id: 1, email: dto.email };
        }

        @RpcMethod()
        async getUsers(ids: number[]): Promise<Array<{ id: number; name: string }>> {
          return ids.map(id => ({ id, name: 'User' + id }));
        }

        @RpcMethod()
        async updateTimestamp(timestamp: string): Promise<string> {
          return timestamp;
        }
      }

      // If this compiles, the test passes
      expect(ValidService).toBeDefined();
    });

    // TypeScript compilation tests - these should cause compile errors

    it('should NOT compile with callback parameters', () => {
      class InvalidService {
        // @ts-expect-error - callbacks are not serializable
        @RpcMethod()
        async withCallback(callback: (data: string) => void): Promise<void> {
          callback('test');
        }
      }

      expect(InvalidService).toBeDefined();
    });

    it('should NOT compile with function return types', () => {
      class InvalidService {
        // @ts-expect-error - functions are not serializable
        @RpcMethod()
        async returnFunction(): Promise<() => void> {
          return () => {};
        }
      }

      expect(InvalidService).toBeDefined();
    });

    it('should NOT compile with Map parameters', () => {
      class InvalidService {
        // @ts-expect-error - Map is not serializable
        @RpcMethod()
        async withMap(data: Map<string, string>): Promise<void> {
          return;
        }
      }

      expect(InvalidService).toBeDefined();
    });

    it('should NOT compile with Set return types', () => {
      class InvalidService {
        // @ts-expect-error - Set is not serializable
        @RpcMethod()
        async returnSet(): Promise<Set<number>> {
          return new Set([1, 2, 3]);
        }
      }

      expect(InvalidService).toBeDefined();
    });

    it('should NOT compile with Date parameters', () => {
      class InvalidService {
        // @ts-expect-error - Date is not serializable
        @RpcMethod()
        async withDate(date: Date): Promise<string> {
          return date.toISOString();
        }
      }
      expect(InvalidService).toBeDefined();
    });

    it('should NOT compile with Date return types', () => {
      class InvalidService {
        // @ts-expect-error - Date is not serializable
        @RpcMethod()
        async returnDate(): Promise<Date> {
          return new Date();
        }
      }
      expect(InvalidService).toBeDefined();
    });
  });

  describe('SerializableJson type utility', () => {
    it('should accept all valid JSON types', () => {
      const stringVal: SerializableJson = 'test';
      const numberVal: SerializableJson = 42;
      const boolVal: SerializableJson = true;
      const nullVal: SerializableJson = null;
      const objVal: SerializableJson = { key: 'value' };
      const arrVal: SerializableJson = [1, 2, 3];
      const nestedVal: SerializableJson = {
        user: {
          id: 1,
          tags: ['a', 'b'],
          metadata: {
            created: '2025-01-01T00:00:00.000Z'
          }
        }
      };

      // All assignments should be valid
      expect(stringVal).toBeDefined();
      expect(numberVal).toBeDefined();
      expect(boolVal).toBeDefined();
      expect(nullVal).toBeNull();
      expect(objVal).toBeDefined();
      expect(arrVal).toBeDefined();
      expect(nestedVal).toBeDefined();
    });
  });

  describe('Documentation of type safety', () => {
    it('demonstrates type safety prevents runtime serialization errors', () => {
      // The type system ensures that only serializable types can be used
      // This prevents runtime errors when RPC transport switches from in-process to TCP

      // Valid example:
      interface ValidDTO {
        id: number;
        name: string;
        tags: string[];
        metadata: {
          created: string;
          count: number;
        };
      }

      // This DTO is fully serializable
      type CheckValid = AssertSerializable<ValidDTO>;

      // The type should not be 'never'
      type IsNotNever<T> = [T] extends [never] ? false : true;
      type ValidCheck = IsNotNever<CheckValid>;

      const _isValid: ValidCheck = true;

      expect(true).toBe(true);
    });
  });
});
