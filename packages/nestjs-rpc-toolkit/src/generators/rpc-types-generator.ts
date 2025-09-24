import { Project, SourceFile, MethodDeclaration, ts } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';

export interface RpcGenerationConfig {
  /** Package paths to scan for RPC methods. Supports glob patterns like 'packages/modules/*' */
  packages: string[];
  outputDir: string;
}

export interface GeneratorOptions {
  rootDir: string;
  configPath: string;
}

interface RpcMethodInfo {
  pattern: string;
  methodName: string;
  module: string;
  paramTypes: { name: string; type: string }[];
  returnType: string;
  sourceFile: string;
}

interface InterfaceDefinition {
  name: string;
  source: string;
  module: string;
}

export class RpcTypesGenerator {
  private projects: Map<string, Project> = new Map();
  private rpcMethods: RpcMethodInfo[] = [];
  private interfaces: Map<string, InterfaceDefinition> = new Map();
  private config: RpcGenerationConfig;
  private packageFiles: Map<string, string[]> = new Map();
  private expandedPackages: string[] = [];
  private fileToModuleMap: Map<string, string> = new Map();

  constructor(private options: GeneratorOptions) {
    // Load configuration
    this.config = this.loadConfig();

    // Expand wildcard patterns in package paths
    this.expandedPackages = this.expandPackagePaths(this.config.packages);

    // Initialize a separate project for each package
    this.expandedPackages.forEach(packagePath => {
      this.initializePackageProject(packagePath);
    });
  }

  private expandPackagePaths(packagePaths: string[]): string[] {
    const expandedPaths: string[] = [];

    for (const packagePath of packagePaths) {
      if (packagePath.includes('*')) {
        // Use glob to expand wildcard patterns
        const matches = glob.sync(packagePath, {
          cwd: this.options.rootDir
        }).filter(match => {
          const fullPath = path.join(this.options.rootDir, match);
          return fs.statSync(fullPath).isDirectory();
        });
        expandedPaths.push(...matches);
      } else {
        // Regular path, add as-is
        expandedPaths.push(packagePath);
      }
    }

    // Filter out duplicates and ensure all paths exist
    const uniquePaths = [...new Set(expandedPaths)];
    return uniquePaths.filter(packagePath => {
      const fullPath = path.join(this.options.rootDir, packagePath);
      const exists = fs.existsSync(fullPath);
      if (!exists) {
        console.warn(`⚠️  Package path not found: ${packagePath} (resolved to ${fullPath})`);
      }
      return exists;
    });
  }

  private initializePackageProject(packagePath: string): void {
    const fullPath = path.join(this.options.rootDir, packagePath);

    // Find all TypeScript files in this package
    const files = glob.sync('src/**/*.ts', {
      cwd: fullPath,
      absolute: true
    });

    this.packageFiles.set(packagePath, files);

    // Find the most appropriate tsconfig for this package
    const tsConfigPath = this.findTsConfigForPackage(fullPath);

    // Create a project for this package
    const project = new Project({
      tsConfigFilePath: tsConfigPath,
    });

    // Add source files to the project
    files.forEach(file => {
      project.addSourceFileAtPath(file);
    });

    this.projects.set(packagePath, project);
  }

  private findTsConfigForPackage(packagePath: string): string {
    // Check for package-specific tsconfig files in order of preference
    const possibleConfigs = [
      path.join(packagePath, 'tsconfig.json'),
      path.join(packagePath, 'tsconfig.build.json'),
    ];

    for (const configPath of possibleConfigs) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    // Fall back to searching for root tsconfig files
    const rootConfigs = [
      path.join(this.options.rootDir, 'tsconfig.base.json'),
      path.join(this.options.rootDir, 'tsconfig.json'),
    ];

    for (const configPath of rootConfigs) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    // If no tsconfig found, create a minimal one in memory
    throw new Error(`No tsconfig found for package ${packagePath}. Please ensure the package has a tsconfig.json or the root has tsconfig.base.json/tsconfig.json`);
  }

