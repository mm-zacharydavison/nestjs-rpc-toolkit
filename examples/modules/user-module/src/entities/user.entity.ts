/**
 * A User account in our system.
 */
export class User {
  /** Unique identifier for the user */
  id: number;
  /** User's email address */
  email: string;
  /** User's first name */
  firstName: string;
  /** User's last name */
  lastName: string;
  /** If this users account is currently active */
  isActive: boolean;
  /** Timestamp when the user was created */
  createdAt: Date;
  /** Timestamp when the user was last updated */
  updatedAt: Date;
}

export type UserSelect = {
  [K in keyof User]?: boolean;
}