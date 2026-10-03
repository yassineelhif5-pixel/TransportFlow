import { apiClient } from './apiClient';
import type {
  ClientDetail, ClientDto, ClientUpsert, Dashboard, DocumentDto, DocumentType, DriverDetail, DriverDto, DriverUpsert,
  HistoryFilters, HistoryItem, ImportResult, LoginResponse, MissionDetail, MissionListItem, MissionQuery, MissionTimelineItem,
  MissionUpsert, NotificationDto, PagedQuery, PagedResult, ReferenceDto, SearchResult, StatusDto, SystemParameter, UserDto,
  UserInfo, VehicleDetail, VehicleDto, VehicleStatus, VehicleUpsert,
} from '@/types';

/** Points d'entrée typés de l'API REST (un module par domaine métier). */

export const authApi = {
  login: (username: string, password: string, rememberMe: boolean) =>
    apiClient.post<LoginResponse>('/api/auth/login', { username, password, rememberMe, audience: 'admin' }, { auth: false }),
  logout: () => apiClient.post<void>('/api/auth/logout'),
  me: () => apiClient.get<UserInfo>('/api/auth/me'),
  updateProfile: (data: { email: string; firstName: string; lastName: string; phone?: string }) => apiClient.put<UserInfo>('/api/auth/me', data),
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    apiClient.post<LoginResponse>('/api/auth/change-password', { currentPassword, newPassword, confirmPassword }),
};

export const dashboardApi = {
  get: () => apiClient.get<Dashboard>('/api/dashboard'),
};

export const missionsApi = {
  list: (q: MissionQuery, signal?: AbortSignal) => apiClient.get<PagedResult<MissionListItem>>('/api/missions', q, signal),
  get: (id: number) => apiClient.get<MissionDetail>(`/api/missions/${id}`),
  statuses: () => apiClient.get<StatusDto[]>('/api/missions/statuses'),
  create: (data: MissionUpsert) => apiClient.post<MissionDetail>('/api/missions', data),
  update: (id: number, data: MissionUpsert) => apiClient.put<MissionDetail>(`/api/missions/${id}`, data),
  remove: (id: number) => apiClient.delete(`/api/missions/${id}`),
  assign: (id: number, data: { driverId: number; vehicleId?: number | null; comment?: string }) =>
    apiClient.post<MissionDetail>(`/api/missions/${id}/assign`, data),
  changeStatus: (id: number, data: { statusCode: string; comment?: string }) =>
    apiClient.post<MissionDetail>(`/api/missions/${id}/status`, data),
  history: (id: number) => apiClient.get<MissionTimelineItem[]>(`/api/missions/${id}/history`),
  documents: (id: number) => apiClient.get<DocumentDto[]>(`/api/missions/${id}/documents`),
  uploadDocument: (id: number, file: File, documentTypeId: number, comment?: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('documentTypeId', String(documentTypeId));
    if (comment) form.append('comment', comment);
    return apiClient.upload<DocumentDto>(`/api/missions/${id}/documents`, form);
  },
  export: (q: MissionQuery, format: 'csv' | 'xlsx') => apiClient.download('/api/missions/export', { ...q, page: undefined, pageSize: undefined, format }),
};

export const referencesApi = {
  list: (q: PagedQuery & { status?: string; source?: string; clientId?: number; available?: boolean }, signal?: AbortSignal) =>
    apiClient.get<PagedResult<ReferenceDto>>('/api/references', q, signal),
  get: (id: number) => apiClient.get<ReferenceDto>(`/api/references/${id}`),
  create: (data: { number: string; clientId: number; notes?: string }) => apiClient.post<ReferenceDto>('/api/references', data),
  update: (id: number, data: { number: string; clientId: number; notes?: string; status?: string }) => apiClient.put<ReferenceDto>(`/api/references/${id}`, data),
  remove: (id: number) => apiClient.delete(`/api/references/${id}`),
  import: (file: File, commit: boolean) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.upload<ImportResult>('/api/references/import', form, { commit });
  },
  template: () => apiClient.download('/api/references/import-template'),
  export: (q: object, format: 'csv' | 'xlsx') => apiClient.download('/api/references/export', { ...q, format }),
};