  private loadConfig(): RpcGenerationConfig {
    if (!fs.existsSync(this.options.configPath)) {
      throw new Error(`RPC generation config not found at: ${this.options.configPath}`);
    }
    return JSON.parse(fs.readFileSync(this.options.configPath, 'utf8'));
  }

  generate(): void {
    console.log(`🔍 Scanning ${this.projects.size} packages for RPC methods...`);

    // First pass: scan for RPC methods to establish module mapping
    this.projects.forEach((project, packagePath) => {
      const sourceFiles = project.getSourceFiles();
      const relevantFiles = sourceFiles.filter(sf =>
        !sf.getFilePath().includes('node_modules') &&
        !sf.getFilePath().includes('/dist/')
      );

      console.log(`   📦 ${packagePath}: scanning ${relevantFiles.length} TypeScript files`);

      // First, find all RPC methods to establish file-to-module mapping
      relevantFiles.forEach(sourceFile => {
        this.scanForRpcMethods(sourceFile);
      });
    });

    // Second pass: extract interfaces/DTOs with correct module associations
    this.projects.forEach((project) => {
      const sourceFiles = project.getSourceFiles();
      const relevantFiles = sourceFiles.filter(sf =>
        !sf.getFilePath().includes('node_modules') &&
        !sf.getFilePath().includes('/dist/') &&
        !sf.getFilePath().includes('.rpc.gen.ts')
      );

      relevantFiles.forEach(sourceFile => {
        this.extractTypesFromFile(sourceFile);
      });
    });

    // Generate the aggregated types file
    this.generateTypesFile();
  }

  private scanForRpcMethods(sourceFile: SourceFile): void {
    sourceFile.forEachDescendant((node) => {
      if (node.getKind() === ts.SyntaxKind.MethodDeclaration) {
        const method = node as MethodDeclaration;
        const rpcMethod = this.processMethod(method, sourceFile);
        if (rpcMethod) {
          // Map this file to the module determined by the RPC pattern
          const module = rpcMethod.module;
          // Map the entire directory to this module (since DTOs might be in separate files)
          const dir = path.dirname(sourceFile.getFilePath());
          this.fileToModuleMap.set(dir, module);

          // Also map parent src directory for this module
          const srcDir = dir.replace(/\/[^\/]+$/, '');
          if (srcDir.endsWith('/src')) {
            this.fileToModuleMap.set(srcDir, module);
          }
        }
      }
    });
  }

  private extractTypesFromFile(sourceFile: SourceFile): void {
    sourceFile.forEachDescendant((node) => {
      if (node.getKind() === ts.SyntaxKind.InterfaceDeclaration) {
        this.extractInterface(node as any, sourceFile);
      } else if (node.getKind() === ts.SyntaxKind.ClassDeclaration) {
        this.extractClassAsInterface(node as any, sourceFile);
      }
    });
  }

  private extractInterface(interfaceDeclaration: any, sourceFile: SourceFile): void {
    const name = interfaceDeclaration.getName();
    const source = interfaceDeclaration.getText();
    const moduleName = this.getModuleForFile(sourceFile.getFilePath());

    if (name && this.isRelevantInterface(name) && !this.isInternalType(name)) {
      this.interfaces.set(name, {
        name,
        source,
        module: moduleName
      });
    }
  }

