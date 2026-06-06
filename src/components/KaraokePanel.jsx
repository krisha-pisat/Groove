import { useEffect, useState, useRef, useMemo } from "react";
import { Mic, Music2 } from "lucide-react";

function parseLRC(lrc) {
  const lines = [];
  const regex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\](.*)/;
  for (const raw of lrc.split("\n")) {
    const m = raw.match(regex);
    if (!m) continue;
    const text = m[4].trim();
    if (!text) continue;
    const time = parseInt(m[1]) * 60 + parseInt(m[2]) + parseFloat("0." + m[3]);
    lines.push({ time, line: text });
  }
  return lines;
}

// Strip YouTube junk from titles so APIs can match them
function cleanTitle(title) {
  return title
    .replace(/\(from[^)]*\)/gi, "")
    .replace(/\[from[^\]]*\]/gi, "")
    .replace(/\(official[^)]*\)/gi, "")
    .replace(/\[official[^\]]*\]/gi, "")
    .replace(/\(feat\.?[^)]*\)/gi, "")
    .replace(/\(ft\.?[^)]*\)/gi, "")
    .replace(/[-–|]\s*(official|lyric|audio|video|visualizer).*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanArtist(artist) {
  return (artist ?? "").split(/[,&]|feat\.|ft\./i)[0].trim();
}

async function fetchLrclib(artist, title) {
  const params = new URLSearchParams({ artist_name: artist, track_name: title });
  const res = await fetch(`https://lrclib.net/api/get?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data;
}

async function searchLrclib(artist, title) {
  const q = `${title} ${artist}`.trim();
  const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return null;
  const results = await res.json();
  return Array.isArray(results) && results.length > 0 ? results[0] : null;
}

async function fetchLyricsOvh(artist, title) {
  const a = encodeURIComponent(artist);
  const t = encodeURIComponent(title);
  const res = await fetch(`https://api.lyrics.ovh/v1/${a}/${t}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.lyrics ?? null;
}

export default function KaraokePanel({ currentSong, getSyncedPosition, isPlaying }) {
  const [lyrics, setLyrics] = useState([]);
  const [plainLyrics, setPlainLyrics] = useState("");
  const [hasSynced, setHasSynced] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [status, setStatus] = useState("no_song");

  const scrollContainerRef = useRef(null);
  const activeRef = useRef(null);
  const pollRef = useRef(null);
  const lastVideoId = useRef(null);

  // Fetch lyrics when song changes
  useEffect(() => {
    if (!currentSong?.title) {
      setStatus("no_song");
      setLyrics([]);
      setPlainLyrics("");
      lastVideoId.current = null;
      return;
    }
    if (lastVideoId.current === currentSong.videoId) return;
    lastVideoId.current = currentSong.videoId;

    setStatus("loading");
    setLyrics([]);
    setPlainLyrics("");
    setActiveIndex(-1);
    setCurrentTime(0);
    setHasSynced(false);

    const load = async () => {
      try {
        const rawTitle = currentSong.title ?? "";
        const rawArtist = currentSong.artist ?? "";
        const title = cleanTitle(rawTitle);
        const artist = cleanArtist(rawArtist);

        console.log("[Karaoke] Searching for lyrics");
        console.log("[Karaoke] Raw title:", rawTitle, "| Raw artist:", rawArtist);
        console.log("[Karaoke] Cleaned title:", title, "| Cleaned artist:", artist);

        // 1. lrclib exact match (cleaned title)
        console.log("[Karaoke] Trying lrclib exact match (cleaned)...");
        let data = await fetchLrclib(artist, title);
        console.log("[Karaoke] lrclib (cleaned) result:", data);

        // 2. lrclib exact match (raw title)
        if (!data?.syncedLyrics && !data?.plainLyrics) {
          console.log("[Karaoke] Trying lrclib exact match (raw)...");
          data = await fetchLrclib(rawArtist, rawTitle);
          console.log("[Karaoke] lrclib (raw) result:", data);
        }

        // 3. lrclib fuzzy search
        if (!data?.syncedLyrics && !data?.plainLyrics) {
          console.log("[Karaoke] Trying lrclib fuzzy search...");
          data = await searchLrclib(artist, title);
          console.log("[Karaoke] lrclib (search) result:", data);
        }

        // Use synced lyrics if found
        if (data?.syncedLyrics) {
          const parsed = parseLRC(data.syncedLyrics);
          console.log("[Karaoke] Got synced lyrics, lines:", parsed.length);
          if (parsed.length > 0) {
            setLyrics(parsed);
            setHasSynced(true);
            setStatus("ready");
            return;
          }
        }

        // Use lrclib plain lyrics if found
        if (data?.plainLyrics) {
          console.log("[Karaoke] Got plain lyrics from lrclib, chars:", data.plainLyrics.length);
          setPlainLyrics(data.plainLyrics);
          setHasSynced(false);
          setStatus("ready");
          return;
        }

        // 4. Fallback: lyrics.ovh
        console.log("[Karaoke] Trying lyrics.ovh fallback...");
        const ovhLyrics = await fetchLyricsOvh(artist, title);
        console.log("[Karaoke] lyrics.ovh result:", ovhLyrics ? `${ovhLyrics.length} chars` : "not found");
        if (ovhLyrics) {
          setPlainLyrics(ovhLyrics);
          setHasSynced(false);
          setStatus("ready");
          return;
        }

        console.log("[Karaoke] No lyrics found from any source");
        setStatus("no_lyrics");
      } catch (err) {
        console.error("[Karaoke] Error fetching lyrics:", err);
        setStatus("no_lyrics");
      }
    };
    load();
  }, [currentSong?.videoId, currentSong?.title, currentSong?.artist]);

  // Poll for current time + active line (100ms for word-level responsiveness)
  useEffect(() => {
    clearInterval(pollRef.current);
    if (!hasSynced || lyrics.length === 0) return;
    pollRef.current = setInterval(() => {
      const t = getSyncedPosition();
      setCurrentTime(t);
      setActiveIndex((prev) => {
        let idx = -1;
        for (let i = 0; i < lyrics.length; i++) {
          if (lyrics[i].time <= t) idx = i;
          else break;
        }
        return idx !== prev ? idx : prev;
      });
    }, 100);
    return () => clearInterval(pollRef.current);
  }, [hasSynced, lyrics, getSyncedPosition]);

  // Smooth scroll: keep active line ~35% from top so upcoming lines are visible
  useEffect(() => {
    if (!activeRef.current || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const el = activeRef.current;
    const target = el.offsetTop - container.clientHeight * 0.35;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeIndex]);

  // Pre-compute per-word start times for every line using linear interpolation
  const wordTimings = useMemo(() => {
    return lyrics.map((item, i) => {
      const words = item.line.split(" ");
      const lineStart = item.time;
      const lineEnd = lyrics[i + 1]?.time ?? lineStart + 5;
      const lineDuration = Math.max(lineEnd - lineStart, 0.1);
      const wordDur = lineDuration / words.length;
      return words.map((word, j) => ({
        word,
        startTime: lineStart + j * wordDur,
      }));
    });
  }, [lyrics]);

  return (
    <div className="w-full select-none">
      {/* Song info bar */}
      {currentSong?.title && (
        <div className="flex items-center gap-3 mb-5 p-3 md:p-4 rounded-2xl bg-gradient-to-r from-[#a259ff]/10 to-[#f246a9]/10 border border-[#a259ff]/20">
          {currentSong.thumbnail && (
            <img
              src={currentSong.thumbnail}
              alt="cover"
              className="w-12 h-12 md:w-14 md:h-14 rounded-xl object-cover shrink-0 shadow-lg"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-white font-bold text-sm md:text-base truncate">{currentSong.title}</p>
            <p className="text-[#a259ff] text-xs md:text-sm truncate">{currentSong.artist}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className={`w-2 h-2 rounded-full ${isPlaying ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
            <span className="text-xs text-gray-400">
              {hasSynced ? "Synced" : status === "ready" ? "Lyrics" : ""}
            </span>
          </div>
        </div>
      )}

      {/* No song */}
      {status === "no_song" && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#a259ff]/20 to-[#f246a9]/20 flex items-center justify-center mb-4 shadow-[0_0_40px_rgba(162,89,255,0.2)]">
            <Mic className="w-9 h-9 text-[#a259ff]" />
          </div>
          <p className="text-white font-semibold text-lg mb-2">No song playing</p>
          <p className="text-gray-500 text-sm">Add a song to the queue to see lyrics</p>
        </div>
      )}

      {/* Loading */}
      {status === "loading" && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="relative w-14 h-14 mb-5">
            <div className="absolute inset-0 rounded-full border-2 border-[#a259ff]/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-[#a259ff] border-r-[#f246a9] animate-spin" />
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-[#a259ff]/10 to-[#f246a9]/10 flex items-center justify-center">
              <Mic className="w-4 h-4 text-[#a259ff]" />
            </div>
          </div>
          <p className="text-gray-400 text-sm">Fetching lyrics for</p>
          <p className="text-white font-semibold text-sm mt-1 truncate max-w-[200px]">{currentSong?.title}</p>
        </div>
      )}

      {/* No lyrics */}
      {status === "no_lyrics" && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-[#1e1e2e] border border-[#232336] flex items-center justify-center mb-4">
            <Music2 className="w-9 h-9 text-gray-500" />
          </div>
          <p className="text-white font-semibold text-lg mb-2">No lyrics found</p>
          <p className="text-gray-500 text-sm max-w-xs">
            Lyrics aren't available for{" "}
            <span className="text-gray-400">"{currentSong?.title}"</span> yet
          </p>
        </div>
      )}

      {/* Plain (unsynced) lyrics */}
      {status === "ready" && !hasSynced && plainLyrics && (
        <div className="overflow-y-auto max-h-[480px] px-2 text-center [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          <div className="h-4" />
          {plainLyrics.split("\n").map((line, i) =>
            line.trim() ? (
              <p key={i} className="text-gray-300 text-sm leading-relaxed py-1">{line}</p>
            ) : (
              <div key={i} className="h-3" />
            )
          )}
          <div className="h-4" />
        </div>
      )}

      {/* Synced karaoke view */}
      {status === "ready" && hasSynced && lyrics.length > 0 && (
        <div className="relative" style={{ height: "480px" }}>
          {/* Top fade */}
          <div
            className="pointer-events-none absolute top-0 left-0 right-0 z-10"
            style={{ height: "100px", background: "linear-gradient(to bottom, #0f0f18 0%, transparent 100%)" }}
          />
          {/* Bottom fade */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 z-10"
            style={{ height: "100px", background: "linear-gradient(to top, #0f0f18 0%, transparent 100%)" }}
          />

          <div
            ref={scrollContainerRef}
            className="overflow-y-auto h-full [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: "none" }}
          >
            <div style={{ height: "160px" }} />

            {lyrics.map((item, i) => {
              const isActive = i === activeIndex;
              const isPast = i < activeIndex;
              const dist = i - activeIndex; // negative = past, 0 = active, positive = future

              // Opacity based on distance from active
              const opacity = isActive
                ? 1
                : dist === 1
                ? 0.55
                : dist === -1
                ? 0.35
                : dist === 2
                ? 0.35
                : 0.18;

              // Font size based on distance
              const fontSize = isActive
                ? "clamp(1.35rem, 3.5vw, 1.75rem)"
                : dist === 1 || dist === -1
                ? "clamp(1rem, 2.5vw, 1.2rem)"
                : "clamp(0.85rem, 2vw, 1rem)";

              const words = wordTimings[i] ?? [];

              return (
                <div
                  key={i}
                  ref={isActive ? activeRef : null}
                  className="text-center px-4 md:px-8 transition-all duration-500"
                  style={{
                    opacity,
                    paddingTop: isActive ? "14px" : "8px",
                    paddingBottom: isActive ? "14px" : "8px",
                  }}
                >
                  {isActive ? (
                    // Active line: word-by-word highlighting
                    <span className="leading-snug" style={{ fontSize, fontWeight: 800 }}>
                      {words.map((w, j) => {
                        const lit = currentTime >= w.startTime;
                        return (
                          <span
                            key={j}
                            className="inline-block transition-all duration-150 mr-[0.3em]"
                            style={
                              lit
                                ? {
                                    background: "linear-gradient(90deg, #a259ff, #f246a9)",
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                    filter:
                                      "drop-shadow(0 0 12px rgba(162,89,255,0.8)) drop-shadow(0 0 24px rgba(242,70,169,0.4))",
                                    transform: "scale(1.05)",
                                    display: "inline-block",
                                  }
                                : {
                                    color: "rgba(255,255,255,0.35)",
                                    display: "inline-block",
                                  }
                            }
                          >
                            {w.word}
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    // Non-active lines: plain styled text
                    <span
                      className="leading-snug transition-all duration-500"
                      style={{
                        fontSize,
                        fontWeight: isPast ? 500 : 600,
                        color: isPast ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.9)",
                      }}
                    >
                      {item.line}
                    </span>
                  )}
                </div>
              );
            })}

            <div style={{ height: "280px" }} />
          </div>
        </div>
      )}
    </div>
  );
}
