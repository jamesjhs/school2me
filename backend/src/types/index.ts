export type UserRole = 'admin' | 'member';
export type ActivityType = 'school_club' | 'hobby' | 'sports' | 'volunteering';

export interface SessionUser {
  userId: string;
  email: string;
  role: UserRole;
  familyId: string;
}