  private extractClassAsInterface(classDeclaration: any, sourceFile: SourceFile): void {
    const name = classDeclaration.getName();
    if (!name || !this.isRelevantInterface(name) || this.isInternalType(name)) return;

    // Extract DTO classes as interfaces
    const properties = classDeclaration.getProperties()
      .filter((prop: any) => !prop.hasModifier(ts.SyntaxKind.PrivateKeyword))
      .map((prop: any) => {
        const propName = prop.getName();
        // Get the type as declared in the source, not the resolved type
        let propType = 'any';
        const typeNode = prop.getTypeNode();
        if (typeNode) {
          propType = typeNode.getText();
        } else {
          // Fallback: try to get a simple representation of the type
          const fullType = prop.getType().getText();
          // Clean up the type string - remove import paths and keep it simple
          propType = this.cleanTypeString(fullType);
        }
        return `  ${propName}: ${propType};`;
      });

    if (properties.length > 0) {
      const source = `export interface ${name} {\n${properties.join('\n')}\n}`;
      const moduleName = this.getModuleForFile(sourceFile.getFilePath());

      this.interfaces.set(name, {
        name,
        source,
        module: moduleName
      });
    }
  }

  private isRelevantInterface(name: string): boolean {
    return !this.isInternalType(name);
  }

  private getModuleForFile(filePath: string): string {
    // Check if this file's directory has been mapped to a module
    const dir = path.dirname(filePath);

    // First check exact directory match
    if (this.fileToModuleMap.has(dir)) {
      return this.fileToModuleMap.get(dir)!;
    }

    // Check parent directories (DTOs might be in subdirectories)
    let currentDir = dir;
    while (currentDir.includes('/src')) {
      if (this.fileToModuleMap.has(currentDir)) {
        return this.fileToModuleMap.get(currentDir)!;
      }
      currentDir = path.dirname(currentDir);
    }

    return 'unknown';
  }

  private isInternalType(name: string): boolean {
    // Filter out generator internal types
    return name === 'InterfaceDefinition' ||
           name === 'RpcMethodInfo' ||
           name === 'RpcGenerationConfig' ||
           name === 'GeneratorOptions';
  }

  private processMethod(method: MethodDeclaration, sourceFile: SourceFile): RpcMethodInfo | null {
    // Check for @RpcMethod decorator
    const rpcDecorator = method.getDecorators().find(decorator => {
      const decoratorName = decorator.getName();
      return decoratorName === 'RpcMethod';
    });

    if (!rpcDecorator) return null;

    const methodName = method.getName() || 'unknown';

    // Check if this method is in a class with @RpcController decorator
    const classDeclaration = method.getParent();
    let rpcControllerDecorator: any = null;

    if (classDeclaration && 'getDecorators' in classDeclaration) {
      rpcControllerDecorator = (classDeclaration as any).getDecorators().find((decorator: any) => {
        return decorator.getName() === 'RpcController';
      });
    }

    // Only process methods from classes with @RpcController decorator
    if (!rpcControllerDecorator) {
      return null; // Skip methods not in @RpcController classes
    }

    // Generate module prefix like the @RpcController decorator does
    let modulePrefix: string;
    const args = rpcControllerDecorator.getArguments();
    if (args.length > 0 && args[0]) {
      const arg = args[0];
      if (typeof arg.getLiteralValue === 'function') {
        modulePrefix = arg.getLiteralValue();
      } else {
        // Fallback to class name inference
        const className = method.getParent()?.getSymbol()?.getName() || 'unknown';
        modulePrefix = className.replace(/(Service|Application|Handler|Repository)$/, '').toLowerCase();
      }
    } else {
      // @RpcController() without arguments - infer from class name
      const className = method.getParent()?.getSymbol()?.getName() || 'unknown';
      modulePrefix = className.replace(/(Service|Application|Handler|Repository)$/, '').toLowerCase();
    }

    // Generate the pattern
    const pattern = `${modulePrefix}.${methodName}`;

    // All patterns should now be prefixed (module.method), so extract module
    if (!pattern.includes('.')) {
      console.warn(`⚠️  RPC pattern '${pattern}' should have module prefix. This might be from an older decorator.`);
      return null;
    }

    const moduleName = pattern.split('.')[0];

    // Extract parameter information
    const paramTypes = method.getParameters().map(param => ({
      name: param.getName(),
      type: this.cleanTypeString(param.getType().getText()),
    }));

    // Extract return type
    const returnType = this.cleanReturnType(method.getReturnType().getText());

    const rpcMethod = {
      pattern,
      methodName,
      module: moduleName,
      paramTypes,
      returnType,
      sourceFile: sourceFile.getFilePath(),
    };


    this.rpcMethods.push(rpcMethod);
    return rpcMethod;
  }

