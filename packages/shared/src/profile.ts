export function getDisplayName(profile: {
  username?: string | null;
  firstName: string;
  lastName?: string | null;
}): string {
  if (profile.username && profile.username.trim() !== '') {
    return `@${profile.username.replace(/^@/, '')}`;
  }
  if (profile.lastName && profile.lastName.trim() !== '') {
    return `${profile.firstName} ${profile.lastName.trim().charAt(0).toUpperCase()}.`;
  }
  return profile.firstName;
}
