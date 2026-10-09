import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import { formatISTTime, formatLastOnline } from '../utils/dateUtils';
import {
  Swords,
  Send,
  X,
  Clock,
  Flame,
  Shield,
  Check,
  CheckCheck,
  RefreshCw,
  Trophy,
  Zap,
  MessageCircle,
  Sparkles,
  ChevronDown
} from 'lucide-react';

const DIVISION_COLORS = {
  GRANDMASTER: 'text-red-400 bg-red-950/80 border-red-500/50',
  MASTER: 'text-purple-300 bg-purple-950/80 border-purple-500/50',
  DIAMOND: 'text-blue-300 bg-blue-950/80 border-blue-400/50',
  PLATINUM: 'text-emerald-300 bg-emerald-950/80 border-emerald-500/50',
  GOLD: 'text-amber-300 bg-amber-950/80 border-amber-500/50',
  SILVER: 'text-slate-300 bg-slate-800 border-slate-600/50',
  BRONZE: 'text-orange-400 bg-orange-950/80 border-orange-700/50',
};

const QUICK_RESPONSES = [
  '⚔️ Ready for a duel?',
  '🔥 Good game!',
  '⚡ Let\'s grind Speed Duel!',
  '📚 Physics or Math?',
  '🎯 Target 99+ percentile!'
];

