import { createContext, useContext } from "react";
import type { User } from "../types/billing";
export interface SessionState {
  user: User | null;
  isDemo: boolean;
  sessionLoading: boolean;
  signingOut: boolean;
  sessionError: string;
  revalidateSession: () => Promise<void>;
  signIn: (user: User) => void;
  startDemo: () => void;
  signOut: () => Promise<boolean>;
}
export const SessionContext = createContext<SessionState | null>(null);
export function useSession() {
  const context = useContext(SessionContext);
  if (!context)
    throw new Error("useSession must be used within SessionProvider");
  return context;
}
