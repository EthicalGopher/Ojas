import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '../store/userStore';
import { AvatarModel, BUNDLED_AVATARS, fetchAvatarCatalog, lookOf } from '../utils/avatarShopService';

/** The signed-in player's character and worn items (bundled default for guests or before the catalog loads). */
export function useEquippedLook(): { catalog: AvatarModel[]; model: AvatarModel; items: AvatarModel[]; ready: boolean } {
  const profile = useUserStore((s) => s.profile);
  const savedLook = useUserStore((s) => s.savedLook);
  const [catalog, setCatalog] = useState<AvatarModel[]>(BUNDLED_AVATARS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAvatarCatalog()
      .then((list) => {
        if (alive) setCatalog(list);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const look = useMemo(() => lookOf(catalog, profile ?? savedLook), [catalog, profile, savedLook]);
  return { catalog, model: look.model, items: look.items, ready };
}
