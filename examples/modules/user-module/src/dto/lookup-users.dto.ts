import { User, UserSelect } from '../entities/user.entity';

/**
 * Query parameters for looking up multiple users by ID with field selection
 */
export class LookupUsersQuery<Select extends UserSelect = UserSelect> {
  /** Array of user IDs to look up */
  userIds: number[];
  /** Field selection object specifying which fields to return */
  select: Select;
}

/**
 * Result of a lookup users query with selected fields
 */
export class LookupUsersResult<Select extends UserSelect = UserSelect> {
  /** Array of users with only the selected fields populated */
  users: Pick<
    User,
    Extract<{ [K in keyof Select]: Select[K] extends true ? K : never }[keyof Select], keyof User>
  >[];
}