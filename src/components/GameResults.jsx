import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function GameResults({ roomCode, currentUserName, gameType, sessionId, isHost, onReturnToLobby, onAction }) {
  const [participants, setParticipants] = useState([]);
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      // Get all participants
      const { data: participantsData } = await supabase
        .from('participants')
        .select('id, user_name')
        .eq('room_code', roomCode);
      setParticipants(participantsData || []);

      // Get all answers for this session
      const { data: answersData } = await supabase
        .from('game_answers')
        .select('participant_id, answer, submitted_at')
        .eq('game_session_id', sessionId);
      setAnswers(answersData || []);

      // Get questions for this game type
      let qs = [];
      if (gameType === 'music_trivia') {
        qs = (await import('../assets/music_recent.json')).default.questions;
      } else if (gameType === 'guess_the_song') {
        qs = (await import('../assets/guess_the_song.json')).default.questions;
      } else if (gameType === 'would_you_rather') {
        qs = (await import('../assets/questions.json')).default.questions;
      } else if (gameType === 'pick_who') {
        qs = (await import('../assets/pick_who.json')).default.questions;
      }
      setQuestions(qs);

      // Calculate scores (only for trivia/guess games)
      const scoreMap = {};
      if (gameType === 'music_trivia' || gameType === 'guess_the_song') {
        for (const p of participantsData) {
          scoreMap[p.id] = 0;
        }
        answersData.forEach((ans, idx) => {
          // Find the question index for this answer
          // (Assume answers are ordered by question, or use submitted_at to group)
          // For simplicity, group by order of answers per participant
          // This is a simplification; for robust logic, store question index in answers
          const qIdx = Math.floor(idx / participantsData.length);
          const correct = qs[qIdx]?.answer;
          if (ans.answer && correct && ans.answer.trim().toLowerCase() === correct.trim().toLowerCase()) {
            scoreMap[ans.participant_id] = (scoreMap[ans.participant_id] || 0) + 1;
          }
        });
      } else {
        // For WYR/PickWho, just count answers
        for (const p of participantsData) {
          scoreMap[p.id] = answersData.filter(a => a.participant_id === p.id).length;
        }
      }
      setScores(scoreMap);
      setLoading(false);
    };
    fetchResults();
  }, [roomCode, sessionId, gameType]);

  if (loading) return <div className="text-white text-center p-8">Loading results...</div>;

  // Build answer breakdown per question
  const questionBreakdown = questions.map((q, idx) => {
    const perParticipant = {};
    participants.forEach(p => {
      // Find this participant's answer for this question
      const ans = answers.find(a => a.participant_id === p.id && answers.indexOf(a) % questions.length === idx);
      perParticipant[p.id] = ans ? ans.answer : '';
    });
    return {
      question: q.question,
      correct: q.answer,
      answers: perParticipant,
      options: q.options || [],
    };
  });

  return (
    <div className="w-full max-w-4xl mx-auto p-8">
      <div className="bg-[#181825] rounded-2xl border border-[#232336] shadow-lg px-8 py-10 text-center">
        <h1 className="text-4xl font-bold text-pink-400 mb-4">Game Over!</h1>
        <h2 className="text-xl text-white mb-8">Results</h2>
        <div className="mb-8">
          <table className="w-full text-white text-lg mb-6">
            <thead>
              <tr>
                <th className="py-2">Player</th>
                <th className="py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {participants.map(p => (
                <tr key={p.id}>
                  <td className="py-2 font-semibold">{p.user_name}</td>
                  <td className="py-2">{scores[p.id] || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mb-8">
          <h3 className="text-lg text-pink-300 mb-2">Question Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-base border">
              <thead>
                <tr>
                  <th className="py-1 px-2">#</th>
                  <th className="py-1 px-2">Question</th>
                  <th className="py-1 px-2">Correct</th>
                  {participants.map(p => (
                    <th key={p.id} className="py-1 px-2">{p.user_name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {questionBreakdown.map((q, i) => (
                  <tr key={i}>
                    <td className="py-1 px-2 font-mono">{i + 1}</td>
                    <td className="py-1 px-2 text-left">{q.question}</td>
                    <td className="py-1 px-2 text-green-400 font-bold">{q.correct || '-'}</td>
                    {participants.map(p => (
                      <td key={p.id} className={q.answers[p.id] && q.answers[p.id] === q.correct ? 'text-green-400' : 'text-red-400'}>
                        {q.answers[p.id] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {isHost ? (
          <div className="flex flex-col gap-4 items-center">
            <button
              className="bg-gradient-to-r from-[#a259ff] to-[#f246a9] text-white font-bold py-3 px-8 rounded-xl text-lg hover:from-[#8a4fd8] hover:to-[#d63d8f] transition-all duration-300"
              onClick={() => onAction && onAction('replay')}
            >
              Play Again
            </button>
            <button
              className="bg-gradient-to-r from-[#f246a9] to-[#a259ff] text-white font-bold py-3 px-8 rounded-xl text-lg hover:from-[#d63d8f] hover:to-[#8a4fd8] transition-all duration-300"
              onClick={() => onAction && onAction('pick_new')}
            >
              Pick a Different Game
            </button>
            <button
              className="mt-2 text-slate-300 underline"
              onClick={onReturnToLobby}
            >
              Return to Lobby
            </button>
          </div>
        ) : (
          <div className="text-slate-300 mt-4">Waiting for host to continue...</div>
        )}
      </div>
    </div>
  );
} 