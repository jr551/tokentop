import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { AgentSessionAggregate } from '@/agents/types.ts';

interface DrawerContextValue {
  selectedSession: AgentSessionAggregate | null;
  showDrawer: (session: AgentSessionAggregate) => void;
  hideDrawer: () => void;
  isOpen: boolean;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [selectedSession, setSelectedSession] = useState<AgentSessionAggregate | null>(null);

  const showDrawer = useCallback((session: AgentSessionAggregate) => {
    setSelectedSession(session);
  }, []);

  const hideDrawer = useCallback(() => {
    setSelectedSession(null);
  }, []);

  return (
    <DrawerContext.Provider value={{
      selectedSession,
      showDrawer,
      hideDrawer,
      isOpen: selectedSession !== null,
    }}>
      {children}
    </DrawerContext.Provider>
  );
}

export function useDrawer(): DrawerContextValue {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error('useDrawer must be used within DrawerProvider');
  }
  return context;
}
