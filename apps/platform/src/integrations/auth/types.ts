export type AuthCtx = { ready: boolean; isSignedIn: boolean; openSignIn: () => void; userId?: string; email?: string | null };

export interface AuthModule {
  AuthProvider: React.ComponentType<{ children: React.ReactNode }>;
  useAuth: () => AuthCtx;
  useUserWidget?: () => React.ComponentType | undefined;
}
