'use client';

import { createContext, useContext } from 'react';
import { STATES, DEFAULT_STATE, type StateCode, type StateConfig } from '@/lib/states';

const Ctx = createContext<StateConfig>(STATES[DEFAULT_STATE]);

/** The state the visitor is looking at, for client components (set once in the root layout). */
export function StateProvider({ code, children }: { code: StateCode; children: React.ReactNode }) {
  return <Ctx.Provider value={STATES[code] ?? STATES[DEFAULT_STATE]}>{children}</Ctx.Provider>;
}
export const useStateConfig = () => useContext(Ctx);
