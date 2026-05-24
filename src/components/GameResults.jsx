import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const gameNames = {
  music_trivia: 'Music Trivia',
  guess_the_song: 'Guess the Song',
  would_you_rather: 'Would You Rather',
  pick_who: 'Pick Who',
};

const medals = ['🥇', '🥈', '🥉'];

export default function GameResults({ roomCode, currentUserName, gameType, sessionId, isHost, onAction }) {
  const [participants, setParticipants] = useState([]);
  const [scores, setScores] = useState({});       // { participant_id: score }
  const [cumulative, setCumulative] = useState({}); // { user_name: total_score }
  const [loading, setLoading] = useState(true);

  const isTriviaGame = gameType === 'music_trivia' || gameType === 'guess_the_song';

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);

      const { data: participantsData } = await supabase
        .from('participants')
        .select('id, user_name')
        .eq('room_code', roomCode);
      const parts = participantsData || [];
      setParticipants(parts);

      const { data: answersData } = await supabase
        .from('game_answers')
        .select('participant_id, answer, question_index')
        .eq('game_session_id', sessionId);
      const answers = answersData || [];

      const scoreMap = {};
      parts.forEach(p => { scoreMap[p.id] = 0; });

      if (isTriviaGame) {
        let questions = [];
        if (gameType === 'music_trivia') {
          questions = (await import('../assets/music_recent.json')).default.questions;
        } else {
          questions = (await import('../assets/guess_the_song.json')).default.questions;
        }
        answers.forEach(ans => {
          const q = questions[ans.question_index ?? 0];
          if (!q) return;
          if (ans.answer.trim().toLowerCase() === q.answer.trim().toLowerCase()) {
            scoreMap[ans.participant_id] = (scoreMap[ans.participant_id] || 0) + 1;
          }
        });
      } else {
        // WYR / Pick Who: majority answer per question earns a point
        const byQuestion = {};
        answers.forEach(ans => {
          const qi = ans.question_index ?? 0;
          if (!byQuestion[qi]) byQuestion[qi] = [];
          byQuestion[qi].push(ans);
        });
        Object.values(byQuestion).forEach(qAnswers => {
          const tally = {};
          qAnswers.forEach(a => { tally[a.answer] = (tally[a.answer] || 0) + 1; });
          const majority = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
          if (!majority) return;
          qAnswers.forEach(ans => {
            if (ans.answer === majority) {
              scoreMap[ans.participant_id] = (scoreMap[ans.participant_id] || 0) + 1;
            }
          });
        });
      }
      setScores(scoreMap);

      // Host writes scores once (check for duplicates first)
      if (isHost) {
        const { data: existing } = await supabase
          .from('game_scores')
          .select('id')
          .eq('game_session_id', sessionId)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from('game_scores').insert(
            parts.map(p => ({
              room_code: roomCode,
              game_session_id: sessionId,
              game_type: gameType,
              user_name: p.user_name,
              score: scoreMap[p.id] || 0,
            }))
          );
        }
      }

      // Cumulative leaderboard across all games in this room
      const { data: allScores } = await supabase
        .from('game_scores')
        .select('user_name, score')
        .eq('room_code', roomCode);

      const cumulMap = {};
      (allScores || []).forEach(s => {
        cumulMap[s.user_name] = (cumulMap[s.user_name] || 0) + s.score;
      });
      setCumulative(cumulMap);

      setLoading(false);
    };

    fetchResults();
  }, [roomCode, sessionId, gameType, isHost]);

  if (loading) return <div className="text-white text-center p-8">Calculating results...</div>;

  const ranked = [...participants].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  const cumulRanked = Object.entries(cumulative).sort((a, b) => b[1] - a[1]);

  return (
    <div className="w-full max-w-4xl mx-auto p-2 md:p-6">
      <div className="bg-[#181825] rounded-2xl border border-[#232336] shadow-[0_0_24px_0_rgba(236,72,153,0.15)] px-4 py-6 md:px-8 md:py-10">

        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏆</div>
          <h1 className="text-3xl font-bold text-pink-400 mb-1">Game Over!</h1>
          <p className="text-gray-400 text-sm">{gameNames[gameType] || gameType}</p>
        </div>

        {/* This game ranking */}
        <div className="mb-8">
          <h2 className="text-white font-bold text-lg mb-4 text-center">This Game</h2>
          <div className="space-y-3">
            {ranked.map((p, i) => {
              const score = scores[p.id] || 0;
              const isYou = p.user_name === currentUserName;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl ${i === 0 ? 'bg-gradient-to-r from-[#a259ff]/20 to-[#f246a9]/20 border border-[#a259ff]/40' : 'bg-[#232336]'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl w-8 text-center">{medals[i] || `${i + 1}.`}</span>
                    <span className={`font-semibold text-sm md:text-base ${isYou ? 'text-pink-400' : 'text-white'}`}>
                      {p.user_name}{isYou ? ' (You)' : ''}
                    </span>
                  </div>
                  <span className="text-white font-bold text-lg">
                    {score} {isTriviaGame ? 'correct' : 'pts'}
                  </span>
                </div>
              );
            })}
          </div>
          {!isTriviaGame && (
            <p className="text-gray-500 text-xs text-center mt-3">
              Points for picking the majority answer each round
            </p>
          )}
        </div>

        {/* Cumulative leaderboard */}
        {cumulRanked.length > 0 && (
          <div className="mb-8">
            <h2 className="text-white font-bold text-lg mb-4 text-center">Overall Leaderboard</h2>
            <div className="space-y-2">
              {cumulRanked.map(([userName, total], i) => {
                const isYou = userName === currentUserName;
                return (
                  <div key={userName} className="flex items-center justify-between px-4 py-2 rounded-lg bg-[#232336]">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm w-6 text-center">{i + 1}</span>
                      <span className={`text-sm font-medium ${isYou ? 'text-pink-400' : 'text-white'}`}>
                        {userName}{isYou ? ' (You)' : ''}
                      </span>
                    </div>
                    <span className="text-[#a259ff] font-bold">{total} pts total</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        {isHost ? (
          <div className="flex flex-col gap-3 items-center">
            <button
              onClick={() => onAction('replay')}
              className="w-full max-w-xs bg-gradient-to-r from-[#a259ff] to-[#f246a9] text-white font-bold py-3 px-8 rounded-xl hover:from-[#8a4fd8] hover:to-[#d63d8f] transition-all duration-300"
            >
              Play Again
            </button>
            <button
              onClick={() => onAction('pick_new')}
              className="w-full max-w-xs bg-[#232336] text-white font-semibold py-3 px-8 rounded-xl hover:bg-[#2d2d45] transition-all duration-300 border border-[#3d3d5a]"
            >
              Pick a Different Game
            </button>
          </div>
        ) : (
          <div className="text-center text-slate-400 mt-4">
            Waiting for host to start the next game...
          </div>
        )}
      </div>
    </div>
  );
}
