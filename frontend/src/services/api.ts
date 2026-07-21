import axios, { AxiosInstance } from 'axios';
import type { ApiResponse, User } from '../types/index';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  register: (data: { email: string; password: string; firstName: string; lastName: string }) =>
    api.post<ApiResponse<{ user: User; token: string }>>('/auth/register', data),
  
  login: (data: { email: string; password: string }) =>
    api.post<ApiResponse<{ user: User; token: string }>>('/auth/login', data),
  
  logout: (sessionId?: string) =>
    api.post<ApiResponse>('/auth/logout', { sessionId }),
  
  verifyEmail: (token: string) =>
    api.post<ApiResponse<{ user: User }>>('/auth/verify-email', { token }),
  
  forgotPassword: (email: string) =>
    api.post<ApiResponse>('/auth/forgot-password', { email }),
  
  resetPassword: (token: string, password: string) =>
    api.post<ApiResponse<{ user: User }>>('/auth/reset-password', { token, password }),
  
  getCurrentUser: () =>
    api.get<ApiResponse<{ user: User }>>('/auth/me'),
  
  updateProfile: (data: { firstName?: string; lastName?: string; profileImage?: string }) =>
    api.put<ApiResponse<{ user: User }>>('/auth/profile', data),
};

export const funnelApi = {
  // Funnel CRUD
  list: (workspaceId: string, params?: { status?: string; search?: string; page?: number; limit?: number }) =>
    api.get(`/funnels/workspaces/${workspaceId}/funnels`, { params }),
  
  get: (workspaceId: string, funnelId: string) =>
    api.get(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}`),
  
  create: (workspaceId: string, data: { name: string; description?: string; funnelType?: string; tags?: string[]; settings?: any; seoMeta?: any }) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels`, data),
  
  update: (workspaceId: string, funnelId: string, data: any) =>
    api.put(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}`, data),
  
  delete: (workspaceId: string, funnelId: string) =>
    api.delete(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}`),
  
  duplicate: (workspaceId: string, funnelId: string) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/duplicate`),
  
  publish: (workspaceId: string, funnelId: string) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/publish`),
  
  unpublish: (workspaceId: string, funnelId: string) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/unpublish`),
  
  archive: (workspaceId: string, funnelId: string) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/archive`),
  
  // Versions
  listVersions: (workspaceId: string, funnelId: string) =>
    api.get(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/versions`),
  
  restoreVersion: (workspaceId: string, funnelId: string, versionId: string) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/versions/${versionId}/restore`),
  
  // Export/Import
  exportFunnel: (workspaceId: string, funnelId: string) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/export`),
  
  importFunnel: (workspaceId: string, data: any) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/import`, data),
  
  // Pages
  createPage: (workspaceId: string, funnelId: string, data: any) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/pages`, data),
  
  updatePage: (workspaceId: string, funnelId: string, pageId: string, data: any) =>
    api.put(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/pages/${pageId}`, data),
  
  deletePage: (workspaceId: string, funnelId: string, pageId: string) =>
    api.delete(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/pages/${pageId}`),
  
  // Blocks
  createBlock: (workspaceId: string, funnelId: string, pageId: string, data: any) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/pages/${pageId}/blocks`, data),
  
  updateBlock: (workspaceId: string, funnelId: string, pageId: string, blockId: string, data: any) =>
    api.put(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/pages/${pageId}/blocks/${blockId}`, data),
  
  deleteBlock: (workspaceId: string, funnelId: string, pageId: string, blockId: string) =>
    api.delete(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/pages/${pageId}/blocks/${blockId}`),
  
  reorderBlocks: (workspaceId: string, funnelId: string, pageId: string, blockOrder: { id: string; sortOrder: number }[]) =>
    api.put(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/pages/${pageId}/blocks/reorder`, { blockOrder }),
  
  // Forms
  listForms: (workspaceId: string, funnelId: string) =>
    api.get(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/forms`),
  
  createForm: (workspaceId: string, funnelId: string, data: any) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/forms`, data),
  
  updateForm: (workspaceId: string, funnelId: string, formId: string, data: any) =>
    api.put(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/forms/${formId}`, data),
  
  deleteForm: (workspaceId: string, funnelId: string, formId: string) =>
    api.delete(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/forms/${formId}`),
  
  submitForm: (workspaceId: string, funnelId: string, formId: string, data: any, metadata?: any, contactId?: string) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/forms/${formId}/submit`, { data, metadata, contactId }),
  
  listSubmissions: (workspaceId: string, funnelId: string, formId: string, params?: { page?: number; limit?: number }) =>
    api.get(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/forms/${formId}/submissions`, { params }),
  
  // Analytics
  trackAnalytics: (workspaceId: string, funnelId: string, data: any) =>
    api.post(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/analytics/track`, data),
  
  getAnalytics: (workspaceId: string, funnelId: string, params?: { startDate?: string; endDate?: string; eventType?: string }) =>
    api.get(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/analytics`, { params }),
  
  getTrafficSources: (workspaceId: string, funnelId: string) =>
    api.get(`/funnels/workspaces/${workspaceId}/funnels/${funnelId}/analytics/traffic-sources`),
};

export default api;
