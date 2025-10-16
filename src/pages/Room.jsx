import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Music,
  Users,
  MessageCircle,
  Gamepad2,
  Mic,
  Heart,
  Share2,
  X,
  Volume2
} from "lucide-react";

import MusicPlayer from "@/components/MusicPlayer";
import ChatPanel from "@/components/ChatPanel";
import GamePanel from "@/components/GamePanel";
import KaraokePanel from "@/components/KaraokePanel";
import ParticipantsList from "@/components/ParticipantsList";
import { useToast, toast } from "@/components/ui/use-toast";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from "@/components/ui/select";
import useRoomMusicState from "@/hooks/useRoomState";

const Room = () => {
  const { roomCode } = useParams();
  const location = useLocation();
  const userName = location.state?.userName || "You";
  const roomName = location.state?.roomName || "Chill Vibes Room";
  const navigate = useNavigate();
  const { toast } = useToast();

  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [masterVolume, setMasterVolume] = useState(75);
  const [audioDevices, setAudioDevices] = useState([{ deviceId: "default", label: "Default" }]);
  const [selectedDevice, setSelectedDevice] = useState("default");
  const [audioQuality, setAudioQuality] = useState("high");

  const [participants, setParticipants] = useState([]);
  const [isHost, setIsHost] = useState(false); // Still needed for initial music state creation
  const [activeTab, setActiveTab] = useState("music");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const {
    current_song_data: syncedCurrentSong,
    queue: syncedQueue,
    is_playing: syncedIsPlaying,
    playback_position: syncedPlaybackPosition,
    getSyncedPosition,
  } = useRoomMusicState(roomCode);

  const [isShuffling, setIsShuffling] = useState(false);

  const [playerVolume, setPlayerVolume] = useState([75]);
  useEffect(() => {
    setPlayerVolume([masterVolume]);
  }, [masterVolume]);

  // Function to update music state in Supabase (NO LONGER HOST-RESTRICTED HERE)
  const updateMusicState = useCallback(async (updates) => {
    try {
      const { data, error } = await supabase
        .from("room_music_state")
        .upsert(
          {
            room_code: roomCode,
            ...updates,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "room_code" }
        )
        .select();

      if (error) {
        console.error("Error updating room music state:", error.message);
        toast({
          title: "Sync Error",
          description: `Failed to sync music state: ${error.message}`,
          variant: "destructive",
        });
      } else {
        console.log("Music state synced successfully:", data);
      }
    } catch (err) {
      console.error("Unexpected error during music state update:", err);
      toast({
        title: "Sync Error",
        description: `Unexpected error during music state update: ${err.message}`,
        variant: "destructive",
      });
    }
  }, [roomCode, toast]);

  // Handlers for any user to update remote state
  const handlePlayerPlay = useCallback(() => {
    updateMusicState({ is_playing: true, playback_position: getSyncedPosition() });
  }, [updateMusicState, getSyncedPosition]);

  const handlePlayerPause = useCallback(() => {
    updateMusicState({ is_playing: false, playback_position: getSyncedPosition() });
  }, [updateMusicState, getSyncedPosition]);

  const handlePlayerSeek = useCallback((position) => {
    updateMusicState({ playback_position: position });
  }, [updateMusicState]);

  const handlePlayerSongChange = useCallback((song, newQueue) => {
    updateMusicState({
      current_song_data: song,
      queue: newQueue,
      is_playing: true,
      playback_position: 0,
    });
  }, [updateMusicState]);

  const handlePlayerQueueUpdate = useCallback((newQueue) => {
    updateMusicState({ queue: newQueue });
  }, [updateMusicState]);

  // Music search and queue management (ANY user can add)
  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await axios.get(`http://localhost:5000/search?query=${query}`);
      setSearchResults(res.data.results);
    } catch (err) {
      console.error("Search error:", err);
      toast({
        title: "Search Failed",
        description: "Could not fetch search results.",
        variant: "destructive",
      });
    }
  };

  const addToQueue = useCallback(async (song) => {
    const newQueue = syncedQueue ? [...syncedQueue, song] : [song];
    await updateMusicState({ queue: newQueue });

    if (!syncedCurrentSong || Object.keys(syncedCurrentSong).length === 0) {
      await updateMusicState({
        current_song_data: newQueue[0],
        queue: newQueue.slice(1),
        is_playing: true,
        playback_position: 0,
      });
    }

    setSearchQuery("");
    setSearchResults([]);
    toast({ title: "Song added to queue!" });
  }, [syncedQueue, syncedCurrentSong, updateMusicState, toast]);

  const removeFromQueue = useCallback(async (videoId) => {
    const newQueue = syncedQueue.filter((s) => s.videoId !== videoId);
    await updateMusicState({ queue: newQueue });
    if (syncedCurrentSong?.videoId === videoId) {
      if (newQueue.length > 0) {
        await updateMusicState({
          current_song_data: newQueue[0],
          queue: newQueue.slice(1),
          is_playing: syncedIsPlaying,
          playback_position: 0,
        });
      } else {
        await updateMusicState({
          current_song_data: {},
          queue: [],
          is_playing: false,
          playback_position: 0,
        });
      }
    }
    toast({ title: "Song removed from queue." });
  }, [syncedQueue, syncedCurrentSong, syncedIsPlaying, updateMusicState, toast]);

  const handleShareRoom = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Room link copied!" });
    } catch (err) {
      toast({ title: "Failed to copy link", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const handleLeaveRoom = async () => {
    try {
      console.log("handleLeaveRoom: Attempting to delete participant for user:", userName, "in room:", roomCode);
      const { error } = await supabase
        .from("participants")
        .delete()
        .eq("room_code", roomCode)
        .eq("user_name", userName);

      if (error) {
        console.error("handleLeaveRoom: Error removing participant:", error.message);
        toast({
            title: "Leave Room Error",
            description: `Failed to leave room: ${error.message}`,
            variant: "destructive",
        });
      } else {
          console.log("handleLeaveRoom: Participant removed successfully.");
      }
    } catch (err) {
      console.error("handleLeaveRoom: Unexpected error leaving room:", err);
      toast({
          title: "Leave Room Error",
          description: `Unexpected error: ${err.message}`,
          variant: "destructive",
      });
    }

    setLeaveDialogOpen(false);
    navigate("/");
    toast({
      title: "Left room",
      description: "You've successfully left the room",
      position: "bottom-left"
    });
  };

  useEffect(() => {
    if (!audioModalOpen) return;
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      setAudioDevices([
        { deviceId: "default", label: "Default" },
        ...outputs.map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Device ${d.deviceId.slice(-4)}`
        }))
      ]);
    });
  }, [audioModalOpen]);

  useEffect(() => {
    let participantsSubscription;

    const setupRoom = async () => {
      console.log("setupRoom: Starting room setup for user:", userName, "in room:", roomCode);

      const { data: existingRoom, error: roomError } = await supabase
        .from('rooms')
        .select('code')
        .eq('code', roomCode)
        .single();

      if (roomError && roomError.code === 'PGRST116') {
        console.warn(`setupRoom: Room ${roomCode} not found. Redirecting.`);
        toast({
          title: "Room Not Found",
          description: "This room does not exist or an error occurred.",
          variant: "destructive",
        });
        navigate("/");
        return;
      } else if (roomError) {
        console.error("setupRoom: Error fetching room:", roomError.message);
        toast({
            title: "Room Error",
            description: `Error fetching room: ${roomError.message}`,
            variant: "destructive",
        });
        navigate("/");
        return;
      }
      console.log("setupRoom: Room found:", existingRoom);


      // Check if current user is already a participant
      const { data: existingParticipant, error: checkParticipantError } = await supabase
        .from('participants')
        .select('id, user_name')
        .eq('room_code', roomCode)
        .eq('user_name', userName)
        .single();

      if (checkParticipantError && checkParticipantError.code !== 'PGRST116') {
          console.error("setupRoom: Error checking existing participant:", checkParticipantError.message);
          toast({
              title: "Join Error",
              description: `Failed to check participant: ${checkParticipantError.message}`,
              variant: "destructive",
          });
          navigate("/");
          return;
      }

      if (!existingParticipant) {
        console.log("setupRoom: Participant not found, inserting new participant.");
        const { data: insertedParticipant, error: insertError } = await supabase.from('participants').insert({
          room_code: roomCode,
          user_name: userName,
        }).select(); // Add .select() to get the inserted data, which includes 'id' and 'created_at'

        if (insertError) {
          console.error("setupRoom: Error inserting participant:", insertError.message);
          toast({
            title: "Join Error",
            description: `Failed to join room: ${insertError.message}`,
            variant: "destructive",
          });
          navigate("/");
          return;
        }
        console.log("setupRoom: Participant inserted successfully:", insertedParticipant);
      } else {
        console.log("setupRoom: Participant already exists:", existingParticipant);
      }

      // Fetch ALL participants to determine host status and populate list
      const { data: initialParticipants, error: fetchParticipantsError } = await supabase
        .from("participants")
        .select("*") // Select all columns, including created_at
        .eq("room_code", roomCode)
        .order("created_at", { ascending: true }); // Order by created_at to determine host

      if (fetchParticipantsError) {
        console.error("setupRoom: Error fetching initial participants:", fetchParticipantsError.message);
        toast({
            title: "Participants Error",
            description: `Error fetching participants: ${fetchParticipantsError.message}`,
            variant: "destructive",
        });
        return;
      }
      console.log("setupRoom: Fetched initial participants:", initialParticipants);

      const hostUser = initialParticipants?.[0];
      const currentUserIsHost = hostUser?.user_name === userName;
      setIsHost(currentUserIsHost);
      console.log("setupRoom: Current user is host:", currentUserIsHost);


      setParticipants(
        initialParticipants.map((p) => ({
          id: p.id,
          name: p.user_name === userName ? `${p.user_name} (You)` : p.user_name,
          avatar: "🎧",
          isHost: p.user_name === hostUser?.user_name,
          isActive: true
        }))
      );
      console.log("setupRoom: Participants state updated:", initialParticipants.length);


      // Initialize room_music_state if it doesn't exist and current user is host
      if (currentUserIsHost) {
        console.log("setupRoom: Current user is host, checking music state initialization.");
        const { data: musicState, error: musicStateError } = await supabase
          .from("room_music_state")
          .select("room_code")
          .eq("room_code", roomCode)
          .single();

        if (musicStateError && musicStateError.code === 'PGRST116') {
          console.log("setupRoom: Music state not found, inserting initial state.");
          const { error: insertMusicStateError } = await supabase.from("room_music_state").insert({
            room_code: roomCode,
            current_song_data: {},
            queue: [],
            is_playing: false,
            playback_position: 0,
          });
          if (insertMusicStateError) {
            console.error("setupRoom: Error initializing music state:", insertMusicStateError.message);
            toast({
                title: "Music State Error",
                description: `Error initializing music state: ${insertMusicStateError.message}`,
                variant: "destructive",
            });
          } else {
            console.log("setupRoom: Initialized room music state for new room.");
          }
        } else if (musicStateError) {
            console.error("setupRoom: Error fetching music state:", musicStateError.message);
            toast({
                title: "Music State Error",
                description: `Error fetching music state: ${musicStateError.message}`,
                variant: "destructive",
            });
        } else {
            console.log("setupRoom: Music state already exists.");
        }
      }
    };

    const subscribeToParticipants = () => {
      console.log("subscribeToParticipants: Subscribing to participants channel.");
      participantsSubscription = supabase
        .channel(`room_participants_${roomCode}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "participants",
            filter: `room_code=eq.${roomCode}`
          },
          (payload) => {
            console.log("subscribeToParticipants: Participant INSERT event received:", payload.new);
            const newParticipant = payload.new;
            setParticipants((prev) => {
              const exists = prev.some((p) => p.id === newParticipant.id);
              if (exists) {
                console.log("subscribeToParticipants: Participant already in state, skipping add.");
                return prev;
              }

              // Ensure `created_at` is treated as a Date object for sorting
              const updatedParticipants = [...prev, {
                id: newParticipant.id,
                name: newParticipant.user_name === userName
                  ? `${newParticipant.user_name} (You)`
                  : newParticipant.user_name,
                avatar: "�",
                isHost: false, // Will be re-evaluated after sort
                isActive: true,
                created_at: newParticipant.created_at // Ensure created_at is passed
              }].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

              const hostUser = updatedParticipants?.[0];
              const finalParticipants = updatedParticipants.map(p => ({
                  ...p,
                  isHost: p.user_name === hostUser?.user_name
              }));
              // Update isHost for current user if their status changed
              setIsHost(finalParticipants.some(p => p.name === `${userName} (You)` && p.isHost));
              console.log("subscribeToParticipants: Updated participants list after INSERT:", finalParticipants);
              return finalParticipants;
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "participants",
            filter: `room_code=eq.${roomCode}`
          },
          (payload) => {
            console.log("subscribeToParticipants: Participant DELETE event received:", payload.old);
            const deletedId = payload.old.id;
            setParticipants((prev) => {
              const updatedParticipants = prev.filter((p) => p.id !== deletedId);
              // Re-evaluate host if the deleted participant was the host
              if (prev.find(p => p.id === deletedId)?.isHost) {
                  console.log("subscribeToParticipants: Host left, re-evaluating host.");
                  const newHost = updatedParticipants[0];
                  const finalParticipants = updatedParticipants.map(p => ({
                      ...p,
                      isHost: p.id === newHost?.id
                  }));
                  setIsHost(finalParticipants.some(p => p.name === `${userName} (You)` && p.isHost));
                  console.log("subscribeToParticipants: Updated participants list after DELETE (host change):", finalParticipants);
                  return finalParticipants;
              }
              console.log("subscribeToParticipants: Updated participants list after DELETE:", updatedParticipants);
              return updatedParticipants;
            });
          }
        )
        .subscribe();
    };

    setupRoom();
    subscribeToParticipants();

    return () => {
      console.log("useEffect cleanup: Unsubscribing from participants channel.");
      if (participantsSubscription) supabase.removeChannel(participantsSubscription);
    };
  }, [roomCode, userName, navigate, toast]);

  return (
    <div className="min-h-screen bg-gradient-secondary">
      <header className="bg-card/80 backdrop-blur-md border-b border-border p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center">
              <Music className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-2">{roomName}</h1>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">{roomCode}</Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="w-3 h-3" />{participants.length}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm"><Heart className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" onClick={handleShareRoom}><Share2 className="w-4 h-4" /></Button>
            <Button variant="hero" size="sm" onClick={handleShareRoom}>Invite Friends</Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <MusicPlayer
            currentSong={syncedCurrentSong}
            queue={syncedQueue || []}
            isPlaying={syncedIsPlaying}
            playbackPosition={syncedPlaybackPosition}
            getSyncedPosition={getSyncedPosition}
            volume={playerVolume}
            isShuffling={isShuffling}
            setIsShuffling={setIsShuffling}

            onPlay={handlePlayerPlay}
            onPause={handlePlayerPause}
            onEnded={handlePlayerSongChange}
            onSeek={handlePlayerSeek}
            onQueueUpdate={handlePlayerQueueUpdate}
            onSongChange={handlePlayerSongChange}
          />

          <Card className="bg-card/80 backdrop-blur-md border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-foreground">Room Activities</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4 bg-muted/50">
                  <TabsTrigger value="music" className="flex items-center gap-2"><Music className="w-4 h-4" /> Queue</TabsTrigger>
                  <TabsTrigger value="chat" className="flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Chat</TabsTrigger>
                  <TabsTrigger value="games" className="flex items-center gap-2"><Gamepad2 className="w-4 h-4" /> Games</TabsTrigger>
                  <TabsTrigger value="karaoke" className="flex items-center gap-2"><Mic className="w-4 h-4" /> Karaoke</TabsTrigger>
                </TabsList>

                <div className="mt-6">
                  <TabsContent value="music">
                    <input
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="w-full p-2 border rounded mb-2 bg-muted/30 text-foreground"
                      placeholder="Search for songs..."
                    />
                    {searchResults.length > 0 && (
                      <div className="bg-card border border-border rounded mb-3">
                        {searchResults.map((song, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-2 hover:bg-muted/50 cursor-pointer"
                            onClick={() => addToQueue(song)}
                          >
                            <div className="flex items-center gap-2">
                              <img src={song.thumbnail} alt="" className="w-10 h-10 rounded" />
                              <div>
                                <p className="font-medium text-foreground">{song.title}</p>
                                <p className="text-xs text-muted-foreground">{song.artist}</p>
                              </div>
                            </div>
                            <Badge variant="outline">+ Add</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    {(syncedQueue?.length === 0 && (!syncedCurrentSong || Object.keys(syncedCurrentSong).length === 0)) && (
                        <p className="text-center text-muted-foreground mt-4">Queue is empty. Search for a song to get started!</p>
                    )}
                    {syncedQueue?.map((song, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg mb-2">
                        <div className="flex items-center gap-2">
                          <img src={song.thumbnail} alt="" className="w-10 h-10 rounded" />
                          <div>
                            <p className="font-medium text-foreground">{song.title}</p>
                            <p className="text-xs text-muted-foreground">{song.artist}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{song.duration}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeFromQueue(song.videoId)}
                          >
                            <X className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="chat"><ChatPanel userName={userName} roomCode={roomCode} /></TabsContent>
                  <TabsContent value="games"><GamePanel currentUserName={userName} roomCode={roomCode} /></TabsContent>
                  <TabsContent value="karaoke"><KaraokePanel userName={userName} roomCode={roomCode} /></TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div>
          <ParticipantsList participants={participants} />
          <Card className="mt-6 bg-card/80 backdrop-blur-md border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-foreground text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full flex justify-start gap-2" onClick={() => setAudioModalOpen(true)}>
                <span className="mr-2"><Volume2 className="w-4 h-4" /></span>
                Audio Settings
              </Button>
              <Button variant="outline" className="w-full flex justify-start gap-2" onClick={handleShareRoom}>
                <span className="mr-2"><Share2 className="w-4 h-4" /></span>
                Share Room
              </Button>
              <Button variant="destructive" className="w-full flex justify-start gap-2" onClick={() => setLeaveDialogOpen(true)}>
                Leave Room
              </Button>
            </CardContent>
          </Card>
          {audioModalOpen && (
            <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-60">
              <div className="bg-[#181825] rounded-2xl border border-[#232336] shadow-[0_0_24px_0_rgba(236,72,153,0.15)] p-8 w-full max-w-lg relative">
                <button className="absolute top-4 right-4 text-muted-foreground hover:text-white" onClick={() => setAudioModalOpen(false)}><X className="w-6 h-6" /></button>
                <h2 className="text-2xl font-bold text-white mb-8">Audio Settings</h2>
                <div className="mb-8">
                  <label className="block text-white font-semibold mb-2">Master Volume</label>
                  <Slider
                    value={[masterVolume]}
                    onValueChange={val => setMasterVolume(val[0])}
                    max={100}
                    min={0}
                    step={1}
                  />
                  <div className="text-slate-300 text-sm mt-2">{masterVolume}%</div>
                </div>
                <div className="mb-8">
                  <label className="block text-white font-semibold mb-2">Audio Device</label>
                  <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                    <SelectTrigger>
                      <SelectValue>{audioDevices.find(d => d.deviceId === selectedDevice)?.label || "Default"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {audioDevices
                        .filter(d => d.deviceId && d.deviceId !== "")
                        .map((d) => (
                          <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Device ${d.deviceId.slice(-4)}`}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mb-2">
                  <label className="block text-white font-semibold mb-2">Audio Quality</label>
                  <Select value={audioQuality} onValueChange={setAudioQuality}>
                    <SelectTrigger>
                      <SelectValue>{audioQuality === "high" ? "High (320 kbps)" : audioQuality === "medium" ? "Medium (128 kbps)" : "Low (64 kbps)"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High (320 kbps)</SelectItem>
                      <SelectItem value="medium">Medium (128 kbps)</SelectItem>
                      <SelectItem value="low">Low (64 kbps)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          {leaveDialogOpen && (
            <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-60">
              <div className="bg-[#181825] rounded-2xl border border-[#232336] shadow-[0_0_24px_0_rgba(236,72,153,0.15)] p-8 w-full max-w-md">
                <h2 className="text-2xl font-bold text-white mb-2">Leave Room?</h2>
                <p className="text-slate-300 mb-8">Are you sure you want to leave this room? You'll need the room code to rejoin.</p>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" className="px-6" onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
                  <Button variant="destructive" className="px-6" onClick={handleLeaveRoom}>Leave Room</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Room;