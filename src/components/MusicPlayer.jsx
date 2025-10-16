import { useRef, useEffect, useState, useCallback } from "react";
import {
  Play, Pause, SkipForward, SkipBack, Repeat, Volume2, Shuffle, Music, Loader2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const MusicPlayer = ({
  currentSong,
  queue,
  isPlaying, // Synced state from Supabase
  playbackPosition, // Synced state from Supabase
  getSyncedPosition, // Function to get adjusted synced position

  volume,
  isShuffling,
  setIsShuffling,

  onPlay, // Callback to Room.jsx to update Supabase
  onPause, // Callback to Room.jsx to update Supabase
  onEnded, // Callback to Room.jsx when song ends (e.g., skip to next)
  onSeek, // Callback to Room.jsx to update Supabase
  onSongChange, // Callback to Room.jsx to change current song and queue
  onQueueUpdate, // Callback to Room.jsx to update queue (e.g., shuffle)
}) => {
  const playerRef = useRef(null); // Reference to the YouTube player instance
  const [internalIsPlaying, setInternalIsPlaying] = useState(false); // Local state for UI/player's actual play status
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0); // Local state for UI progress slider
  const [duration, setDuration] = useState(0);
  const intervalRef = useRef(null); // Reference for the progress update interval
  const [internalVolume, setInternalVolume] = useState(volume); // Local state for volume slider
  const [isYoutubeApiReady, setIsYoutubeApiReady] = useState(false); // State to track if window.YT is fully loaded
  const playerInstanceReady = useRef(false); // Tracks if playerRef.current is fully initialized and ready to receive commands

  // --- Volume Control ---
  useEffect(() => {
    setInternalVolume(volume);
    if (playerRef.current && playerInstanceReady.current) {
      playerRef.current.setVolume(volume[0]);
    }
  }, [volume]);

  // --- YouTube Iframe API Loading ---
  useEffect(() => {
    console.log("MusicPlayer useEffect [API Loading]: Component mounted.");
    // Load YouTube Iframe API script if not already loaded
    if (!window.YT && !document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.id = "youtube-iframe-api-script"; // Add an ID for easier selection
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      console.log("MusicPlayer useEffect [API Loading]: YouTube API script injected.");
    } else if (window.YT) {
        console.log("MusicPlayer useEffect [API Loading]: YouTube API already loaded (window.YT exists). Setting isYoutubeApiReady to true.");
        setIsYoutubeApiReady(true); // Set true immediately if already loaded
    }


    // Set the global callback for YouTube API readiness
    window.onYouTubeIframeAPIReady = () => {
      console.log("window.onYouTubeIframeAPIReady fired. Setting isYoutubeApiReady to true.");
      setIsYoutubeApiReady(true); // Now uses state, which triggers re-renders
    };

    // Cleanup function for when component unmounts
    return () => {
      console.log("MusicPlayer useEffect [API Loading]: Cleanup initiated.");
      delete window.onYouTubeIframeAPIReady;
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        console.log("MusicPlayer useEffect [API Loading]: Destroying player instance during cleanup.");
        playerRef.current.destroy();
        playerRef.current = null;
        playerInstanceReady.current = false;
      }
      const tag = document.getElementById('youtube-iframe-api-script'); // Use ID for removal
      if (tag && document.body.contains(tag)) {
        console.log("MusicPlayer useEffect [API Loading]: Removing YouTube API script during cleanup.");
        document.body.removeChild(tag);
      }
    };
  }, []); // Empty dependency array to run once on mount

  // --- Player Creation and State Management ---
  const createPlayer = useCallback((videoId) => {
    // Ensure YouTube API is fully loaded before attempting to create player
    if (!window.YT || !window.YT.Player) {
      console.warn("createPlayer: YouTube Iframe API not ready (window.YT.Player missing). Deferring.");
      return;
    }

    // If player already exists and is playing the same video, just ensure state
    if (playerRef.current && playerInstanceReady.current && playerRef.current.getVideoData().video_id === videoId) {
      console.log("createPlayer: Player already exists for this video. Relying on main useEffect for sync.");
      setDuration(playerRef.current.getDuration());
      setIsLoading(false);
      return;
    }

    // If player exists but needs a new video or needs to be recreated (e.g., video changed)
    if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        console.log("createPlayer: Destroying existing player for new video or recreation.");
        playerRef.current.destroy();
        playerRef.current = null;
        playerInstanceReady.current = false; // Reset readiness as old player is destroyed
    }

    console.log("createPlayer: Creating new YouTube Player instance for videoId:", videoId);
    playerRef.current = new window.YT.Player("yt-player", {
      videoId: videoId,
      playerVars: {
        controls: 0,
        modestbranding: 1,
        disablekb: 1,
        enablejsapi: 1,
        autoplay: 0,
      },
      events: {
        onReady: (e) => {
          playerInstanceReady.current = true; // Crucial: Player instance is now fully ready!
          console.log("YouTube Player onReady: Player instance is ready. Applying initial sync.");
          e.target.setVolume(internalVolume[0]);

          // Apply initial synced state from props (isPlaying, playbackPosition)
          const syncedPos = getSyncedPosition();
          e.target.seekTo(syncedPos, true);
          if (isPlaying) {
            e.target.playVideo();
          } else {
            e.target.pauseVideo();
          }
          setDuration(e.target.getDuration());
          setIsLoading(false);
          setInternalIsPlaying(isPlaying);
        },
        onStateChange: (e) => {
          console.log("YouTube Player onStateChange (local):", e.data);
          const newPlayerState = e.data;

          setInternalIsPlaying(newPlayerState === window.YT.PlayerState.PLAYING);
          setIsLoading(newPlayerState === window.YT.PlayerState.BUFFERING || newPlayerState === window.YT.PlayerState.UNSTARTED);

          if (newPlayerState === window.YT.PlayerState.ENDED) {
            handleSkip();
          }
        },
        onError: (e) => {
          console.error("YouTube Player Error:", e);
          setIsLoading(false);
          if (queue.length > 0) {
            handleSkip();
          }
        }
      },
    });
  }, [isPlaying, internalVolume, getSyncedPosition, queue]);

  // --- Main Effect for Synchronizing Player with Supabase State ---
  useEffect(() => {
    console.log("Main useEffect triggered. currentSong:", currentSong, "isPlaying:", isPlaying, "isYoutubeApiReady:", isYoutubeApiReady, "playerInstanceReady:", playerInstanceReady.current);

    // If no song is current, stop player and reset UI
    if (!currentSong || Object.keys(currentSong).length === 0) {
      if (playerRef.current && playerInstanceReady.current && typeof playerRef.current.stopVideo === 'function') {
        console.log("Main useEffect: No current song, stopping player.");
        playerRef.current.stopVideo();
      }
      setInternalIsPlaying(false);
      setProgress(0);
      setDuration(0);
      setIsLoading(false);
      return;
    }

    // If YouTube API is not yet ready, defer player creation/sync
    if (!isYoutubeApiReady) {
      console.log("Main useEffect: YouTube API not yet ready, deferring player creation/sync.");
      return;
    }

    // If player instance is not created or needs to be reloaded for a new song
    const needsNewPlayer = !playerRef.current || (playerInstanceReady.current && playerRef.current.getVideoData().video_id !== currentSong.videoId);

    if (needsNewPlayer) {
      console.log("Main useEffect: Player needs creation/re-load for videoId:", currentSong.videoId);
      createPlayer(currentSong.videoId); // Call createPlayer directly
      return; // Exit, as player creation/loading will handle the state sync
    }

    // If the same song is playing and player instance is ready, synchronize play/pause/seek
    if (playerInstanceReady.current) {
        console.log("Main useEffect: Player is ready for current song, syncing play/pause/seek.");
        // Sync play/pause state
        if (isPlaying && playerRef.current.getPlayerState() !== window.YT.PlayerState.PLAYING) {
            console.log("Main useEffect: Playing video due to synced state.");
            playerRef.current.playVideo();
        } else if (!isPlaying && playerRef.current.getPlayerState() !== window.YT.PlayerState.PAUSED) {
            console.log("Main useEffect: Pausing video due to synced state.");
            playerRef.current.pauseVideo();
        }

        // Sync playback position if significantly off
        const currentLocalTime = playerRef.current.getCurrentTime();
        const syncedTime = getSyncedPosition();
        const diff = Math.abs(currentLocalTime - syncedTime);

        if (diff > 1.5) { // Resync if difference is more than 1.5 seconds
            console.log(`Main useEffect: Seeking video due to synced state. Diff: ${diff.toFixed(2)}s`);
            playerRef.current.seekTo(syncedTime, true);
        }
    }
  }, [currentSong, isPlaying, playbackPosition, getSyncedPosition, createPlayer, isYoutubeApiReady, playerInstanceReady]);

  // --- Progress Update Interval for UI ---
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (internalIsPlaying) {
      intervalRef.current = setInterval(() => {
        if (playerRef.current && playerInstanceReady.current) {
          const current = playerRef.current.getCurrentTime();
          const dur = playerRef.current.getDuration();
          setProgress(current);
          setDuration(dur);
        }
      }, 500);
    }
    return () => clearInterval(intervalRef.current);
  }, [internalIsPlaying]);

  // --- User Interaction Handlers (Now ONLY Update Supabase) ---
  const togglePlay = () => {
    if (!currentSong || Object.keys(currentSong).length === 0) {
      console.warn("togglePlay: No current song to play/pause.");
      return;
    }
    isPlaying ? onPause() : onPlay();
    console.log("togglePlay: Sent play/pause command to Supabase.");
  };

  const handleSkip = () => {
    if (!currentSong || Object.keys(currentSong).length === 0) return;

    let newCurrentSong = null;
    let newQueue = [...queue];

    if (newQueue.length > 0) {
        if (isShuffling) {
            const randomIndex = Math.floor(Math.random() * newQueue.length);
            newCurrentSong = newQueue[randomIndex];
            newQueue.splice(randomIndex, 1);
        } else {
            newCurrentSong = newQueue[0];
            newQueue = newQueue.slice(1);
        }
    }
    onSongChange(newCurrentSong, newQueue);
    console.log("handleSkip: Sent skip command to Supabase.");
  };

  const handlePrev = () => {
    if (!currentSong || Object.keys(currentSong).length === 0) return;
    onSeek(0);
    console.log("handlePrev: Sent seek to 0 command to Supabase.");
  };

  const handleSeek = (val) => {
    if (!currentSong || Object.keys(currentSong).length === 0) return;
    const newTime = val[0];
    onSeek(newTime);
    console.log("handleSeek: Sent seek command to Supabase.");
  };

  const handleShuffleToggle = () => {
    const updatedShuffleState = !isShuffling;
    setIsShuffling(updatedShuffleState);

    if (updatedShuffleState) {
        const shuffledQueue = [...queue];
        for (let i = shuffledQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledQueue[i], shuffledQueue[j]] = [shuffledQueue[j], shuffledQueue[i]];
        }
        onQueueUpdate(shuffledQueue);
        console.log("handleShuffleToggle: Sent shuffle queue update to Supabase.");
    }
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <Card className="bg-card/90 backdrop-blur-md border-border shadow-glow-sm">
      <CardContent className="p-6">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted/40 flex items-center justify-center">
            {currentSong && Object.keys(currentSong).length > 0 ? (
              <img src={currentSong.thumbnail} alt="cover" className="w-full h-full object-cover" />
            ) : (
              <Music className="w-8 h-8 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {currentSong && Object.keys(currentSong).length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-xl font-semibold text-foreground truncate">{currentSong.title}</h3>
                </div>
                <p className="text-muted-foreground mb-1">{currentSong.artist}</p>
                <p className="text-sm text-muted-foreground">{currentSong.album}</p>
              </>
            ) : (
              <h3 className="text-lg text-muted-foreground">Nothing playing</h3>
            )}
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleShuffleToggle}>
                <Shuffle className={`w-4 h-4 ${isShuffling ? "text-pink-400" : "text-muted-foreground"}`} />
              </Button>
              <Button variant="ghost" size="sm" disabled={!currentSong || Object.keys(currentSong).length === 0} onClick={handlePrev}>
                <SkipBack className="w-5 h-5" />
              </Button>
              <Button
                variant="hero"
                size="lg"
                onClick={togglePlay}
                className="w-12 h-12 rounded-full shadow-glow flex items-center justify-center"
                disabled={!currentSong || Object.keys(currentSong).length === 0}
              >
                {isLoading && currentSong && Object.keys(currentSong).length > 0 ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : internalIsPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6" />
                )}
              </Button>
              <Button variant="ghost" size="sm" disabled={!currentSong || Object.keys(currentSong).length === 0} onClick={handleSkip}>
                <SkipForward className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm">
                <Repeat className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-3 w-80">
              <span className="text-xs text-muted-foreground w-10 text-right">{formatTime(progress)}</span>
              <Slider
                value={[progress]}
                onValueChange={handleSeek}
                max={duration || 1}
                step={1}
                className="flex-1"
                disabled={!currentSong || Object.keys(currentSong).length === 0}
              />
              <span className="text-xs text-muted-foreground w-10">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-muted-foreground" />
            <Slider
              value={internalVolume}
              onValueChange={(val) => {
                setInternalVolume(val);
                if (playerRef.current && playerInstanceReady.current) playerRef.current.setVolume(val[0]);
              }}
              max={100}
              step={1}
              className="w-20"
            />
          </div>
        </div>

        <div style={{ display: "none" }}>
          <div id="yt-player"></div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MusicPlayer;
