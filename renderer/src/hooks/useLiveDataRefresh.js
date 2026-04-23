import { useEffect, useRef } from 'react';

function invokeLatest(ref, payload) {
  const fn = ref.current;
  if (typeof fn === 'function') {
    return fn(payload);
  }
  return undefined;
}

export default function useLiveDataRefresh({
  load,
  isActive = true,
  dataTypes = [],
  pollMs = 0,
  runOnMount = true,
  runOnActive = true,
  runOnDataChange = true,
  dataChangeActiveOnly = true
}) {
  const loadRef = useRef(load);
  const wasActiveRef = useRef(isActive);
  const typeKey = (Array.isArray(dataTypes) ? dataTypes : []).join('|');

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!runOnMount) return undefined;
    invokeLatest(loadRef, { source: 'mount' });
    return undefined;
  }, [runOnMount]);

  useEffect(() => {
    if (runOnActive && isActive && !wasActiveRef.current) {
      invokeLatest(loadRef, { source: 'active' });
    }

    wasActiveRef.current = isActive;
  }, [isActive, runOnActive]);

  useEffect(() => {
    if (!runOnDataChange || !window.electron?.onDataChanged) return undefined;
    const typeList = typeKey ? typeKey.split('|') : [];

    const unsubscribe = window.electron.onDataChanged((data) => {
      const matchesType = typeList.length === 0 || typeList.includes(data?.type);
      if (!matchesType) return;
      if (dataChangeActiveOnly && !isActive) return;
      invokeLatest(loadRef, { source: 'data-change', silent: true, data });
    });

    return unsubscribe;
  }, [dataChangeActiveOnly, isActive, runOnDataChange, typeKey]);

  useEffect(() => {
    if (!pollMs || pollMs <= 0 || !isActive) return undefined;

    const timer = setInterval(() => {
      invokeLatest(loadRef, { source: 'poll', silent: true });
    }, pollMs);

    return () => clearInterval(timer);
  }, [isActive, pollMs]);
}
