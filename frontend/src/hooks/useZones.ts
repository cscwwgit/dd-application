import { useCallback, useEffect, useState } from 'react';
import { createZone, deleteZone, fetchZones } from '../api/client';
import type { RestrictedZone } from '../api/types';

export function useZones() {
  const [zones, setZones] = useState<RestrictedZone[]>([]);

  useEffect(() => {
    fetchZones().then(setZones).catch(console.error);
  }, []);

  const addZone = useCallback(async (name: string | null, geojson: object): Promise<RestrictedZone> => {
    const zone = await createZone(name, geojson);
    setZones((prev) => [...prev, zone]);
    return zone;
  }, []);

  const removeZone = useCallback(async (zoneId: string) => {
    await deleteZone(zoneId);
    setZones((prev) => prev.filter((z) => z.id !== zoneId));
  }, []);

  return { zones, addZone, removeZone };
}
