import { useCallback, useState } from 'react';

export type EntityType = 'asset' | 'drone';

export interface SelectedEntity {
  type: EntityType;
  id: string;
}

export function useSelectedEntity() {
  const [selected, setSelected] = useState<SelectedEntity | null>(null);

  const selectEntity = useCallback((type: EntityType, id: string) => {
    setSelected((prev) => {
      if (prev?.type === type && prev?.id === id) return null;
      return { type, id };
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(null), []);

  return { selected, selectEntity, clearSelection };
}
