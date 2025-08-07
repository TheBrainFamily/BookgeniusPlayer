export interface AuthenticatedUser {
  id: string; // User ID from the token (sub claim)
  authProvider: 'clerk' | 'snapplify' | 'internal'; // To know where they came from
  email?: string; // Optional email from the token
  // You can add more fields here in the future, like scopes or permissions
}

export interface JWTPayload {
  sub?: string;
  iss?: string;
  email?: string;
  [key: string]: any;
}