/**
 * DTO for creating a new user
 */
export class CreateUserDto {
  /** The user's email address */
  email: string;
  /** The user's first name */
  firstName: string;
  /** The user's last name */
  lastName: string;
  /** Whether the user account is active (defaults to true if not provided) */
  isActive?: boolean;
}