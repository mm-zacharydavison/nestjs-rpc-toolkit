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
  [K in keyof User]?: boolean;
}