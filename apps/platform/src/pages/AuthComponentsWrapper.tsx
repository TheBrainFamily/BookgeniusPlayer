import type { AuthCtx } from "@platform/integrations/auth/types";

type AuthComponentsWrapperProps = {
  signIn?: boolean;
  signUp?: boolean;
  useAuth: () => {};
  fallbackComponent: React.ComponentType;
}

const AuthComponentsWrapper = (props: AuthComponentsWrapperProps) => {
  const { signIn, signUp, useAuth, fallbackComponent: FallbackComponent } = props;
  const Fallback = () => FallbackComponent ? <FallbackComponent /> : null;
  if (!signIn && !signUp) {
    return <Fallback />;
  }

  const authContext = useAuth() as AuthCtx;
  if (!authContext.ready) {
    return null
  }

  const Wrapper = ({ children }) => (
    <div className="min-h-screen flex items-center justify-center">
      {children}
    </div>
  );

  if (signIn) {
    if (!authContext.components?.SignIn) {
      return <Fallback />;
    }
    const { SignIn } = authContext.components;
    return (
        <Wrapper>
          <SignIn />
        </Wrapper>
      );
  }

  if (signUp) {
    if (!authContext.components?.SignUp) {
      return <Fallback />;
    }
    const { SignUp } = authContext.components;
    return (
      <Wrapper>
        <SignUp />
      </Wrapper>
    );
  }

  return null;
}

export default AuthComponentsWrapper;
