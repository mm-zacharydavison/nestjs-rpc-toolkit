import { RpcTypesGenerator } from '@zdavison/nestjs-rpc-toolkit';
import * as path from 'path';

// Run the generator - we're in lib-rpc/scripts
const rootDir = path.join(__dirname, '../../../');
const configPath = path.join(__dirname, '../nestjs-rpc-toolkit.config.json');

const generator = new RpcTypesGenerator({
  rootDir,
  configPath,
});

generator.generate();
