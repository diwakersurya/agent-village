import { useEffect, useState } from 'react';
import { useAgents } from '../store/agents';
import styles from './Toast.module.css';

/** The latest toast, for 2.5 s. */
export function Toast() {
  const toast = useAgents((s) => s.toast);
  const [shown, setShown] = useState<number>();
  useEffect(() => {
    if (!toast) return;
    setShown(toast.id);
    const t = setTimeout(() => setShown(undefined), 2500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || shown !== toast.id) return null;
  return <div key={toast.id} className={styles.toast} role="status">{toast.text}</div>;
}
