import { create } from 'zustand';
import type { User, Organization, Workspace } from '../types/index';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  
  setUser: (user) => set({ user }),
  setToken: (token) => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
    set({ token, isAuthenticated: !!token });
  },
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

interface WorkspaceState {
  currentOrganization: Organization | null;
  currentWorkspace: Workspace | null;
  organizations: Organization[];
  workspaces: Workspace[];
  
  setCurrentOrganization: (org: Organization | null) => void;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  setOrganizations: (orgs: Organization[]) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  currentOrganization: null,
  currentWorkspace: null,
  organizations: [],
  workspaces: [],
  
  setCurrentOrganization: (org) => set({ currentOrganization: org }),
  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
  setOrganizations: (orgs) => set({ organizations: orgs }),
  setWorkspaces: (workspaces) => set({ workspaces }),
}));
