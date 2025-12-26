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
  typeParameters?: string[];
  jsDoc?: string;
}

interface InterfaceDefinition {
  name: string;
  source: string;
  module: string;
  jsDoc?: string;
}

interface EnumDefinition {
  name: string;
  source: string;
  module: string;
  jsDoc?: string;
}

export class RpcTypesGenerator {
  private projects: Map<string, Project> = new Map();
  private rpcMethods: RpcMethodInfo[] = [];
  private interfaces: Map<string, InterfaceDefinition> = new Map();
  private enums: Map<string, EnumDefinition> = new Map();
  private config: RpcGenerationConfig;
  private packageFiles: Map<string, string[]> = new Map();
  private expandedPackages: string[] = [];
  private fileToModuleMap: Map<string, string> = new Map();
  /** Maps type names to their codec fields (field name -> codec name) */
  private codecFields: Map<string, Map<string, string>> = new Map();
  /** Pending nested type checks to resolve after all types are processed */
  private pendingNestedTypes: Map<string, { propName: string; typeName: string }[]> = new Map();

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
      path.join(this.options.rootDir, 'tsconfig.json'),
      path.join(this.options.rootDir, 'tsconfig.base.json'),
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

    // Third pass: resolve nested type references (fields that reference types with codec fields)
    this.resolveNestedTypeReferences();

