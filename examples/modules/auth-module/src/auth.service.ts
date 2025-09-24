import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RpcController, RpcMethod } from '@zdavison/nestjs-rpc-toolkit';

@Injectable()
@RpcController()
export class AuthService {
  private users = new Map<string, { id: string; email: string; password: string }>();
  private idCounter = 1;

  constructor(private readonly jwtService: JwtService) {}

  @RpcMethod()
  async register(registerDto: RegisterDto) {
    console.log('auth.register called', registerDto)

    const { email, password } = registerDto;

    if (this.users.has(email)) {
      throw new UnauthorizedException('Email already exists');
    }

    const user = {
      id: String(this.idCounter++),
      email,
      password,
    };

    this.users.set(email, user);

    const payload: JwtPayload = { sub: user.id, email };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = this.users.get(email);

    if (!user || user.password !== password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = { sub: user.id, email };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async validateUser(payload: JwtPayload) {
    const { email } = payload;
    const user = this.users.get(email);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
    };
  }
}