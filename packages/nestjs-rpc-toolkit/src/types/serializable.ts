/**
 * Type utilities for ensuring JSON serialization compatibility in RPC methods.
 * These types help catch non-serializable types at compile time.
 */

// =============================================================================
// Null/Undefined Conversion Utilities
// =============================================================================

/**
 * Converts a type with optional properties (undefined) to use null instead.
 * Useful for preparing data for RPC transport where undefined is not allowed.
 *
 * @example
 * ```typescript
 * interface UserInput {
 *   name: string;
 *   age?: number;           // number | undefined
 *   nickname: string | undefined;
 * }
 *
 * type UserRpc = UndefinedToNull<UserInput>;
 * // {
 * //   name: string;
 * //   age?: number | null;   // optional properties get | null added
 * //   nickname: string | null;
 * // }
 * ```
 */
export type UndefinedToNull<T> = T extends undefined
  ? null
  : T extends object
    ? T extends Array<infer U>
      ? Array<UndefinedToNull<U>>
      : { [K in keyof T]: UndefinedToNull<T[K]> | (undefined extends T[K] ? null : never) }
    : T;

/**
 * Converts a type with null to use undefined instead.
 * Useful for converting RPC response data back to TypeScript-friendly optionals.
 *
 * @example
 * ```typescript
 * interface UserRpc {
 *   name: string;
 *   age: number | null;
 *   nickname: string | null;
 * }
 *
 * type UserLocal = NullToUndefined<UserRpc>;
 * // {
 * //   name: string;
 * //   age: number | undefined;
 * //   nickname: string | undefined;
 * // }
 * ```
 */
export type NullToUndefined<T> = T extends null
  ? undefined
  : T extends object
    ? T extends Array<infer U>
      ? Array<NullToUndefined<U>>
      : { [K in keyof T]: NullToUndefined<T[K]> }
    : T;

/**
 * Recursively converts all `undefined` values to `null` in an object.
 * Use this to prepare data for RPC calls where `undefined` is not JSON-serializable.
 *
 * @example
 * ```typescript
 * const input = { name: 'John', age: undefined, meta: { active: undefined } };
 * const rpcReady = undefinedToNull(input);
 * // { name: 'John', age: null, meta: { active: null } }
 *
 * // In RPC controller:
 * await rpc.user.create({ createUserDto: undefinedToNull(dto) });
 * ```
 */
export function undefinedToNull<T>(value: T): UndefinedToNull<T> {
  if (value === undefined) {
    return null as UndefinedToNull<T>;
  }

  if (value === null || typeof value !== 'object') {
    return value as UndefinedToNull<T>;
  }

  if (Array.isArray(value)) {
    return value.map(item => undefinedToNull(item)) as UndefinedToNull<T>;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const val = (value as Record<string, unknown>)[key];
    result[key] = undefinedToNull(val);
  }
  return result as UndefinedToNull<T>;
}

/**
 * Recursively converts all `null` values to `undefined` in an object.
 * Use this to convert RPC response data back to TypeScript-friendly optionals.
 *
 * @example
 * ```typescript
 * const rpcResponse = { name: 'John', age: null, meta: { active: null } };
 * const local = nullToUndefined(rpcResponse);
 * // { name: 'John', age: undefined, meta: { active: undefined } }
 * ```
 */
export function nullToUndefined<T>(value: T): NullToUndefined<T> {
  if (value === null) {
    return undefined as NullToUndefined<T>;
  }

  if (value === undefined || typeof value !== 'object') {
    return value as NullToUndefined<T>;
  }

  if (Array.isArray(value)) {
    return value.map(item => nullToUndefined(item)) as NullToUndefined<T>;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const val = (value as Record<string, unknown>)[key];
    result[key] = nullToUndefined(val);
  }
  return result as NullToUndefined<T>;
}

// =============================================================================
// Serialization Type Definitions
// =============================================================================

/**
 * JSON primitive types (Date is NOT included as it doesn't round-trip correctly over TCP)
 */
