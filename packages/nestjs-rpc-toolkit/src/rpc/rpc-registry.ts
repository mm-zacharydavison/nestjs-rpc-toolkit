export interface RpcMethodMetadata {
  pattern: string;
  module: string;
  methodName: string;
  returnType?: string;
  target: any;
  propertyKey: string;
}

class RpcRegistry {
  private methods = new Map<string, RpcMethodMetadata>();
  private modulesMethods = new Map<string, RpcMethodMetadata[]>();

  registerMethod(metadata: RpcMethodMetadata): void {
    this.methods.set(metadata.pattern, metadata);

    if (!this.modulesMethods.has(metadata.module)) {
      this.modulesMethods.set(metadata.module, []);
    }
    this.modulesMethods.get(metadata.module)!.push(metadata);
  }

  getMethod(pattern: string): RpcMethodMetadata | undefined {
    return this.methods.get(pattern);
  }

  getModuleMethods(module: string): RpcMethodMetadata[] {
    return this.modulesMethods.get(module) || [];
  }

  getAllMethods(): RpcMethodMetadata[] {
    return Array.from(this.methods.values());
  }

  getMethodsByModule(): Map<string, RpcMethodMetadata[]> {
    return new Map(this.modulesMethods);
  }
}

export const rpcRegistry = new RpcRegistry();