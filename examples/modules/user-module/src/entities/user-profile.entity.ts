/**
 * A user's profile with additional information.
 */
export class UserProfile {
  /** User's biography */
  bio: string;
  /** User's avatar URL */
  avatarUrl: string;
  /** When the profile was last updated */
  lastUpdated: Date;
  /** When the user last logged in */
  lastLoginAt: Date;
}

/**
 * A user with their nested profile information.
 */
export class UserWithProfile {
  /** User ID */
  id: number;
  /** User's email */
  email: string;
  /** The user's profile (contains nested Date fields) */
  profile: UserProfile;
  /** When the user account was created */
  createdAt: Date;
}