export default function FriendChatDrawer({
  isOpen,
  onClose,
  activeFriend,
  currentUser,
  onAcceptDuel,
  onViewProfile
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingChallenge, setSendingChallenge] = useState(false);
  const [challengeSettingsOpen, setChallengeSettingsOpen] = useState(false);
  const [questionCount, setQuestionCount] = useState(5);
  const [timePerQuestion, setTimePerQuestion] = useState(60);
  const [processingChallengeId, setProcessingChallengeId] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && activeFriend?.id) {
      fetchHistory(true);
      const interval = setInterval(() => {
        fetchHistory(false);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, activeFriend?.id]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        scrollToBottom();
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchHistory = async (showLoading = false) => {
    if (!activeFriend?.id) return;
    if (showLoading) setLoading(true);
    try {
      const res = await api.friends.getChatHistory(activeFriend.id);
      if (res && res.messages) {
        setMessages(res.messages);
      }
    } catch (_) {
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || sending || !activeFriend?.id) return;

    sound.click();
    setSending(true);
    setInputText('');

    // Optimistic UI insert
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      sender_id: currentUser?.id,
      receiver_id: activeFriend.id,
      is_mine: true,
      message: text,
      message_type: 'TEXT',
      metadata: {},
      is_read: false,
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await api.friends.sendMessage(activeFriend.id, text);
      if (res) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? res : m))
        );
      }
    } catch (err) {
      alert(err.message || 'Failed to send message.');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(text);
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  const handleSendQuickResponse = (text) => {
    setInputText(text);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleSendChallenge = async () => {
    if (sendingChallenge || !activeFriend?.id) return;
    sound.click();
    setSendingChallenge(true);
    try {
      const res = await api.friends.sendChatChallenge(activeFriend.id, {
        preset_name: '1-on-1 Speed Duel',
        question_count: questionCount,
        time_per_question: timePerQuestion,
      });

      if (res && res.message) {
        setMessages((prev) => [...prev, res.message]);
        setChallengeSettingsOpen(false);
        sound.start();
        scrollToBottom();
      }
    } catch (err) {
      alert(err.message || 'Could not issue duel challenge.');
    } finally {
      setSendingChallenge(false);
    }
  };

  const handleRespondChallenge = async (challengeId, accept) => {
    sound.click();
    setProcessingChallengeId(challengeId);
    try {
      const res = await api.friends.respondChatChallenge(challengeId, accept);
      if (accept && res?.room_code) {
        if (onAcceptDuel) {
          onAcceptDuel(res.room_code);
        }
        onClose();
      } else {
        await fetchHistory(false);
      }
    } catch (err) {
      alert(err.message || 'Error updating challenge status.');
    } finally {
      setProcessingChallengeId(null);
    }
  };

  const renderAvatarEmoji = (avatarId) => {
    switch (avatarId) {
      case 'atom': return '⚛️';
      case 'zap': return '⚡';
      case 'rocket': return '🚀';
      case 'flame': return '🔥';
      case 'shield': return '🛡️';
      case 'target': return '🎯';
      case 'compass': return '🧭';
      case 'brain': return '🧠';
      default: return '🔥';
    }
  };

  const formatMessageTime = (isoString) => {
    return formatISTTime(isoString, '');
  };

  if (!isOpen || !activeFriend) return null;

  const divStyle =
    DIVISION_COLORS[activeFriend.current_division] || DIVISION_COLORS.BRONZE;

  const presence = formatLastOnline(activeFriend.last_active, activeFriend.is_online);

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs sm:hidden"
        onClick={onClose}
      />

      {/* Floating Chat Window / Slide-over Drawer */}
      <div className="fixed bottom-0 right-0 sm:right-6 sm:bottom-6 z-50 w-full sm:w-[420px] max-w-full h-[580px] max-h-[92vh] bg-[#1a202c] border border-orange-500/40 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden glow-orange-subtle animate-in slide-in-from-bottom duration-200">
        {/* Drawer Header */}
        <div className="px-4 py-3 bg-[#242b3b] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-xl bg-orange-950/80 border border-orange-500/40 flex items-center justify-center text-xl shadow-inner">
                {renderAvatarEmoji(activeFriend.avatar_id)}
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#242b3b] ${
                  presence.isOnline
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-slate-500'
                }`}
                title={presence.detail || presence.badgeText}
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="font-black text-sm text-white truncate max-w-[130px]">
                  {activeFriend.username}
                </h4>
                <span
                  className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${divStyle}`}
                >
                  {activeFriend.current_division || 'BRONZE'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
                <span className="text-orange-400 font-bold">
                  {Math.round(activeFriend.overall_elo || 1200)} Elo
                </span>
                <span>•</span>
                <span
                  className={
                    presence.isOnline
                      ? 'text-emerald-400 font-bold'
                      : presence.statusColor === 'amber'
                      ? 'text-amber-400 font-bold'
                      : 'text-slate-400'
                  }
                >
                  {presence.badgeText}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Duel Trigger in Header */}
            <button
              type="button"
              onClick={() => setChallengeSettingsOpen(!challengeSettingsOpen)}
              title="Issue 1-on-1 Duel Challenge"
              className="px-2.5 py-1.5 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-xs font-black transition flex items-center gap-1 shadow-md shadow-orange-950/50 cursor-pointer"
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Duel</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform ${
                  challengeSettingsOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Optional Collapsible Challenge Setup Tray */}
        {challengeSettingsOpen && (
          <div className="bg-[#1f2635] p-3.5 border-b border-orange-500/30 shrink-0 space-y-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-orange-400 flex items-center gap-1">
                <Swords className="w-3.5 h-3.5" /> 1-on-1 Speed Duel Settings
              </span>
              <button
                type="button"
                onClick={() => setChallengeSettingsOpen(false)}
                className="text-[10px] text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Questions
                </label>
                <div className="flex gap-1">
                  {[3, 5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setQuestionCount(num)}
                      className={`flex-1 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                        questionCount === num
                          ? 'bg-orange-500 text-white shadow'
                          : 'bg-[#151922] text-slate-400 hover:text-white'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Time / Q
                </label>
                <div className="flex gap-1">
                  {[45, 60, 90].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setTimePerQuestion(sec)}
                      className={`flex-1 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                        timePerQuestion === sec
                          ? 'bg-orange-500 text-white shadow'
                          : 'bg-[#151922] text-slate-400 hover:text-white'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={sendingChallenge}
              onClick={handleSendChallenge}
              className="w-full py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs rounded-xl shadow-lg shadow-orange-950/40 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {sendingChallenge ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating Duel...</span>
                </>
              ) : (
                <>
                  <Swords className="w-3.5 h-3.5" />
                  <span>Send In-Chat Duel Challenge</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Message Stream Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin bg-[#161a24]/60">
          {loading && messages.length === 0 ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-orange-400 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-mono">
                Loading messages...
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="py-14 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="w-6 h-6" />
              </div>
              <h5 className="font-bold text-sm text-white mb-1">
                Say hello to {activeFriend.username}!
              </h5>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mb-4">
                Chat about JEE formulas, mock scores, or challenge each other to a live 1-on-1 Speed Duel.
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {QUICK_RESPONSES.slice(0, 3).map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendQuickResponse(prompt)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-[#202738] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 border border-white/5 transition cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.is_mine;
              const isChallenge = msg.message_type === 'CHALLENGE';
              const meta = msg.metadata || {};
              const challengeStatus = meta.status || 'PENDING';

              if (isChallenge) {
                // Interactive Duel Challenge Card in Chat Stream
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'} my-2`}
                  >
                    <div className="max-w-[88%] bg-gradient-to-br from-[#29221d] via-[#202636] to-[#1a1f2c] border-2 border-orange-500/80 rounded-2xl p-3.5 shadow-xl glow-orange-subtle space-y-2.5">
                      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center text-xs">
                            ⚔️
                          </div>
                          <span className="text-[11px] font-black uppercase text-orange-400 tracking-wider">
                            1-on-1 Duel Challenge
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/40 text-amber-300 border border-amber-500/30">
                          #{meta.room_code || 'DUEL'}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-slate-200">
                        {isMine
                          ? `You challenged ${activeFriend.username}`
                          : `${activeFriend.username} challenged you`}
                      </p>

                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-black/30 p-2 rounded-xl text-slate-300 border border-white/5">
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-sans font-bold">
                            Questions
                          </span>
                          <span className="font-bold text-white">
                            {meta.question_count || 5} Qs
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-sans font-bold">
                            Speed
                          </span>
                          <span className="font-bold text-white">
                            {meta.time_per_question || 60}s / Q
                          </span>
                        </div>
                      </div>

                      {/* Challenge Actions depending on sender & status */}
                      {challengeStatus === 'PENDING' && (
                        <div>
                          {!isMine ? (
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                disabled={processingChallengeId === meta.challenge_id}
                                onClick={() =>
                                  handleRespondChallenge(meta.challenge_id, true)
                                }
                                className="flex-1 py-1.5 px-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                {processingChallengeId === meta.challenge_id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Swords className="w-3.5 h-3.5" />
                                )}
                                <span>ACCEPT DUEL</span>
                              </button>
                              <button
                                type="button"
                                disabled={processingChallengeId === meta.challenge_id}
                                onClick={() =>
                                  handleRespondChallenge(meta.challenge_id, false)
                                }
                                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-bold text-xs rounded-xl border border-white/10 transition cursor-pointer"
                              >
                                Decline
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[11px] text-orange-300 font-mono flex items-center gap-1 animate-pulse">
                                <Clock className="w-3 h-3" /> Waiting for reply...
                              </span>
                              {meta.room_code && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onAcceptDuel) onAcceptDuel(meta.room_code);
                                    onClose();
                                  }}
                                  className="text-[10px] font-bold text-orange-400 hover:underline cursor-pointer"
                                >
                                  Enter Lobby &rarr;
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {challengeStatus === 'ACCEPTED' && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] font-black text-emerald-400 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Challenge Accepted!
                          </span>
                          {meta.room_code && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onAcceptDuel) onAcceptDuel(meta.room_code);
                                onClose();
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] rounded-lg shadow cursor-pointer"
                            >
                              Join Match
                            </button>
                          )}
                        </div>
                      )}

                      {challengeStatus === 'DECLINED' && (
                        <div className="pt-1">
                          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                            <X className="w-3.5 h-3.5" /> Challenge was declined
                          </span>
                        </div>
                      )}

                      <div className="text-[9px] text-slate-400 font-mono text-right">
                        {formatMessageTime(msg.created_at)}
                      </div>
                    </div>
                  </div>
                );
              }

              // Standard Direct Message Bubble
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl shadow text-xs ${
                      isMine
                        ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-br-xs'
                        : 'bg-[#222a3a] border border-white/10 text-slate-100 rounded-bl-xs'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed font-sans">
                      {msg.message}
                    </p>
                    <div
                      className={`text-[9px] font-mono mt-1 flex items-center justify-end gap-1 ${
                        isMine ? 'text-orange-200' : 'text-slate-400'
                      }`}
                    >
                      <span>{formatMessageTime(msg.created_at)}</span>
                      {isMine && (
                        <span>
                          {msg.is_read ? (
                            <CheckCheck className="w-3 h-3 text-orange-200 inline" />
                          ) : (
                            <Check className="w-3 h-3 text-orange-300 inline" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Chips Drawer Footer */}
        <div className="px-3 py-1.5 bg-[#181d28] border-t border-white/5 flex items-center gap-1.5 overflow-x-auto scrollbar-none shrink-0">
          {QUICK_RESPONSES.map((txt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSendQuickResponse(txt)}
              className="px-2.5 py-1 rounded-full text-[10px] bg-[#222a3a] hover:bg-orange-500/20 text-slate-300 hover:text-orange-400 border border-white/5 whitespace-nowrap transition cursor-pointer font-medium"
            >
              {txt}
            </button>
          ))}
        </div>

        {/* Message Input Box */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 bg-[#1e2433] border-t border-white/10 flex items-center gap-2 shrink-0"
        >
          <button
            type="button"
            onClick={() => setChallengeSettingsOpen(!challengeSettingsOpen)}
            title="Issue Duel Challenge"
            className="p-2 text-slate-400 hover:text-orange-400 rounded-xl hover:bg-white/5 transition cursor-pointer shrink-0"
          >
            <Swords className="w-4 h-4" />
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Message ${activeFriend.username}...`}
            className="flex-1 bg-[#141822] border border-white/10 focus:border-orange-500/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-400 focus:outline-hidden transition font-sans"
            maxLength={500}
          />

          <button
            type="submit"
            disabled={!inputText.trim() || sending}
            className="p-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white rounded-xl shadow transition cursor-pointer disabled:opacity-40 shrink-0"
          >
            {sending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </>
  );
}
