/**
 * Type utilities for ensuring JSON serialization compatibility in RPC methods.
 * These types help catch non-serializable types at compile time.
 */

// =============================================================================
// Null/Undefined Conversion Utilities
// =============================================================================

/**
 * Converts a type with optional properties (undefined) to use null instead.
 * Makes all properties required, replacing undefined with null.
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
 * //   age: number | null;      // required, undefined -> null
 * //   nickname: string | null; // required, undefined -> null
 * // }
 * ```
 */
export type UndefinedToNull<T> = T extends undefined
  ? null
  : T extends object
    ? T extends Array<infer U>
      ? Array<UndefinedToNull<U>>
      : { [K in keyof T]-?: UndefinedToNull<Exclude<T[K], undefined>> | (undefined extends T[K] ? null : never) }
    : T;

/**
 * Converts a type with null to use undefined instead.
 * Makes nullable properties optional.
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
 * //   age?: number;     // optional, null -> undefined
 * //   nickname?: string; // optional, null -> undefined
 * // }
 * ```
 */
export type NullToUndefined<T> = T extends null
  ? undefined
  : T extends object
    ? T extends Array<infer U>
      ? Array<NullToUndefined<U>>
      : { [K in keyof T as null extends T[K] ? never : K]: NullToUndefined<T[K]> } &
        { [K in keyof T as null extends T[K] ? K : never]?: NullToUndefined<Exclude<T[K], null>> }
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
// Date Serialization Utilities
// =============================================================================

/** Type for the generated RpcDateFields metadata */
export type DateFieldsMetadata = Record<string, readonly string[]>;

/**
 * Recursively converts all Date instances to ISO strings.
 * Use this to prepare data for RPC transport.
 *
 * @example
 * ```typescript
 * const user = { name: 'John', createdAt: new Date() };
 * const wire = encodeDates(user);
 * // { name: 'John', createdAt: '2025-01-01T00:00:00.000Z' }
 * ```
 */
export function encodeDates<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString() as unknown as T;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => encodeDates(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    result[key] = encodeDates((value as Record<string, unknown>)[key]);
  }
  return result as T;
}

/**
 * Recursively converts ISO date strings back to Date objects based on metadata.
 * The metadata specifies which fields should be treated as dates.
 *
 * @param value - The value to decode
 * @param metadata - Map of type names to their date field paths
 * @param typeName - The type name to look up in metadata (optional for nested calls)
 *
 * @example
 * ```typescript
 * import { RpcDateFields } from './all.rpc.gen';
 *
 * const wire = { name: 'John', createdAt: '2025-01-01T00:00:00.000Z' };
 * const user = decodeDates(wire, RpcDateFields, 'User');
 * // { name: 'John', createdAt: Date }
 * ```
 */
export function decodeDates<T>(
  value: T,
  metadata: DateFieldsMetadata,
  typeName?: string
): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => decodeDates(item, metadata, typeName)) as unknown as T;
  }

  // Get date fields for this type
  const dateFields = typeName ? metadata[typeName] : undefined;
  const dateFieldSet = dateFields ? new Set(dateFields) : new Set<string>();

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const val = (value as Record<string, unknown>)[key];

    // Check if this field should be a Date
    if (dateFieldSet.has(key) && typeof val === 'string') {
      result[key] = new Date(val);
    } else if (typeof val === 'object' && val !== null) {
      // For nested objects, try to infer the type name from the key
      // This is a heuristic - the key might be the type name in camelCase
      const nestedTypeName = key.charAt(0).toUpperCase() + key.slice(1);
      result[key] = decodeDates(val, metadata, metadata[nestedTypeName] ? nestedTypeName : undefined);
    } else {
      result[key] = val;
    }
  }
  return result as T;
}

/**
 * Creates an encoder function bound to specific metadata.
 * Useful when you want to encode dates for a specific type.
 */
export function createDateEncoder() {
  return encodeDates;
}

/**
 * Creates a decoder function bound to specific metadata.
 * Useful when you want to decode dates for a specific type.
 */
export function createDateDecoder(metadata: DateFieldsMetadata) {
  return <T>(value: T, typeName?: string) => decodeDates(value, metadata, typeName);
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
// Note: Date is allowed because the RPC client automatically transforms Date <-> string
type IsSerializable<T> =
  // Use Equal type check for exact undefined match
  Equal<T, undefined> extends true ? never :
  Equal<T, symbol> extends true ? never :
  // Accept null
  Equal<T, null> extends true ? T :
  // Reject functions
  T extends Function ? never :
  // Accept Date (will be automatically transformed to/from ISO string by RPC client)
  T extends Date ? T :
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
 * Validates JSON compatibility (no undefined, no functions, no symbols).
 * Date is allowed and will be automatically transformed to/from ISO string.
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

