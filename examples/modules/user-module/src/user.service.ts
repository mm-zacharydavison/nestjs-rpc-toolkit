import { Inject, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserSelect } from './entities/user.entity';
import { RpcController, RpcMethod } from '@zdavison/nestjs-rpc-toolkit';
import { IRpcClient } from '@meetsmore/lib-rpc';
import { LookupUsersQuery } from './dto/lookup-users.dto';

@Injectable()
@RpcController()
export class UserService {
  private users: User[] = [];
  private idCounter = 1;

  constructor(
    @Inject('RPC') private rpc: IRpcClient,
  ) {}

  @RpcMethod()
  async create(createUserDto: CreateUserDto): Promise<User> {
    console.log('user.create', createUserDto)
    const user: User = {
      id: this.idCounter++,
      isActive: true,
      ...createUserDto,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);

    // Example RPC call to auth service.
    await this.rpc.auth.register(
      { registerDto: { 
        email: createUserDto.email, 
        password: 'some-password' 
      } 
    })

    return user;
  }

  findAll(): User[] {
    return this.users;
  }

  findOne(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }

  update(id: number, updateUserDto: UpdateUserDto): User | undefined {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) return undefined;

    this.users[userIndex] = {
      ...this.users[userIndex],
      ...updateUserDto,
      updatedAt: new Date(),
    };
    return this.users[userIndex];
  }

  remove(id: number): boolean {
    const userIndex = this.users.findIndex(user => user.id === id);
    if (userIndex === -1) return false;

    this.users.splice(userIndex, 1);
    return true;
  }

  @RpcMethod()
  async lookupUsers<Select extends UserSelect>(
    query: LookupUsersQuery<Select>,
  ): Promise<Partial<User>[]> {
    const selectedUsers = this.users.filter(user =>
      query.userIds.includes(user.id)
    );

    return selectedUsers.map(user => {
      const result: Partial<User> = {};

      if (query.select.id) result.id = user.id;
      if (query.select.email) result.email = user.email;
      if (query.select.firstName) result.firstName = user.firstName;
      if (query.select.lastName) result.lastName = user.lastName;
      if (query.select.isActive) result.isActive = user.isActive;
      if (query.select.createdAt) result.createdAt = user.createdAt;
      if (query.select.updatedAt) result.updatedAt = user.updatedAt;

      return result;
    });
  }
}