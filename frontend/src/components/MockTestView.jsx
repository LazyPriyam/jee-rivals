import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/api';
import MathRenderer from './MathRenderer';
import { sound } from '../utils/sound';
import ReportQuestionModal from './ReportQuestionModal';
import { Clock, AlertTriangle, FileText, X, Image as ImageIcon, CheckCircle, ChevronLeft, ChevronRight, User, Flag, BookOpen } from 'lucide-react';
import { normalizeQuestionsWithComprehensions, buildComprehensionGroupMap } from '../utils/comprehension';

  const sortQuestionsBySubject = (raw) => {
    if (!raw || raw.length === 0) return [];
    const normalized = normalizeQuestionsWithComprehensions(raw);
    const order = { 'physics': 1, 'chemistry': 2, 'mathematics': 3, 'maths': 3 };
    return [...normalized].sort((a, b) => {
      const oA = order[(a.subject || '').toLowerCase()] || 99;
      const oB = order[(b.subject || '').toLowerCase()] || 99;
      if (oA !== oB) return oA - oB;
      if (a.passage_id && b.passage_id && a.passage_id === b.passage_id) {
        return (a.subquestion_index || 0) - (b.subquestion_index || 0);
      }
      return (a.id || '').localeCompare(b.id || '');
    });
  };