    // Generate the aggregated types file
    this.generateTypesFile();
  }

  /**
   * Resolve pending nested type references.
   * For each type, check if any of its fields reference other types that have codec fields.
   * If so, add a nested type reference (prefixed with @) to the codec fields.
   */
  private resolveNestedTypeReferences(): void {
    this.pendingNestedTypes.forEach((pendingChecks, typeName) => {
      pendingChecks.forEach(({ propName, typeName: nestedTypeName }) => {
        // Check if the referenced type has codec fields
        if (this.codecFields.has(nestedTypeName)) {
          // Add a nested type reference to the parent type's codec fields
          let typeCodecFields = this.codecFields.get(typeName);
          if (!typeCodecFields) {
            typeCodecFields = new Map<string, string>();
            this.codecFields.set(typeName, typeCodecFields);
          }
          // Use @ prefix to indicate a nested type reference
          typeCodecFields.set(propName, `@${nestedTypeName}`);
        }
      });
    });
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
      } else if (node.getKind() === ts.SyntaxKind.TypeAliasDeclaration) {
        this.extractTypeAlias(node as any, sourceFile);
      } else if (node.getKind() === ts.SyntaxKind.EnumDeclaration) {
        this.extractEnum(node as any, sourceFile);
      }
    });
  }

  private extractInterface(interfaceDeclaration: any, sourceFile: SourceFile): void {
    const name = interfaceDeclaration.getName();
    const moduleName = this.getModuleForFile(sourceFile.getFilePath());
    const jsDoc = this.extractJsDoc(interfaceDeclaration);

    if (name && this.isRelevantInterface(name) && !this.isInternalType(name)) {
      // Track codec fields and transform the interface source
      const typeCodecFields = new Map<string, string>();
      // Track nested type references (for fields whose type has codec fields)
      const pendingNestedTypeChecks: { propName: string; typeName: string }[] = [];
      const properties = interfaceDeclaration.getProperties();

      let source = interfaceDeclaration.getText();

      // Check each property for codec-handled types
      properties.forEach((prop: any) => {
        const propName = prop.getName();
        const typeNode = prop.getTypeNode();
        if (typeNode) {
          const propType = typeNode.getText();
          const codecInfo = this.getCodecForType(propType);
          if (codecInfo) {
            typeCodecFields.set(propName, codecInfo.codecName);
            // Replace the type with wire type in the source
            const newType = codecInfo.wireType;
            source = source.replace(
              new RegExp(`(${propName}\\s*[?]?\\s*:\\s*)${propType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
              `$1${newType}`
            );
          } else {
            // Check if this is a reference to another type (potential nested type)
            const extractedType = this.extractMainTypeName(propType);
            if (extractedType && !this.isBuiltInType(extractedType)) {
              pendingNestedTypeChecks.push({ propName, typeName: extractedType });
            }
          }
        }
      });

      // Store codec fields for this type
      if (typeCodecFields.size > 0) {
        this.codecFields.set(name, typeCodecFields);
      }

      // Store pending nested type checks to resolve after all types are processed
      if (pendingNestedTypeChecks.length > 0) {
        this.pendingNestedTypes.set(name, pendingNestedTypeChecks);
      }

      this.interfaces.set(name, {
        name,
        source,
        module: moduleName,
        jsDoc
      });
    }
  }

  private extractClassAsInterface(classDeclaration: any, sourceFile: SourceFile): void {
    const name = classDeclaration.getName();
    if (!name || !this.isRelevantInterface(name) || this.isInternalType(name)) return;

    // Extract generic type parameters from class
    const typeParameters = classDeclaration.getTypeParameters();
    const typeParamsStr = typeParameters.length > 0
      ? `<${typeParameters.map((tp: any) => {
          const tpName = tp.getName();
          const constraint = tp.getConstraint();
          const defaultType = tp.getDefault();
          let result = tpName;
          if (constraint) {
            result += ` extends ${constraint.getText()}`;
          }
          if (defaultType) {
            result += ` = ${defaultType.getText()}`;
          }
          return result;
        }).join(', ')}>`
      : '';

    // Track codec fields for this type
    const typeCodecFields = new Map<string, string>();
    // Track nested type references (for fields whose type has codec fields)
    const pendingNestedTypeChecks: { propName: string; typeName: string }[] = [];

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

        // Check if this type needs a codec and convert to wire type
        const codecInfo = this.getCodecForType(propType);
        if (codecInfo) {
          typeCodecFields.set(propName, codecInfo.codecName);
          propType = codecInfo.wireType;
        } else {
          // Check if this is a reference to another type (potential nested type)
          const extractedType = this.extractMainTypeName(propType);
          if (extractedType && !this.isBuiltInType(extractedType)) {
            pendingNestedTypeChecks.push({ propName, typeName: extractedType });
          }
        }

        // Extract JSDoc for the property
        const propJsDoc = this.extractJsDoc(prop);
        const propJsDocStr = propJsDoc ? `${propJsDoc}\n` : '';
        return `${propJsDocStr}  ${propName}: ${propType};`;
      });

    // Store codec fields for this type
    if (typeCodecFields.size > 0) {
      this.codecFields.set(name, typeCodecFields);
    }

    // Store pending nested type checks to resolve after all types are processed
    if (pendingNestedTypeChecks.length > 0) {
      this.pendingNestedTypes.set(name, pendingNestedTypeChecks);
    }

    if (properties.length > 0) {
      // Extract JSDoc for the class
      const classJsDoc = this.extractJsDoc(classDeclaration);
      const classJsDocStr = classJsDoc ? `${classJsDoc}\n` : '';
      const source = `${classJsDocStr}export interface ${name}${typeParamsStr} {\n${properties.join('\n')}\n}`;
      const moduleName = this.getModuleForFile(sourceFile.getFilePath());

      this.interfaces.set(name, {
        name,
        source,
        module: moduleName,
        jsDoc: classJsDoc
      });
    }
  }

  /**
   * Built-in codec mappings: source type -> { codecName, wireType }
   * Extensible: add more entries to support additional types.
   */
  private readonly codecMappings: Record<string, { codecName: string; wireType: string }> = {
    'Date': { codecName: 'Date', wireType: 'string' },
    // Future: 'BigInt': { codecName: 'BigInt', wireType: 'string' },
    // Future: 'Buffer': { codecName: 'Buffer', wireType: 'string' },
  };

  /**
   * Check if a type needs a codec and return codec info.
   * Returns undefined if the type doesn't need a codec.
   */
  private getCodecForType(typeStr: string): { codecName: string; wireType: string } | undefined {
    const normalized = typeStr.replace(/\s/g, '');

    // Check each known codec type
    for (const [sourceType, codecInfo] of Object.entries(this.codecMappings)) {
      // Match exact type or union with null/undefined
      if (normalized === sourceType ||
          normalized.includes(`${sourceType}|`) ||
          normalized.includes(`|${sourceType}`)) {
        return {
          codecName: codecInfo.codecName,
          // Replace the source type with wire type, preserving unions
          wireType: typeStr.replace(new RegExp(`\\b${sourceType}\\b`, 'g'), codecInfo.wireType),
        };
      }
    }

    return undefined;
  }

  private extractTypeAlias(typeAliasDeclaration: any, sourceFile: SourceFile): void {
    const name = typeAliasDeclaration.getName();
    let source = typeAliasDeclaration.getText();
    const moduleName = this.getModuleForFile(sourceFile.getFilePath());
    const jsDoc = this.extractJsDoc(typeAliasDeclaration);

    // Ensure the source has export keyword
    if (!source.startsWith('export ')) {
      source = `export ${source}`;
    }

    // Prepend JSDoc if available
    if (jsDoc) {
      source = `${jsDoc}\n${source}`;
    }

    if (name && this.isRelevantInterface(name) && !this.isInternalType(name)) {
      this.interfaces.set(name, {
        name,
        source,
        module: moduleName,
        jsDoc
      });
    }
  }

  private extractEnum(enumDeclaration: any, sourceFile: SourceFile): void {
    const name = enumDeclaration.getName();
    let source = enumDeclaration.getText();
    const moduleName = this.getModuleForFile(sourceFile.getFilePath());
    const jsDoc = this.extractJsDoc(enumDeclaration);

    // Ensure the source has export keyword
    if (!source.startsWith('export ')) {
      source = `export ${source}`;
    }

    // Prepend JSDoc if available
    if (jsDoc) {
      source = `${jsDoc}\n${source}`;
    }

    if (name && !this.isInternalType(name)) {
      this.enums.set(name, {
        name,
        source,
        module: moduleName,
        jsDoc
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

    // Extract generic type parameters
    const typeParameters = method.getTypeParameters().map(tp => {
      const name = tp.getName();
      const constraint = tp.getConstraint();
      if (constraint) {
        return `${name} extends ${constraint.getText()}`;
      }
      return name;
    });

    // Extract JSDoc comment
    const jsDocComment = this.extractJsDoc(method);

    const rpcMethod = {
      pattern,
      methodName,
      module: moduleName,
      paramTypes,
      returnType,
      sourceFile: sourceFile.getFilePath(),
      typeParameters: typeParameters.length > 0 ? typeParameters : undefined,
      jsDoc: jsDocComment,
    };


    this.rpcMethods.push(rpcMethod);
    return rpcMethod;
  }

  private extractJsDoc(node: MethodDeclaration | any): string | undefined {
    const jsDocs = node.getJsDocs();
    if (!jsDocs || jsDocs.length === 0) return undefined;

    // Get the full text of the JSDoc comment
    const jsDocText = jsDocs.map((doc: any) => doc.getText()).join('\n');
    return jsDocText;
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

    // Group enums by module
    const enumsByModule = new Map<string, EnumDefinition[]>();
    this.enums.forEach(enumDef => {
      if (!enumsByModule.has(enumDef.module)) {
        enumsByModule.set(enumDef.module, []);
      }
      enumsByModule.get(enumDef.module)!.push(enumDef);
    });

    // Generate separate file for each module
    Object.entries(moduleGroups).forEach(([moduleName, methods]) => {
      this.generateModuleTypesFile(
        moduleName,
        methods,
        interfacesByModule.get(moduleName) || [],
        enumsByModule.get(moduleName) || []
      );
    });

    // Generate the main types file that composes all modules
    this.generateMainTypesFile(moduleGroups);
  }

  private generateModuleTypesFile(moduleName: string, methods: RpcMethodInfo[], interfaces: InterfaceDefinition[], enums: EnumDefinition[]): void {
    // Collect all type names referenced in RPC methods
    const referencedTypes = new Set<string>();
    const genericTypeParamNames = new Set<string>();

    methods.forEach(method => {
      // Track generic type parameter names to exclude from imports
      if (method.typeParameters) {
        method.typeParameters.forEach(typeParam => {
          // Extract just the parameter name (before 'extends' if present)
          const paramName = typeParam.split(' ')[0];
          genericTypeParamNames.add(paramName);
        });
      }

      // Extract types from parameters
      method.paramTypes.forEach(param => {
        this.extractTypeNames(param.type).forEach(typeName => {
          if (!genericTypeParamNames.has(typeName)) {
            referencedTypes.add(typeName);
          }
        });
      });

      // Extract types from return type
      this.extractTypeNames(method.returnType).forEach(typeName => {
        if (!genericTypeParamNames.has(typeName)) {
          referencedTypes.add(typeName);
        }
      });

      // Extract types from generic type parameters (constraints only)
      if (method.typeParameters) {
        method.typeParameters.forEach(typeParam => {
          this.extractTypeNames(typeParam).forEach(typeName => {
            if (!genericTypeParamNames.has(typeName)) {
              referencedTypes.add(typeName);
            }
          });
        });
      }
    });

    // Include enums that are actually referenced, from this module or others
    const referencedEnums: EnumDefinition[] = [];

    // First add enums from this module
    enums.filter(enumDef =>
      referencedTypes.has(enumDef.name)
    ).forEach(enumDef => referencedEnums.push(enumDef));

    // Then add enums from other modules that are referenced
    this.enums.forEach(enumDef => {
      if (referencedTypes.has(enumDef.name) &&
          enumDef.module !== moduleName &&
          !referencedEnums.some(existing => existing.name === enumDef.name)) {
        referencedEnums.push(enumDef);
      }
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

    // Recursively collect type dependencies from referenced interfaces
    // Keep scanning until no new types are found
    let prevSize = 0;
    while (referencedTypes.size !== prevSize) {
      prevSize = referencedTypes.size;

      // Scan referenced interfaces for additional type dependencies
      referencedInterfaces.forEach(interfaceDef => {
        this.extractTypeNames(interfaceDef.source).forEach(typeName => {
          if (!genericTypeParamNames.has(typeName)) {
            referencedTypes.add(typeName);
          }
        });
      });

      // Re-check interfaces after scanning for dependencies (for nested types)
      this.interfaces.forEach(interfaceDef => {
        if (referencedTypes.has(interfaceDef.name) &&
            !referencedInterfaces.some(existing => existing.name === interfaceDef.name)) {
          referencedInterfaces.push(interfaceDef);
        }
      });
    }

    // Re-check enums after scanning interfaces for dependencies
    this.enums.forEach(enumDef => {
      if (referencedTypes.has(enumDef.name) &&
          !referencedEnums.some(existing => existing.name === enumDef.name)) {
        referencedEnums.push(enumDef);
      }
    });

    // Enums should come before interfaces that use them
    const moduleEnums = referencedEnums.map(enumDef => enumDef.source).join('\n\n');
    const moduleInterfaces = referencedInterfaces.map(interfaceDef => interfaceDef.source).join('\n\n');

    // Generate domain interface for this module
    const domainMethodDefinitions = methods.map(method => {
      const methodNameWithoutModule = method.methodName;
      const paramsType = this.generateParamsType(method.paramTypes);
      const typeParams = method.typeParameters && method.typeParameters.length > 0
        ? `<${method.typeParameters.join(', ')}>`
        : '';
      const jsDocComment = method.jsDoc ? `${method.jsDoc}\n` : '';
      return `${jsDocComment}  ${methodNameWithoutModule}${typeParams}(params: ${paramsType}): Promise<${method.returnType}>;`;
    }).join('\n');

    const domainInterface = `// Domain interface for ${moduleName} module
export interface ${this.toCamelCase(moduleName)}Domain {
${domainMethodDefinitions}
}`;

    // Build file content with enums before interfaces
    const typesSection = [moduleEnums, moduleInterfaces].filter(section => section.length > 0).join('\n\n');

    // Generate codec field metadata for types in this module only
    const moduleCodecFields = this.generateCodecFieldsMetadata(moduleName);

    const fileContent = `// Auto-generated RPC types for ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} module
// Do not edit this file manually - it will be overwritten
//
// IMPORTANT: All types must be JSON-serializable for TCP transport when extracted to microservices

// ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} module types
${typesSection}

${domainInterface}
${moduleCodecFields}
`;

    // Write to configured output directory
    const outputPath = path.join(this.options.rootDir, this.config.outputDir, `${moduleName}.rpc.gen.ts`);
    fs.writeFileSync(outputPath, fileContent, 'utf8');
  }

  /** Generate codec metadata for types belonging to this module only */
  private generateCodecFieldsMetadata(moduleName: string): string {
    const codecEntries: string[] = [];

    // Only include types that belong to this module
    this.codecFields.forEach((fields, typeName) => {
      const interfaceDef = this.interfaces.get(typeName);
      if (interfaceDef && interfaceDef.module === moduleName && fields.size > 0) {
        const fieldEntries = Array.from(fields.entries())
          .map(([fieldName, codecName]) => `    ${fieldName}: '${codecName}'`)
          .join(',\n');
        codecEntries.push(`  ${typeName}: {\n${fieldEntries}\n  }`);
      }
    });

    if (codecEntries.length === 0) {
      return '';
    }

    return `
// Type metadata for automatic codec transformation
// Maps type names to field -> codec name mappings
// Used by RPC client for transparent serialization (Date <-> string, etc.)
export const RpcTypeInfo = {
${codecEntries.join(',\n')}
} as const;
`;
  }

  /** Generate function metadata for RPC patterns (params and returns) */
  private generateRpcFunctionInfo(moduleGroups: Record<string, RpcMethodInfo[]>): string {
    const entries: string[] = [];

    Object.values(moduleGroups).forEach(methods => {
      methods.forEach(method => {
        // Extract param types that have codec fields
        const paramEntries: string[] = [];
        method.paramTypes.forEach(param => {
          const typeName = this.extractMainTypeName(param.type);
          if (typeName && this.codecFields.has(typeName)) {
            paramEntries.push(`      ${param.name}: '${typeName}'`);
          }
        });

        // Extract return type if it has codec fields
        const returnType = this.extractMainTypeName(method.returnType);
        const hasReturnCodec = returnType && this.codecFields.has(returnType);

        // Only include if there are codec fields in params or return
        if (paramEntries.length > 0 || hasReturnCodec) {
          const paramsObj = paramEntries.length > 0
            ? `{\n${paramEntries.join(',\n')}\n    }`
            : '{}';
          const returnsValue = hasReturnCodec ? `'${returnType}'` : 'undefined';
          entries.push(`  '${method.pattern}': {\n    params: ${paramsObj},\n    returns: ${returnsValue}\n  }`);
        }
      });
    });

    if (entries.length === 0) {
      return '';
    }

    return `
// Function metadata for RPC patterns
// Maps patterns to their parameter and return type names for codec transformation
export const RpcFunctionInfo = {
${entries.join(',\n')}
} as const;

export type RpcFunctionInfoType = typeof RpcFunctionInfo;
`;
  }

  /** Extract the main type name from a type string (e.g., "User" from "Promise<User>") */
  private extractMainTypeName(typeStr: string): string | undefined {
    // Remove array brackets
    let type = typeStr.replace(/\[\]/g, '');
    // Remove Promise wrapper
    const promiseMatch = type.match(/Promise<(.+)>/);
    if (promiseMatch) {
      type = promiseMatch[1];
    }
    // Get the first capitalized identifier
    const match = type.match(/\b([A-Z][a-zA-Z0-9]*)\b/);
    return match ? match[1] : undefined;
  }

  /** Generate imports and re-exports for codec fields from module files */
  private generateCodecFieldReExports(moduleGroups: Record<string, RpcMethodInfo[]>): { imports: string; exports: string } {
    const modulesWithCodecFields: string[] = [];

    // Check which modules have codec fields
    Object.keys(moduleGroups).forEach(moduleName => {
      // Check if any types in this module have codec fields
      const moduleTypes = Array.from(this.interfaces.entries())
        .filter(([_, def]) => def.module === moduleName)
        .map(([name]) => name);

      const hasCodecFields = moduleTypes.some(typeName => this.codecFields.has(typeName));
      if (hasCodecFields) {
        modulesWithCodecFields.push(moduleName);
      }
    });

    if (modulesWithCodecFields.length === 0) {
      return { imports: '', exports: '' };
    }

    // Generate imports with aliases to avoid conflicts
    const imports = modulesWithCodecFields
      .map(mod => `import { RpcTypeInfo as ${this.toCamelCase(mod)}TypeInfo } from './${mod}.rpc.gen';`)
      .join('\n');

    // Generate merged export
    const mergeEntries = modulesWithCodecFields
      .map(mod => `  ...${this.toCamelCase(mod)}TypeInfo`)
      .join(',\n');

    const exports = `
// Merged type metadata from all modules
export const RpcTypeInfo = {
${mergeEntries}
} as const;
`;

    return { imports, exports };
  }

  private generateMainTypesFile(moduleGroups: Record<string, RpcMethodInfo[]>): void {
    const hasModules = Object.keys(moduleGroups).length > 0;

    // Generate imports from module files - include domain interfaces and types
    const moduleImports = Object.keys(moduleGroups).map(moduleName => {
      // Collect all types referenced in this module's methods
      const referencedTypes = new Set<string>();
      const genericTypeParamNames = new Set<string>();

      moduleGroups[moduleName].forEach(method => {
        // Track generic type parameter names to exclude from imports
        if (method.typeParameters) {
          method.typeParameters.forEach(typeParam => {
            const paramName = typeParam.split(' ')[0];
            genericTypeParamNames.add(paramName);
          });
        }

        method.paramTypes.forEach(param => {
          this.extractTypeNames(param.type).forEach(typeName => {
            if (!genericTypeParamNames.has(typeName)) {
              referencedTypes.add(typeName);
            }
          });
        });
        this.extractTypeNames(method.returnType).forEach(typeName => {
          if (!genericTypeParamNames.has(typeName)) {
            referencedTypes.add(typeName);
          }
        });
        if (method.typeParameters) {
          method.typeParameters.forEach(typeParam => {
            this.extractTypeNames(typeParam).forEach(typeName => {
              if (!genericTypeParamNames.has(typeName)) {
                referencedTypes.add(typeName);
              }
            });
          });
        }
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
      const genericTypeParamNames = new Set<string>();

      moduleGroups[moduleName].forEach(method => {
        // Track generic type parameter names to exclude from exports
        if (method.typeParameters) {
          method.typeParameters.forEach(typeParam => {
            const paramName = typeParam.split(' ')[0];
            genericTypeParamNames.add(paramName);
          });
        }

        method.paramTypes.forEach(param => {
          this.extractTypeNames(param.type).forEach(typeName => {
            if (!genericTypeParamNames.has(typeName)) {
              referencedTypes.add(typeName);
            }
          });
        });
        this.extractTypeNames(method.returnType).forEach(typeName => {
          if (!genericTypeParamNames.has(typeName)) {
            referencedTypes.add(typeName);
          }
        });
        if (method.typeParameters) {
          method.typeParameters.forEach(typeParam => {
            this.extractTypeNames(typeParam).forEach(typeName => {
              if (!genericTypeParamNames.has(typeName)) {
                referencedTypes.add(typeName);
              }
            });
          });
        }
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

    // Generate AllRpcMethods type for MessageBus
    const allRpcMethodsType = hasModules
      ? this.generateAllRpcMethodsType(moduleGroups)
      : `// Empty type mapping for RPC methods (no methods found yet)
export type AllRpcMethods = {};`;

    // Generate RPC client interface using imported domain interfaces
    // Always export IRpcClient to avoid import errors, even when empty
    const rpcClientInterface = hasModules ? `
// Domain-scoped RPC client interface
export interface IRpcClient {
${Object.keys(moduleGroups).map(moduleName =>
  `  ${moduleName}: ${this.toCamelCase(moduleName)}Domain;`
).join('\n')}
}` : `
// Empty RPC client interface (no RPC methods found yet)
// Run the type generator after adding @RpcMethod decorators to populate this
export interface IRpcClient {
  // No RPC domains available
}`;

    // Generate RPC function info (params and returns) for codec transformation
    const rpcFunctionInfo = this.generateRpcFunctionInfo(moduleGroups);

    // Generate codec field imports and re-exports from module files
    const codecFieldImportsAndExports = this.generateCodecFieldReExports(moduleGroups);

    const fileContent = `// Auto-generated RPC types from all modules
// Do not edit this file manually - it will be overwritten
//
// SERIALIZATION REQUIREMENTS:
// All @RpcMethod parameters and return types must be JSON-serializable for TCP transport.
// Avoid: functions, callbacks, Buffer, Map/Set, DOM elements, class instances, undefined
// Prefer: primitives, plain objects, arrays, null (instead of undefined), Date (auto-converted)

${moduleImports}
${codecFieldImportsAndExports.imports}

// Re-export domain interfaces and types
${moduleReExports}

// Re-export common types from their primary modules
${commonTypeExports}

${allRpcMethodsType}

${rpcClientInterface}
${codecFieldImportsAndExports.exports}${rpcFunctionInfo}
// Usage examples:
// import { RpcTypeInfo, RpcFunctionInfo } from '@your-org/lib-rpc';
// import { createRpcClientProxy } from '@zdavison/nestjs-rpc-toolkit';
//
// const rpc = createRpcClientProxy(client, {
//   typeInfo: RpcTypeInfo,
//   functionInfo: RpcFunctionInfo,
// });
// const user = await rpc.user.create({ ... }); // Dates auto-converted
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

    // Strip JSDoc comments before extracting type names
    // This prevents matching words in comments (e.g., "User" in "from a user")
    const withoutJsDoc = typeString
      .replace(/\/\*\*[\s\S]*?\*\//g, '')  // Remove /** ... */ comments
      .replace(/\/\/[^\n]*/g, '');          // Remove // comments

    // Match type names (letters, numbers, underscore, $)
    // This regex will match identifiers that could be type names
    const typeNameRegex = /\b[A-Z][a-zA-Z0-9_$]*\b/g;

    const matches = withoutJsDoc.match(typeNameRegex);
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
      const genericTypeParamNames = new Set<string>();

      methods.forEach(method => {
        // Track generic type parameter names to exclude
        if (method.typeParameters) {
          method.typeParameters.forEach(typeParam => {
            const paramName = typeParam.split(' ')[0];
            genericTypeParamNames.add(paramName);
          });
        }

        // Extract types from parameters and return types
        const allTypes = new Set<string>();
        method.paramTypes.forEach(param => {
          this.extractTypeNames(param.type).forEach(typeName => {
            if (!genericTypeParamNames.has(typeName)) {
              allTypes.add(typeName);
            }
          });
        });
        this.extractTypeNames(method.returnType).forEach(typeName => {
          if (!genericTypeParamNames.has(typeName)) {
            allTypes.add(typeName);
          }
        });
        if (method.typeParameters) {
          method.typeParameters.forEach(typeParam => {
            this.extractTypeNames(typeParam).forEach(typeName => {
              if (!genericTypeParamNames.has(typeName)) {
                allTypes.add(typeName);
              }
            });
          });
        }

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

  private generateAllRpcMethodsType(moduleGroups: Record<string, RpcMethodInfo[]>): string {
    const methodEntries: string[] = [];

    Object.values(moduleGroups).forEach(methods => {
      methods.forEach(method => {
        // For AllRpcMethods type, we need to replace generic type parameters with 'any'
        // since this is a flat type mapping and can't have generic parameters
        const genericTypeParamNames = new Set<string>();
        if (method.typeParameters) {
          method.typeParameters.forEach(typeParam => {
            const paramName = typeParam.split(' ')[0];
            genericTypeParamNames.add(paramName);
          });
        }

        // Replace generic type parameters in params
        let paramsType = this.generateParamsType(method.paramTypes);
        genericTypeParamNames.forEach(paramName => {
          paramsType = paramsType.replace(new RegExp(`\\b${paramName}\\b`, 'g'), 'any');
        });

        // Replace generic type parameters in return type
        let returnType = method.returnType;
        genericTypeParamNames.forEach(paramName => {
          returnType = returnType.replace(new RegExp(`\\b${paramName}\\b`, 'g'), 'any');
        });

        methodEntries.push(`  '${method.pattern}': { params: ${paramsType}; returns: ${returnType} };`);
      });
    });

    if (methodEntries.length === 0) {
      return `// Type mapping for RPC methods and their signatures
export type AllRpcMethods = {};`;
    }

    return `// Type mapping for RPC methods and their signatures
export type AllRpcMethods = {
${methodEntries.join('\n')}
};`;
  }
}