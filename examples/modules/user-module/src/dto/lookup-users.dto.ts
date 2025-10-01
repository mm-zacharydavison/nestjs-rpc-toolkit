import { UserSelect } from '../entities/user.entity';

export class LookupUsersQuery<Select extends UserSelect = UserSelect> {
  userIds: number[];
  select: Select;
}
