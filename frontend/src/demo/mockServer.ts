/**
 * MODE DÉMONSTRATION (VITE_DEMO=true) — utilisé uniquement pour la version publiée sur GitHub Pages.
 * Simule l'API ASP.NET Core directement dans le navigateur avec des données fictives, afin de présenter
 * le design et les fonctionnalités sans serveur ni base de données. Les modifications sont conservées
 * dans le navigateur du visiteur (localStorage) et peuvent être réinitialisées.
 * En fonctionnement normal, ce fichier n'est jamais chargé : tout passe par la vraie API.
 */
import type { MissionStatusCode } from '@/types';

const STORE_KEY = 'tf.demo.v1';
const DAY = 86_400_000;

// ------------------------------------------------------------------ Modèle interne

interface U { id: number; username: string; email: string; firstName: string; lastName: string; phone?: string | null; role: 'ADMIN' | 'DRIVER'; isActive: boolean; mustChangePassword: boolean; lastLoginAt?: string | null; createdAt: string; password: string }
interface C { id: number; code: string; name: string; address?: string | null; city?: string | null; postalCode?: string | null; country: string; phone?: string | null; email?: string | null; isActive: boolean }
interface V { id: number; plateNumber: string; brand: string; model: string; type: string; capacityKg: number; capacityM3?: number | null; status: string; isActive: boolean }
interface D { id: number; userId?: number | null; firstName: string; lastName: string; email?: string | null; phone: string; licenseNumber: string; licenseExpiryDate: string; defaultVehicleId?: number | null; isActive: boolean }
interface R { id: number; number: string; clientId: number; source: string; status: string; notes?: string | null; createdAt: string; deleted?: boolean }
interface Loc { address: string; city: string; postalCode?: string | null; country: string; label?: string | null }
interface M { id: number; referenceId: number; clientId: number; plannedDate: string; pickup: Loc; delivery: Loc; description?: string | null; goods?: string | null; weightKg?: number | null; volumeM3?: number | null; status: MissionStatusCode; driverId?: number | null; vehicleId?: number | null; createdAt: string; createdBy: number; updatedAt?: string | null; lastAction?: string | null; lastActionAt?: string | null; deleted?: boolean }
interface H { missionId: number; from?: MissionStatusCode | null; to: MissionStatusCode; by: number; at: string; comment?: string | null }
interface A { id: number; missionId: number; driverId: number; vehicleId?: number | null; by: number; at: string; status: 'ACTIVE' | 'REPLACED' | 'ENDED'; endedAt?: string | null; comment?: string | null }
interface Doc { id: number; missionId: number; typeId: number; fileName: string; ext: string; mime: string; size: number; by: number; at: string; comment?: string | null; deleted?: boolean; deletedAt?: string | null }
interface Au { id: number; userId?: number | null; entityName: string; entityId?: string | null; action: string; description: string; oldValue?: string | null; newValue?: string | null; at: string }
interface N { id: number; userId: number; title: string; message: string; type: string; entityName?: string | null; entityId?: number | null; isRead: boolean; at: string }
interface P { id: number; key: string; value: string; description: string; updatedAt?: string | null }

interface State { seq: number; users: U[]; clients: C[]; vehicles: V[]; drivers: D[]; refs: R[]; missions: M[]; hist: H[]; assigns: A[]; docs: Doc[]; audit: Au[]; notifs: N[]; params: P[] }