export const driversApi = {
  list: (q: PagedQuery & { isActive?: boolean }, signal?: AbortSignal) => apiClient.get<PagedResult<DriverDto>>('/api/drivers', q, signal),
  get: (id: number) => apiClient.get<DriverDetail>(`/api/drivers/${id}`),
  create: (data: DriverUpsert) => apiClient.post<DriverDetail>('/api/drivers', data),
  update: (id: number, data: DriverUpsert) => apiClient.put<DriverDetail>(`/api/drivers/${id}`, data),
  setActive: (id: number, isActive: boolean) => apiClient.patch<DriverDetail>(`/api/drivers/${id}/status`, { isActive }),
  export: (q: object, format: 'csv' | 'xlsx') => apiClient.download('/api/drivers/export', { ...q, format }),
};

export const clientsApi = {
  list: (q: PagedQuery & { isActive?: boolean }, signal?: AbortSignal) => apiClient.get<PagedResult<ClientDto>>('/api/clients', q, signal),
  get: (id: number) => apiClient.get<ClientDetail>(`/api/clients/${id}`),
  create: (data: ClientUpsert) => apiClient.post<ClientDetail>('/api/clients', data),
  update: (id: number, data: ClientUpsert) => apiClient.put<ClientDetail>(`/api/clients/${id}`, data),
  setActive: (id: number, isActive: boolean) => apiClient.patch<ClientDetail>(`/api/clients/${id}/status`, { isActive }),
};

export const vehiclesApi = {
  list: (q: PagedQuery & { status?: string; isActive?: boolean }, signal?: AbortSignal) => apiClient.get<PagedResult<VehicleDto>>('/api/vehicles', q, signal),
  get: (id: number) => apiClient.get<VehicleDetail>(`/api/vehicles/${id}`),
  create: (data: VehicleUpsert) => apiClient.post<VehicleDetail>('/api/vehicles', data),
  update: (id: number, data: VehicleUpsert) => apiClient.put<VehicleDetail>(`/api/vehicles/${id}`, data),
  setStatus: (id: number, status: VehicleStatus) => apiClient.patch<VehicleDetail>(`/api/vehicles/${id}/status`, { status }),
};

export const documentsApi = {
  list: (q: PagedQuery & { missionId?: number; documentTypeId?: number; extension?: string }, signal?: AbortSignal) =>
    apiClient.get<PagedResult<DocumentDto>>('/api/documents', q, signal),
  types: () => apiClient.get<DocumentType[]>('/api/documents/types'),
  download: (doc: DocumentDto) => apiClient.download(`/api/documents/${doc.id}/download`, undefined, doc.fileName),
  preview: (id: number) => apiClient.blob(`/api/documents/${id}/download`, { inline: true }),
  remove: (id: number) => apiClient.delete(`/api/documents/${id}`),
};

export const historyApi = {
  list: (q: PagedQuery & { userId?: number; action?: string; entityName?: string; reference?: string; dateFrom?: string; dateTo?: string }, signal?: AbortSignal) =>
    apiClient.get<PagedResult<HistoryItem>>('/api/history', q, signal),
  filters: () => apiClient.get<HistoryFilters>('/api/history/filters'),
  export: (q: object, format: 'csv' | 'xlsx') => apiClient.download('/api/history/export', { ...q, format }),
};

export const notificationsApi = {
  list: (q: PagedQuery & { unreadOnly?: boolean }, signal?: AbortSignal) => apiClient.get<PagedResult<NotificationDto>>('/api/notifications', q, signal),
  unreadCount: () => apiClient.get<number>('/api/notifications/unread-count'),
  markRead: (id: number) => apiClient.post<void>(`/api/notifications/${id}/read`),
  markAllRead: () => apiClient.post<number>('/api/notifications/read-all'),
};

export const usersApi = {
  list: (q: PagedQuery & { role?: string; isActive?: boolean }, signal?: AbortSignal) => apiClient.get<PagedResult<UserDto>>('/api/users', q, signal),
  create: (data: { username: string; email: string; firstName: string; lastName: string; phone?: string; role: string; password: string }) =>
    apiClient.post<UserDto>('/api/users', data),
  update: (id: number, data: { email: string; firstName: string; lastName: string; phone?: string; role: string }) => apiClient.put<UserDto>(`/api/users/${id}`, data),
  setActive: (id: number, isActive: boolean) => apiClient.patch<UserDto>(`/api/users/${id}/status`, { isActive }),
  resetPassword: (id: number) => apiClient.post<{ temporaryPassword: string }>(`/api/users/${id}/reset-password`),
};

export const searchApi = {
  search: (q: string, signal?: AbortSignal) => apiClient.get<SearchResult[]>('/api/search', { q }, signal),
};

export const settingsApi = {
  list: () => apiClient.get<SystemParameter[]>('/api/settings'),
  update: (updates: { key: string; value: string }[]) => apiClient.put<SystemParameter[]>('/api/settings', updates),
};
