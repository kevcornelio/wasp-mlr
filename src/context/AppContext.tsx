import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, Task, Project } from '@/types';
import { mockUsers, mockTasks, mockProjects } from '@/data/mockData';

interface AppContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => boolean;
  signup: (fullName: string, email: string, password: string) => boolean;
  logout: () => void;
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [projects, setProjects] = useState<Project[]>(mockProjects);
  const [users, setUsers] = useState<User[]>(mockUsers);

  const login = (email: string, _password: string) => {
    const user = users.find(u => u.email === email);
    if (user) {
      setCurrentUser(user);
      return true;
    }
    // Allow any email to log in with a generated user
    setCurrentUser({ id: 'u-new', fullName: email.split('@')[0], email, role: 'developer' });
    return true;
  };

  const signup = (fullName: string, email: string, _password: string) => {
    const newUser: User = { id: `u-${Date.now()}`, fullName, email, role: 'developer' };
    setUsers(prev => [...prev, newUser]);
    setCurrentUser(newUser);
    return true;
  };

  const logout = () => setCurrentUser(null);

  return (
    <AppContext.Provider value={{
      currentUser,
      isAuthenticated: !!currentUser,
      login, signup, logout,
      tasks, setTasks,
      projects, setProjects,
      users, setUsers,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
