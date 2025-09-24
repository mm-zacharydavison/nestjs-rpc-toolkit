/**
 * Type utilities for ensuring JSON serialization compatibility in RPC methods.
 * These types help catch non-serializable types at compile time.
 */

// Basic JSON-serializable primitive types (Date is included since NestJS handles serialization)
type JsonPrimitive = string | number | boolean | null | Date;

// JSON-serializable types (recursive for objects and arrays)
export type SerializableJson = JsonPrimitive | SerializableJsonObject | SerializableJsonArray;

interface SerializableJsonObject {
  [key: string]: SerializableJson;
}

interface SerializableJsonArray extends Array<SerializableJson> {}

/**
 * Helper type to check if a type is serializable.
 * This creates compile-time errors for non-serializable types.
 */
export type AssertSerializable<T> = T extends SerializableJson ? T : never;

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

