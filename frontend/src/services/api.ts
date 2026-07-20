import axios, { AxiosInstance } from 'axios';
import type { ApiResponse, User } from '../types/index';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
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

export default api;
