type AuthCtxComponents = { SignIn?: React.ComponentType; SignUp?: React.ComponentType };

export type AuthCtx = {
  ready: boolean;
  isSignedIn: boolean;
  openSignIn: () => void;
  signOut?: () => void;
  refreshToken?: () => Promise<string | null | undefined>;
  getToken?: (options?: { skipCache?: boolean }) => Promise<string | null | undefined>;
  userId?: string;
  email?: string | null;
  components?: AuthCtxComponents;
};

export interface AuthModule {
  AuthProvider: React.ComponentType<{ children: React.ReactNode }>;
  useAuth: () => AuthCtx;
  useUserWidget?: () => React.ComponentType | undefined;
  useSignInWidget?: () => React.ComponentType<{ onClick: () => void }> | undefined;
}
