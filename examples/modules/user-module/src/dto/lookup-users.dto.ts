import { User, UserSelect } from '../entities/user.entity';

export class LookupUsersQuery<Select extends UserSelect = UserSelect> {
  userIds: number[];
  select: Select;
}

export class LookupUsersResult<Select extends UserSelect = UserSelect> {
  users: Pick<
    User,
    Extract<{ [K in keyof Select]: Select[K] extends true ? K : never }[keyof Select], keyof User>
  >[];
}