  private generateTypesFile(): void {
    // Group methods by module
    const moduleGroups = this.rpcMethods.reduce((groups, method) => {
      if (!groups[method.module]) {
        groups[method.module] = [];
      }
      groups[method.module].push(method);
      return groups;
    }, {} as Record<string, RpcMethodInfo[]>);

    // Group interfaces by module
    const interfacesByModule = new Map<string, InterfaceDefinition[]>();
    this.interfaces.forEach(interfaceDef => {
      if (!interfacesByModule.has(interfaceDef.module)) {
        interfacesByModule.set(interfaceDef.module, []);
      }
      interfacesByModule.get(interfaceDef.module)!.push(interfaceDef);
    });

    // Generate separate file for each module
    Object.entries(moduleGroups).forEach(([moduleName, methods]) => {
      this.generateModuleTypesFile(moduleName, methods, interfacesByModule.get(moduleName) || []);
    });

    // Generate the main types file that composes all modules
    this.generateMainTypesFile(moduleGroups);
  }

  private generateModuleTypesFile(moduleName: string, methods: RpcMethodInfo[], interfaces: InterfaceDefinition[]): void {
    // Collect all type names referenced in RPC methods
    const referencedTypes = new Set<string>();

    methods.forEach(method => {
      // Extract types from parameters
      method.paramTypes.forEach(param => {
        this.extractTypeNames(param.type).forEach(typeName => {
          referencedTypes.add(typeName);
        });
      });

      // Extract types from return type
      this.extractTypeNames(method.returnType).forEach(typeName => {
        referencedTypes.add(typeName);
      });
    });

    // Include interfaces that are actually referenced, from this module or others
    const referencedInterfaces: InterfaceDefinition[] = [];

    // First add interfaces from this module
    interfaces.filter(interfaceDef =>
      referencedTypes.has(interfaceDef.name)
    ).forEach(interfaceDef => referencedInterfaces.push(interfaceDef));

    // Then add interfaces from other modules that are referenced
    this.interfaces.forEach(interfaceDef => {
      if (referencedTypes.has(interfaceDef.name) &&
          interfaceDef.module !== moduleName &&
          !referencedInterfaces.some(existing => existing.name === interfaceDef.name)) {
        referencedInterfaces.push(interfaceDef);
      }
    });

    const moduleInterfaces = referencedInterfaces.map(interfaceDef => interfaceDef.source).join('\n\n');

    // Generate domain interface for this module
    const domainMethodDefinitions = methods.map(method => {
      const methodNameWithoutModule = method.methodName;
      const paramsType = this.generateParamsType(method.paramTypes);
      return `  ${methodNameWithoutModule}(params: ${paramsType}): Promise<${method.returnType}>;`;
    }).join('\n');

    const domainInterface = `// Domain interface for ${moduleName} module
export interface ${this.toCamelCase(moduleName)}Domain {
${domainMethodDefinitions}
}`;

    const fileContent = `// Auto-generated RPC types for ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} module
// Do not edit this file manually - it will be overwritten
//
// IMPORTANT: All types must be JSON-serializable for TCP transport when extracted to microservices

// ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} module types
${moduleInterfaces}

${domainInterface}
`;

    // Write to configured output directory
    const outputPath = path.join(this.options.rootDir, this.config.outputDir, `${moduleName}.rpc.gen.ts`);
    fs.writeFileSync(outputPath, fileContent, 'utf8');
  }

