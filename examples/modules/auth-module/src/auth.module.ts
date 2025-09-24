import { Module, DynamicModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController, AuthService],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {
  /**
   * Configure module for microservice mode
   * Auth module doesn't need external dependencies, so configuration is the same
   */
  static forMicroservice(): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: process.env.JWT_SECRET || 'your-secret-key',
          signOptions: { expiresIn: '1d' },
        }),
      ],
      controllers: [AuthController, AuthService],
      providers: [AuthService, JwtStrategy],
      exports: [AuthService, JwtModule, PassportModule],
    };
  }
}