const STATUS_LABEL: Record<MissionStatusCode, string> = {
  CREATED: 'Créée', ASSIGNED: 'Affectée', TO_BE_PICKED_UP: 'À prendre en charge', PICKED_UP: 'Prise en charge',
  IN_PROGRESS: 'En cours', COMPLETED: 'Terminée', CANCELLED: 'Annulée', ANOMALY: 'Anomalie',
};
const ORDER: MissionStatusCode[] = ['CREATED', 'ASSIGNED', 'TO_BE_PICKED_UP', 'PICKED_UP', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ANOMALY'];
const ACTIVE: MissionStatusCode[] = ['ASSIGNED', 'TO_BE_PICKED_UP', 'PICKED_UP', 'IN_PROGRESS'];
const TRANSITIONS: Record<MissionStatusCode, MissionStatusCode[]> = {
  CREATED: ['CANCELLED'], ASSIGNED: ['TO_BE_PICKED_UP', 'ANOMALY', 'CANCELLED'], TO_BE_PICKED_UP: ['PICKED_UP', 'ANOMALY', 'CANCELLED'],
  PICKED_UP: ['IN_PROGRESS', 'ANOMALY'], IN_PROGRESS: ['COMPLETED', 'ANOMALY'], ANOMALY: ['TO_BE_PICKED_UP', 'PICKED_UP', 'IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [], CANCELLED: [],
};
const DOC_TYPES = [
  { id: 1, code: 'BON_TRANSPORT', label: 'Bon de transport' }, { id: 2, code: 'CMR', label: 'CMR / lettre de voiture' },
  { id: 3, code: 'PHOTO_PICKUP', label: 'Photo prise en charge' }, { id: 4, code: 'PHOTO_DELIVERY', label: 'Photo livraison' },
  { id: 5, code: 'PREUVE_LIVRAISON', label: 'Preuve de livraison' }, { id: 6, code: 'ANOMALIE', label: "Constat d'anomalie" },
  { id: 7, code: 'AUTRE', label: 'Autre document' },
];

const iso = (t: number) => new Date(t).toISOString();
const files = new Map<number, Blob>();

// ------------------------------------------------------------------ Jeu de données

function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function seed(): State {
  const r = rng(2026);
  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const st: State = { seq: 1000, users: [], clients: [], vehicles: [], drivers: [], refs: [], missions: [], hist: [], assigns: [], docs: [], audit: [], notifs: [], params: [] };
  let id = 1;
  const nid = () => id++;

  st.users.push({ id: nid(), username: 'admin', email: 'admin@local.dev', firstName: 'Admin', lastName: 'TRANSPORTFLOW', role: 'ADMIN', isActive: true, mustChangePassword: false, lastLoginAt: iso(now - 3600_000), createdAt: iso(now - 90 * DAY), password: 'admin' });
  const admin = st.users[0];
  st.users.push({ id: nid(), username: 'claire.dupont', email: 'claire.dupont@transportflow.local', firstName: 'Claire', lastName: 'DUPONT', role: 'ADMIN', isActive: true, mustChangePassword: false, lastLoginAt: iso(now - 26 * 3600_000), createdAt: iso(now - 60 * DAY), password: 'x' });

  const clients: [string, string, string, string][] = [
    ['ABC', 'ABC Logistics', 'Paris', '75019'], ['NORDIS', 'Nordis Distribution', 'Lille', '59000'], ['ALPFROID', 'Alpina Froid', 'Grenoble', '38000'],
    ['PORTSUD', 'Port-Sud Négoce', 'Marseille', '13002'], ['VERCORS', 'Vercors Matériaux', 'Valence', '26000'], ['LUMEN', 'Lumen Pharma', 'Lyon', '69007'],
    ['BASTIDE', 'Atelier Bastide', 'Bordeaux', '33000'],
  ];
  clients.forEach(([code, name, city, cp], i) => st.clients.push({ id: nid(), code, name, city, postalCode: cp, address: `${10 + i * 7} rue de la Logistique`, country: 'France', phone: `0${i + 1} 42 00 11 2${i}`, email: `contact@${code.toLowerCase()}.fr`, isActive: i !== 6 }));

  const vehicles: [string, string, string, string, number, number, string][] = [
    ['AB-123-CD', 'Renault Trucks', 'T 480', 'Semi-remorque', 25000, 90, 'AVAILABLE'], ['EF-456-GH', 'Volvo', 'FH 500', 'Semi-remorque', 24000, 88, 'AVAILABLE'],
    ['GH-789-JK', 'Mercedes-Benz', 'Actros 1845', 'Porteur frigorifique', 12000, 45, 'AVAILABLE'], ['JK-321-LM', 'Iveco', 'Daily 35S', 'Fourgon', 1200, 16, 'AVAILABLE'],
    ['LM-654-NP', 'Renault', 'Master', 'Fourgon', 1000, 13, 'MAINTENANCE'], ['NP-987-QR', 'DAF', 'XF 480', 'Plateau', 22000, 70, 'AVAILABLE'],
  ];
  vehicles.forEach(([plateNumber, brand, model, type, capacityKg, capacityM3, status]) => st.vehicles.push({ id: nid(), plateNumber, brand, model, type, capacityKg, capacityM3, status, isActive: true }));

  const drivers: [string, string, string, string, number, number, boolean][] = [
    ['Mohamed', 'BEN ALI', '06 12 34 56 78', '13AB45678', 900, 0, true], ['Julie', 'MARCHAND', '06 23 45 67 89', '15CD98765', 1200, 1, true],
    ['Karim', 'HADDAD', '06 34 56 78 90', '11EF24680', 18, 2, true], ['Thomas', 'LEROY', '06 45 67 89 01', '18GH13579', 700, 3, true],
    ['Sofia', 'MORENO', '06 56 78 90 12', '20IJ11223', 1500, 5, true], ['Nicolas', 'PETIT', '06 67 89 01 23', '09KL44556', 400, -1, false],
  ];
  drivers.forEach(([first, last, phone, lic, days, veh, active]) => {
    const login = `${first}.${last.replace(' ', '')}`.toLowerCase();
    const u: U = { id: nid(), username: login, email: `${login}@transportflow.local`, firstName: first, lastName: last, phone, role: 'DRIVER', isActive: active, mustChangePassword: false, lastLoginAt: active ? iso(now - r() * 30 * 3600_000) : null, createdAt: iso(now - 80 * DAY), password: 'x' };
    st.users.push(u);
    st.drivers.push({ id: nid(), userId: u.id, firstName: first, lastName: last, email: u.email, phone, licenseNumber: lic, licenseExpiryDate: iso(t0 + days * DAY).slice(0, 10), defaultVehicleId: veh >= 0 ? st.vehicles[veh].id : null, isActive: active });
  });
  const activeDrivers = st.drivers.filter((d) => d.isActive);

  const routes: [string, string, string, string, string, string][] = [
    ['Paris', '75019', '12 rue des Entrepôts', 'Lyon', '69007', '8 allée Pasteur'], ['Lille', '59000', 'ZI des Hauts', 'Rungis', '94150', 'MIN de Rungis, bât. C4'],
    ['Marseille', '13002', 'Quai de la Joliette', 'Toulouse', '31200', 'Parc Eurocentre'], ['Grenoble', '38000', '4 avenue du Vercors', 'Annecy', '74000', '12 rue de la Paix'],
    ['Le Havre', '76600', 'Terminal de France', 'Rouen', '76000', 'Port de Rouen, quai 4'], ['Lyon', '69007', '8 allée Pasteur', 'Strasbourg', '67000', 'Port du Rhin'],
    ['Nantes', '44000', 'Zone de Cheviré', 'Bordeaux', '33000', '21 cours Victor Hugo'],
  ];
  const goods: [string, number, number][] = [['Palettes produits secs', 18000, 60], ['Produits frais sous température dirigée', 9000, 38], ['Matériaux de construction', 21000, 55], ['Médicaments (2-8 °C)', 2400, 12], ['Pièces détachées automobiles', 6800, 24]];
  const path: MissionStatusCode[] = ['CREATED', 'ASSIGNED', 'TO_BE_PICKED_UP', 'PICKED_UP', 'IN_PROGRESS', 'COMPLETED'];

  let n = 101;
  for (let day = -9; day <= 6; day++) {
    const count = day === 0 ? 5 : 1 + Math.floor(r() * 3);
    for (let k = 0; k < count; k++) {
      const number = `REF-2026-${String(n).padStart(5, '0')}`;
      let target: MissionStatusCode;
      if (n === 125) target = 'PICKED_UP';
      else if (day < -1) target = r() < 0.08 ? 'CANCELLED' : r() < 0.08 ? 'ANOMALY' : 'COMPLETED';
      else if (day === -1) target = r() < 0.7 ? 'COMPLETED' : 'IN_PROGRESS';
      else if (day === 0) target = (['TO_BE_PICKED_UP', 'IN_PROGRESS', 'PICKED_UP', 'ANOMALY', 'CREATED'] as MissionStatusCode[])[k % 5];
      else if (day <= 2) target = r() < 0.6 ? 'ASSIGNED' : 'CREATED';
      else target = r() < 0.3 ? 'ASSIGNED' : 'CREATED';
      const route = routes[n === 125 ? 0 : Math.floor(r() * routes.length)];
      const client = st.clients[n === 125 ? 0 : Math.floor(r() * 6)];
      const driver = activeDrivers[n === 125 ? 0 : Math.floor(r() * activeDrivers.length)];
      const vehicle = st.vehicles.find((v) => v.id === driver.defaultVehicleId && v.status !== 'MAINTENANCE');
      const g = goods[Math.floor(r() * goods.length)];
      const planned = t0 + day * DAY + (6 + Math.floor(r() * 9)) * 3600_000 + Math.floor(r() * 4) * 900_000;
      let created = planned - 2 * DAY - Math.floor(1 + r() * 7) * 3600_000;
      if (created > now) created = now - 3 * 3600_000;
      const codes: MissionStatusCode[] = target === 'CANCELLED' ? ['CREATED', 'ASSIGNED', 'CANCELLED']
        : target === 'ANOMALY' ? ['CREATED', 'ASSIGNED', 'TO_BE_PICKED_UP', 'PICKED_UP', 'IN_PROGRESS', 'ANOMALY']
          : path.slice(0, path.indexOf(target) + 1);

      const ref: R = { id: nid(), number, clientId: client.id, source: 'MANUAL', status: 'USED', createdAt: iso(created) };
      st.refs.push(ref);
      const m: M = {
        id: nid(), referenceId: ref.id, clientId: client.id, plannedDate: iso(planned),
        pickup: { address: route[2], city: route[0], postalCode: route[1], country: 'France' }, delivery: { address: route[5], city: route[3], postalCode: route[4], country: 'France' },
        description: `Transport ${route[0]} → ${route[3]} pour ${client.name}.`, goods: g[0], weightKg: g[1], volumeM3: g[2], status: target,
        createdAt: iso(created), createdBy: admin.id,
      };
      st.missions.push(m);
      let at = created;
      let prev: MissionStatusCode | null = null;
      for (const code of codes) {
        at = code === 'CREATED' ? created : code === 'ASSIGNED' ? created + (5 + r() * 85) * 60_000 : code === 'TO_BE_PICKED_UP' ? planned - 2 * 3600_000
          : code === 'PICKED_UP' ? planned + (r() * 35 - 10) * 60_000 : code === 'IN_PROGRESS' ? at + (10 + r() * 30) * 60_000 : code === 'COMPLETED' ? at + (3 + r() * 4) * 3600_000 : at + (30 + r() * 90) * 60_000;
        if (at > now) at = now - (2 + r() * 28) * 60_000;
        const byDriver = ['PICKED_UP', 'IN_PROGRESS', 'COMPLETED', 'ANOMALY'].includes(code);
        const comment = code === 'CREATED' ? 'Création de la mission' : code === 'ASSIGNED' ? `Affectée à ${driver.firstName} ${driver.lastName}`
          : code === 'ANOMALY' ? ['Quai de livraison fermé à l’arrivée', 'Palette endommagée constatée au chargement', 'Retard important : accident sur l’A7'][Math.floor(r() * 3)]
            : code === 'CANCELLED' ? 'Commande annulée par le client' : code === 'COMPLETED' ? 'Livraison effectuée, CMR signée' : null;
        const by = byDriver ? driver.userId! : admin.id;
        st.hist.push({ missionId: m.id, from: prev, to: code, by, at: iso(at), comment });
        st.audit.push({
          id: nid(), userId: by, entityName: 'Mission', entityId: String(m.id), at: iso(at),
          action: code === 'CREATED' ? 'CREATE' : code === 'ASSIGNED' ? 'ASSIGN' : 'STATUS_CHANGE',
          description: code === 'CREATED' ? `Mission ${number} créée pour ${client.name}.` : code === 'ASSIGNED' ? `Mission ${number} affectée à ${driver.firstName} ${driver.lastName}${vehicle ? ` (${vehicle.plateNumber})` : ''}.` : `Mission ${number} passée à ${STATUS_LABEL[code]}.`,
        });
        if (code === 'ASSIGNED') {
          m.driverId = driver.id; m.vehicleId = vehicle?.id ?? null;
          st.assigns.push({ id: nid(), missionId: m.id, driverId: driver.id, vehicleId: vehicle?.id, by: admin.id, at: iso(at), status: 'ACTIVE' });
        }
        if ((code === 'ANOMALY' || code === 'COMPLETED') && at > now - 2 * DAY) {
          st.notifs.push({ id: nid(), userId: admin.id, entityName: 'Mission', entityId: m.id, at: iso(at), isRead: at < now - 20 * 3600_000, type: code === 'ANOMALY' ? 'DANGER' : 'SUCCESS',
            title: code === 'ANOMALY' ? 'Nouvelle anomalie détectée' : 'Mission terminée', message: code === 'ANOMALY' ? `Anomalie sur la mission ${number} : ${comment}` : `Mission ${number} terminée.` });
        }
        if (code === 'PICKED_UP' && at > now - 12 * 3600_000) {
          st.notifs.push({ id: nid(), userId: admin.id, entityName: 'Mission', entityId: m.id, at: iso(at), isRead: false, type: 'INFO', title: 'Prise en charge', message: `Mission ${number} prise en charge par ${driver.firstName}.` });
        }
        prev = code;
      }
      const ended = target === 'COMPLETED' || target === 'CANCELLED';
      const a = st.assigns.find((x) => x.missionId === m.id);
      if (a && ended) { a.status = 'ENDED'; a.endedAt = iso(at); }
      m.lastAction = target === 'CREATED' ? 'Mission créée' : target === 'ASSIGNED' ? `Affectée à ${driver.firstName} ${driver.lastName}` : `Passée à ${STATUS_LABEL[target]}`;
      m.lastActionAt = iso(at);
      if (n === 125) {
        const docs: [number, string, string, string, number][] = [[1, 'Bon de transport.pdf', '.pdf', 'application/pdf', 248_000], [2, 'CMR.jpg', '.jpg', 'image/jpeg', 1_840_000], [3, 'Photo prise en charge.jpg', '.jpg', 'image/jpeg', 2_210_000]];
        docs.forEach(([typeId, fileName, ext, mime, size], i) => {
          const d: Doc = { id: nid(), missionId: m.id, typeId, fileName, ext, mime, size, by: i === 0 ? admin.id : driver.userId!, at: iso(i === 0 ? created + 600_000 : at + (i + 1) * 60_000), comment: i === 1 ? 'CMR signée' : null };
          st.docs.push(d);
          st.audit.push({ id: nid(), userId: d.by, entityName: 'Document', entityId: String(d.id), action: 'DOCUMENT_UPLOAD', at: d.at, description: `Document « ${fileName} » ajouté à la mission ${number}.` });
        });
      }
      n++;
    }
  }
  for (let i = 0; i < 9; i++) {
    st.refs.push({ id: nid(), number: `REF-2026-${String(n + i).padStart(5, '0')}`, clientId: st.clients[i % 6].id, source: i % 3 === 0 ? 'IMPORT' : 'MANUAL', status: 'OPEN', notes: i % 3 === 0 ? 'Import planning hebdomadaire' : null, createdAt: iso(now - (2 + r() * 70) * 3600_000) });
  }
  st.audit.push({ id: nid(), userId: admin.id, entityName: 'Reference', action: 'IMPORT', at: iso(now - 26 * 3600_000), description: 'Import « planning-semaine.xlsx » : 3 référence(s) importée(s), 0 ligne(s) ignorée(s).' });
  st.audit.push({ id: nid(), userId: admin.id, entityName: 'User', entityId: String(admin.id), action: 'LOGIN', at: iso(now - 3600_000), description: 'Connexion de Admin TRANSPORTFLOW.' });
  st.params = [
    { id: 1, key: 'COMPANY_NAME', value: 'TransportFlow', description: "Nom de l'entreprise affiché dans l'application" },
    { id: 2, key: 'DEFAULT_COUNTRY', value: 'France', description: 'Pays par défaut des adresses' },
    { id: 3, key: 'LICENSE_EXPIRY_ALERT_DAYS', value: '30', description: 'Alerte d’expiration du permis (jours)' },
    { id: 4, key: 'REFERENCE_PREFIX', value: 'REF', description: 'Préfixe suggéré pour les nouvelles références' },
    { id: 5, key: 'SUPPORT_EMAIL', value: 'support@transportflow.local', description: 'Contact support affiché aux utilisateurs' },
  ];
  st.seq = id;
  return st;
}

// ------------------------------------------------------------------ Persistance

let S: State = load();

function load(): State {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch { /* données corrompues : on repart d'un jeu neuf */ }
  return seed();
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch { /* quota : la démo continue en mémoire */ }
}
export function resetDemo() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  S = seed();
  files.clear();
}

const next = () => S.seq++;
const nowIso = () => new Date().toISOString();
const ME = () => S.users.find((u) => u.username === 'admin')!;

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public errors?: Record<string, string[]>) { super(message); }
}
const notFound = (msg = 'Ressource introuvable.', code = 'NOT_FOUND') => new HttpError(404, code, msg);
const rule = (code: string, msg: string) => new HttpError(422, code, msg);
const invalid = (field: string, msg: string) => new HttpError(400, 'VALIDATION_ERROR', msg, { [field]: [msg] });

