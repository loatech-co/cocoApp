import { Injectable } from '@nestjs/common';

import { UsersRepository } from './users.repository';
import type { User, UserRole, UserStatus } from '../../generated/prisma/client';

/**
 * The user accounts, for the modules that manage them (admin). The `users`
 * table belongs to auth; nobody else reads or writes it but through here.
 */
@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async page(
    status: UserStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{ users: User[]; total: number }> {
    const [users, total] = await Promise.all([
      this.users.findPage(status, skip, take),
      this.users.count(status),
    ]);
    return { users, total };
  }

  findById(id: bigint): Promise<User | null> {
    return this.users.findById(id);
  }

  approve(id: bigint, approvedById: bigint): Promise<User> {
    return this.users.updateUnchecked(id, {
      status: 'active',
      approvedAt: new Date(),
      approvedById,
    });
  }

  setStatus(id: bigint, status: UserStatus): Promise<User> {
    return this.users.updateUnchecked(id, { status });
  }

  setRole(id: bigint, role: UserRole): Promise<User> {
    return this.users.updateUnchecked(id, { role });
  }

  countOtherActiveAdmins(userId: bigint): Promise<number> {
    return this.users.countOtherActiveAdmins(userId);
  }
}
