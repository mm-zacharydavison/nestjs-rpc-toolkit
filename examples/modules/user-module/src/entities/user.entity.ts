export class User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserSelect = {
  id?: boolean;
  email?: boolean;
  firstName?: boolean;
  lastName?: boolean;
  isActive?: boolean;
  createdAt?: boolean;
  updatedAt?: boolean;
}