function audit(entityName: string, entityId: number | string | null, action: string, description: string, oldValue?: unknown, newValue?: unknown) {
  S.audit.push({ id: next(), userId: ME().id, entityName, entityId: entityId === null ? null : String(entityId), action, description, at: nowIso(),
    oldValue: oldValue === undefined ? null : JSON.stringify(oldValue), newValue: newValue === undefined ? null : JSON.stringify(newValue) });
}
function notify(title: string, message: string, type: string, missionId?: number) {
  S.notifs.push({ id: next(), userId: ME().id, title, message, type, entityName: missionId ? 'Mission' : null, entityId: missionId ?? null, isRead: false, at: nowIso() });
}

// ------------------------------------------------------------------ Projections (mêmes DTO que l'API)

const fullName = (x?: { firstName: string; lastName: string } | null) => (x ? `${x.firstName} ${x.lastName}` : null);
const client = (id: number) => S.clients.find((c) => c.id === id)!;
const ref = (id: number) => S.refs.find((r) => r.id === id)!;
const driver = (id?: number | null) => S.drivers.find((d) => d.id === id);
const vehicle = (id?: number | null) => S.vehicles.find((v) => v.id === id);
const user = (id?: number | null) => S.users.find((u) => u.id === id);
const missions = () => S.missions.filter((m) => !m.deleted);

function missionItem(m: M) {
  return {
    id: m.id, referenceNumber: ref(m.referenceId).number, clientId: m.clientId, clientName: client(m.clientId).name, plannedDate: m.plannedDate,
    pickupCity: m.pickup.city, deliveryCity: m.delivery.city, driverId: m.driverId ?? null, driverName: fullName(driver(m.driverId)),
    vehiclePlate: vehicle(m.vehicleId)?.plateNumber ?? null, statusCode: m.status, statusLabel: STATUS_LABEL[m.status], lastAction: m.lastAction, lastActionAt: m.lastActionAt,
  };
}

function missionDetail(m: M) {
  const d = driver(m.driverId);
  const v = vehicle(m.vehicleId);
  const c = client(m.clientId);
  return {
    id: m.id, referenceId: m.referenceId, referenceNumber: ref(m.referenceId).number, client: { id: c.id, code: c.code, name: c.name }, plannedDate: m.plannedDate,
    pickup: m.pickup, delivery: m.delivery, description: m.description, goods: m.goods, weightKg: m.weightKg, volumeM3: m.volumeM3,
    status: { code: m.status, label: STATUS_LABEL[m.status] },
    driver: d ? { id: d.id, fullName: fullName(d), phone: d.phone, email: d.email } : null,
    vehicle: v ? { id: v.id, plateNumber: v.plateNumber, brand: v.brand, model: v.model, type: v.type } : null,
    createdAt: m.createdAt, createdByName: fullName(user(m.createdBy)), updatedAt: m.updatedAt, lastAction: m.lastAction, lastActionAt: m.lastActionAt,
    isLocked: m.status === 'COMPLETED' || m.status === 'CANCELLED',
    allowedTransitions: TRANSITIONS[m.status].map((code) => ({ code, label: STATUS_LABEL[code] })),
    assignments: S.assigns.filter((a) => a.missionId === m.id).sort((a, b) => b.at.localeCompare(a.at)).map((a) => ({
      id: a.id, driverId: a.driverId, driverName: fullName(driver(a.driverId)), vehicleId: a.vehicleId, vehiclePlate: vehicle(a.vehicleId)?.plateNumber ?? null,
      assignedByName: fullName(user(a.by)), assignedAt: a.at, status: a.status, endedAt: a.endedAt, comment: a.comment,
    })),
    documentCount: S.docs.filter((x) => x.missionId === m.id && !x.deleted).length,
  };
}

function refDto(r: R) {
  const m = S.missions.find((x) => x.referenceId === r.id && !x.deleted);
  const c = client(r.clientId);
  return { id: r.id, number: r.number, clientId: r.clientId, clientName: c.name, clientCode: c.code, source: r.source, status: r.status, notes: r.notes, createdAt: r.createdAt,
    missionId: m?.id ?? null, missionStatusCode: m?.status ?? null, missionStatusLabel: m ? STATUS_LABEL[m.status] : null };
}

function driverDto(d: D) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(d.licenseExpiryDate).getTime();
  const u = user(d.userId);
  return {
    id: d.id, firstName: d.firstName, lastName: d.lastName, fullName: fullName(d), email: d.email, phone: d.phone, licenseNumber: d.licenseNumber,
    licenseExpiryDate: d.licenseExpiryDate, licenseExpired: exp < today.getTime(), licenseExpiresSoon: exp >= today.getTime() && exp < today.getTime() + 30 * DAY,
    defaultVehicleId: d.defaultVehicleId, vehiclePlate: vehicle(d.defaultVehicleId)?.plateNumber ?? null, isActive: d.isActive,
    hasUserAccount: !!u, userActive: !!u?.isActive, username: u?.username ?? null,
    activeMissions: missions().filter((m) => m.driverId === d.id && ACTIVE.includes(m.status)).length,
  };
}

function clientDto(c: C) {
  const ms = missions().filter((m) => m.clientId === c.id);
  return { ...c, referenceCount: S.refs.filter((r) => r.clientId === c.id && !r.deleted).length, missionCount: ms.length, activeMissionCount: ms.filter((m) => ACTIVE.includes(m.status)).length };
}

