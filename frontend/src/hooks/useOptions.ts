import { useEffect, useState } from 'react';
import { clientsApi, driversApi, missionsApi, vehiclesApi } from '@/api/endpoints';
import type { ClientDto, DriverDto, StatusDto, VehicleDto } from '@/types';

/** Listes de référence (clients, chauffeurs, véhicules, statuts) pour les filtres et formulaires. */
const cache: { clients?: ClientDto[]; drivers?: DriverDto[]; vehicles?: VehicleDto[]; statuses?: StatusDto[] } = {};

export function invalidateOptions(key?: keyof typeof cache) {
  if (key) delete cache[key];
  else (Object.keys(cache) as (keyof typeof cache)[]).forEach((k) => delete cache[k]);
}

export function useClientOptions(activeOnly = false) {
  const [items, setItems] = useState<ClientDto[]>(cache.clients ?? []);
  useEffect(() => {
    if (cache.clients) return;
    clientsApi.list({ pageSize: 200, sortBy: 'name', sortDir: 'asc' }).then((r) => { cache.clients = r.items; setItems(r.items); }).catch(() => undefined);
  }, []);
  return activeOnly ? items.filter((c) => c.isActive) : items;
}

export function useDriverOptions(activeOnly = false) {
  const [items, setItems] = useState<DriverDto[]>(cache.drivers ?? []);
  useEffect(() => {
    if (cache.drivers) return;
    driversApi.list({ pageSize: 200, sortBy: 'lastName', sortDir: 'asc' }).then((r) => { cache.drivers = r.items; setItems(r.items); }).catch(() => undefined);
  }, []);
  return activeOnly ? items.filter((d) => d.isActive) : items;
}

export function useVehicleOptions() {
  const [items, setItems] = useState<VehicleDto[]>(cache.vehicles ?? []);
  useEffect(() => {
    if (cache.vehicles) return;
    vehiclesApi.list({ pageSize: 200, sortBy: 'plate', sortDir: 'asc' }).then((r) => { cache.vehicles = r.items; setItems(r.items); }).catch(() => undefined);
  }, []);
  return items;
}

export function useStatusOptions() {
  const [items, setItems] = useState<StatusDto[]>(cache.statuses ?? []);
  useEffect(() => {
    if (cache.statuses) return;
    missionsApi.statuses().then((s) => { cache.statuses = s; setItems(s); }).catch(() => undefined);
  }, []);
  return items;
}