type SerializableJsonPrimitive = string | number | boolean | null;

/**
 * Recursively defined JSON-serializable types (strict JSON only)
 */
export type SerializableJson = SerializableJsonPrimitive | SerializableJsonObject | SerializableJsonArray;

interface SerializableJsonObject {
  [key: string]: SerializableJson;
}

interface SerializableJsonArray extends Array<SerializableJson> {}

// Helper to check if any property in an object is 'never'
type HasNeverProperty<T> = {
  [K in keyof T]: [T[K]] extends [never] ? true : false;
}[keyof T] extends false ? false : true;

// Helper type to check exact equality
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;

// Recursively check if a type is serializable (strict JSON only)
type IsSerializable<T> =
  // Use Equal type check for exact undefined match
  Equal<T, undefined> extends true ? never :
  Equal<T, symbol> extends true ? never :
  // Accept null
  Equal<T, null> extends true ? T :
  // Reject functions
  T extends Function ? never :
  // Reject Date (doesn't round-trip correctly over TCP - becomes string)
  T extends Date ? never :
  // Accept primitives
  T extends string | number | boolean ? T :
  // Accept arrays (check elements recursively)
  T extends Array<infer U> ? Array<IsSerializable<U>> :
  // Accept objects (check properties recursively)
  T extends object ? (
    { [K in keyof T]: IsSerializable<T[K]> } extends infer O
      ? HasNeverProperty<O> extends true ? never : O
      : never
  ) :
  // Reject everything else
  never;

/**
 * Helper type to check if a type is serializable.
 * Validates strict JSON compatibility (no Date, no undefined, no functions, no symbols).
 * Non-serializable types will result in 'never'.
 */
export type AssertSerializable<T> = IsSerializable<T>;

/**
 * Utility type that extracts parameters from a function type
 * and ensures they are all serializable
 */
export type SerializableParameters<T extends (...args: any[]) => any> = T extends (
  ...args: infer P
) => any
  ? { [K in keyof P]: AssertSerializable<P[K]> }
  : never;

/**
 * Utility type that extracts the return type from a function
 * and ensures it's serializable (excluding Promise wrapper)
 */
export type SerializableReturnType<T extends (...args: any[]) => any> = T extends (
  ...args: any[]
) => Promise<infer R>
  ? AssertSerializable<R>
  : T extends (...args: any[]) => infer R
  ? AssertSerializable<R>
  : never;

/**
 * Complete validation type for RPC methods.
 * Ensures both parameters and return type are serializable.
 */
export type SerializableRpcMethod<T extends (...args: any[]) => any> = (
  ...args: SerializableParameters<T>
) => T extends (...args: any[]) => Promise<any>
  ? Promise<SerializableReturnType<T>>
  : SerializableReturnType<T>;

/**
 * Constraint type that ensures all parameters are serializable.
 * Returns true if all params are serializable, false otherwise.
 */
type AreParametersSerializable<T extends (...args: any[]) => any> = T extends (
  ...args: infer P
) => any
  ? P extends any[]
    ? { [K in keyof P]: AssertSerializable<P[K]> extends never ? false : true }[number] extends true
      ? true
      : false
    : false
  : false;

/**
 * Constraint type that ensures return type is serializable.
 * Returns true if return type is serializable, false otherwise.
 */
type IsReturnTypeSerializable<T extends (...args: any[]) => any> = T extends (
  ...args: any[]
) => Promise<infer R>
  ? AssertSerializable<R> extends never ? false : true
  : T extends (...args: any[]) => infer R
  ? AssertSerializable<R> extends never ? false : true
  : false;

/**
 * Ensures a method has serializable parameters and return type.
 * This constraint prevents the method from being used if it has non-serializable types.
 */
export type ValidateRpcMethod<T extends (...args: any[]) => any> =
  AreParametersSerializable<T> extends true
    ? IsReturnTypeSerializable<T> extends true
      ? T
      : never
    : never;

