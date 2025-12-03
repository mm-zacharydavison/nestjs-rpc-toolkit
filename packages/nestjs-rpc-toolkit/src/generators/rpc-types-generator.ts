import { Project, SourceFile, MethodDeclaration, ts } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import { detectPackageManager } from '../utils/package-manager.utils';

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
  // Map of type name -> package it's imported from
  private typeToPackageMap: Map<string, string> = new Map();
  // Set of all external packages that are imported in generated files
  private externalPackagesUsed: Set<string> = new Set();
  // Map of package name -> version (from source package.json files)
  private packageVersionMap: Map<string, string> = new Map();

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
    // First, extract import information
    this.extractImports(sourceFile);

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

  private extractImports(sourceFile: SourceFile): void {
    const importDeclarations = sourceFile.getImportDeclarations();

    importDeclarations.forEach(importDecl => {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();

      // Only track imports from packages (not relative imports)
      if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
        const namedImports = importDecl.getNamedImports();

        namedImports.forEach(namedImport => {
          const importedName = namedImport.getName();
          this.typeToPackageMap.set(importedName, moduleSpecifier);
        });

        // Try to resolve package version from the source file's package.json
        if (!this.packageVersionMap.has(moduleSpecifier)) {
          const version = this.resolvePackageVersion(sourceFile.getFilePath(), moduleSpecifier);
          if (version) {
            this.packageVersionMap.set(moduleSpecifier, version);
          }
        }
      }
    });
  }

  private resolvePackageVersion(sourceFilePath: string, packageName: string): string | null {
    // Walk up from the source file to find package.json
    let currentDir = path.dirname(sourceFilePath);

    while (currentDir !== path.dirname(currentDir)) { // Stop at root
      const packageJsonPath = path.join(currentDir, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

          // Check dependencies and devDependencies
          const version = packageJson.dependencies?.[packageName] ||
                         packageJson.devDependencies?.[packageName];

          if (version) {
            return version;
          }
        } catch (error) {
          // Ignore and continue searching
        }
      }

      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  private extractInterface(interfaceDeclaration: any, sourceFile: SourceFile): void {
    const name = interfaceDeclaration.getName();
    const jsDoc = this.extractJsDoc(interfaceDeclaration);
    let source = interfaceDeclaration.getText();

    // Prepend JSDoc if available and not already in source
    if (jsDoc && !source.startsWith('/**')) {
      source = `${jsDoc}\n${source}`;
    }

    // Ensure the source has export keyword
    if (!source.includes('export interface')) {
      source = source.replace(/^(\/\*\*[\s\S]*?\*\/\n)?interface/, '$1export interface');
    }

    const moduleName = this.getModuleForFile(sourceFile.getFilePath());

    if (name && this.isRelevantInterface(name) && !this.isInternalType(name)) {
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
        // Extract JSDoc for the property
        const propJsDoc = this.extractJsDoc(prop);
        const propJsDocStr = propJsDoc ? `${propJsDoc}\n` : '';
        return `${propJsDocStr}  ${propName}: ${propType};`;
      });

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

  private collectExternalImports(referencedTypes: Set<string>, genericTypeParamNames: Set<string>): Map<string, Set<string>> {
    // Map of package name -> Set of type names to import from that package
    const externalImports = new Map<string, Set<string>>();
    const typesToCheck = new Set(referencedTypes);
    const checkedTypes = new Set<string>();

    // Recursively collect all external types and their dependencies
    while (typesToCheck.size > 0) {
      const currentType = Array.from(typesToCheck)[0];
      typesToCheck.delete(currentType);
      checkedTypes.add(currentType);

      // Skip if it's a built-in type, generic parameter, or internal type
      if (this.isBuiltInType(currentType) || genericTypeParamNames.has(currentType) || this.isInternalType(currentType)) {
        continue;
      }

      // Check if this type is defined locally (in our interfaces or enums)
      const isLocalType = this.interfaces.has(currentType) || this.enums.has(currentType);

      if (!isLocalType && this.typeToPackageMap.has(currentType)) {
        // This is an external type - add to imports
        const packageName = this.typeToPackageMap.get(currentType)!;
        if (!externalImports.has(packageName)) {
          externalImports.set(packageName, new Set());
        }
        externalImports.get(packageName)!.add(currentType);

        // Check if any of our source interfaces reference this type and extract nested types
        this.interfaces.forEach(interfaceDef => {
          if (interfaceDef.source.includes(currentType)) {
            this.extractTypeNames(interfaceDef.source).forEach(nestedType => {
              if (!checkedTypes.has(nestedType) && !genericTypeParamNames.has(nestedType)) {
                typesToCheck.add(nestedType);
              }
            });
          }
        });
      } else if (isLocalType) {
        // This is a local type - check if it references other external types
        const localDef = this.interfaces.get(currentType) || this.enums.get(currentType);
        if (localDef) {
          this.extractTypeNames(localDef.source).forEach(nestedType => {
            if (!checkedTypes.has(nestedType) && !genericTypeParamNames.has(nestedType)) {
              typesToCheck.add(nestedType);
            }
          });
        }
      }
    }

    return externalImports;
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

  private generateModuleTypesFile(moduleName: string, methods: RpcMethodInfo[], _interfaces: InterfaceDefinition[], _enums: EnumDefinition[]): void {
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

    // Recursively collect all transitive type dependencies (interfaces, type aliases, and enums)
    // Keep iterating until no new types are discovered
    const collectedTypes = new Set<string>();
    let typesToProcess = new Set(referencedTypes);

    while (typesToProcess.size > 0) {
      const newTypesToProcess = new Set<string>();

      typesToProcess.forEach(typeName => {
        if (collectedTypes.has(typeName) || genericTypeParamNames.has(typeName)) {
          return;
        }
        collectedTypes.add(typeName);

        // Check if this type is defined locally (interface or type alias)
        const interfaceDef = this.interfaces.get(typeName);
        if (interfaceDef) {
          // Extract all type references from this interface/type alias source
          this.extractTypeNames(interfaceDef.source).forEach(nestedType => {
            if (!collectedTypes.has(nestedType) && !genericTypeParamNames.has(nestedType)) {
              newTypesToProcess.add(nestedType);
            }
          });
        }

        // Check if this type is an enum
        const enumDef = this.enums.get(typeName);
        if (enumDef) {
          // Enums don't have nested type references, but mark as collected
        }
      });

      typesToProcess = newTypesToProcess;
    }

    // Update referencedTypes with all collected types
    collectedTypes.forEach(t => referencedTypes.add(t));

    // Collect external type imports needed
    const externalImports = this.collectExternalImports(referencedTypes, genericTypeParamNames);

    // Include enums that are actually referenced, from this module or others
    const referencedEnums: EnumDefinition[] = [];

    // Add all referenced enums
    this.enums.forEach(enumDef => {
      if (referencedTypes.has(enumDef.name) &&
          !referencedEnums.some(existing => existing.name === enumDef.name)) {
        referencedEnums.push(enumDef);
      }
    });

    // Include interfaces/type aliases that are actually referenced, from this module or others
    const referencedInterfaces: InterfaceDefinition[] = [];

    // Add all referenced interfaces/type aliases
    this.interfaces.forEach(interfaceDef => {
      if (referencedTypes.has(interfaceDef.name) &&
          !referencedInterfaces.some(existing => existing.name === interfaceDef.name)) {
        referencedInterfaces.push(interfaceDef);
      }
    });

    // Sort interfaces/type aliases topologically so dependencies come before dependents
    const sortedInterfaces = this.topologicalSortTypes(referencedInterfaces, genericTypeParamNames);

    // Enums should come before interfaces that use them
    const moduleEnums = referencedEnums.map(enumDef => enumDef.source).join('\n\n');
    const moduleInterfaces = sortedInterfaces.map(interfaceDef => interfaceDef.source).join('\n\n');

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

    // Generate import statements for external types
    const importStatements: string[] = [];
    externalImports.forEach((types, packageName) => {
      const sortedTypes = Array.from(types).sort();
      importStatements.push(`import { ${sortedTypes.join(', ')} } from '${packageName}';`);
      // Track that this external package is used
      this.externalPackagesUsed.add(packageName);
    });
    const importsSection = importStatements.length > 0 ? importStatements.join('\n') + '\n\n' : '';

    const fileContent = `// Auto-generated RPC types for ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} module
// Do not edit this file manually - it will be overwritten
//
// IMPORTANT: All types must be JSON-serializable for TCP transport when extracted to microservices

${importsSection}// ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} module types
${typesSection}

${domainInterface}
`;

    // Write to configured output directory
    const outputPath = path.join(this.options.rootDir, this.config.outputDir, `${moduleName}.rpc.gen.ts`);
    fs.writeFileSync(outputPath, fileContent, 'utf8');
  }

  private generateMainTypesFile(moduleGroups: Record<string, RpcMethodInfo[]>): void {
    const hasModules = Object.keys(moduleGroups).length > 0;

    // Helper to check if a type is external (imported from an npm package)
    const isExternalType = (typeName: string): boolean => {
      return this.typeToPackageMap.has(typeName) &&
             !this.interfaces.has(typeName) &&
             !this.enums.has(typeName);
    };

    // Generate imports from module files - include domain interfaces and types
    // but EXCLUDE external types (they're imported in module files, not exported)
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

      // Filter out built-in types, internal types, AND external types
      const typesList = Array.from(referencedTypes).filter(type =>
        !this.isBuiltInType(type) && !this.isInternalType(type) && !isExternalType(type)
      );

      const imports = [`${this.toCamelCase(moduleName)}Domain`];
      if (typesList.length > 0) {
        imports.push(...typesList);
      }

      return `import { ${imports.join(', ')} } from './${moduleName}.rpc.gen';`;
    }).join('\n');

    // Generate selective re-exports to avoid type conflicts
    // EXCLUDE external types - they should be imported directly from their packages
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

      // Filter out built-in types, internal types, AND external types
      const typesList = Array.from(referencedTypes).filter(type =>
        !this.isBuiltInType(type) && !this.isInternalType(type) && !isExternalType(type)
      );

      const exports = [`${this.toCamelCase(moduleName)}Domain`];
      if (typesList.length > 0) {
        exports.push(...typesList);
      }

      return `export { ${exports.join(', ')} } from './${moduleName}.rpc.gen';`;
    }).join('\n');

    // Generate common type re-exports from their original modules
    const commonTypeExports = this.generateCommonTypeExports(moduleGroups);

    // Collect all external types used across all modules for direct import/re-export
    const externalTypesUsed = new Map<string, Set<string>>(); // package -> types
    Object.values(moduleGroups).forEach(methods => {
      methods.forEach(method => {
        const genericTypeParamNames = new Set<string>();
        if (method.typeParameters) {
          method.typeParameters.forEach(typeParam => {
            genericTypeParamNames.add(typeParam.split(' ')[0]);
          });
        }

        // Collect types from params and return type
        const allTypes = new Set<string>();
        method.paramTypes.forEach(param => {
          this.extractTypeNames(param.type).forEach(t => {
            if (!genericTypeParamNames.has(t)) allTypes.add(t);
          });
        });
        this.extractTypeNames(method.returnType).forEach(t => {
          if (!genericTypeParamNames.has(t)) allTypes.add(t);
        });

        // Check which are external types
        allTypes.forEach(typeName => {
          if (isExternalType(typeName)) {
            const packageName = this.typeToPackageMap.get(typeName)!;
            if (!externalTypesUsed.has(packageName)) {
              externalTypesUsed.set(packageName, new Set());
            }
            externalTypesUsed.get(packageName)!.add(typeName);
          }
        });
      });
    });

    // Generate import statements for external types
    const externalImportStatements: string[] = [];
    externalTypesUsed.forEach((types, packageName) => {
      const sortedTypes = Array.from(types).sort();
      externalImportStatements.push(`import type { ${sortedTypes.join(', ')} } from '${packageName}';`);
    });
    const externalImportsSection = externalImportStatements.length > 0
      ? externalImportStatements.join('\n') + '\n'
      : '';

    // Generate re-export statements for external types
    const externalReExportStatements: string[] = [];
    externalTypesUsed.forEach((types, packageName) => {
      const sortedTypes = Array.from(types).sort();
      externalReExportStatements.push(`export type { ${sortedTypes.join(', ')} } from '${packageName}';`);
    });
    const externalReExportsSection = externalReExportStatements.length > 0
      ? '\n// Re-export external types from their source packages\n' + externalReExportStatements.join('\n')
      : '';

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

    const fileContent = `// Auto-generated RPC types from all modules
// Do not edit this file manually - it will be overwritten
//
// SERIALIZATION REQUIREMENTS:
// All @RpcMethod parameters and return types must be JSON-serializable for TCP transport.
// Avoid: functions, callbacks, Buffer, Map/Set, DOM elements, class instances, undefined
// Prefer: primitives, plain objects, arrays, null (instead of undefined)

${externalImportsSection}${moduleImports}

// Re-export domain interfaces and types
${moduleReExports}
${externalReExportsSection}

// Re-export common types from their primary modules
${commonTypeExports}

${allRpcMethodsType}

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

    // Update output package.json with missing dependencies
    this.updateOutputPackageJson();
  }

  private updateOutputPackageJson(): void {
    if (this.externalPackagesUsed.size === 0) {
      return; // No external packages to add
    }

    // Find the package.json for the output directory
    const outputDir = path.join(this.options.rootDir, this.config.outputDir);
    const packageJsonPath = this.findPackageJsonForOutput(outputDir);

    if (!packageJsonPath) {
      console.log(`⚠️  Could not find package.json for output directory ${this.config.outputDir}`);
      console.log(`   External packages used: ${Array.from(this.externalPackagesUsed).join(', ')}`);
      return;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const dependencies = packageJson.dependencies || {};
      const missingDeps: string[] = [];
      const addedDeps: Record<string, string> = {};

      // Check which external packages are missing
      this.externalPackagesUsed.forEach(packageName => {
        if (!dependencies[packageName]) {
          missingDeps.push(packageName);
          const version = this.packageVersionMap.get(packageName) || 'workspace:*';
          addedDeps[packageName] = version;
          dependencies[packageName] = version;
        }
      });

      if (missingDeps.length > 0) {
        // Update package.json with new dependencies
        packageJson.dependencies = dependencies;

        // Write back to file with proper formatting
        fs.writeFileSync(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2) + '\n',
          'utf-8'
        );

        console.log(`📦 Updated ${path.relative(this.options.rootDir, packageJsonPath)} with missing dependencies:`);
        missingDeps.forEach(dep => {
          console.log(`   ✓ ${dep}@${addedDeps[dep]}`);
        });

        // Detect package manager and show appropriate install command
        const packageManager = detectPackageManager(this.options.rootDir);
        console.log(`\n⚠️  Please run '${packageManager} install' to install the new dependencies before building.\n`);
      }
    } catch (error) {
      console.error(`❌ Error updating package.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private findPackageJsonForOutput(outputDir: string): string | null {
    // Walk up from output directory to find package.json
    let currentDir = outputDir;

    while (currentDir !== path.dirname(currentDir)) { // Stop at root
      const packageJsonPath = path.join(currentDir, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        return packageJsonPath;
      }

      currentDir = path.dirname(currentDir);
    }

    return null;
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

    // Remove JSDoc comments and single-line comments to avoid matching words in comments
    const codeWithoutComments = typeString
      .replace(/\/\*\*[\s\S]*?\*\//g, '') // Remove JSDoc comments
      .replace(/\/\*[\s\S]*?\*\//g, '')   // Remove multi-line comments
      .replace(/\/\/.*$/gm, '');          // Remove single-line comments

    // Match type names (letters, numbers, underscore, $)
    // This regex will match identifiers that could be type names
    const typeNameRegex = /\b[A-Z][a-zA-Z0-9_$]*\b/g;

    const matches = codeWithoutComments.match(typeNameRegex);
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

  /**
   * Topologically sort types so that dependencies come before dependents.
   * This ensures type aliases and interfaces are defined before they are used.
   */
  private topologicalSortTypes(types: InterfaceDefinition[], genericTypeParamNames: Set<string>): InterfaceDefinition[] {
    if (types.length === 0) return [];

    // Build a dependency graph
    const typeNames = new Set(types.map(t => t.name));
    const dependencies = new Map<string, Set<string>>();

    types.forEach(typeDef => {
      const deps = new Set<string>();
      this.extractTypeNames(typeDef.source).forEach(depName => {
        // Only consider dependencies that are in our type set and not generic params
        if (typeNames.has(depName) && depName !== typeDef.name && !genericTypeParamNames.has(depName)) {
          deps.add(depName);
        }
      });
      dependencies.set(typeDef.name, deps);
    });

    // Kahn's algorithm for topological sort
    // We want dependencies to come BEFORE dependents
    const sorted: InterfaceDefinition[] = [];
    const typeMap = new Map(types.map(t => [t.name, t]));

    // In-degree = number of dependencies a type has (within our type set)
    // Types with 0 dependencies should be output first
    const inDegree = new Map<string, number>();
    typeNames.forEach(name => {
      const deps = dependencies.get(name) || new Set();
      inDegree.set(name, deps.size);
    });

    // Start with types that have no dependencies
    const queue: string[] = [];
    inDegree.forEach((degree, name) => {
      if (degree === 0) {
        queue.push(name);
      }
    });

    while (queue.length > 0) {
      const name = queue.shift()!;
      const typeDef = typeMap.get(name);
      if (typeDef) {
        sorted.push(typeDef);
      }

      // For each type that depends on this one, decrement its in-degree
      // (because one of its dependencies has now been processed)
      typeNames.forEach(dependentName => {
        const deps = dependencies.get(dependentName);
        if (deps && deps.has(name)) {
          const newDegree = (inDegree.get(dependentName) || 1) - 1;
          inDegree.set(dependentName, newDegree);
          if (newDegree === 0) {
            queue.push(dependentName);
          }
        }
      });
    }

    // If there's a cycle, just append remaining types (they have circular deps)
    if (sorted.length < types.length) {
      types.forEach(t => {
        if (!sorted.includes(t)) {
          sorted.push(t);
        }
      });
    }

    return sorted;
  }
}