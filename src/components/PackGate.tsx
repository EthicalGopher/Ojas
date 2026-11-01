import React, { useEffect, useRef, useState } from 'react';
import { fetchPack, showPackConfirmation, usePack } from '../utils/assetPacks';
import { PackName, gate, isStalled } from '../utils/assetPacksLogic';
import { PackDownloadNotice } from './PackDownloadNotice';

const STALL_MS = 60_000;

interface Props {
  pack: PackName;
  title: string;
  children: React.ReactNode;
  /** Lets the user leave while the pack is not ready (a duel's exit, a camera screen's close). */
  onClose?: () => void;
}

/**
 * Renders [children] only while the pack is ready. The moment it stops being ready (an app update that
 * delivers new packs, an evicted pack) the children unmount, so a page that loaded a file once never keeps
 * running against a pack that is gone. A hook lives here so screens never need an early return.
 */
export function PackGate({ pack, title, children, onClose }: Props) {
  const state = usePack(pack);

  // When the status, downloaded bytes or progress last changed (for the "Check again" escape).
  const [changedAt, setChangedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const last = useRef({ status: state.status, downloadedBytes: state.downloadedBytes, progress: state.progress });

  useEffect(() => {
    const l = last.current;
    if (l.status !== state.status || l.downloadedBytes !== state.downloadedBytes || l.progress !== state.progress) {
      last.current = { status: state.status, downloadedBytes: state.downloadedBytes, progress: state.progress };
      setChangedAt(Date.now());
    }
  }, [state.status, state.downloadedBytes, state.progress]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  if (gate(state) === 'ready') return <>{children}</>;

  const stalled = isStalled(
    { status: state.status, downloadedBytes: state.downloadedBytes, progress: state.progress, at: changedAt },
    now,
    STALL_MS,
  );
  const retry = () => {
    fetchPack(pack).catch(() => {});
  };

  return (
    <PackDownloadNotice
      pack={pack}
      state={state}
      title={title}
      stalled={stalled}
      onRetry={retry}
      onCheckAgain={retry}
      onConfirm={() => {
        showPackConfirmation().catch(() => {});
      }}
      onClose={onClose}
    />
  );
}
