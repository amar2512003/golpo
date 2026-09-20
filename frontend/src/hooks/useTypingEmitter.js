import { useCallback, useEffect, useRef } from "react";
import { useAuthStore } from "../store/useAuthStore";

// Tell the other side we've stopped after this long without a keystroke.
const STOP_AFTER_IDLE_MS = 2500;
// While typing continues, re-announce this often. Must stay comfortably
// below the receiver's expiry (5s) so the indicator doesn't flicker.
const REFRESH_MS = 3000;

function emitTyping(target, isTyping) {
  const socket = useAuthStore.getState().socket;
  if (!socket?.connected || !target) return;

  socket.emit(
    "typing",
    target.isGroup
      ? { groupId: target.id, isTyping }
      : { toUserId: target.id, isTyping },
  );
}

/**
 * Returns `notifyTyping` (call on every keystroke) and `stopTyping` (call on
 * send / clear). Emits at most one "typing" event per REFRESH_MS, sends
 * "stopped" after a short idle, and stops automatically when the open chat
 * changes or the composer unmounts — always to the chat it started in.
 */
export function useTypingEmitter({ conversationId, isGroup }) {
  const idleTimerRef = useRef(null);
  const lastEmitAtRef = useRef(0);
  const activeTargetRef = useRef(null);

  const stopTyping = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;

    if (!activeTargetRef.current) return;

    emitTyping(activeTargetRef.current, false);
    activeTargetRef.current = null;
    lastEmitAtRef.current = 0;
  }, []);

  const notifyTyping = useCallback(() => {
    if (!conversationId) return;

    const now = Date.now();
    if (!activeTargetRef.current || now - lastEmitAtRef.current >= REFRESH_MS) {
      activeTargetRef.current = { id: conversationId, isGroup };
      lastEmitAtRef.current = now;
      emitTyping(activeTargetRef.current, true);
    }

    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(stopTyping, STOP_AFTER_IDLE_MS);
  }, [conversationId, isGroup, stopTyping]);

  // Switching chats (or leaving) ends typing in the chat we were in.
  useEffect(() => stopTyping, [conversationId, stopTyping]);

  return { notifyTyping, stopTyping };
}
