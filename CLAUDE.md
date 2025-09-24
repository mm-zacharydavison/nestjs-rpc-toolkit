# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `@zdavison/nestjs-rpc-toolkit`, a TypeScript library for type-safe RPC calls in NestJS monorepos. The toolkit provides decorators, type generation, and transport mechanisms for inter-service communication.

## Development Commands

### Building and Development
- `npm run build` or `tsc` - Build the TypeScript to dist/
- `npm run dev` or `tsc --watch` - Build in watch mode
- `npm run clean` - Remove dist/ directory

### Examples and Testing
The `examples/` directory contains a complete monorepo setup for testing:
- `cd examples && pnpm build` - Build all example packages
- `cd examples && pnpm dev` - Start the example API in dev mode
- `cd examples && pnpm generate-rpc` - Generate RPC types for examples

### Type Checking
Run `tsc --noEmit` to type-check without building (no dedicated npm script exists).

## Architecture

### Core Components

1. **Decorators** (`src/decorators/`)
   - `@RpcController(prefix?)` - Marks classes containing RPC methods, auto-infers module names from class names (UserService → 'user')
   - `@RpcMethod(pattern?)` - Marks methods as RPC endpoints, generates patterns like 'user.findAll'

2. **RPC System** (`src/rpc/`)
   - `TypedMessageBus<T>` - Type-safe wrapper around NestJS ClientProxy
   - `RpcClient` - Creates domain proxies for RPC calls
   - `RpcRegistry` - Method discovery and pattern management

3. **Type Generation** (`src/generators/`)
   - `RpcTypesGenerator` - Scans decorated methods and generates TypeScript types
   - Supports monorepo structure with wildcard package paths (e.g., `packages/modules/*`)
   - Generates module-specific `.rpc.gen.ts` files and aggregated `all.rpc.gen.ts`

4. **Transport Layer** (`src/transport/`)
   - In-memory transport for development/testing
   - TCP transport support for production microservices

### Code Generation Pattern

The toolkit uses a two-phase approach:
1. **Method Discovery**: Scans for `@RpcMethod` decorators in `@RpcController` classes
2. **Type Generation**: Creates TypeScript interfaces for type-safe RPC calls

Generated types follow pattern: `rpc.domain.method(params)` → `Promise<ReturnType>`

### Configuration

RPC generation requires a `nestjs-rpc-toolkit.config.json`:
```json
{
  "packages": ["packages/modules/*"],  // Supports glob patterns
  "outputDir": "lib-rpc/src"
}
```

## Monorepo Structure

When working with examples or implementing in monorepos:
- Main toolkit: Root directory (`src/`, `dist/`)
- Examples: `examples/` directory with separate pnpm workspace
- Generated types: Typically in `lib-rpc/` or similar package
- Modules: Individual packages containing `@RpcController` classes

## Key Patterns

### RPC Method Definition
```typescript
@RpcController('user')  // or @RpcController() for auto-inference
export class UserService {
  @RpcMethod()
  async findOne(params: { id: string }): Promise<User> {
    // Pattern auto-generated as 'user.findOne'
  }
}
```

### Type-Safe RPC Calls
```typescript
// Generated types enable: rpc.user.findOne({ id: 'user123' })
const user = await messageBus.send('user.findOne', { id: 'user123' });
```

## Serialization Requirements

All RPC parameters and return types must be JSON-serializable for TCP transport compatibility. Avoid functions, class instances, Buffer, Map/Set, undefined values.