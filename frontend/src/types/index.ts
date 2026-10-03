// Types alignés sur les DTO de l'API ASP.NET Core (JSON camelCase).

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string | null;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  code: string;
  errors?: Record<string, string[]>;
  traceId?: string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PagedQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export type Role = 'ADMIN' | 'DRIVER';

export interface UserInfo {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  phone?: string | null;
  lastLoginAt?: string | null;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: string;
  user: UserInfo;
}

export type MissionStatusCode =
  | 'CREATED' | 'ASSIGNED' | 'TO_BE_PICKED_UP' | 'PICKED_UP' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'ANOMALY';

export interface StatusDto { code: MissionStatusCode; label: string }

export interface LocationDto { label?: string | null; address: string; city: string; postalCode?: string | null; country: string }
export interface LocationInput { label?: string; address: string; city: string; postalCode?: string; country?: string }

export interface MissionListItem {
  id: number;
  referenceNumber: string;
  clientId: number;
  clientName: string;
  plannedDate: string;
  pickupCity: string;
  deliveryCity: string;
  driverId?: number | null;
  driverName?: string | null;
  vehiclePlate?: string | null;
  statusCode: MissionStatusCode;
  statusLabel: string;
  lastAction?: string | null;
  lastActionAt?: string | null;
}

export interface AssignmentDto {
  id: number;
  driverId: number;
  driverName: string;
  vehicleId?: number | null;
  vehiclePlate?: string | null;
  assignedByName: string;
  assignedAt: string;
  status: 'ACTIVE' | 'REPLACED' | 'ENDED';
  endedAt?: string | null;
  comment?: string | null;
}

export interface MissionDetail {
  id: number;
  referenceId: number;
  referenceNumber: string;
  client: { id: number; code: string; name: string };
  plannedDate: string;
  pickup: LocationDto;
  delivery: LocationDto;
  description?: string | null;
  goods?: string | null;
  weightKg?: number | null;
  volumeM3?: number | null;
  status: StatusDto;
  driver?: { id: number; fullName: string; phone: string; email?: string | null } | null;
  vehicle?: { id: number; plateNumber: string; brand: string; model: string; type: string } | null;
  createdAt: string;
  createdByName?: string | null;
  updatedAt?: string | null;
  lastAction?: string | null;
  lastActionAt?: string | null;
  isLocked: boolean;
  allowedTransitions: StatusDto[];
  assignments: AssignmentDto[];
  documentCount: number;
}

export interface MissionTimelineItem {
  at: string;
  type: 'CREATE' | 'STATUS' | 'ASSIGN' | 'DOCUMENT' | 'DOCUMENT_DELETE' | 'UPDATE';
  title: string;
  description?: string | null;
  userName?: string | null;
  statusCode?: MissionStatusCode | null;
}

export interface MissionUpsert {
  referenceNumber: string;
  clientId: number;
  plannedDate: string;
  pickup: LocationInput;
  delivery: LocationInput;
  description?: string;
  goods?: string;
  weightKg?: number | null;
  volumeM3?: number | null;
  driverId?: number | null;
  vehicleId?: number | null;
  assignComment?: string;
}

export interface MissionQuery extends PagedQuery {
  status?: string;
  clientId?: number;
  driverId?: number;
  dateFrom?: string;
  dateTo?: string;
  period?: '' | 'today' | 'week' | 'month';
  ids?: string;
}

export interface ReferenceDto {
  id: number;
  number: string;
  clientId: number;
  clientName: string;
  clientCode: string;
  source: 'MANUAL' | 'IMPORT' | 'API';
  status: 'OPEN' | 'USED' | 'CANCELLED';
  notes?: string | null;
  createdAt: string;
  missionId?: number | null;
  missionStatusCode?: MissionStatusCode | null;
  missionStatusLabel?: string | null;
}

export interface ImportErrorDto { line: number; field: string; message: string; value?: string | null }
export interface ImportRowDto { line: number; number: string; clientCode: string; clientName: string; notes?: string | null }
export interface ImportResult {
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ImportErrorDto[];
  preview: ImportRowDto[];
  committed: boolean;
  imported: number;
}