function vehicleDto(v: V) {
  const d = S.drivers.find((x) => x.defaultVehicleId === v.id);
  const m = missions().filter((x) => x.vehicleId === v.id && ACTIVE.includes(x.status)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
  return { ...v, driverName: fullName(d), driverId: d?.id ?? null, currentMissionReference: m ? ref(m.referenceId).number : null, currentMissionId: m?.id ?? null };
}

function docDto(d: Doc) {
  const t = DOC_TYPES.find((x) => x.id === d.typeId)!;
  const m = S.missions.find((x) => x.id === d.missionId)!;
  return { id: d.id, missionId: d.missionId, referenceNumber: ref(m.referenceId).number, documentTypeId: t.id, documentTypeCode: t.code, documentTypeLabel: t.label,
    fileName: d.fileName, fileExtension: d.ext, mimeType: d.mime, fileSize: d.size, uploadedByName: fullName(user(d.by)), uploadedAt: d.at, comment: d.comment };
}

function userDto(u: U) {
  return { id: u.id, username: u.username, email: u.email, firstName: u.firstName, lastName: u.lastName, fullName: fullName(u), phone: u.phone, role: u.role,
    isActive: u.isActive, mustChangePassword: u.mustChangePassword, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, isLocked: false, driverId: S.drivers.find((d) => d.userId === u.id)?.id ?? null };
}

const meInfo = () => { const u = ME(); return { id: u.id, username: u.username, email: u.email, firstName: u.firstName, lastName: u.lastName, fullName: fullName(u), role: u.role, phone: u.phone, lastLoginAt: u.lastLoginAt, mustChangePassword: false }; };

// ------------------------------------------------------------------ Outils de liste

type Q = URLSearchParams;
const num = (q: Q, k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
const has = (s: string | null | undefined, term: string) => (s ?? '').toLowerCase().includes(term.toLowerCase());

function page<T>(items: T[], q: Q) {
  const p = Math.max(1, num(q, 'page') ?? 1);
  const size = Math.min(200, Math.max(1, num(q, 'pageSize') ?? 20));
  return { items: items.slice((p - 1) * size, p * size), total: items.length, page: p, pageSize: size, totalPages: Math.ceil(items.length / size) };
}

function sort<T>(items: T[], q: Q, keys: Record<string, (x: T) => string | number | null | undefined>, def: string, defDesc: boolean) {
  const key = (q.get('sortBy') ?? '').toLowerCase();
  const f = keys[key] ?? keys[def];
  const dir = q.get('sortDir');
  const desc = dir ? dir === 'desc' : (keys[key] ? false : defDesc);
  return [...items].sort((a, b) => {
    const va = f(a) ?? ''; const vb = f(b) ?? '';
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr');
    return desc ? -c : c;
  });
}

function filterMissions(q: Q) {
  let ms = missions();
  const s = q.get('search');
  if (s) ms = ms.filter((m) => has(ref(m.referenceId).number, s) || has(client(m.clientId).name, s) || has(m.pickup.city, s) || has(m.delivery.city, s) || has(fullName(driver(m.driverId)), s));
  const status = q.get('status');
  if (status) { const list = status.split(','); ms = ms.filter((m) => list.includes(m.status)); }
  const clientId = num(q, 'clientId'); if (clientId) ms = ms.filter((m) => m.clientId === clientId);
  const driverId = num(q, 'driverId'); if (driverId) ms = ms.filter((m) => m.driverId === driverId);
  const ids = q.get('ids'); if (ids) { const list = ids.split(',').map(Number); ms = ms.filter((m) => list.includes(m.id)); }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const period = q.get('period');
  let from: number | undefined; let to: number | undefined;
  if (period === 'today') { from = today.getTime(); to = from + DAY; }
  else if (period === 'week') { const dow = (today.getDay() + 6) % 7; from = today.getTime() - dow * DAY; to = from + 7 * DAY; }
  else if (period === 'month') { from = new Date(today.getFullYear(), today.getMonth(), 1).getTime(); to = new Date(today.getFullYear(), today.getMonth() + 1, 1).getTime(); }
  else {
    if (q.get('dateFrom')) from = new Date(q.get('dateFrom')!).setHours(0, 0, 0, 0);
    if (q.get('dateTo')) to = new Date(q.get('dateTo')!).setHours(0, 0, 0, 0) + DAY;
  }
  if (from !== undefined) ms = ms.filter((m) => new Date(m.plannedDate).getTime() >= from!);
  if (to !== undefined) ms = ms.filter((m) => new Date(m.plannedDate).getTime() < to!);
  return sort(ms, q, {
    reference: (m) => ref(m.referenceId).number, client: (m) => client(m.clientId).name, status: (m) => ORDER.indexOf(m.status), driver: (m) => driver(m.driverId)?.lastName,
    lastaction: (m) => m.lastActionAt, pickup: (m) => m.pickup.city, delivery: (m) => m.delivery.city, date: (m) => m.plannedDate,
  }, 'date', true);
}

function csv(headers: string[], rows: (string | number | null | undefined)[][], name: string) {
  const esc = (v: unknown) => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const body = '﻿' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  return new Response(new Blob([body], { type: 'text/csv;charset=utf-8' }), {
    status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="transportflow-${name}-demo.csv"` },
  });
}
const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// ------------------------------------------------------------------ Logique métier simulée

function setStatus(m: M, to: MissionStatusCode, comment?: string | null) {
  S.hist.push({ missionId: m.id, from: m.status, to, by: ME().id, at: nowIso(), comment: comment ?? null });
  m.status = to;
  m.updatedAt = nowIso();
  m.lastAction = `Passée à ${STATUS_LABEL[to]}`;
  m.lastActionAt = nowIso();
}

function assign(m: M, body: { driverId: number; vehicleId?: number | null; comment?: string }) {
  if (m.status === 'COMPLETED' || m.status === 'CANCELLED') throw rule('MISSION_LOCKED', `La mission est « ${STATUS_LABEL[m.status]} » et ne peut plus être modifiée.`);
  const d = driver(body.driverId);
  if (!d) throw invalid('driverId', 'Le chauffeur est obligatoire.');
  const name = fullName(d)!;
  if (!d.isActive) throw rule('DRIVER_INACTIVE', `${name} est désactivé et ne peut pas recevoir de mission.`);
  if (!user(d.userId)?.isActive) throw rule('DRIVER_NO_ACTIVE_USER', `${name} n'a pas de compte utilisateur actif. Activez son accès avant de l'affecter.`);
  if (new Date(d.licenseExpiryDate).getTime() < new Date().setHours(0, 0, 0, 0)) throw rule('DRIVER_LICENSE_EXPIRED', `Le permis de ${name} a expiré.`);
  const vId = body.vehicleId ?? d.defaultVehicleId ?? null;
  const v = vehicle(vId);
  if (v && (v.status === 'MAINTENANCE' || v.status === 'OUT_OF_SERVICE')) throw rule('VEHICLE_UNAVAILABLE', `Le véhicule ${v.plateNumber} n'est pas disponible.`);
  S.assigns.filter((a) => a.missionId === m.id && a.status === 'ACTIVE').forEach((a) => {
    a.status = 'REPLACED'; a.endedAt = nowIso();
    audit('Mission', m.id, 'UNASSIGN', `${fullName(driver(a.driverId))} retiré de la mission ${ref(m.referenceId).number}.`);
  });
  S.assigns.push({ id: next(), missionId: m.id, driverId: d.id, vehicleId: v?.id ?? null, by: ME().id, at: nowIso(), status: 'ACTIVE', comment: body.comment || null });
  m.driverId = d.id;
  m.vehicleId = v?.id ?? null;
  if (m.status === 'CREATED') setStatus(m, 'ASSIGNED', body.comment || `Affectée à ${name}`);
  m.lastAction = `Affectée à ${name}`;
  m.lastActionAt = nowIso();
  audit('Mission', m.id, 'ASSIGN', `Mission ${ref(m.referenceId).number} affectée à ${name}${v ? ` (${v.plateNumber})` : ''}.`);
  notify('Mission affectée', `Mission ${ref(m.referenceId).number} affectée à ${d.firstName}.`, 'INFO', m.id);
}

function upsertMission(body: Record<string, any>, existing?: M) {
  const number = String(body.referenceNumber ?? '').trim().toUpperCase();
  const errors: Record<string, string[]> = {};
  if (!number) errors.referenceNumber = ['La référence est obligatoire.'];
  if (!body.clientId) errors.clientId = ['Le client est obligatoire.'];
  if (!body.plannedDate) errors.plannedDate = ['La date prévue est obligatoire.'];
  if (!body.pickup?.address) errors['pickup.Address'] = ["L'adresse est obligatoire."];
  if (!body.pickup?.city) errors['pickup.City'] = ['La ville est obligatoire.'];
  if (!body.delivery?.address) errors['delivery.Address'] = ["L'adresse est obligatoire."];
  if (!body.delivery?.city) errors['delivery.City'] = ['La ville est obligatoire.'];
  if (Object.keys(errors).length) throw new HttpError(400, 'VALIDATION_ERROR', Object.values(errors)[0][0], errors);
  const c = client(Number(body.clientId));
  if (!c.isActive) throw rule('CLIENT_INACTIVE', `Le client ${c.name} est désactivé.`);

  let r = S.refs.find((x) => x.number === number);
  if (r && r.deleted) throw new HttpError(409, 'REFERENCE_DELETED', `La référence ${number} a été supprimée et ne peut pas être réutilisée.`);
  if (r && S.missions.some((m) => m.referenceId === r!.id && !m.deleted && m.id !== existing?.id)) throw new HttpError(409, 'REFERENCE_ALREADY_USED', `La référence ${number} est déjà associée à une mission.`);
  if (r && r.clientId !== c.id) throw rule('REFERENCE_CLIENT_MISMATCH', `La référence ${number} appartient à un autre client.`);
  if (!r) { r = { id: next(), number, clientId: c.id, source: 'MANUAL', status: 'OPEN', createdAt: nowIso() }; S.refs.push(r); }
  r.status = 'USED';

  const loc = (l: Record<string, string>): Loc => ({ address: l.address, city: l.city, postalCode: l.postalCode || null, country: l.country || 'France' });
  if (existing) {
    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') throw rule('MISSION_LOCKED', `La mission est « ${STATUS_LABEL[existing.status]} » et ne peut plus être modifiée.`);
    if (existing.referenceId !== r.id) { ref(existing.referenceId).status = 'OPEN'; existing.referenceId = r.id; }
    Object.assign(existing, { clientId: c.id, plannedDate: body.plannedDate, pickup: loc(body.pickup), delivery: loc(body.delivery), description: body.description, goods: body.goods,
      weightKg: body.weightKg, volumeM3: body.volumeM3, updatedAt: nowIso(), lastAction: 'Mission modifiée', lastActionAt: nowIso() });
    audit('Mission', existing.id, 'UPDATE', `Mission ${number} modifiée.`);
    return existing;
  }
  const m: M = { id: next(), referenceId: r.id, clientId: c.id, plannedDate: body.plannedDate, pickup: loc(body.pickup), delivery: loc(body.delivery), description: body.description,
    goods: body.goods, weightKg: body.weightKg, volumeM3: body.volumeM3, status: 'CREATED', createdAt: nowIso(), createdBy: ME().id, lastAction: 'Mission créée', lastActionAt: nowIso() };
  S.missions.push(m);
  S.hist.push({ missionId: m.id, from: null, to: 'CREATED', by: ME().id, at: nowIso(), comment: 'Création de la mission' });
  audit('Mission', m.id, 'CREATE', `Mission ${number} créée pour ${c.name}.`);
  if (body.driverId) assign(m, { driverId: Number(body.driverId), vehicleId: body.vehicleId, comment: body.assignComment });
  return m;
}

function timeline(m: M) {
  const items: Record<string, unknown>[] = [];
  const number = ref(m.referenceId).number;
  S.hist.filter((h) => h.missionId === m.id).forEach((h) => items.push({
    at: h.at, type: h.from ? 'STATUS' : 'CREATE', title: h.from ? `Statut : ${STATUS_LABEL[h.to]}` : `Mission ${number} créée`,
    description: h.from ? (h.comment ?? `${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]}`) : h.comment, userName: fullName(user(h.by)), statusCode: h.to,
  }));
  S.assigns.filter((a) => a.missionId === m.id).forEach((a) => items.push({
    at: a.at, type: 'ASSIGN', title: `Affectée à ${fullName(driver(a.driverId))}`,
    description: [vehicle(a.vehicleId) ? `Véhicule ${vehicle(a.vehicleId)!.plateNumber}` : null, a.comment].filter(Boolean).join(' · '), userName: fullName(user(a.by)),
  }));
  S.docs.filter((d) => d.missionId === m.id).forEach((d) => {
    items.push({ at: d.at, type: 'DOCUMENT', title: 'Document ajouté', description: `${DOC_TYPES.find((t) => t.id === d.typeId)!.label} — ${d.fileName}`, userName: fullName(user(d.by)) });
    if (d.deleted && d.deletedAt) items.push({ at: d.deletedAt, type: 'DOCUMENT_DELETE', title: 'Document supprimé', description: d.fileName });
  });
  S.audit.filter((a) => a.entityName === 'Mission' && a.entityId === String(m.id) && a.action === 'UPDATE')
    .forEach((a) => items.push({ at: a.at, type: 'UPDATE', title: 'Mission modifiée', description: a.description, userName: fullName(user(a.userId)) }));
  return items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Fichier de démonstration généré à la volée pour les documents du jeu d'essai. */
function sampleFile(d: Doc): Blob {
  if (d.mime === 'application/pdf') {
    const text = `${d.fileName} - document de demonstration TransportFlow`;
    const content = `BT /F1 18 Tf 60 760 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
    const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n5 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
    return new Blob([pdf], { type: 'application/pdf' });
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E8F1FA"/><stop offset="1" stop-color="#D6F1F5"/></linearGradient></defs><rect width="900" height="600" fill="url(#g)"/><rect x="250" y="250" width="280" height="150" rx="10" fill="#236EBE"/><rect x="530" y="300" width="120" height="100" rx="10" fill="#142337"/><circle cx="320" cy="410" r="32" fill="#142337"/><circle cx="590" cy="410" r="32" fill="#142337"/><text x="450" y="520" font-family="sans-serif" font-size="26" text-anchor="middle" fill="#142337">${d.fileName} — photo de démonstration</text></svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

// ------------------------------------------------------------------ Routeur

type Handler = (p: string[], q: Q, body: any) => unknown;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, h: Handler) =>
  routes.push([method, new RegExp('^' + pattern.replace(/:\w+/g, '([^/]+)') + '$'), h]);

on('POST', '/api/auth/login', (_p, _q, b) => {
  const u = S.users.find((x) => x.username === String(b?.username ?? '').trim().toLowerCase() || x.email === String(b?.username ?? '').trim().toLowerCase());
  if (!u || u.password !== b?.password) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Identifiants incorrects. (Démo : admin / admin)');
  if (u.role !== 'ADMIN') throw new HttpError(403, 'ADMIN_ONLY', 'Cet espace est réservé aux administrateurs.');
  u.lastLoginAt = nowIso();
  audit('User', u.id, 'LOGIN', `Connexion de ${fullName(u)}.`);
  return { accessToken: 'demo-token', refreshToken: 'demo-refresh', expiresIn: 86400, expiresAt: iso(Date.now() + DAY), user: meInfo() };
});
on('POST', '/api/auth/refresh', () => ({ accessToken: 'demo-token', refreshToken: 'demo-refresh', expiresIn: 86400, expiresAt: iso(Date.now() + DAY), user: meInfo() }));
on('POST', '/api/auth/logout', () => { audit('User', ME().id, 'LOGOUT', `Déconnexion de ${fullName(ME())}.`); return null; });
on('GET', '/api/auth/me', () => meInfo());
on('PUT', '/api/auth/me', (_p, _q, b) => { Object.assign(ME(), { firstName: b.firstName, lastName: String(b.lastName).toUpperCase(), email: b.email, phone: b.phone }); return meInfo(); });
on('POST', '/api/auth/change-password', (_p, _q, b) => {
  if (b.currentPassword !== ME().password) throw invalid('currentPassword', "L'ancien mot de passe est incorrect.");
  ME().password = b.newPassword;
  audit('User', ME().id, 'PASSWORD_CHANGE', `Mot de passe modifié par ${fullName(ME())}.`);
  return { accessToken: 'demo-token', refreshToken: 'demo-refresh', expiresIn: 86400, expiresAt: iso(Date.now() + DAY), user: meInfo() };
});

on('GET', '/api/dashboard', () => {
  const ms = missions();
  const count = (c: MissionStatusCode) => ms.filter((m) => m.status === c).length;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const completedAt = (from: number, to: number) => S.hist.filter((h) => h.to === 'COMPLETED' && new Date(h.at).getTime() >= from && new Date(h.at).getTime() < to).length;
  const closed = count('COMPLETED') + count('CANCELLED');
  const group = (key: (m: M) => number | null | undefined, name: (id: number) => string) => {
    const map = new Map<number, number>();
    ms.forEach((m) => { const k = key(m); if (k) map.set(k, (map.get(k) ?? 0) + 1); });
    return [...map.entries()].map(([id, c]) => ({ id, name: name(id), count: c })).sort((a, b) => b.count - a.count).slice(0, 5);
  };
  return {
    kpis: { total: ms.length, today: ms.filter((m) => new Date(m.plannedDate).getTime() >= t0 && new Date(m.plannedDate).getTime() < t0 + DAY).length,
      toAssign: count('CREATED'), inProgress: ACTIVE.reduce((s, c) => s + count(c), 0), completed: count('COMPLETED'), anomalies: count('ANOMALY'), cancelled: count('CANCELLED'),
      completedThisWeek: completedAt(t0 - 7 * DAY, Date.now() + 1), completionRate: closed ? Math.round((count('COMPLETED') * 1000) / closed) / 10 : 0 },
    byStatus: ORDER.map((c) => ({ code: c, label: STATUS_LABEL[c], count: count(c) })),
    byDriver: group((m) => m.driverId, (id) => fullName(driver(id))!),
    byClient: group((m) => m.clientId, (id) => client(id).name),
    trend: Array.from({ length: 14 }, (_, i) => {
      const d = t0 - (13 - i) * DAY;
      return { date: iso(d), planned: ms.filter((m) => { const t = new Date(m.plannedDate).getTime(); return t >= d && t < d + DAY; }).length, completed: completedAt(d, d + DAY) };
    }),
    actionRequired: ms.filter((m) => ['CREATED', 'ANOMALY', 'TO_BE_PICKED_UP'].includes(m.status)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)).slice(0, 8).map(missionItem),
    recentActivity: S.audit.filter((a) => !['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'DOCUMENT_DOWNLOAD', 'EXPORT'].includes(a.action)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10)
      .map((a) => ({ id: a.id, at: a.at, action: a.action, description: a.description, userName: fullName(user(a.userId)), entityName: a.entityName, entityId: a.entityId })),
    generatedAt: nowIso(),
  };
});

const findMission = (id: string) => { const m = missions().find((x) => x.id === Number(id)); if (!m) throw notFound("La mission n'existe pas.", 'MISSION_NOT_FOUND'); return m; };

on('GET', '/api/missions', (_p, q) => page(filterMissions(q).map(missionItem), q));
on('GET', '/api/missions/statuses', () => ORDER.map((code) => ({ code, label: STATUS_LABEL[code] })));
on('GET', '/api/missions/export', (_p, q) => csv(['Référence', 'Client', 'Date prévue', 'Départ', 'Destination', 'Chauffeur', 'Statut'],
  filterMissions(q).map((m) => [ref(m.referenceId).number, client(m.clientId).name, fmt(m.plannedDate), m.pickup.city, m.delivery.city, fullName(driver(m.driverId)), STATUS_LABEL[m.status]]), 'missions'));
on('GET', '/api/missions/:id', ([id]) => missionDetail(findMission(id)));
on('POST', '/api/missions', (_p, _q, b) => missionDetail(upsertMission(b)));
on('PUT', '/api/missions/:id', ([id], _q, b) => missionDetail(upsertMission(b, findMission(id))));
on('DELETE', '/api/missions/:id', ([id]) => {
  const m = findMission(id);
  if (m.status !== 'CREATED' && m.status !== 'CANCELLED') throw rule('MISSION_NOT_DELETABLE', 'Seules les missions créées ou annulées peuvent être supprimées. Annulez d’abord la mission.');
  m.deleted = true; ref(m.referenceId).status = 'OPEN';
  audit('Mission', m.id, 'DELETE', `Mission ${ref(m.referenceId).number} supprimée (suppression logique).`);
  return null;
});
on('POST', '/api/missions/:id/assign', ([id], _q, b) => { const m = findMission(id); assign(m, b); return missionDetail(m); });
on('POST', '/api/missions/:id/status', ([id], _q, b) => {
  const m = findMission(id);
  const to = b.statusCode as MissionStatusCode;
  if (to === 'ANOMALY' && !String(b.comment ?? '').trim()) throw invalid('comment', "Décrivez l'anomalie rencontrée.");
  if (!TRANSITIONS[m.status].includes(to)) throw rule('INVALID_STATUS_TRANSITION', `Passage de « ${STATUS_LABEL[m.status]} » à « ${STATUS_LABEL[to]} » impossible.`);
  if (['TO_BE_PICKED_UP', 'PICKED_UP', 'IN_PROGRESS', 'COMPLETED'].includes(to) && !m.driverId) throw rule('MISSION_NOT_ASSIGNED', 'Affectez un chauffeur avant de faire avancer la mission.');
  setStatus(m, to, b.comment);
  if (to === 'COMPLETED' || to === 'CANCELLED') S.assigns.filter((a) => a.missionId === m.id && a.status === 'ACTIVE').forEach((a) => { a.status = 'ENDED'; a.endedAt = nowIso(); });
  const number = ref(m.referenceId).number;
  audit('Mission', m.id, 'STATUS_CHANGE', `Mission ${number} passée à ${STATUS_LABEL[to]}.`);
  notify(to === 'ANOMALY' ? 'Nouvelle anomalie détectée' : to === 'COMPLETED' ? 'Mission terminée' : 'Statut mis à jour',
    to === 'ANOMALY' ? `Anomalie sur la mission ${number} : ${b.comment}` : `Mission ${number} ${STATUS_LABEL[to].toLowerCase()}.`,
    to === 'ANOMALY' ? 'DANGER' : to === 'COMPLETED' ? 'SUCCESS' : to === 'CANCELLED' ? 'WARNING' : 'INFO', m.id);
  return missionDetail(m);
});
on('GET', '/api/missions/:id/history', ([id]) => timeline(findMission(id)));
on('GET', '/api/missions/:id/documents', ([id]) => S.docs.filter((d) => d.missionId === findMission(id).id && !d.deleted).sort((a, b) => b.at.localeCompare(a.at)).map(docDto));
on('POST', '/api/missions/:id/documents', ([id], _q, form: FormData) => {
  const m = findMission(id);
  const file = form.get('file') as File | null;
  if (!file) throw invalid('file', 'Sélectionnez un fichier.');
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  if (!['.pdf', '.jpg', '.jpeg', '.png', '.docx'].includes(ext)) throw invalid('file', 'Format non autorisé. Formats acceptés : PDF, JPG, PNG, DOCX.');
  if (file.size > 10 * 1024 * 1024) throw invalid('file', 'Le fichier dépasse la taille maximale de 10 Mo.');
  const typeId = Number(form.get('documentTypeId'));
  const d: Doc = { id: next(), missionId: m.id, typeId, fileName: file.name, ext, mime: file.type || 'application/octet-stream', size: file.size, by: ME().id, at: nowIso(), comment: (form.get('comment') as string) || null };
  S.docs.push(d);
  files.set(d.id, file);
  m.lastAction = `Document ajouté : ${DOC_TYPES.find((t) => t.id === typeId)?.label}`;
  m.lastActionAt = nowIso();
  audit('Document', d.id, 'DOCUMENT_UPLOAD', `Document « ${file.name} » ajouté à la mission ${ref(m.referenceId).number}.`);
  return docDto(d);
});

on('GET', '/api/documents', (_p, q) => {
  let ds = S.docs.filter((d) => !d.deleted && !S.missions.find((m) => m.id === d.missionId)?.deleted);
  const s = q.get('search'); if (s) ds = ds.filter((d) => has(d.fileName, s) || has(docDto(d).referenceNumber, s));
  const t = num(q, 'documentTypeId'); if (t) ds = ds.filter((d) => d.typeId === t);
  const e = q.get('extension'); if (e) ds = ds.filter((d) => d.ext === e);
  return page(sort(ds, q, { name: (d) => d.fileName, size: (d) => d.size, type: (d) => d.typeId, reference: (d) => docDto(d).referenceNumber, date: (d) => d.at }, 'date', true).map(docDto), q);
});
on('GET', '/api/documents/types', () => DOC_TYPES);
on('GET', '/api/documents/:id/download', ([id], q) => {
  const d = S.docs.find((x) => x.id === Number(id) && !x.deleted);
  if (!d) throw notFound("Le document n'existe pas.");
  const blob = files.get(d.id) ?? sampleFile(d);
  const name = files.get(d.id) || d.mime !== 'image/jpeg' ? d.fileName : d.fileName.replace(/\.jpe?g$/i, '.svg');
  return new Response(blob, { status: 200, headers: { 'Content-Type': blob.type, 'Content-Disposition': `${q.get('inline') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}` } });
});
on('DELETE', '/api/documents/:id', ([id]) => {
  const d = S.docs.find((x) => x.id === Number(id) && !x.deleted);
  if (!d) throw notFound("Le document n'existe pas.");
  d.deleted = true; d.deletedAt = nowIso();
  audit('Document', d.id, 'DOCUMENT_DELETE', `Document « ${d.fileName} » supprimé de la mission ${docDto(d).referenceNumber}.`);
  return null;
});

const refsQuery = (q: Q) => {
  let rs = S.refs.filter((r) => !r.deleted);
  const s = q.get('search'); if (s) rs = rs.filter((r) => has(r.number, s) || has(client(r.clientId).name, s));
  if (q.get('status')) rs = rs.filter((r) => r.status === q.get('status'));
  if (q.get('source')) rs = rs.filter((r) => r.source === q.get('source'));
  const c = num(q, 'clientId'); if (c) rs = rs.filter((r) => r.clientId === c);
  if (q.get('available') === 'true') rs = rs.filter((r) => r.status === 'OPEN' && !S.missions.some((m) => m.referenceId === r.id && !m.deleted));
  return sort(rs, q, { number: (r) => r.number, client: (r) => client(r.clientId).name, status: (r) => r.status, source: (r) => r.source, created: (r) => r.createdAt }, 'created', true);
};
on('GET', '/api/references', (_p, q) => page(refsQuery(q).map(refDto), q));
on('GET', '/api/references/import-template', () => csv(['Reference', 'Client', 'Notes'], [['REF-2026-01001', 'ABC', 'Livraison quai 3'], ['REF-2026-01002', 'Nordis Distribution', '']], 'modele-import'));
on('GET', '/api/references/export', (_p, q) => csv(['Référence', 'Client', 'Source', 'Statut', 'Date création'], refsQuery(q).map((r) => [r.number, client(r.clientId).name, r.source, r.status, fmt(r.createdAt)]), 'references'));
on('POST', '/api/references', (_p, _q, b) => {
  const number = String(b.number ?? '').trim().toUpperCase();
  if (!number) throw invalid('number', 'La référence est obligatoire.');
  if (S.refs.some((r) => r.number === number)) throw new HttpError(409, 'REFERENCE_ALREADY_EXISTS', `La référence ${number} existe déjà.`);
  const r: R = { id: next(), number, clientId: Number(b.clientId), source: 'MANUAL', status: 'OPEN', notes: b.notes || null, createdAt: nowIso() };
  S.refs.push(r);
  audit('Reference', r.id, 'CREATE', `Référence ${number} créée.`);
  return refDto(r);
});
on('PUT', '/api/references/:id', ([id], _q, b) => {
  const r = S.refs.find((x) => x.id === Number(id) && !x.deleted);
  if (!r) throw notFound("La référence n'existe pas.");
  const number = String(b.number).trim().toUpperCase();
  if (number !== r.number && S.refs.some((x) => x.number === number)) throw new HttpError(409, 'REFERENCE_ALREADY_EXISTS', `La référence ${number} existe déjà.`);
  Object.assign(r, { number, clientId: Number(b.clientId), notes: b.notes || null, ...(b.status ? { status: b.status } : {}) });
  audit('Reference', r.id, 'UPDATE', `Référence ${number} modifiée.`);
  return refDto(r);
});
on('DELETE', '/api/references/:id', ([id]) => {
  const r = S.refs.find((x) => x.id === Number(id) && !x.deleted);
  if (!r) throw notFound("La référence n'existe pas.");
  if (S.missions.some((m) => m.referenceId === r.id && !m.deleted)) throw rule('REFERENCE_IN_USE', 'Impossible de supprimer une référence liée à une mission.');
  r.deleted = true; r.status = 'CANCELLED';
  audit('Reference', r.id, 'DELETE', `Référence ${r.number} supprimée (suppression logique).`);
  return null;
});
on('POST', '/api/references/import', async (_p, q, form: FormData) => {
  const file = form.get('file') as File;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'csv') throw invalid('file', 'Dans la démo, seuls les fichiers CSV sont analysés (Excel est pris en charge par la vraie API).');
  const text = (await file.text()).replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);
  const delim = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const norm = (h: string) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const header = lines[0].split(delim).map(norm);
  const ni = header.findIndex((h) => ['reference', 'ref', 'numero'].includes(h));
  const ci = header.findIndex((h) => ['client', 'code client', 'nom client'].includes(h));
  const oi = header.findIndex((h) => ['notes', 'note', 'commentaire'].includes(h));
  if (ni < 0 || ci < 0) throw new HttpError(400, 'IMPORT_MISSING_COLUMNS', 'Colonnes obligatoires manquantes : « Référence » et « Client ».');
  const errors: { line: number; field: string; message: string; value?: string }[] = [];
  const valid: { line: number; number: string; clientCode: string; clientName: string; notes?: string; clientId: number }[] = [];
  const seen = new Set<string>();
  let total = 0;
  lines.slice(1).forEach((l, i) => {
    if (!l.trim()) return;
    total++;
    const cells = l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
    const line = i + 2;
    const number = (cells[ni] ?? '').toUpperCase();
    const ck = cells[ci] ?? '';
    const before = errors.length;
    if (!number) errors.push({ line, field: 'Référence', message: 'Référence obligatoire' });
    else if (S.refs.some((r) => r.number === number)) errors.push({ line, field: 'Référence', message: 'Référence déjà existante', value: number });
    else if (seen.has(number)) errors.push({ line, field: 'Référence', message: 'Référence en double dans le fichier', value: number });
    seen.add(number);
    const c = S.clients.find((x) => x.isActive && (x.code.toLowerCase() === ck.toLowerCase() || x.name.toLowerCase() === ck.toLowerCase()));
    if (!ck) errors.push({ line, field: 'Client', message: 'Client obligatoire' });
    else if (!c) errors.push({ line, field: 'Client', message: 'Client introuvable', value: ck });
    if (errors.length === before && c) valid.push({ line, number, clientCode: c.code, clientName: c.name, notes: oi >= 0 ? cells[oi] : undefined, clientId: c.id });
  });
  const commit = q.get('commit') === 'true';
  if (commit) {
    valid.forEach((v) => S.refs.push({ id: next(), number: v.number, clientId: v.clientId, source: 'IMPORT', status: 'OPEN', notes: v.notes || null, createdAt: nowIso() }));
    audit('Reference', null, 'IMPORT', `Import « ${file.name} » : ${valid.length} référence(s) importée(s), ${total - valid.length} ligne(s) ignorée(s).`);
    notify('Import terminé', `${valid.length} référence(s) importée(s) depuis ${file.name}.`, 'SUCCESS');
  }
  return { fileName: file.name, totalRows: total, validRows: valid.length, errorRows: new Set(errors.map((e) => e.line)).size, errors, preview: valid.slice(0, 100), committed: commit, imported: commit ? valid.length : 0 };
});

const driversQuery = (q: Q) => {
  let ds = S.drivers;
  const s = q.get('search'); if (s) ds = ds.filter((d) => has(fullName(d), s) || has(d.phone, s) || has(d.licenseNumber, s) || has(d.email, s));
  if (q.get('isActive')) ds = ds.filter((d) => String(d.isActive) === q.get('isActive'));
  return sort(ds, q, { lastname: (d) => d.lastName, firstname: (d) => d.firstName, license: (d) => d.licenseExpiryDate, status: (d) => (d.isActive ? 1 : 0) }, 'lastname', false);
};
const driverDetail = (d: D) => ({
  driver: driverDto(d),
  currentMissions: missions().filter((m) => m.driverId === d.id && [...ACTIVE, 'ANOMALY'].includes(m.status)).map(missionItem),
  history: S.assigns.filter((a) => a.driverId === d.id).sort((a, b) => b.at.localeCompare(a.at)).map((a) => {
    const m = S.missions.find((x) => x.id === a.missionId)!;
    return { missionId: m.id, referenceNumber: ref(m.referenceId).number, clientName: client(m.clientId).name, assignedAt: a.at, status: a.status, endedAt: a.endedAt, missionStatusLabel: STATUS_LABEL[m.status] };
  }),
  completedMissions: missions().filter((m) => m.driverId === d.id && m.status === 'COMPLETED').length,
  totalAssignments: S.assigns.filter((a) => a.driverId === d.id).length,
});
const findDriver = (id: string) => { const d = S.drivers.find((x) => x.id === Number(id)); if (!d) throw notFound("Le chauffeur n'existe pas."); return d; };
on('GET', '/api/drivers', (_p, q) => page(driversQuery(q).map(driverDto), q));
on('GET', '/api/drivers/export', (_p, q) => csv(['Nom', 'Prénom', 'Téléphone', 'N° permis', 'Expiration permis', 'Statut'], driversQuery(q).map((d) => [d.lastName, d.firstName, d.phone, d.licenseNumber, d.licenseExpiryDate, d.isActive ? 'Actif' : 'Inactif']), 'chauffeurs'));
on('GET', '/api/drivers/:id', ([id]) => driverDetail(findDriver(id)));
const saveDriver = (b: Record<string, any>, d?: D) => {
  if (S.drivers.some((x) => x.licenseNumber === String(b.licenseNumber).toUpperCase() && x.id !== d?.id)) throw new HttpError(409, 'LICENSE_ALREADY_EXISTS', 'Ce numéro de permis est déjà enregistré.');
  const target = d ?? ({ id: next(), isActive: true } as D);
  Object.assign(target, { firstName: b.firstName, lastName: String(b.lastName).toUpperCase(), email: b.email || null, phone: b.phone, licenseNumber: String(b.licenseNumber).toUpperCase(), licenseExpiryDate: String(b.licenseExpiryDate).slice(0, 10), defaultVehicleId: b.defaultVehicleId ?? null });
  if (b.createAccount && !target.userId) {
    const u: U = { id: next(), username: (b.username || b.email).toLowerCase(), email: String(b.email).toLowerCase(), firstName: b.firstName, lastName: String(b.lastName).toUpperCase(), phone: b.phone, role: 'DRIVER', isActive: true, mustChangePassword: true, createdAt: nowIso(), password: b.password };
    S.users.push(u);
    target.userId = u.id;
  }
  if (!d) S.drivers.push(target);
  audit('Driver', target.id, d ? 'UPDATE' : 'CREATE', `Chauffeur ${fullName(target)} ${d ? 'modifié' : 'créé'}.`);
  return driverDetail(target);
};
on('POST', '/api/drivers', (_p, _q, b) => saveDriver(b));
on('PUT', '/api/drivers/:id', ([id], _q, b) => saveDriver(b, findDriver(id)));
on('PATCH', '/api/drivers/:id/status', ([id], _q, b) => {
  const d = findDriver(id);
  if (!b.isActive) {
    const n = missions().filter((m) => m.driverId === d.id && ACTIVE.includes(m.status)).length;
    if (n) throw rule('DRIVER_HAS_ACTIVE_MISSIONS', `${fullName(d)} a ${n} mission(s) en cours. Réaffectez-les avant de le désactiver.`);
  }
  d.isActive = b.isActive;
  const u = user(d.userId); if (u) u.isActive = b.isActive;
  audit('Driver', d.id, 'UPDATE', `Chauffeur ${fullName(d)} ${b.isActive ? 'activé' : 'désactivé'}.`);
  return driverDetail(d);
});

const findClient = (id: string) => { const c = S.clients.find((x) => x.id === Number(id)); if (!c) throw notFound("Le client n'existe pas."); return c; };
const clientDetail = (c: C) => {
  const ms = missions().filter((m) => m.clientId === c.id);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  return {
    client: clientDto(c),
    references: S.refs.filter((r) => r.clientId === c.id && !r.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20).map(refDto),
    missions: [...ms].sort((a, b) => b.plannedDate.localeCompare(a.plannedDate)).slice(0, 20).map(missionItem),
    missionsByStatus: ORDER.map((code) => ({ code, label: STATUS_LABEL[code], count: ms.filter((m) => m.status === code).length })).filter((x) => x.count),
    completedThisMonth: S.hist.filter((h) => h.to === 'COMPLETED' && ms.some((m) => m.id === h.missionId) && new Date(h.at) >= monthStart).length,
  };
};
on('GET', '/api/clients', (_p, q) => {
  let cs = S.clients;
  const s = q.get('search'); if (s) cs = cs.filter((c) => has(c.name, s) || has(c.code, s) || has(c.city, s));
  if (q.get('isActive')) cs = cs.filter((c) => String(c.isActive) === q.get('isActive'));
  return page(sort(cs, q, { name: (c) => c.name, code: (c) => c.code, city: (c) => c.city, country: (c) => c.country }, 'name', false).map(clientDto), q);
});
on('GET', '/api/clients/:id', ([id]) => clientDetail(findClient(id)));
const saveClient = (b: Record<string, any>, c?: C) => {
  const code = String(b.code).trim().toUpperCase();
  if (S.clients.some((x) => x.code === code && x.id !== c?.id)) throw new HttpError(409, 'CLIENT_CODE_EXISTS', `Le code client ${code} existe déjà.`);
  const target = c ?? ({ id: next(), isActive: true } as C);
  Object.assign(target, { code, name: b.name, address: b.address || null, city: b.city || null, postalCode: b.postalCode || null, country: b.country || 'France', phone: b.phone || null, email: b.email || null });
  if (!c) S.clients.push(target);
  audit('Client', target.id, c ? 'UPDATE' : 'CREATE', `Client ${target.name} ${c ? 'modifié' : 'créé'}.`);
  return clientDetail(target);
};
on('POST', '/api/clients', (_p, _q, b) => saveClient(b));
on('PUT', '/api/clients/:id', ([id], _q, b) => saveClient(b, findClient(id)));
on('PATCH', '/api/clients/:id/status', ([id], _q, b) => { const c = findClient(id); c.isActive = b.isActive; audit('Client', c.id, 'UPDATE', `Client ${c.name} ${b.isActive ? 'activé' : 'désactivé'}.`); return clientDetail(c); });

const findVehicle = (id: string) => { const v = S.vehicles.find((x) => x.id === Number(id)); if (!v) throw notFound("Le véhicule n'existe pas."); return v; };
const vehicleDetail = (v: V) => ({
  vehicle: vehicleDto(v),
  history: S.assigns.filter((a) => a.vehicleId === v.id).sort((a, b) => b.at.localeCompare(a.at)).map((a) => {
    const m = S.missions.find((x) => x.id === a.missionId)!;
    return { missionId: m.id, referenceNumber: ref(m.referenceId).number, clientName: client(m.clientId).name, assignedAt: a.at, status: a.status, endedAt: a.endedAt, missionStatusLabel: STATUS_LABEL[m.status] };
  }),
  totalMissions: new Set(S.assigns.filter((a) => a.vehicleId === v.id).map((a) => a.missionId)).size,
});
on('GET', '/api/vehicles', (_p, q) => {
  let vs = S.vehicles;
  const s = q.get('search'); if (s) vs = vs.filter((v) => has(v.plateNumber, s) || has(v.brand, s) || has(v.model, s) || has(v.type, s));
  if (q.get('status')) vs = vs.filter((v) => v.status === q.get('status'));
  return page(sort(vs, q, { plate: (v) => v.plateNumber, brand: (v) => v.brand, type: (v) => v.type, capacity: (v) => v.capacityKg, status: (v) => v.status }, 'plate', false).map(vehicleDto), q);
});
on('GET', '/api/vehicles/:id', ([id]) => vehicleDetail(findVehicle(id)));
const saveVehicle = (b: Record<string, any>, v?: V) => {
  const plate = String(b.plateNumber).trim().toUpperCase().replace(/ /g, '-');
  if (S.vehicles.some((x) => x.plateNumber === plate && x.id !== v?.id)) throw new HttpError(409, 'VEHICLE_PLATE_EXISTS', `Le véhicule ${plate} existe déjà.`);
  const target = v ?? ({ id: next(), isActive: true, status: 'AVAILABLE' } as V);
  Object.assign(target, { plateNumber: plate, brand: b.brand, model: b.model, type: b.type, capacityKg: b.capacityKg, capacityM3: b.capacityM3 ?? null, ...(b.status ? { status: b.status } : {}) });
  if (!v) S.vehicles.push(target);
  audit('Vehicle', target.id, v ? 'UPDATE' : 'CREATE', `Véhicule ${plate} ${v ? 'modifié' : 'créé'}.`);
  return vehicleDetail(target);
};
on('POST', '/api/vehicles', (_p, _q, b) => saveVehicle(b));
on('PUT', '/api/vehicles/:id', ([id], _q, b) => saveVehicle(b, findVehicle(id)));
on('PATCH', '/api/vehicles/:id/status', ([id], _q, b) => { const v = findVehicle(id); v.status = b.status; v.isActive = b.status !== 'OUT_OF_SERVICE'; audit('Vehicle', v.id, 'UPDATE', `Véhicule ${v.plateNumber} : statut ${b.status}.`); return vehicleDetail(v); });

const historyQuery = (q: Q) => {
  let hs = S.audit;
  const u = num(q, 'userId'); if (u) hs = hs.filter((h) => h.userId === u);
  if (q.get('action')) hs = hs.filter((h) => h.action === q.get('action'));
  if (q.get('entityName')) hs = hs.filter((h) => h.entityName === q.get('entityName'));
  const r = q.get('reference'); if (r) hs = hs.filter((h) => has(h.description, r));
  const s = q.get('search'); if (s) hs = hs.filter((h) => has(h.description, s) || has(h.action, s) || has(h.entityName, s));
  if (q.get('dateFrom')) { const f = new Date(q.get('dateFrom')!).setHours(0, 0, 0, 0); hs = hs.filter((h) => new Date(h.at).getTime() >= f); }
  if (q.get('dateTo')) { const t = new Date(q.get('dateTo')!).setHours(0, 0, 0, 0) + DAY; hs = hs.filter((h) => new Date(h.at).getTime() < t); }
  return [...hs].sort((a, b) => b.at.localeCompare(a.at));
};
on('GET', '/api/history', (_p, q) => page(historyQuery(q).map((h) => ({ id: h.id, createdAt: h.at, userId: h.userId, userName: fullName(user(h.userId)), entityName: h.entityName, entityId: h.entityId, action: h.action, description: h.description, oldValue: h.oldValue, newValue: h.newValue, ipAddress: '127.0.0.1' })), q));
on('GET', '/api/history/filters', () => ({
  users: S.users.map((u) => ({ id: u.id, name: fullName(u)! })),
  actions: [...new Set(S.audit.map((a) => a.action))].sort(), entities: [...new Set(S.audit.map((a) => a.entityName))].sort(),
}));
on('GET', '/api/history/export', (_p, q) => csv(['Date', 'Utilisateur', 'Entité', 'Action', 'Description'], historyQuery(q).map((h) => [fmt(h.at), fullName(user(h.userId)), h.entityName, h.action, h.description]), 'historique'));

on('GET', '/api/notifications', (_p, q) => page(S.notifs.filter((n) => q.get('unreadOnly') !== 'true' || !n.isRead).sort((a, b) => b.at.localeCompare(a.at))
  .map((n) => ({ id: n.id, title: n.title, message: n.message, type: n.type, entityName: n.entityName, entityId: n.entityId, isRead: n.isRead, createdAt: n.at })), q));
on('GET', '/api/notifications/unread-count', () => S.notifs.filter((n) => !n.isRead).length);
on('POST', '/api/notifications/:id/read', ([id]) => { const n = S.notifs.find((x) => x.id === Number(id)); if (n) n.isRead = true; return null; });
on('POST', '/api/notifications/read-all', () => { const unread = S.notifs.filter((n) => !n.isRead); unread.forEach((n) => (n.isRead = true)); return unread.length; });

const findUser = (id: string) => { const u = S.users.find((x) => x.id === Number(id)); if (!u) throw notFound("L'utilisateur n'existe pas."); return u; };
on('GET', '/api/users', (_p, q) => {
  let us = S.users;
  const s = q.get('search'); if (s) us = us.filter((u) => has(fullName(u), s) || has(u.email, s) || has(u.username, s));
  if (q.get('role')) us = us.filter((u) => u.role === q.get('role'));
  return page(sort(us, q, { name: (u) => u.lastName, email: (u) => u.email, role: (u) => u.role, lastlogin: (u) => u.lastLoginAt }, 'name', false).map(userDto), q);
});
on('POST', '/api/users', (_p, _q, b) => {
  if (S.users.some((u) => u.username === String(b.username).toLowerCase())) throw new HttpError(409, 'USERNAME_EXISTS', 'Cet identifiant est déjà utilisé.');
  const u: U = { id: next(), username: String(b.username).toLowerCase(), email: String(b.email).toLowerCase(), firstName: b.firstName, lastName: String(b.lastName).toUpperCase(), phone: b.phone, role: b.role, isActive: true, mustChangePassword: true, createdAt: nowIso(), password: b.password };
  S.users.push(u);
  audit('User', u.id, 'CREATE', `Utilisateur ${fullName(u)} (${u.role}) créé.`);
  return userDto(u);
});
on('PUT', '/api/users/:id', ([id], _q, b) => { const u = findUser(id); Object.assign(u, { email: b.email, firstName: b.firstName, lastName: String(b.lastName).toUpperCase(), phone: b.phone, role: b.role }); audit('User', u.id, 'UPDATE', `Utilisateur ${fullName(u)} modifié.`); return userDto(u); });
on('PATCH', '/api/users/:id/status', ([id], _q, b) => {
  const u = findUser(id);
  if (u.id === ME().id && !b.isActive) throw rule('CANNOT_DISABLE_SELF', 'Vous ne pouvez pas désactiver votre propre compte.');
  u.isActive = b.isActive;
  audit('User', u.id, 'UPDATE', `Utilisateur ${fullName(u)} ${b.isActive ? 'activé' : 'désactivé'}.`);
  return userDto(u);
});
on('POST', '/api/users/:id/reset-password', ([id]) => {
  const u = findUser(id);
  const temp = 'Demo-' + Math.random().toString(36).slice(2, 8).toUpperCase() + '7!';
  u.password = temp; u.mustChangePassword = true;
  audit('User', u.id, 'UPDATE', `Mot de passe de ${fullName(u)} réinitialisé.`);
  return { temporaryPassword: temp };
});

on('GET', '/api/search', (_p, q) => {
  const s = (q.get('q') ?? '').trim();
  if (s.length < 2) return [];
  const out: unknown[] = [];
  missions().filter((m) => has(ref(m.referenceId).number, s) || has(client(m.clientId).name, s) || has(fullName(driver(m.driverId)), s)).slice(0, 6)
    .forEach((m) => out.push({ type: 'mission', id: m.id, title: ref(m.referenceId).number, subtitle: client(m.clientId).name, meta: fullName(driver(m.driverId)) ?? 'Non affectée', statusCode: m.status, statusLabel: STATUS_LABEL[m.status], missionId: m.id }));
  S.refs.filter((r) => !r.deleted && has(r.number, s) && !S.missions.some((m) => m.referenceId === r.id && !m.deleted)).slice(0, 4)
    .forEach((r) => out.push({ type: 'reference', id: r.id, title: r.number, subtitle: client(r.clientId).name, meta: 'Sans mission' }));
  S.clients.filter((c) => has(c.name, s) || has(c.code, s)).slice(0, 4).forEach((c) => out.push({ type: 'client', id: c.id, title: c.name, subtitle: c.code, meta: c.city }));
  S.drivers.filter((d) => has(fullName(d), s) || has(d.phone, s)).slice(0, 4).forEach((d) => out.push({ type: 'driver', id: d.id, title: fullName(d), subtitle: d.phone, meta: d.isActive ? 'Actif' : 'Inactif' }));
  return out;
});

on('GET', '/api/settings', () => S.params);
on('PUT', '/api/settings', (_p, _q, b: { key: string; value: string }[]) => {
  b.forEach((u) => { const p = S.params.find((x) => x.key === u.key); if (p && p.value !== u.value) { audit('SystemParameter', p.key, 'UPDATE', `Paramètre ${p.key} modifié.`); p.value = u.value; p.updatedAt = nowIso(); } });
  return S.params;
});

// ------------------------------------------------------------------ Installation

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Remplace fetch pour les URL /api et /health par l'API simulée. */
export function installDemoApi(apiBase = '') {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    const path = url.pathname.replace(apiBase, '').replace(/^.*?(\/api\/|\/health$)/, '$1');
    if (!path.startsWith('/api/') && path !== '/health') return realFetch(input, init);

    await new Promise((r) => setTimeout(r, 120 + Math.random() * 180)); // latence réseau réaliste
    if (path === '/health') {
      return json(200, { status: 'Healthy', components: {
        api: { status: 'Healthy', description: 'Version de démonstration (API simulée dans le navigateur).' },
        sqlserver: { status: 'Healthy', description: 'Données fictives stockées dans votre navigateur.' },
        storage: { status: 'Healthy', description: 'Documents conservés le temps de la session.' },
      } });
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    const route = routes.find(([m, re]) => m === method && re.test(path));
    if (!route) return json(404, { success: false, message: 'Fonction non disponible dans la démo.', code: 'NOT_FOUND' });
    const params = path.match(route[1])!.slice(1);
    let body: unknown;
    if (init?.body instanceof FormData) body = init.body;
    else if (typeof init?.body === 'string') { try { body = JSON.parse(init.body); } catch { body = undefined; } }

    try {
      const result = await route[2](params, url.searchParams, body);
      save();
      if (result instanceof Response) return result;
      return json(method === 'POST' && path === '/api/missions' ? 201 : 200, { success: true, data: result });
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { success: false, message: e.message, code: e.code, errors: e.errors });
      console.error('[démo]', e);
      return json(500, { success: false, message: 'Une erreur est survenue.', code: 'INTERNAL_ERROR' });
    }
  };
}
