import type { MissionStatusCode, VehicleStatus } from '@/types';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
const numFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** Les dates de l'API sont en UTC ; on force le suffixe Z si absent. */
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const v = /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const formatDate = (v?: string | null) => (parseDate(v) ? dateFmt.format(parseDate(v)!) : '—');
export const formatDateTime = (v?: string | null) => (parseDate(v) ? dateTimeFmt.format(parseDate(v)!) : '—');
export const formatTime = (v?: string | null) => (parseDate(v) ? timeFmt.format(parseDate(v)!) : '—');
export const formatDay = (v?: string | null) => (parseDate(v) ? dayFmt.format(parseDate(v)!) : '—');
export const formatNumber = (v?: number | null, suffix = '') => (v === null || v === undefined ? '—' : `${numFmt.format(v)}${suffix}`);

export function formatRelative(v?: string | null): string {
  const d = parseDate(v);
  if (!d) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 45) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
  if (diff < 86400 * 7) return `il y a ${Math.round(diff / 86400)} j`;
  return formatDate(v);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** Valeur pour <input type="datetime-local"> à partir d'une date UTC de l'API (heure locale). */
export function toLocalInput(v?: string | null): string {
  const d = parseDate(v);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convertit la saisie locale en ISO UTC pour l'API. */
export const fromLocalInput = (v: string) => new Date(v).toISOString();

export const initials = (name?: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

// ------------------------------------------------------------------ Statuts

export interface Tone { dot: string; text: string; bg: string; ring: string; hex: string }

const tones = {
  slate: { dot: 'bg-subtle', text: 'text-muted', bg: 'bg-raised', ring: 'ring-line', hex: '#7D8FA6' },
  blue: { dot: 'bg-brand', text: 'text-brand-400', bg: 'bg-brand/10', ring: 'ring-brand/30', hex: '#236EBE' },
  amber: { dot: 'bg-warn', text: 'text-warn', bg: 'bg-warn/10', ring: 'ring-warn/30', hex: '#D99A2B' },
  cyan: { dot: 'bg-cyan', text: 'text-cyan', bg: 'bg-cyan/10', ring: 'ring-cyan/30', hex: '#2CAABF' },
  teal: { dot: 'bg-cyan-400', text: 'text-cyan-400', bg: 'bg-cyan/15', ring: 'ring-cyan/40', hex: '#4FC0D2' },
  green: { dot: 'bg-go', text: 'text-go-400', bg: 'bg-go/10', ring: 'ring-go/30', hex: '#2A9B64' },
  red: { dot: 'bg-stop', text: 'text-stop', bg: 'bg-stop/10', ring: 'ring-stop/30', hex: '#D6455A' },
} satisfies Record<string, Tone>;

export const STATUS_META: Record<MissionStatusCode, { label: string; tone: Tone; live?: boolean }> = {
  CREATED: { label: 'Créée', tone: tones.slate },
  ASSIGNED: { label: 'Affectée', tone: tones.blue },
  TO_BE_PICKED_UP: { label: 'À prendre en charge', tone: tones.amber },
  PICKED_UP: { label: 'Prise en charge', tone: tones.cyan, live: true },
  IN_PROGRESS: { label: 'En cours', tone: tones.teal, live: true },
  COMPLETED: { label: 'Terminée', tone: tones.green },
  CANCELLED: { label: 'Annulée', tone: tones.slate },
  ANOMALY: { label: 'Anomalie', tone: tones.red, live: true },
};

export const STATUS_ORDER: MissionStatusCode[] = ['CREATED', 'ASSIGNED', 'TO_BE_PICKED_UP', 'PICKED_UP', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ANOMALY'];

/** Étapes du cycle de vie principal (affichage « progression » sur la fiche mission). */
export const LIFECYCLE: MissionStatusCode[] = ['CREATED', 'ASSIGNED', 'TO_BE_PICKED_UP', 'PICKED_UP', 'IN_PROGRESS', 'COMPLETED'];

export const VEHICLE_STATUS: Record<VehicleStatus, { label: string; tone: Tone }> = {
  AVAILABLE: { label: 'Disponible', tone: tones.green },
  IN_USE: { label: 'En mission', tone: tones.cyan },
  MAINTENANCE: { label: 'Maintenance', tone: tones.amber },
  OUT_OF_SERVICE: { label: 'Hors service', tone: tones.red },
};

export const TONES = tones;

export const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
  LOGIN: 'Connexion',
  LOGIN_FAILED: 'Connexion refusée',
  LOGOUT: 'Déconnexion',
  ASSIGN: 'Affectation',
  UNASSIGN: 'Désaffectation',
  STATUS_CHANGE: 'Changement de statut',
  DOCUMENT_UPLOAD: 'Ajout de document',
  DOCUMENT_DOWNLOAD: 'Téléchargement',
  DOCUMENT_DELETE: 'Suppression de document',
  IMPORT: 'Import',
  EXPORT: 'Export',
  PASSWORD_CHANGE: 'Mot de passe',
};

export const ENTITY_LABELS: Record<string, string> = {
  Mission: 'Mission',
  Reference: 'Référence',
  Driver: 'Chauffeur',
  Client: 'Client',
  Vehicle: 'Véhicule',
  Document: 'Document',
  User: 'Utilisateur',
  Export: 'Export',
  SystemParameter: 'Paramètre',
};
