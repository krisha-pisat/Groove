import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (!roomCode) return;

    async function fetchState() {
      const { data } = await supabase
        .from("room_music_state")
        .select("*")
        .eq("room_code", roomCode)
        .single();
      if (data) setState({ ...data, queue: data.queue || [], receivedAt: Date.now() });
    }

    fetchState();

    const channel = supabase
      .channel(`room-music-${roomCode}`)
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
    // Use only THIS device's own clock — no cross-device clock comparison
    const elapsed = (Date.now() - state.receivedAt) / 1000;
    const currentPosition = parseFloat(state.playback_position || 0);
    return state.is_playing ? currentPosition + elapsed : currentPosition;
  };

  return { ...state, getSyncedPosition };
}
