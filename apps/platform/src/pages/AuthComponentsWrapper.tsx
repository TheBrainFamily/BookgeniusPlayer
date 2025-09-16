import type { AuthCtx } from "@platform/integrations/auth/types";

type AuthComponentsWrapperProps = {
  componentName: string;
  useAuth: () => AuthCtx;
  fallbackComponent: React.ComponentType;
}

const Wrapper = ({ children }) => (
  <div className="min-h-screen flex items-center justify-center">
    {children}
  </div>
);

const AuthComponentsWrapper = (props: AuthComponentsWrapperProps) => {
  const { componentName, useAuth, fallbackComponent: FallbackComponent } = props;
  const Fallback = () => FallbackComponent ? <FallbackComponent /> : null;
  const authContext = useAuth();

  if (!componentName) {
    return <Fallback />;
  }

  if (!authContext.ready) {
    return null
  }

  const ComponentToRender = authContext.components?.[componentName];
  if (!ComponentToRender) {
    return <Fallback />;
  }

  return (
      <Wrapper>
        <ComponentToRender />
      </Wrapper>
    );
}

export default AuthComponentsWrapper;