export default function MockTestView({ room, user, onMatchComplete, onExitToDashboard }) {
  const storageKey = `jee_mock_test_progress_${room.code}`;
  const getSavedProgress = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  };
  const savedProgress = getSavedProgress();

  const [questions, setQuestions] = useState(() => sortQuestionsBySubject(room.all_questions || []));
  const [currentIndex, setCurrentIndex] = useState(() => savedProgress?.currentIndex ?? 0);
  const [answers, setAnswers] = useState(() => savedProgress?.answers || {}); // q_id -> selected_option
  const [reviewMarks, setReviewMarks] = useState(() => savedProgress?.reviewMarks || {}); // q_id -> bool
  const [visited, setVisited] = useState(() => savedProgress?.visited || { 0: true });
  const [submitting, setSubmitting] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [exitWarningModalOpen, setExitWarningModalOpen] = useState(false);
  const [questionPaperModalOpen, setQuestionPaperModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(() => {
    const sorted = sortQuestionsBySubject(room.all_questions || []);
    return sorted[savedProgress?.currentIndex || 0]?.subject || sorted[0]?.subject || 'Physics';
  });

  // Exam Duration in seconds (e.g. 60 min -> 3600s, or room.total_duration_minutes)
  const initialDuration = (room.total_duration_minutes || 60) * 60;

  // Global server-synchronized deadline
  const getExamDeadline = () => {
    // 1. Prefer positive server-computed remaining seconds
    if (room.time_remaining_seconds != null && room.time_remaining_seconds > 0) {
      return Date.now() + room.time_remaining_seconds * 1000;
    }
    // 2. Strict UTC parse of started_at
    if (room.started_at) {
      try {
        const utcStr = (room.started_at.endsWith('Z') || room.started_at.includes('+'))
          ? room.started_at
          : `${room.started_at}Z`;
        const startEpoch = new Date(utcStr).getTime();
        if (!isNaN(startEpoch)) {
          const calcDeadline = startEpoch + initialDuration * 1000;
          if (calcDeadline > Date.now()) {
            return calcDeadline;
          }
        }
      } catch (_) {}
    }
    // 3. Saved progress deadline if future
    if (savedProgress?.deadline && savedProgress.deadline > Date.now()) {
      return savedProgress.deadline;
    }
    if (savedProgress?.timeRemaining !== undefined && savedProgress?.timestamp && savedProgress.timeRemaining > 0) {
      const elapsed = Math.floor((Date.now() - savedProgress.timestamp) / 1000);
      const rem = Math.max(0, savedProgress.timeRemaining - elapsed);
      if (rem > 0) {
        return Date.now() + rem * 1000;
      }
    }
    return Date.now() + initialDuration * 1000;
  };

  const deadlineRef = useRef(getExamDeadline());
  const [timeRemaining, setTimeRemaining] = useState(() => {
    return Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
  });

  const startTimeRef = useRef(Date.now());
  const timerRef = useRef(null);

  // Intercept browser back button and trigger exit warning modal
  useEffect(() => {
    window.history.pushState({ inMockTest: true }, '', window.location.href);

    const handlePopState = () => {
      window.history.pushState({ inMockTest: true }, '', window.location.href);
      setExitWarningModalOpen(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Save active room code and question progress to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('jee_active_test_room', room.code);
      localStorage.setItem(storageKey, JSON.stringify({
        currentIndex,
        answers,
        reviewMarks,
        visited,
        deadline: deadlineRef.current,
        timeRemaining,
        timestamp: Date.now()
      }));
    } catch (_) {}
  }, [currentIndex, answers, reviewMarks, visited, timeRemaining, room.code]);

  // Load questions if not loaded
  useEffect(() => {
    if (!questions || questions.length === 0) {
      api.rooms.get(room.code).then((data) => {
        if (data.all_questions && data.all_questions.length > 0) {
          const sorted = sortQuestionsBySubject(data.all_questions);
          setQuestions(sorted);
          if (sorted[0]?.subject && !selectedSubject) {
            setSelectedSubject(sorted[0].subject);
          }
        }
      }).catch(() => {});
    } else {
      const sorted = sortQuestionsBySubject(questions);
      if (JSON.stringify(sorted.map(q => q.id)) !== JSON.stringify(questions.map(q => q.id))) {
        setQuestions(sorted);
      }
      if (sorted[0]?.subject && !selectedSubject) {
        setSelectedSubject(sorted[0].subject);
      }
    }
  }, [room.code]);

  // Global Countdown Timer (immune to tab-switching throttling)
  useEffect(() => {
    clearInterval(timerRef.current);

    const tick = () => {
      const rem = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setTimeRemaining(rem);
      if (rem <= 0 && Date.now() - startTimeRef.current > 3000) {
        clearInterval(timerRef.current);
        handleFinalSubmit();
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    const handleFocus = () => {
      tick();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Periodic server sync for remaining exam time and status
  useEffect(() => {
    const syncInterval = setInterval(() => {
      api.rooms.get(room.code).then((data) => {
        if (!data) return;
        if (data.status === 'COMPLETED') {
          onMatchComplete();
        } else if (data.time_remaining_seconds != null) {
          const serverRem = data.time_remaining_seconds;
          const localRem = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
          if (Math.abs(serverRem - localRem) > 3) {
            deadlineRef.current = Date.now() + serverRem * 1000;
            setTimeRemaining(serverRem);
          }
        }
      }).catch(() => {});
    }, 5000);

    return () => clearInterval(syncInterval);
  }, [room.code]);

  // Format timer as HH:MM:SS
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const currentQ = questions[currentIndex];
  const compGroupMap = React.useMemo(() => buildComprehensionGroupMap(questions), [questions]);
  const currentCompGroup = compGroupMap[currentIndex];

  // Distinct subjects in exam strictly ordered: Physics -> Chemistry -> Mathematics
  const rawSubjects = Array.from(new Set(questions.map((q) => q.subject))).filter(Boolean);
  const subjRank = { 'physics': 1, 'chemistry': 2, 'mathematics': 3, 'maths': 3 };
  rawSubjects.sort((a, b) => (subjRank[(a || '').toLowerCase()] || 99) - (subjRank[(b || '').toLowerCase()] || 99));
  const effectiveSubjects = rawSubjects.length > 0 ? rawSubjects : ['Physics', 'Chemistry', 'Mathematics'];

  // Indices for selected subject
  const currentSubjectIndices = questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => q.subject === selectedSubject)
    .map(({ idx }) => idx);

  const goToQuestion = (idx) => {
    sound.click();
    setCurrentIndex(idx);
    setVisited((prev) => ({ ...prev, [idx]: true }));
    if (questions[idx]?.subject) {
      setSelectedSubject(questions[idx].subject);
    }
  };

  const handleSelectOption = (key) => {
    if (!currentQ) return;
    sound.click();
    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: key,
    }));
  };

  const handleClearResponse = () => {
    if (!currentQ) return;
    sound.click();
    setAnswers((prev) => {
      const copy = { ...prev };
      delete copy[currentQ.id];
      return copy;
    });
  };

  const handleSaveAndNext = () => {
    sound.click();
    if (currentIndex < questions.length - 1) {
      goToQuestion(currentIndex + 1);
    }
  };

  const handleSaveAndMarkReview = () => {
    if (!currentQ) return;
    sound.click();
    setReviewMarks((prev) => ({
      ...prev,
      [currentQ.id]: true,
    }));
    if (currentIndex < questions.length - 1) {
      goToQuestion(currentIndex + 1);
    }
  };

  const handleMarkReviewAndNext = () => {
    if (!currentQ) return;
    sound.click();
    setReviewMarks((prev) => ({
      ...prev,
      [currentQ.id]: true,
    }));
    // Remove answer if user clicked Mark for review without saving answer
    setAnswers((prev) => {
      const copy = { ...prev };
      delete copy[currentQ.id];
      return copy;
    });
    if (currentIndex < questions.length - 1) {
      goToQuestion(currentIndex + 1);
    }
  };

  const handleFinalSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitModalOpen(false);
    setExitWarningModalOpen(false);

    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem('jee_active_test_room');
    } catch (_) {}

    const totalTime = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      await api.rooms.submitBulk(room.code, answers, totalTime);
      onMatchComplete();
    } catch (err) {
      console.error(err);
      onMatchComplete();
    }
  };

  // Determine NTA status of a question index
  const getQuestionNTAState = (idx) => {
    const q = questions[idx];
    if (!q) return 'NOT_VISITED';
    const isAns = Boolean(answers[q.id]);
    const isRev = Boolean(reviewMarks[q.id]);
    const isVis = Boolean(visited[idx]);

    if (isAns && isRev) return 'ANS_AND_REVIEW';
    if (isRev) return 'REVIEW';
    if (isAns) return 'ANSWERED';
    if (isVis) return 'NOT_ANSWERED';
    return 'NOT_VISITED';
  };

  // Status Metrics per Section
  const getSectionStats = (subj) => {
    const qList = questions.map((q, idx) => ({ q, idx })).filter(({ q }) => !subj || q.subject === subj);
    let answered = 0;
    let notAnswered = 0;
    let markedReview = 0;
    let ansAndReview = 0;
    let notVisited = 0;

    qList.forEach(({ idx }) => {
      const state = getQuestionNTAState(idx);
      if (state === 'ANSWERED') answered++;
      else if (state === 'NOT_ANSWERED') notAnswered++;
      else if (state === 'REVIEW') markedReview++;
      else if (state === 'ANS_AND_REVIEW') ansAndReview++;
      else if (state === 'NOT_VISITED') notVisited++;
    });

    return { total: qList.length, answered, notAnswered, markedReview, ansAndReview, notVisited };
  };

  const overallStats = getSectionStats(null);

  if (!currentQ) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center font-mono">
        <h2 className="text-xl font-bold text-white">Loading Official NTA Examination Question Paper...</h2>
      </div>
    );
  }

  return (
    <div className="bg-[#f1f5f9] text-[#0f172a] min-h-screen flex flex-col font-sans select-none">
      {/* 1. Official NTA Exam Header Bar */}
      <header className="bg-[#1e293b] text-white border-b-2 border-orange-500 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 text-white font-black text-xs px-2.5 py-1 rounded">
              NTA CBT
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
                JEE (Main) 2026 Examination - Computer Based Test
              </h1>
              <p className="text-[10px] text-slate-300 font-mono">
                Room #{room.code} • Marking: +4.0 Correct, -1.0 Incorrect
              </p>
            </div>
          </div>

          {/* Candidate Details & Timer Box */}
          <div className="flex items-center gap-4">
            {/* Real NTA Time Left Box */}
            <div className="flex items-center gap-2 bg-[#0f172a] border border-orange-500/80 px-3.5 py-1.5 rounded-lg text-white font-mono text-sm shadow-inner">
              <Clock className="w-4 h-4 text-orange-400" />
              <div className="text-left">
                <span className="text-[9px] uppercase tracking-wider block text-slate-400 font-bold">Time Left</span>
                <span className={`font-black tracking-wider ${timeRemaining < 300 ? 'text-red-400 animate-pulse' : 'text-orange-400'}`}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
            </div>

            {/* Candidate Info Box */}
            <div className="hidden sm:flex items-center gap-2 bg-[#0f172a] px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
              <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center font-bold text-white">
                <User className="w-4 h-4" />
              </div>
              <div className="text-left text-[11px]">
                <span className="font-bold text-white block max-w-[120px] truncate">{user?.username || 'Candidate'}</span>
                <span className="text-slate-400 font-mono">Roll: JEE2026</span>
              </div>
            </div>

            {onExitToDashboard && (
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  onExitToDashboard();
                }}
                className="px-3 py-1.5 bg-[#0f172a] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                title="Pause screen and return to Dashboard (Match remains live on Dashboard)"
              >
                <span>Dashboard</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. NTA Sections Navigation Bar (Physics | Chemistry | Mathematics) */}
      <div className="bg-[#e2e8f0] border-b border-slate-300 px-4 py-1.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-slate-600 mr-2 uppercase tracking-wider hidden md:inline">
              Sections:
            </span>
            {effectiveSubjects.map((subj) => {
              const isActive = selectedSubject === subj;
              const subQuestions = questions.filter((q) => q.subject === subj);
              const firstIdx = questions.findIndex((q) => q.subject === subj);
              const lastIdx = firstIdx + subQuestions.length - 1;
              return (
                <button
                  key={subj}
                  onClick={() => {
                    sound.click();
                    setSelectedSubject(subj);
                    if (firstIdx !== -1) {
                      goToQuestion(firstIdx);
                    }
                  }}
                  className={`px-4 py-2 rounded-t-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border-t-2 ${
                    isActive
                      ? 'bg-white text-orange-600 border-orange-500 shadow-sm'
                      : 'bg-slate-200/80 text-slate-700 border-transparent hover:bg-slate-300'
                  }`}
                >
                  <span>{subj}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-100 rounded text-slate-600 font-bold">
                    {firstIdx !== -1 ? `Q${firstIdx + 1} - Q${lastIdx + 1}` : `${subQuestions.length} Qs`}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuestionPaperModalOpen(true)}
              className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-300 rounded shadow-sm transition cursor-pointer flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>Question Paper</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main Examination Grid (Question View on Left + Palette on Right) */}
      <div className="max-w-7xl mx-auto w-full px-2 sm:px-4 py-3 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left Pane: Question Paper & Action Buttons (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col justify-between bg-white border border-slate-300 rounded-lg shadow-sm">
          {/* Question Meta Bar */}
          <div>
            <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-800">
                  Question No. {currentIndex + 1}
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-600 font-semibold">{currentQ.subject}</span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-500 text-[11px] truncate max-w-[180px]">{currentQ.chapter}</span>
                <span className="text-slate-400">|</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-bold uppercase">
                  {currentCompGroup?.isPassage ? 'PARAGRAPH / COMPREHENSION' : (currentQ.question_type ? currentQ.question_type.replace('_', ' ') : 'MCQ')}
                </span>
              </div>
              <div className="flex items-center gap-2.5 font-mono text-[11px]">
                <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Correct: +4
                </span>
                <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  Negative: -1
                </span>
                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setReportModalOpen(true);
                  }}
                  className="text-slate-500 hover:text-amber-700 font-sans font-bold flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50/80 hover:bg-amber-100 border border-amber-200/80 transition cursor-pointer"
                  title="Report Defective Question"
                >
                  <Flag className="w-3 h-3 text-amber-600" />
                  <span>Report</span>
                </button>
              </div>
            </div>

            {/* Question Body */}
            <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(100vh-290px)]">
              {/* Official JEE Comprehension Context Box */}
              {(currentCompGroup?.isPassage || currentQ.passage_text) && (
                <div className="mb-6 rounded-xl bg-blue-50/70 border-2 border-blue-200/90 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-100 via-indigo-50 to-blue-50 border-b border-blue-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-blue-700 shrink-0" />
                      <span className="text-xs font-black uppercase tracking-wider text-blue-900">
                        {currentCompGroup?.groupLabel || currentQ.passage_title || 'Comprehension Passage'}
                      </span>
                    </div>
                    {(currentCompGroup?.subIndex || currentQ.subquestion_index) && (
                      <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-blue-200 text-blue-950 font-black border border-blue-300">
                        Question {currentCompGroup?.subIndex || currentQ.subquestion_index} of {currentCompGroup?.subTotal || currentQ.subquestion_total} based on this passage
                      </span>
                    )}
                  </div>
                  <div className="p-4 sm:p-5 text-sm sm:text-base leading-relaxed text-slate-800 font-normal max-h-72 overflow-y-auto border-b border-blue-100 bg-white/75">
                    <MathRenderer content={currentCompGroup?.passageText || currentQ.passage_text} />
                  </div>
                  <div className="px-4 py-1.5 bg-blue-50/90 text-[11px] text-blue-800 font-semibold flex items-center justify-between">
                    <span>Read the paragraph above and answer the question below:</span>
                    <span className="font-mono text-[10px] text-blue-700 uppercase font-bold">NTA CBT Standard</span>
                  </div>
                </div>
              )}

              {/* Question Statement */}
              <div className="text-sm sm:text-base text-slate-900 leading-relaxed font-normal mb-6">
                <MathRenderer content={currentQ.text} />
              </div>

              {/* Diagram */}
              {currentQ.has_diagram && currentQ.diagram_urls && currentQ.diagram_urls.length > 0 && (
                <div className="mb-6 p-3 bg-slate-50 border border-slate-200 rounded-lg inline-block">
                  <div className="text-[11px] text-slate-500 font-semibold mb-1 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-orange-500" />
                    <span>Diagram</span>
                  </div>
                  <img
                    src={currentQ.diagram_urls[0]}
                    alt="Question Diagram"
                    className="max-h-60 object-contain rounded border border-slate-200 bg-white"
                  />
                </div>
              )}

              {/* Options Radio List */}
              <div className="space-y-3 mt-4">
                {currentQ.options && currentQ.options.length > 0 ? (
                  currentQ.options.map((opt) => {
                    const isSelected = answers[currentQ.id] === opt.key;
                    return (
                      <label
                        key={opt.key}
                        onClick={() => handleSelectOption(opt.key)}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-sm transition cursor-pointer ${
                          isSelected
                            ? 'bg-orange-50 border-orange-500 text-slate-950 shadow-sm font-semibold'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${currentQ.id}`}
                          checked={isSelected}
                          onChange={() => handleSelectOption(opt.key)}
                          className="mt-1 accent-orange-600 w-4 h-4 cursor-pointer"
                        />
                        <span className="font-bold text-slate-700 shrink-0">({opt.key})</span>
                        <div className="flex-1">
                          <MathRenderer content={opt.text} />
                        </div>
                      </label>
                    );
                  })
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-xs font-bold text-slate-600 block mb-2">Numerical Answer:</span>
                    <input
                      type="text"
                      placeholder="Enter numerical value..."
                      value={answers[currentQ.id] || ''}
                      onChange={(e) => handleSelectOption(e.target.value)}
                      className="px-4 py-2 border border-slate-300 rounded font-mono text-sm w-48 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Authentic NTA Bottom Action Buttons */}
          <div className="bg-[#f8fafc] border-t border-slate-300 p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveAndNext}
                className="px-4 py-2 bg-[#16a34a] hover:bg-[#15803d] text-white font-bold text-xs rounded shadow transition cursor-pointer"
              >
                Save & Next
              </button>

              <button
                onClick={handleClearResponse}
                disabled={!answers[currentQ.id]}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300 rounded shadow-sm transition cursor-pointer disabled:opacity-40"
              >
                Clear Response
              </button>

              <button
                onClick={handleSaveAndMarkReview}
                className="px-4 py-2 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-xs rounded shadow transition cursor-pointer"
              >
                Save & Mark for Review
              </button>

              <button
                onClick={handleMarkReviewAndNext}
                className="px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-bold text-xs rounded shadow transition cursor-pointer"
              >
                Mark for Review & Next
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => currentIndex > 0 && goToQuestion(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300 rounded shadow-sm transition cursor-pointer disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <button
                onClick={() => currentIndex < questions.length - 1 && goToQuestion(currentIndex + 1)}
                disabled={currentIndex === questions.length - 1}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300 rounded shadow-sm transition cursor-pointer disabled:opacity-40 flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Pane: Official NTA Question Palette & Legend (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col justify-between bg-white border border-slate-300 rounded-lg shadow-sm p-4">
          <div>
            {/* Palette Header */}
            <div className="pb-3 mb-3 border-b border-slate-200">
              <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Question Palette - {selectedSubject}
              </h3>
            </div>

            {/* Official NTA 5-Color Legend */}
            <div className="grid grid-cols-2 gap-2 text-[11px] mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded nta-shape-answered flex items-center justify-center font-bold text-[10px] text-white">
                  {overallStats.answered}
                </span>
                <span className="text-slate-700 font-medium">Answered</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded nta-shape-not-answered flex items-center justify-center font-bold text-[10px] text-white">
                  {overallStats.notAnswered}
                </span>
                <span className="text-slate-700 font-medium">Not Answered</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded nta-shape-not-visited flex items-center justify-center font-bold text-[10px] text-slate-800 border border-slate-300">
                  {overallStats.notVisited}
                </span>
                <span className="text-slate-700 font-medium">Not Visited</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded nta-shape-review flex items-center justify-center font-bold text-[10px] text-white">
                  {overallStats.markedReview}
                </span>
                <span className="text-slate-700 font-medium">Marked Review</span>
              </div>

              <div className="col-span-2 flex items-center gap-1.5 mt-1 pt-1 border-t border-slate-200">
                <span className="w-5 h-5 rounded nta-shape-ans-review flex items-center justify-center font-bold text-[10px] text-white">
                  {overallStats.ansAndReview}
                </span>
                <span className="text-[10px] text-slate-600 font-medium">
                  Ans & Marked Review (will be evaluated)
                </span>
              </div>
            </div>

            {/* Questions Number Grid */}
            <div className="border border-slate-200 rounded-lg p-2 max-h-[300px] overflow-y-auto">
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                {currentSubjectIndices.map((idx) => {
                  const q = questions[idx];
                  const ntaState = getQuestionNTAState(idx);
                  const isCurrent = idx === currentIndex;
                  const groupInfo = compGroupMap[idx];

                  let shapeClass = 'nta-shape-not-visited';
                  if (ntaState === 'ANSWERED') shapeClass = 'nta-shape-answered';
                  else if (ntaState === 'NOT_ANSWERED') shapeClass = 'nta-shape-not-answered';
                  else if (ntaState === 'REVIEW') shapeClass = 'nta-shape-review';
                  else if (ntaState === 'ANS_AND_REVIEW') shapeClass = 'nta-shape-ans-review';

                  return (
                    <button
                      key={q.id}
                      onClick={() => goToQuestion(idx)}
                      title={groupInfo?.isPassage ? `${groupInfo.groupLabel} (Sub-question ${groupInfo.subIndex})` : `Question ${idx + 1}`}
                      className={`h-9 w-9 text-xs font-mono font-bold flex flex-col items-center justify-center cursor-pointer transition relative ${shapeClass} ${
                        isCurrent ? 'ring-2 ring-blue-600 ring-offset-2 scale-105' : 'hover:opacity-90'
                      }`}
                    >
                      <span>{idx + 1}</span>
                      {groupInfo?.isPassage && (
                        <span className="text-[7px] leading-none opacity-85 font-sans font-black tracking-tighter text-blue-200">¶</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Submit Test Button */}
          <div className="pt-4 border-t border-slate-200 mt-4">
            <button
              onClick={() => setSubmitModalOpen(true)}
              className="w-full py-3 bg-[#0284c7] hover:bg-[#0369a1] text-white font-black text-xs uppercase tracking-wider rounded-lg shadow-md transition cursor-pointer"
            >
              SUBMIT TEST
            </button>
          </div>
        </div>
      </div>

      {/* 5. Question Paper Modal (Full Paper Review) */}
      {questionPaperModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col border border-slate-300">
            <div className="bg-[#1e293b] text-white p-3.5 flex items-center justify-between rounded-t-lg">
              <h3 className="font-bold text-sm">Full Examination Question Paper</h3>
              <button
                onClick={() => setQuestionPaperModalOpen(false)}
                className="text-slate-300 hover:text-white p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-900 text-sm">
              {questions.map((q, idx) => (
                <div key={q.id} className="pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2 font-bold text-xs text-orange-600 mb-2">
                    <span>Q{idx + 1}</span>
                    <span>• {q.subject}</span>
                    <span className="text-slate-500">• {q.chapter}</span>
                    {q.passage_text && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded">
                        Sub-Q {q.subquestion_index || 1}
                      </span>
                    )}
                  </div>
                  {q.passage_text && (compGroupMap[idx]?.isFirstInGroup ?? true) && (
                    <div className="mb-3 p-3 bg-blue-50/80 border border-blue-200 rounded text-xs leading-relaxed text-slate-800">
                      <div className="font-bold text-blue-900 mb-1 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{compGroupMap[idx]?.groupLabel || q.passage_title || 'Comprehension Passage'}</span>
                      </div>
                      <MathRenderer content={q.passage_text} />
                    </div>
                  )}
                  <div className="mb-3">
                    <MathRenderer content={q.text} />
                  </div>
                  {q.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {q.options.map((opt) => (
                        <div key={opt.key} className="p-2 bg-slate-50 rounded border border-slate-200">
                          <span className="font-bold mr-1">({opt.key})</span>
                          <MathRenderer content={opt.text} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 bg-slate-100 border-t border-slate-300 text-right rounded-b-lg">
              <button
                onClick={() => setQuestionPaperModalOpen(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded"
              >
                Close Question Paper
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 6. Authentic NTA Exam Summary & Submit Confirmation Modal */}
      {submitModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-lg shadow-2xl max-w-xl w-full border border-slate-300 overflow-hidden">
            <div className="bg-[#1e293b] text-white p-3.5 flex items-center justify-between">
              <h3 className="font-bold text-sm">Examination Summary</h3>
              <button
                onClick={() => setSubmitModalOpen(false)}
                className="text-slate-300 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 text-slate-800 text-xs">
              <p className="mb-4 text-slate-600">
                Please verify your section attempt summary before locking your final submission:
              </p>

              {/* NTA Summary Table */}
              <table className="w-full border-collapse border border-slate-300 text-left mb-6 text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold">
                    <th className="border border-slate-300 p-2">Section</th>
                    <th className="border border-slate-300 p-2 text-center">Total</th>
                    <th className="border border-slate-300 p-2 text-center text-emerald-700">Answered</th>
                    <th className="border border-slate-300 p-2 text-center text-rose-700">Not Answered</th>
                    <th className="border border-slate-300 p-2 text-center text-purple-700">Marked Review</th>
                    <th className="border border-slate-300 p-2 text-center">Not Visited</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveSubjects.map((sub) => {
                    const st = getSectionStats(sub);
                    return (
                      <tr key={sub} className="hover:bg-slate-50">
                        <td className="border border-slate-300 p-2 font-bold">{sub}</td>
                        <td className="border border-slate-300 p-2 text-center font-mono">{st.total}</td>
                        <td className="border border-slate-300 p-2 text-center font-mono font-bold text-emerald-700">{st.answered + st.ansAndReview}</td>
                        <td className="border border-slate-300 p-2 text-center font-mono text-rose-700">{st.notAnswered}</td>
                        <td className="border border-slate-300 p-2 text-center font-mono text-purple-700">{st.markedReview}</td>
                        <td className="border border-slate-300 p-2 text-center font-mono">{st.notVisited}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded-lg mb-6 text-xs">
                <span className="font-bold block mb-1">Important Notice:</span>
                Are you sure you want to conclude the examination? No further changes can be made after final submission.
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setSubmitModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded cursor-pointer"
                >
                  No, Return to Test
                </button>
                <button
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                  className="px-6 py-2 bg-[#16a34a] hover:bg-[#15803d] text-white font-black rounded shadow cursor-pointer"
                >
                  {submitting ? 'Submitting Test...' : 'Yes, Final Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 7. Exit Confirmation Modal on Browser Back Button */}
      {exitWarningModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-300 overflow-hidden text-slate-800">
            <div className="bg-[#1e293b] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">Examination In Progress</h3>
              </div>
              <button
                onClick={() => setExitWarningModalOpen(false)}
                className="text-slate-300 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 text-xs space-y-4">
              <p className="text-slate-600 leading-relaxed">
                You pressed the browser back button. Leaving now will interrupt your examination session.
                You still have <strong className="font-mono text-orange-600">{formatTime(timeRemaining)}</strong> remaining.
              </p>

              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-amber-900 text-xs">
                <strong>Notice:</strong> Your answered questions and progress are safely preserved. If you wish to finish now, you can lock in your final submission.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setExitWarningModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow cursor-pointer transition"
                >
                  Stay in Examination
                </button>
                {onExitToDashboard && (
                  <button
                    onClick={() => {
                      setExitWarningModalOpen(false);
                      onExitToDashboard();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer transition"
                  >
                    Exit to Dashboard
                  </button>
                )}
                <button
                  onClick={handleFinalSubmit}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-red-500 hover:text-white text-slate-700 font-bold text-xs cursor-pointer transition"
                >
                  Submit & Exit
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Report Question Modal */}
      <ReportQuestionModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        questionId={currentQ?.id}
        questionText={currentQ?.text}
      />
    </div>
  );
}
