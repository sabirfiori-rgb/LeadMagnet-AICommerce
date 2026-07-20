export function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[@$!%*?&]/.test(password)) {
    return 'Password must contain at least one special character (@$!%*?&)';
  }
  return null;
}

export function validateName(name: string): boolean {
  return Boolean(name && name.trim().length > 0 && name.length <= 100);
}

export function validateSlug(slug: string): boolean {
  const regex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return regex.test(slug) && slug.length > 0 && slug.length <= 50;
}