  private generateMainTypesFile(moduleGroups: Record<string, RpcMethodInfo[]>): void {
    const hasModules = Object.keys(moduleGroups).length > 0;

    // Generate imports from module files - include domain interfaces and types
    const moduleImports = Object.keys(moduleGroups).map(moduleName => {
      // Collect all types referenced in this module's methods
      const referencedTypes = new Set<string>();
      moduleGroups[moduleName].forEach(method => {
        method.paramTypes.forEach(param => {
          this.extractTypeNames(param.type).forEach(typeName => {
            referencedTypes.add(typeName);
          });
        });
        this.extractTypeNames(method.returnType).forEach(typeName => {
          referencedTypes.add(typeName);
        });
      });

      const typesList = Array.from(referencedTypes).filter(type =>
        !this.isBuiltInType(type) && !this.isInternalType(type)
      );

      const imports = [`${this.toCamelCase(moduleName)}Domain`];
      if (typesList.length > 0) {
        imports.push(...typesList);
      }

      return `import { ${imports.join(', ')} } from './${moduleName}.rpc.gen';`;
    }).join('\n');

    // Generate selective re-exports to avoid type conflicts
    const moduleReExports = Object.keys(moduleGroups).map(moduleName => {
      // Collect all types referenced in this module's methods
      const referencedTypes = new Set<string>();
      moduleGroups[moduleName].forEach(method => {
        method.paramTypes.forEach(param => {
          this.extractTypeNames(param.type).forEach(typeName => {
            referencedTypes.add(typeName);
          });
        });
        this.extractTypeNames(method.returnType).forEach(typeName => {
          referencedTypes.add(typeName);
        });
      });

      const typesList = Array.from(referencedTypes).filter(type =>
        !this.isBuiltInType(type) && !this.isInternalType(type)
      );

      const exports = [`${this.toCamelCase(moduleName)}Domain`];
      if (typesList.length > 0) {
        exports.push(...typesList);
      }

      return `export { ${exports.join(', ')} } from './${moduleName}.rpc.gen';`;
    }).join('\n');

    // Generate common type re-exports from their original modules
    const commonTypeExports = this.generateCommonTypeExports(moduleGroups);

    // Generate RPC client interface using imported domain interfaces
    const rpcClientInterface = hasModules ? `
// Domain-scoped RPC client interface
export interface IRpcClient {
${Object.keys(moduleGroups).map(moduleName =>
  `  ${moduleName}: ${this.toCamelCase(moduleName)}Domain;`
).join('\n')}
}` : '';

    const fileContent = `// Auto-generated RPC types from all modules
// Do not edit this file manually - it will be overwritten
//
// SERIALIZATION REQUIREMENTS:
// All @RpcMethod parameters and return types must be JSON-serializable for TCP transport.
// Avoid: functions, callbacks, Buffer, Map/Set, DOM elements, class instances, undefined
// Prefer: primitives, plain objects, arrays, null (instead of undefined)

${moduleImports}

// Re-export domain interfaces and types
${moduleReExports}

// Re-export common types from their primary modules
${commonTypeExports}
${rpcClientInterface}

// Usage examples:
// import { TypedRpcClient } from '@modular-monolith/rpc';
//
// const user = await rpc.user.findOne({ id: 'user123' });
// const products = await rpc.product.findByOwner({ ownerId: 'user123' });
`;

    // Write to configured output directory
    const outputPath = path.join(this.options.rootDir, this.config.outputDir, 'all.rpc.gen.ts');

    // Ensure directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, fileContent, 'utf8');

    if (this.rpcMethods.length === 0) {
      console.log(`⚠️  No RPC methods found in the configured packages`);
      console.log(`   📁 Output directory: ${this.config.outputDir}`);
      console.log(`   💡 Make sure your modules use @RpcMethod decorators from @zdavison/nestjs-rpc-toolkit`);
    } else {
      console.log(`✅ Generated RPC types for ${this.rpcMethods.length} methods across ${Object.keys(moduleGroups).length} modules`);
      console.log(`   📁 Output directory: ${this.config.outputDir}`);
      Object.entries(moduleGroups).forEach(([module, methods]) => {
        console.log(`   📄 ${module}: ${methods.length} methods`);
      });
    }
  }

