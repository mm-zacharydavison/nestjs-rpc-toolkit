/**
 * Type utilities for ensuring JSON serialization compatibility in RPC methods.
 * These types help catch non-serializable types at compile time.
 */

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

// Helper to check if any required property in an object is 'never'
// Optional properties (which include undefined) are allowed to have undefined
type HasNeverRequiredProperty<T> = {
  [K in keyof T]-?: undefined extends T[K]
    // For optional properties, check if the non-undefined part is never
    ? [Exclude<T[K], undefined>] extends [never] ? true : false
    // For required properties, check if the value is never
    : [T[K]] extends [never] ? true : false;
}[keyof T] extends false ? false : true;

// Helper type to check exact equality
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends
  (<T>() => T extends Y ? 1 : 2) ? true : false;

// Helper to detect index signatures (string index like Record<string, T>)
type HasStringIndexSignature<T> = string extends keyof T ? true : false;

// Recursively check if a type is serializable (strict JSON only)
// Uses a depth counter to prevent infinite recursion with self-referential types
type IsSerializable<T, Depth extends number[] = []> =
  // Prevent infinite recursion - if we've gone too deep, assume it's valid
  // This handles self-referential types like type-fest's JsonObject/JsonValue
  Depth['length'] extends 10 ? T :
  // Use Equal type check for exact undefined match (standalone undefined is not serializable)
  Equal<T, undefined> extends true ? never :
  Equal<T, symbol> extends true ? never :
  // Accept unknown - represents "any valid JSON value" (common in Record<string, unknown>)
  Equal<T, unknown> extends true ? T :
  // Accept null
  Equal<T, null> extends true ? T :
  // Reject functions
  T extends Function ? never :
  // Reject Date (doesn't round-trip correctly over TCP - becomes string)
  T extends Date ? never :
  // Reject Map, Set, WeakMap, WeakSet
  T extends Map<any, any> | Set<any> | WeakMap<any, any> | WeakSet<any> ? never :
  // Accept primitives
  T extends string | number | boolean ? T :
  // Accept arrays (check elements recursively)
  T extends Array<infer U> ? Array<IsSerializable<U, [...Depth, 1]>> :
  // Accept readonly arrays
  T extends readonly (infer U)[] ? readonly IsSerializable<U, [...Depth, 1]>[] :
  // Accept objects (check properties recursively)
  T extends object ? (
    // For objects with string index signatures (like Record<string, T>),
    // check the value type but don't recurse into each "property"
    HasStringIndexSignature<T> extends true
      ? T  // Accept index signature types as-is (the value type was likely already checked)
      : (
        // For regular objects, check each property
        { [K in keyof T]: IsSerializableProperty<T[K], Depth> } extends infer O
          ? HasNeverRequiredProperty<O> extends true ? never : O
          : never
      )
  ) :
  // Reject everything else
  never;

// Helper for checking object properties - handles optional properties (T | undefined)
type IsSerializableProperty<T, Depth extends number[]> =
  // If the property can be undefined (optional property), check the non-undefined part
  undefined extends T
    ? IsSerializable<Exclude<T, undefined>, [...Depth, 1]> | undefined
    : IsSerializable<T, [...Depth, 1]>;

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

