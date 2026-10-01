import type { AgentState } from '../../../daemon/src/types';

/** Display name for an agent: its project, else its kind. */
export const agentName = (a: Pick<AgentState, 'project' | 'kind'>) => a.project || a.kind;

/** True when a key event target is somewhere the user types or a focusable control that handles its own keys. */
export const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el?.isContentEditable;
};

/** True when the target is a focused control (button/link/tab/option) whose Enter/Space/digits belong to it. */
export const isControlTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || (typeof document !== 'undefined' && el === document.body)) return false;
  return el.tagName === 'BUTTON' || el.tagName === 'A' || !!el.closest?.('[role=tab],[role=option],[role=menuitem],button,a');
};
