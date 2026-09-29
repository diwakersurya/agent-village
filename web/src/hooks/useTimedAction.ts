import { useCallback, useEffect, useRef, useState } from 'react';

/** `active` is true for `secs` after `start()`; starting again while active is ignored. `onDone` runs at the end. */
export function useTimedAction(secs: number, onDone?: () => void): [boolean, () => boolean] {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => () => clearTimeout(timer.current), []);
  const start = useCallback(() => {
    if (timer.current) return false;
    setActive(true);
    timer.current = setTimeout(() => { timer.current = undefined; setActive(false); done.current?.(); }, secs * 1000);
    return true;
  }, [secs]);
  return [active, start];
}
