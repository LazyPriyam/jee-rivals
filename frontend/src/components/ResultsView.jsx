import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { api } from '../utils/api';
import MathRenderer from './MathRenderer';
import { Trophy, Crown, ArrowLeft, RefreshCw, CheckCircle2, XCircle, BookOpen, AlertTriangle, Lightbulb, Image as ImageIcon, Flame } from 'lucide-react';

export default function ResultsView({ roomCode, user, onReturnArena, onRematch, onViewProfile }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' or 'solutions'

  useEffect(() => {
    try {
      confetti({
        particleCount: 110,
        spread: 75,
        origin: { y: 0.6 },
      });
    } catch (_) {}

    api.rooms.results(roomCode)
      .then((data) => {
        setResults(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [roomCode]);

  if (loading || !results) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center font-mono">
        <div className="inline-block animate-spin text-orange-500 mb-4">
          <RefreshCw className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-white">Tabulating Combat Results...</h2>
      </div>
    );
  }

  const participants = results.participants || [];
  const winner = participants[0];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 page-transition">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onReturnArena}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Arena</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'summary'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-950/40 font-black'
                : 'text-slate-400 hover:text-white bg-[#101524] border border-white/10'
            }`}
          >
            Podium & Standings
          </button>
          <button
            onClick={() => setActiveTab('solutions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === 'solutions'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-950/40 font-black'
                : 'text-slate-400 hover:text-white bg-[#101524] border border-white/10'
            }`}
          >
            Step-by-Step Solutions
          </button>
        </div>
      </div>

      {activeTab === 'summary' ? (
        <div>
          {/* Winner Hero Banner */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-amber-950 border border-amber-400/50 text-amber-300 mb-3 shadow-2xl shadow-amber-950/80">
              <Crown className="w-8 h-8 fill-amber-300" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white">
              {winner ? `${winner.username} Claims Victory!` : 'Match Concluded'}
            </h1>
            <p className="text-xs uppercase tracking-widest text-slate-400 mt-1 font-mono">
              Room #{results.room_code} • {results.mode === 'MOCK_TEST' ? 'Common NTA Mock Examination (Identical Question Paper)' : results.mode}
            </p>
          </div>

          {/* Podium Display (1st, 2nd, 3rd) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 max-w-3xl mx-auto items-end">
            {/* 2nd Place */}
            {participants[1] ? (
              <div className="order-2 md:order-1 bg-[#101524] border border-white/10 rounded-2xl p-5 text-center shadow-lg">
                <span className="text-2xl mb-1 block">🥈</span>
                <span className="text-xs font-mono font-bold text-slate-400">RANK #2</span>
                <h3 
                  onClick={() => onViewProfile && onViewProfile(participants[1].username)}
                  className="text-base font-bold text-white truncate mt-1 hover:text-orange-400 hover:underline cursor-pointer transition-colors"
                  title={`View ${participants[1].username}'s profile`}
                >
                  {participants[1].username}
                </h3>
                {results.mode === 'MOCK_TEST' ? (
                  <>
                    <div className="font-mono font-black text-xl text-orange-400 mt-2">
                      {participants[1].marks >= 0 ? '+' : ''}{participants[1].marks} Marks
                    </div>
                    <span className="text-xs text-slate-400 block font-mono">
                      {participants[1].accuracy !== undefined ? `${participants[1].accuracy}% Accuracy` : `${participants[1].score} pts`}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="font-mono font-black text-xl text-slate-200 mt-2">
                      {participants[1].score} pts
                    </div>
                    <span className="text-xs text-slate-400 block font-mono">
                      {participants[1].marks} Marks
                    </span>
                  </>
                )}
              </div>
            ) : <div className="hidden md:block"></div>}

            {/* 1st Place */}
            {winner && (
              <div className="order-1 md:order-2 bg-gradient-to-b from-[#182136] to-[#101524] border-2 border-orange-500 rounded-3xl p-6 text-center shadow-2xl shadow-orange-950/50 -translate-y-2 glow-orange-subtle">
                <span className="text-4xl mb-1 block">👑</span>
                <span className="text-xs font-mono font-bold text-amber-400">CHAMPION #1</span>
                <h3 
                  onClick={() => onViewProfile && onViewProfile(winner.username)}
                  className="text-lg font-black text-white truncate mt-1 hover:text-orange-400 hover:underline cursor-pointer transition-colors"
                  title={`View ${winner.username}'s profile`}
                >
                  {winner.username}
                </h3>
                {results.mode === 'MOCK_TEST' ? (
                  <>
                    <div className="font-mono font-black text-3xl text-orange-400 mt-2">
                      {winner.marks >= 0 ? '+' : ''}{winner.marks} Marks
                    </div>
                    <span className="text-xs text-amber-200/80 block font-mono">
                      {winner.accuracy !== undefined ? `${winner.accuracy}% Accuracy` : `${winner.score} pts`}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="font-mono font-black text-3xl text-orange-400 mt-2">
                      {winner.score} pts
                    </div>
                    <span className="text-xs text-amber-200/80 block font-mono">
                      {winner.marks} Marks
                    </span>
                  </>
                )}
              </div>
            )}

            {/* 3rd Place */}
            {participants[2] ? (
              <div className="order-3 bg-[#101524] border border-white/10 rounded-2xl p-5 text-center shadow-lg">
                <span className="text-2xl mb-1 block">🥉</span>
                <span className="text-xs font-mono font-bold text-slate-400">RANK #3</span>
                <h3 
                  onClick={() => onViewProfile && onViewProfile(participants[2].username)}
                  className="text-base font-bold text-white truncate mt-1 hover:text-orange-400 hover:underline cursor-pointer transition-colors"
                  title={`View ${participants[2].username}'s profile`}
                >
                  {participants[2].username}
                </h3>
                {results.mode === 'MOCK_TEST' ? (
                  <>
                    <div className="font-mono font-black text-xl text-orange-400 mt-2">
                      {participants[2].marks >= 0 ? '+' : ''}{participants[2].marks} Marks
                    </div>
                    <span className="text-xs text-slate-400 block font-mono">
                      {participants[2].accuracy !== undefined ? `${participants[2].accuracy}% Accuracy` : `${participants[2].score} pts`}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="font-mono font-black text-xl text-slate-200 mt-2">
                      {participants[2].score} pts
                    </div>
                    <span className="text-xs text-slate-400 block font-mono">
                      {participants[2].marks} Marks
                    </span>
                  </>
                )}
              </div>
            ) : <div className="hidden md:block"></div>}
          </div>

          {/* Full Scoreboard Matrix Table */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 shadow-xl mb-8">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-orange-400" />
              <span>Full Participant Standings</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-slate-500 uppercase font-mono">
                    <th className="pb-3 pl-2">Rank</th>
                    <th className="pb-3">Candidate</th>
                    {results.mode === 'MOCK_TEST' ? (
                      <>
                        <th className="pb-3 text-right">Marks (+4/-1)</th>
                        <th className="pb-3 text-right">Accuracy</th>
                        <th className="pb-3 text-right">Attempted</th>
                      </>
                    ) : (
                      <>
                        <th className="pb-3 text-right">Score</th>
                        <th className="pb-3 text-right">Marks</th>
                      </>
                    )}
                    <th className="pb-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {participants.map((p) => {
                    const isMe = user && p.user_id === user.id;
                    return (
                      <tr
                        key={p.user_id}
                        className={isMe ? 'bg-orange-950/30 font-semibold' : 'hover:bg-white/5'}
                      >
                        <td className="py-3.5 pl-2 font-mono text-orange-400 font-bold">
                          #{p.rank}
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-2">
                            <span 
                              onClick={() => onViewProfile && onViewProfile(p.username)}
                              className="font-bold text-white hover:text-orange-400 hover:underline cursor-pointer transition-colors"
                              title={`View ${p.username}'s profile`}
                            >
                              {p.username}
                            </span>
                            {isMe && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-orange-950 border border-orange-500/40 text-orange-400 rounded font-bold">
                                YOU
                              </span>
                            )}
                          </div>
                        </td>
                        {results.mode === 'MOCK_TEST' ? (
                          <>
                            <td className="py-3.5 text-right font-mono font-black text-orange-400">
                              {p.marks !== undefined ? `${p.marks >= 0 ? '+' : ''}${p.marks}` : `${p.score} pts`}
                            </td>
                            <td className="py-3.5 text-right font-mono text-emerald-400 font-bold">
                              {p.accuracy !== undefined ? `${p.accuracy}%` : '-'}
                            </td>
                            <td className="py-3.5 text-right font-mono text-slate-300">
                              {p.total_attempted !== undefined ? `${p.total_attempted} / ${results.total_questions}` : '-'}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-3.5 text-right font-mono font-black text-orange-400">
                              {p.score}
                            </td>
                            <td className="py-3.5 text-right font-mono text-slate-300">
                              {p.marks}
                            </td>
                          </>
                        )}
                        <td className="py-3.5 text-center">
                          <span className="text-xs text-emerald-400 font-mono">
                            {p.is_finished ? 'Finished' : 'Writing'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Step-by-Step Solutions & Comparative Breakdown */
        <div className="space-y-6">
          <div className="mb-4">
            <h2 className="text-xl font-black text-white">Full Derivation & Analysis</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Review correct keys, candidate selections, and mathematical derivations with KaTeX.
            </p>
          </div>

          {results.questions?.map((item, idx) => {
            const q = item.question;
            const sol = item.solution;

            return (
              <div
                key={q.id}
                className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl"
              >
                {/* Question Header */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-orange-950 border border-orange-500/40 text-orange-400 rounded-lg text-xs font-bold font-mono">
                      Question {idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-300">
                      {q.subject} • {q.chapter}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-400 font-bold">
                    Official Key: <span className="text-emerald-400 font-black">{sol.correct_answer}</span>
                  </span>
                </div>

                {/* Question Statement */}
                <div className="text-sm sm:text-base text-slate-100 mb-4 leading-relaxed">
                  <MathRenderer content={q.text} />
                </div>

                {/* Diagram */}
                {q.has_diagram && q.diagram_urls && q.diagram_urls.length > 0 && (
                  <div className="mb-4 bg-[#1e2433] border border-white/10 rounded-xl p-3 inline-block">
                    <img
                      src={q.diagram_urls[0]}
                      alt="Question diagram"
                      className="max-h-48 object-contain rounded bg-white p-2"
                    />
                  </div>
                )}

                {/* Options List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6 text-xs">
                  {q.options?.map((opt) => {
                    const isCorrect = String(opt.key).toUpperCase() === String(sol.correct_answer).toUpperCase();
                    return (
                      <div
                        key={opt.key}
                        className={`p-3 rounded-xl border flex items-start gap-2 ${
                          isCorrect
                            ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-200'
                            : 'border-white/10 bg-[#1e2433] text-slate-300'
                        }`}
                      >
                        <span className={`w-5 h-5 shrink-0 rounded flex items-center justify-center font-mono font-bold ${
                          isCorrect ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {opt.key}
                        </span>
                        <div className="pt-0.5 flex-1">
                          <MathRenderer content={opt.text} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Comparative Participant Choices */}
                <div className="mb-6 bg-[#1e2433] rounded-2xl p-4 border border-white/10">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Participant Choices
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {participants.map((p) => {
                      const userAns = p.answers?.[q.id];
                      const chosen = userAns?.selected || 'SKIPPED';
                      const isCorrect = userAns?.correct;
                      return (
                        <div
                          key={p.user_id}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs ${
                            isCorrect
                              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                              : 'border-rose-500/40 bg-rose-950/40 text-rose-300'
                          }`}
                        >
                          <span className="font-semibold">{p.username}:</span>
                          <span className="font-mono font-black">{chosen}</span>
                          {isCorrect ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Full Solution Box */}
                {sol.solution_text && (
                  <div className="bg-[#202534] border border-orange-500/20 rounded-2xl p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">
                      <BookOpen className="w-4 h-4" />
                      <span>Step-by-Step Derivation</span>
                    </div>
                    <div className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                      <MathRenderer content={sol.solution_text} />
                    </div>

                    {sol.common_pitfall && (
                      <div className="mt-3 p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl flex items-start gap-2 text-amber-300 text-xs">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                        <div>
                          <strong className="block font-semibold">Common Pitfall:</strong>
                          <span>{sol.common_pitfall}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-8 flex items-center justify-center gap-4">
        <button
          onClick={onReturnArena}
          className="px-8 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-extrabold rounded-2xl transition cursor-pointer text-sm shadow-xl shadow-orange-950/50 glow-orange-subtle"
        >
          Return to Arena
        </button>
      </div>
    </div>
  );
}
