import React, { createContext, useContext } from "react";
import type { AuthCtx, AuthModule } from "./types";

const Ctx = createContext<AuthCtx>({ ready: true, isSignedIn: false, openSignIn: () => {} });

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Ctx.Provider value={{ ready: true, isSignedIn: false, openSignIn: () => {}, signOut: () => {} }}>{children}</Ctx.Provider>
);

const useAuth = () => useContext(Ctx);

const mod: AuthModule = { AuthProvider, useAuth };
export default mod;
