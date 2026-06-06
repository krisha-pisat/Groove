import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function useRoomMusicState(roomCode) {
  const [state, setState] = useState({
    current_song_data: null,
    queue: [],
    is_playing: false,
    playback_position: 0,
    updated_at: null,
    receivedAt: null,   // local timestamp when THIS device received the state
  });

  // Each hook instance gets a unique channel name so multiple callers
  // (Room.jsx + KaraokePanel) don't share/clobber the same Supabase channel.
  const instanceId = useRef(Math.random().toString(36).slice(2, 8));

  useEffect(() => {
    if (!roomCode) return;

    async function fetchState() {
      const { data } = await supabase
        .from("room_music_state")
        .select("*")
        .eq("room_code", roomCode)
        .single();
      if (data) setState({
        ...data,
        queue: data.queue || [],
        // Use the server's updated_at as the time reference so elapsedSinceReceipt
        // correctly reflects how long the song has been playing since the last state write
        receivedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
      });
    }

    fetchState();

    const channel = supabase
      .channel(`room-music-${roomCode}-${instanceId.current}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "room_music_state",
        filter: `room_code=eq.${roomCode}`
      }, (payload) => {
        // Record the exact local time this device received the update
        setState({ ...payload.new, queue: payload.new.queue || [], receivedAt: Date.now() });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [roomCode]);

  const getSyncedPosition = () => {
    if (!state.receivedAt) return parseFloat(state.playback_position || 0);
    const currentPosition = parseFloat(state.playback_position || 0);
    if (!state.is_playing) return currentPosition;

    // How long since THIS device received the update (same-device clock, no skew)
    const elapsedSinceReceipt = (Date.now() - state.receivedAt) / 1000;

    // Estimate how long the message took to arrive: updated_at (writer's clock) → receivedAt (our clock)
    // Capped 0–2s to ignore wild clock skew
    const networkLatency = state.updated_at
      ? Math.min(Math.max(0, (state.receivedAt - new Date(state.updated_at).getTime()) / 1000), 2)
      : 0;

    // Total: position at write time + delivery lag + time since we got it
    return currentPosition + networkLatency + elapsedSinceReceipt;
  };

  return { ...state, getSyncedPosition };
}
