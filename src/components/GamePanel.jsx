import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { startGame } from '../lib/startGame';
import MusicTriviaGame from './MusicTriviaGame';
import GuessTheSongGame from './GuessTheSongGame';
import WyrGame from './WyrGame';
import PickWhoGame from './PickWhoGame';
import GameCard from './GameCard';
import { isHostUser } from '../lib/isHostUser';
import SettingsDialog from './SettingsDialog';
import GameResults from './GameResults';

export default function GamePanel({ roomCode, currentUserName }) {
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(null); // null = not yet determined
  const [activeGame, setActiveGame] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingGameType, setPendingGameType] = useState(null);
  const [session, setSession] = useState(null);
  const [gameEnded, setGameEnded] = useState(false);
  const [endedSession, setEndedSession] = useState(null); // holds session data after game ends

  useEffect(() => {
    // Get room data
    const fetchRoom = async () => {
      const { data } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', roomCode)
        .single();

      setRoom(data);
      console.log('ROOM HOST:', data?.host_name, 'CURRENT USER:', currentUserName);
      console.log('Is Host:', isHostUser(data?.host_name, currentUserName));
      setIsHost(isHostUser(data?.host_name, currentUserName));
    };

    fetchRoom();

    // Fetch active game session (in case it already exists)
    const fetchActiveGame = async () => {
      const { data: sessionRows } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('room_code', roomCode)
        .eq('game_state', 'active')
        .order('updated_at', { ascending: false })
        .limit(1);
      const sessionData = sessionRows?.[0] ?? null;
      if (sessionData) {
        setActiveGame(sessionData.game_type);
        setSession(sessionData);
      } else {
        setSession(null);
      }
    };
    fetchActiveGame();

    // Listen for game start and updates
    const sub = supabase
      .channel('game_session_sync')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_sessions',
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          setActiveGame(payload.new.game_type);
          setSession(payload.new);
          setGameEnded(false);
          setEndedSession(null);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          if (payload.new.game_state === 'ended') {
            setEndedSession(payload.new);
            setGameEnded(true);
            setActiveGame(null);
            setSession(null);
          } else {
            setActiveGame(payload.new.game_type);
            setSession(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [roomCode, currentUserName]);

  const handleStartGame = async (gameType) => {
    await startGame(gameType, roomCode, currentUserName);
  };

  const handleGameResultAction = async (action) => {
    if (action === 'replay' && endedSession) {
      await startGame(endedSession.game_type, roomCode, currentUserName);
    } else if (action === 'pick_new') {
      setGameEnded(false);
      setEndedSession(null);
    }
  };

  const handleGameCardClick = (gameType) => {
    setPendingGameType(gameType);
    setShowSettings(true);
  };

  const handleStartWithSettings = async ({ total, secs }) => {
    setShowSettings(false);
    if (!pendingGameType) return;
    // Pass settings to startGame
    await startGame(pendingGameType, roomCode, currentUserName, { total, secs });
    setPendingGameType(null);
  };

  if (isHost === null) {
    return (
      <div className="w-full max-w-5xl mx-auto text-center text-white p-4 md:p-8">
        Loading room data...
      </div>
    );
  }

  if (activeGame === 'music_trivia') 
    return <MusicTriviaGame roomCode={roomCode} currentUserName={currentUserName} />;
  if (activeGame === 'guess_the_song') 
    return <GuessTheSongGame roomCode={roomCode} currentUserName={currentUserName} />;
  if (activeGame === 'would_you_rather') 
    return <WyrGame roomCode={roomCode} currentUserName={currentUserName} />;
  if (activeGame === 'pick_who') 
    return <PickWhoGame roomCode={roomCode} currentUserName={currentUserName} />;

  // Show results screen if game has ended
  if (gameEnded && endedSession) {
    return (
      <GameResults
        roomCode={roomCode}
        currentUserName={currentUserName}
        gameType={endedSession.game_type}
        sessionId={endedSession.id}
        isHost={isHost}
        onAction={handleGameResultAction}
      />
    );
  }

  // No game started yet
  if (isHost) {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <h3 className="text-2xl font-bold mb-2 text-white text-center">Game Room</h3>
        <p className="mb-8 text-slate-300 text-center">Choose a game to start with your friends</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          <GameCard 
            title="Music Trivia"
            description="Test your music knowledge with questions about artists, songs, and albums"
            icon="🎵"
            difficulty="Medium"
            players="2-8"
            duration="10-15 min"
            badgeColor="bg-[#a259ff] bg-opacity-20"
            onStart={() => handleGameCardClick('music_trivia')}
          />
          <GameCard 
            title="Guess the Song"
            description="Guess the song title from emoji clues!"
            icon="🎧"
            difficulty="Hard"
            players="2-8"
            duration="15-20 min"
            badgeColor="bg-pink-600 bg-opacity-20"
            onStart={() => handleGameCardClick('guess_the_song')}
          />
          <GameCard 
            title="Would You Rather"
            description="Choose between two scenarios and see what others pick"
            icon="🤔"
            difficulty="Easy"
            players="2-10"
            duration="5-10 min"
            badgeColor="bg-green-600 bg-opacity-20"
            onStart={() => handleGameCardClick('would_you_rather')}
          />
          <GameCard 
            title="Pick Who Game"
            description="Vote on who best fits the scenario or who you would choose"
            icon="🥳"
            difficulty="Easy"
            players="2-8"
            duration="10-15 min"
            badgeColor="bg-green-600 bg-opacity-20"
            onStart={() => handleGameCardClick('pick_who')}
          />
        </div>
        {showSettings && (
          <SettingsDialog 
            onStart={handleStartWithSettings} 
            onClose={() => setShowSettings(false)} 
          />
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto text-center">
      <h3 className="text-2xl font-bold mb-2 text-white">Game Room</h3>
      <p className="text-slate-300 mb-8">Waiting for host to start the game...</p>
      <div className="bg-[#181825] rounded-2xl border border-[#232336] shadow-[0_0_24px_0_rgba(236,72,153,0.15)] p-4 md:p-8">
        <div className="text-6xl mb-4">🎮</div>
        <p className="text-white text-lg">The host will choose a game to play with everyone!</p>
      </div>
    </div>
  );
}