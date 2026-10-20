import { Request } from 'express';
import { User, UserRole } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user: (Pick<User, 'id' | 'email' | 'name' | 'role' | 'googleSubject'> & { avatarUrl: string | null }) | undefined;
}