  private generateParamsType(params: { name: string; type: string }[]): string {
    if (params.length === 0) return '{}';

    const paramStrings = params.map(param => `${param.name}: ${param.type}`);
    return `{ ${paramStrings.join('; ')} }`;
  }

  private cleanReturnType(returnType: string): string {
    // Remove Promise wrapper if present
    let cleanType = returnType;
    const promiseMatch = returnType.match(/Promise<(.+)>/);
    if (promiseMatch) {
      cleanType = promiseMatch[1];
    }

    // Remove all import paths and use simple type names
    cleanType = cleanType.replace(/import\("[^"]*"\)\./g, '');

    return cleanType;
  }

  private cleanTypeString(typeStr: string): string {
    // Remove import paths and keep only the type name
    let cleanType = typeStr.replace(/import\("[^"]*"\)\./g, '');

    return cleanType;
  }

  private toCamelCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private extractTypeNames(typeString: string): Set<string> {
    const typeNames = new Set<string>();

    // Match type names (letters, numbers, underscore, $)
    // This regex will match identifiers that could be type names
    const typeNameRegex = /\b[A-Z][a-zA-Z0-9_$]*\b/g;

    const matches = typeString.match(typeNameRegex);
    if (matches) {
      matches.forEach(match => {
        // Exclude built-in types and common generic types
        if (!this.isBuiltInType(match)) {
          typeNames.add(match);
        }
      });
    }

    return typeNames;
  }

  private isBuiltInType(typeName: string): boolean {
    const builtInTypes = [
      'Array', 'Object', 'String', 'Number', 'Boolean',
      'Promise', 'Date', 'RegExp', 'Error', 'Map', 'Set',
      'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit',
      // Node.js types that shouldn't be imported
      'Buffer', 'Stream', 'EventEmitter', 'Socket',
      // DOM types that shouldn't be imported
      'HTMLElement', 'Document', 'Window', 'Event', 'FileList', 'File', 'Blob',
      // TypeScript utility types
      'Function', 'CallbackFunction'
    ];
    return builtInTypes.includes(typeName);
  }


  private generateCommonTypeExports(moduleGroups: Record<string, RpcMethodInfo[]>): string {
    // Find types that are used across modules and determine their "primary" module
    const typeToModulesMap = new Map<string, Set<string>>();
    const typeToOriginalModule = new Map<string, string>();

    // Track which types are used by which modules
    Object.entries(moduleGroups).forEach(([moduleName, methods]) => {
      methods.forEach(method => {
        // Extract types from parameters and return types
        const allTypes = new Set<string>();
        method.paramTypes.forEach(param => {
          this.extractTypeNames(param.type).forEach(typeName => allTypes.add(typeName));
        });
        this.extractTypeNames(method.returnType).forEach(typeName => allTypes.add(typeName));

        allTypes.forEach(typeName => {
          if (!typeToModulesMap.has(typeName)) {
            typeToModulesMap.set(typeName, new Set());
          }
          typeToModulesMap.get(typeName)!.add(moduleName);
        });
      });
    });

    // Find the original module for each type
    this.interfaces.forEach(interfaceDef => {
      if (!typeToOriginalModule.has(interfaceDef.name)) {
        typeToOriginalModule.set(interfaceDef.name, interfaceDef.module);
      }
    });

    // Generate exports for types that are used across multiple modules
    const exports: string[] = [];
    typeToModulesMap.forEach((modules, typeName) => {
      if (modules.size > 1 && typeToOriginalModule.has(typeName)) {
        const originalModule = typeToOriginalModule.get(typeName)!;
        exports.push(`export { ${typeName} } from './${originalModule}.rpc.gen';`);
      }
    });

    return exports.join('\n');
  }
}