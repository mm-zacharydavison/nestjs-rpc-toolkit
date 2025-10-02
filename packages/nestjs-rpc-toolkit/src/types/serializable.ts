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