export interface DriverDto {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string | null;
  phone: string;
  licenseNumber: string;
  licenseExpiryDate: string;
  licenseExpired: boolean;
  licenseExpiresSoon: boolean;
  defaultVehicleId?: number | null;
  vehiclePlate?: string | null;
  isActive: boolean;
  hasUserAccount: boolean;
  userActive: boolean;
  username?: string | null;
  activeMissions: number;
}

export interface AssignmentHistory {
  missionId: number;
  referenceNumber: string;
  clientName: string;
  assignedAt: string;
  status: string;
  endedAt?: string | null;
  missionStatusLabel: string;
}

export interface DriverDetail {
  driver: DriverDto;
  currentMissions: MissionListItem[];
  history: AssignmentHistory[];
  completedMissions: number;
  totalAssignments: number;
}

export interface DriverUpsert {
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  licenseNumber: string;
  licenseExpiryDate: string;
  defaultVehicleId?: number | null;
  createAccount?: boolean;
  username?: string;
  password?: string;
}

export interface ClientDto {
  id: number;
  code: string;
  name: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country: string;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  referenceCount: number;
  missionCount: number;
  activeMissionCount: number;
}

export interface StatusCount { code: MissionStatusCode; label: string; count: number }

export interface ClientDetail {
  client: ClientDto;
  references: ReferenceDto[];
  missions: MissionListItem[];
  missionsByStatus: StatusCount[];
  completedThisMonth: number;
}

export interface ClientUpsert {
  code: string;
  name: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
}

export type VehicleStatus = 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' | 'OUT_OF_SERVICE';

export interface VehicleDto {
  id: number;
  plateNumber: string;
  brand: string;
  model: string;
  type: string;
  capacityKg: number;
  capacityM3?: number | null;
  status: VehicleStatus;
  isActive: boolean;
  driverName?: string | null;
  driverId?: number | null;
  currentMissionReference?: string | null;
  currentMissionId?: number | null;
}

export interface VehicleDetail {
  vehicle: VehicleDto;
  history: AssignmentHistory[];
  totalMissions: number;
}

export interface VehicleUpsert {
  plateNumber: string;
  brand: string;
  model: string;
  type: string;
  capacityKg: number;
  capacityM3?: number | null;
  status?: VehicleStatus;
}

export interface DocumentDto {
  id: number;
  missionId: number;
  referenceNumber: string;
  documentTypeId: number;
  documentTypeCode: string;
  documentTypeLabel: string;
  fileName: string;
  fileExtension: string;
  mimeType: string;
  fileSize: number;
  uploadedByName: string;
  uploadedAt: string;
  comment?: string | null;
}

export interface DocumentType { id: number; code: string; label: string }

export interface HistoryItem {
  id: number;
  createdAt: string;
  userId?: number | null;
  userName?: string | null;
  entityName: string;
  entityId?: string | null;
  action: string;
  description?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  ipAddress?: string | null;
}

export interface HistoryFilters {
  users: { id: number; name: string }[];
  actions: string[];
  entities: string[];
}

export interface NotificationDto {
  id: number;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';
  entityName?: string | null;
  entityId?: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface UserDto {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone?: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  isLocked: boolean;
  driverId?: number | null;
}

export interface Kpis {
  total: number;
  today: number;
  toAssign: number;
  inProgress: number;
  completed: number;
  anomalies: number;
  cancelled: number;
  completedThisWeek: number;
  completionRate: number;
}

export interface Ranking { id: number; name: string; count: number }
export interface TrendPoint { date: string; planned: number; completed: number }
export interface Activity {
  id: number;
  at: string;
  action: string;
  description?: string | null;
  userName?: string | null;
  entityName: string;
  entityId?: string | null;
}

export interface Dashboard {
  kpis: Kpis;
  byStatus: StatusCount[];
  byDriver: Ranking[];
  byClient: Ranking[];
  trend: TrendPoint[];
  actionRequired: MissionListItem[];
  recentActivity: Activity[];
  generatedAt: string;
}

export interface SearchResult {
  type: 'mission' | 'reference' | 'client' | 'driver';
  id: number;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  statusCode?: MissionStatusCode | null;
  statusLabel?: string | null;
  missionId?: number | null;
}

export interface SystemParameter { id: number; key: string; value: string; description?: string | null; updatedAt?: string | null }
