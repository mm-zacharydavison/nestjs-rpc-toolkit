# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS RPC Toolkit monorepo that provides type-safe RPC calls between NestJS microservices. The toolkit includes:

- **Core Library** (`packages/nestjs-rpc-toolkit`): Decorators, generators, and transport mechanisms for RPC
- **Generated Types Library** (`examples/lib-rpc`): Auto-generated TypeScript types and client interfaces
- **Example Applications** (`examples/apps/api`): Main API application composing microservice modules
- **Example Modules** (`examples/modules/*`): Microservice modules (auth-module, user-module)

## Architecture

### Core Concepts

- **@RpcController()**: Marks a service class as an RPC controller, auto-inferring module prefix from class name
- **@RpcMethod()**: Decorates methods to expose them as RPC endpoints with auto-generated patterns like `user.create`
- **Type Generation**: Automatically generates TypeScript client interfaces from decorated methods
- **In-Process Transport**: Uses in-memory communication for modular monolith architecture
- **Generated Client**: Auto-generated `IRpcClient` interface provides type-safe RPC calls

### RPC Pattern Generation

RPC patterns are automatically generated as `{module}.{methodName}`:
- `UserService` with `@RpcController()` → module: `user`
- Method `create()` with `@RpcMethod()` → pattern: `user.create`
- Custom prefix: `@RpcController('custom')` → pattern: `custom.methodName`

### Type Generation Workflow

1. Modules decorated with `@RpcController` and `@RpcMethod` are scanned
2. Types are generated using `pnpm generate-rpc`
3. Generated types go to `examples/lib-rpc/src/`
4. Applications import `@meetsmore/lib-rpc` for type-safe RPC calls

## Development Commands

### Root Level (Monorepo)
- `pnpm build` - Build all packages using Turbo
- `pnpm dev` - Start the API application in development mode
- `pnpm clean` - Clean all package build outputs
- `pnpm generate-rpc` - Generate RPC types from decorated methods

### Package Level Commands
**Main API Application** (`examples/apps/api`):
- `pnpm start:dev` - Start API server with hot reload
- `pnpm test:e2e` - Run end-to-end tests

**Modules** (`examples/modules/*`):
- `pnpm build` - Compile TypeScript
- `pnpm dev` - Watch mode compilation
- `pnpm start:microservice` - Run as standalone microservice

**Core Library** (`packages/nestjs-rpc-toolkit`):
- `pnpm build` - Compile library
- `pnpm dev` - Watch mode compilation

**Generated Types** (`examples/lib-rpc`):
- `pnpm generate:types` - Generate types from configured modules
- `pnpm build` - Build generated types library

## Configuration Files

### RPC Type Generation
- `examples/lib-rpc/nestjs-rpc-toolkit.config.json` - Configures which modules to scan for RPC types
- Modules listed in `packages` array are scanned for `@RpcController` and `@RpcMethod` decorators

### Workspace Configuration
- `pnpm-workspace.yaml` - Defines monorepo package structure
- `turbo.json` - Turbo build pipeline configuration with task dependencies

## Key Implementation Details

### Adding New RPC Methods
1. Decorate service class with `@RpcController()`
2. Decorate methods with `@RpcMethod()`
3. Run `pnpm generate-rpc` to update types
4. Import and use type-safe client: `@Inject('RPC') private rpc: IRpcClient`

### Module Structure Pattern
Each module follows this structure:
- `src/{module}.service.ts` - RPC service with decorators
- `src/{module}.controller.ts` - HTTP controller (optional)
- `src/{module}.module.ts` - NestJS module definition
- `src/dto/` - Data transfer objects
- `src/entities/` - Entity definitions

### Transport Configuration
The toolkit uses `InProcessTransportStrategy` for modular monolith architecture, enabling in-memory RPC calls without network overhead.

## Writing Tests

- The project only write integration tests.
- The tests are located in the `tests` directory.
- Each test file will be for a high level requirement or feature.
- Tests will always test against the `examples` directory.
  - Adding a new test will require adding an example of the feature to the `examples` directory.