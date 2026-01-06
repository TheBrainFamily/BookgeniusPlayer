import { useIntegrations } from "@platform/integrations";

export const useAuth = () => {
  const { authMod } = useIntegrations();
  if (!authMod) {
    return {
      ready: false,
      isSignedIn: false,
      openSignIn: () => {},
      signOut: () => {},
      userId: undefined,
      email: null,
    };
  }
  return authMod.useAuth();
};
