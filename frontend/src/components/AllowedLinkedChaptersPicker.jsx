import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Link2, Search, X, Check, ChevronDown, ChevronUp,
  Sparkles, History, Zap, RotateCcw
} from 'lucide-react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';

/**
 * Reusable picker for selecting "Allowed Linked Chapters" (prerequisite/supporting concepts)
 * in custom chapter tests and scheduled exams.
 * 
 * Automatically pre-selects:
 * 1. Tested Chapters (chapters already tested in prior scheduled exams)
 * 2. Seen Linked Concepts (multi-concept prerequisites detected in questions of the selected chapters)
 */
export default function AllowedLinkedChaptersPicker({
  selectedChapters = [],
  allowedLinkedChapters = [],
  onChange,
  chaptersMap = {},
  accentColor = 'indigo', // 'indigo' | 'orange'
  autoSelectEnabled = true,
}) {
  const [expanded, setExpanded] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [testedChaptersList, setTestedChaptersList] = useState([]);
  const [recommendedPrerequisites, setRecommendedPrerequisites] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllChapters, setShowAllChapters] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'seen' | 'tested'

  const prevFingerprintRef = useRef('');

  // Strip any chapter from allowedLinkedChapters if it was promoted to a primary chapter
  useEffect(() => {
    if (!allowedLinkedChapters.length || !selectedChapters.length) return;
    const primarySet = new Set(selectedChapters.map((c) => c.toLowerCase()));
    const filtered = allowedLinkedChapters.filter((c) => !primarySet.has(c.toLowerCase()));
    if (filtered.length !== allowedLinkedChapters.length) {
      onChange(filtered);
    }
  }, [selectedChapters, allowedLinkedChapters, onChange]);

  // Fetch detected linked-chapter suggestions and previously tested chapters
  useEffect(() => {
    if (!selectedChapters || selectedChapters.length === 0) {
      setSuggestions([]);
      setTestedChaptersList([]);
      setRecommendedPrerequisites([]);
      return;
    }

    let cancelled = false;
    setLoadingSuggestions(true);
    const timer = setTimeout(() => {
      api.questions
        .getLinkedSuggestions(selectedChapters)
        .then((res) => {
          if (cancelled) return;

          const rawSuggestions = Array.isArray(res?.suggestions) ? res.suggestions : [];
          const rawTested = Array.isArray(res?.tested_chapters) ? res.tested_chapters : [];
          const rawRecommended = Array.isArray(res?.recommended_prerequisites)
            ? res.recommended_prerequisites
            : [];

          setSuggestions(rawSuggestions);
          setTestedChaptersList(rawTested);
          setRecommendedPrerequisites(rawRecommended);

          // Automatic First-Pass Selection:
          // When a new combination of primary chapters is chosen, automatically
          // select the tested chapters and seen linked concepts first!
          const currentFingerprint = selectedChapters
            .map((c) => c.toLowerCase())
            .sort()
            .join('|');

          if (
            autoSelectEnabled &&
            rawRecommended.length > 0 &&
            currentFingerprint !== prevFingerprintRef.current
          ) {
            prevFingerprintRef.current = currentFingerprint;
            onChange(rawRecommended);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
            setTestedChaptersList([]);
            setRecommendedPrerequisites([]);
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingSuggestions(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedChapters, autoSelectEnabled, onChange]);

  // Flatten all chapters from chaptersMap excluding primary chapters
  const allOtherChapters = useMemo(() => {
    const primarySet = new Set(selectedChapters.map((c) => c.toLowerCase()));
    const suggestionCountMap = new Map(
      suggestions.map((s) => [s.chapter.toLowerCase(), s.count])
    );
    const testedSet = new Set(
      testedChaptersList.map((t) => t.chapter.toLowerCase())
    );

    const list = [];
    const seen = new Set();
    Object.entries(chaptersMap || {}).forEach(([subj, chArr]) => {
      if (!Array.isArray(chArr)) return;
      chArr.forEach((item) => {
        const name = item?.chapter;
        if (!name) return;
        const lower = name.toLowerCase();
        if (primarySet.has(lower) || seen.has(lower)) return;
        seen.add(lower);
        list.push({
          chapter: name,
          subject: subj,
          linkedCount: suggestionCountMap.get(lower) || 0,
          isTested: testedSet.has(lower),
        });
      });
    });

    // Also include any suggestion chapters that might not be in chaptersMap
    suggestions.forEach((s) => {
      const lower = s.chapter.toLowerCase();
      if (!primarySet.has(lower) && !seen.has(lower)) {
        seen.add(lower);
        list.push({
          chapter: s.chapter,
          subject: s.subject || 'General',
          linkedCount: s.count || 0,
          isTested: testedSet.has(lower) || Boolean(s.is_tested),
        });
      }
    });

    return list;
  }, [chaptersMap, selectedChapters, suggestions, testedChaptersList]);

  const filteredOtherChapters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allOtherChapters;
    return allOtherChapters.filter(
      (item) =>
        item.chapter.toLowerCase().includes(q) ||
        item.subject.toLowerCase().includes(q)
    );
  }, [allOtherChapters, searchQuery]);

  if (!selectedChapters || selectedChapters.length === 0) {
    return null;
  }

  const toggleLinkedChapter = (chapterName) => {
    try {
      sound?.click?.();
    } catch (_) {}
    const exists = allowedLinkedChapters.some(
      (c) => c.toLowerCase() === chapterName.toLowerCase()
    );
    if (exists) {
      onChange(
        allowedLinkedChapters.filter(
          (c) => c.toLowerCase() !== chapterName.toLowerCase()
        )
      );
    } else {
      onChange([...allowedLinkedChapters, chapterName]);
    }
  };

  const handleAutoSelectAll = () => {
    try {
      sound?.click?.();
    } catch (_) {}
    if (recommendedPrerequisites.length > 0) {
      onChange(recommendedPrerequisites);
    }
  };

  const handleSelectAllTested = () => {
    try {
      sound?.click?.();
    } catch (_) {}
    const primarySet = new Set(selectedChapters.map((c) => c.toLowerCase()));
    const currentSet = new Set(allowedLinkedChapters.map((c) => c.toLowerCase()));
    const merged = [...allowedLinkedChapters];

    testedChaptersList.forEach((t) => {
      const lower = t.chapter.toLowerCase();
      if (!primarySet.has(lower) && !currentSet.has(lower)) {
        merged.push(t.chapter);
        currentSet.add(lower);
      }
    });
    onChange(merged);
  };

  const handleSelectAllSeen = () => {
    try {
      sound?.click?.();
    } catch (_) {}
    const primarySet = new Set(selectedChapters.map((c) => c.toLowerCase()));
    const currentSet = new Set(allowedLinkedChapters.map((c) => c.toLowerCase()));
    const merged = [...allowedLinkedChapters];

    suggestions.forEach((s) => {
      const lower = s.chapter.toLowerCase();
      if (!primarySet.has(lower) && !currentSet.has(lower)) {
        merged.push(s.chapter);
        currentSet.add(lower);
      }
    });
    onChange(merged);
  };

  const isIndigo = accentColor === 'indigo';
  const borderAccent = isIndigo ? 'border-indigo-500/30' : 'border-orange-500/30';
  const bgAccent = isIndigo ? 'bg-indigo-950/20' : 'bg-orange-950/20';
  const pillActive = isIndigo
    ? 'bg-indigo-600/35 border-indigo-400 text-indigo-100 shadow-sm shadow-indigo-500/10'
    : 'bg-orange-600/35 border-orange-400 text-orange-100 shadow-sm shadow-orange-500/10';
  const badgeBg = isIndigo ? 'bg-indigo-500/20 text-indigo-300' : 'bg-orange-500/20 text-orange-300';
  const iconColor = isIndigo ? 'text-indigo-400' : 'text-orange-400';

  const seenChaptersSet = new Set(suggestions.map((s) => s.chapter.toLowerCase()));
  const testedChaptersSet = new Set(testedChaptersList.map((t) => t.chapter.toLowerCase()));

  return (
    <div className={`mt-3 rounded-xl border ${borderAccent} ${bgAccent} overflow-hidden transition-all`}>
      {/* Header */}
      <div className="w-full px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left border-b border-white/5 bg-slate-950/40">
        <div
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-2 min-w-0 cursor-pointer select-none flex-1"
        >
          <Link2 className={`w-4 h-4 shrink-0 ${iconColor}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-white">
                Allowed Linked Chapters (Prerequisites)
              </span>
              {allowedLinkedChapters.length > 0 && (
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${badgeBg}`}>
                  {allowedLinkedChapters.length} active
                </span>
              )}
              {testedChaptersList.length > 0 && (
                <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <History className="w-2.5 h-2.5" />
                  {testedChaptersList.length} tested
                </span>
              )}
              {suggestions.length > 0 && (
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  {suggestions.length} seen in bank
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
              Automatically selects tested chapters and detected bank concepts so questions aren't falsely disqualified.
            </p>
          </div>
        </div>

        {/* Quick Toolbar */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
          {recommendedPrerequisites.length > 0 && (
            <button
              type="button"
              onClick={handleAutoSelectAll}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition flex items-center gap-1 cursor-pointer ${
                isIndigo
                  ? 'bg-indigo-600/30 border-indigo-400/50 text-indigo-200 hover:bg-indigo-600/50'
                  : 'bg-orange-600/30 border-orange-400/50 text-orange-200 hover:bg-orange-600/50'
              }`}
              title="Auto-select all tested chapters and seen bank concepts in 1 click"
            >
              <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
              <span>Auto-Select All ({recommendedPrerequisites.length})</span>
            </button>
          )}

          {allowedLinkedChapters.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-red-500/30 text-red-300 bg-red-950/30 hover:bg-red-900/40 transition cursor-pointer"
            >
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-2.5 space-y-3">
          {/* Informational banner when auto-selection is active */}
          {!loadingSuggestions && recommendedPrerequisites.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px]">
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-semibold truncate">
                  ⚡ Auto-selected {allowedLinkedChapters.length} prerequisite concepts (tested in previous exams & seen in questions).
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleAutoSelectAll}
                  className="text-[10px] font-bold underline hover:text-emerald-100 flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  Reset to Auto-Select
                </button>
                <span className="text-white/20">|</span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[10px] font-bold text-slate-400 hover:text-rose-300 cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 text-[10px] font-bold border-b border-white/5 pb-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-0.5 rounded-md transition cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Prerequisite Concepts ({recommendedPrerequisites.length})
            </button>
            {suggestions.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('seen')}
                className={`px-2.5 py-0.5 rounded-md transition flex items-center gap-1 cursor-pointer ${
                  activeTab === 'seen'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-400 hover:text-emerald-300'
                }`}
              >
                <span>Seen in Bank ({suggestions.length})</span>
              </button>
            )}
            {testedChaptersList.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('tested')}
                className={`px-2.5 py-0.5 rounded-md transition flex items-center gap-1 cursor-pointer ${
                  activeTab === 'tested'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-cyan-300'
                }`}
              >
                <span>Tested Chapters ({testedChaptersList.length})</span>
              </button>
            )}
          </div>

          {/* Loading state */}
          {loadingSuggestions ? (
            <div className="text-[11px] text-slate-400 font-mono py-1 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>Scanning tested chapters and multi-concept prerequisites...</span>
            </div>
          ) : (
            <>
              {/* Active / Recommended Chips */}
              <div className="space-y-2">
                {/* 1. SEEN IN BANK (Detected in Active Questions) */}
                {(activeTab === 'all' || activeTab === 'seen') && suggestions.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Sparkles className="w-3 h-3" />
                        Detected Linked Concepts in Questions
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectAllSeen}
                        className="text-[10px] text-indigo-300 hover:text-white cursor-pointer font-semibold lowercase"
                      >
                        select all seen ({suggestions.length})
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((item) => {
                        const isSelected = allowedLinkedChapters.some(
                          (c) => c.toLowerCase() === item.chapter.toLowerCase()
                        );
                        const isTested = Boolean(item.is_tested || testedChaptersSet.has(item.chapter.toLowerCase()));
                        return (
                          <button
                            key={item.chapter}
                            type="button"
                            onClick={() => toggleLinkedChapter(item.chapter)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                              isSelected
                                ? pillActive
                                : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-white/25 hover:text-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 shrink-0" />}
                            <span>{item.chapter}</span>
                            <span className="text-[10px] font-mono opacity-80 bg-black/30 px-1 py-0.2 rounded">
                              +{item.count} Qs
                            </span>
                            {isTested && (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                Tested
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. TESTED CHAPTERS (Chapters already tested in earlier exams) */}
                {(activeTab === 'all' || activeTab === 'tested') && testedChaptersList.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span className="flex items-center gap-1 text-cyan-400">
                        <History className="w-3 h-3" />
                        Previously Tested in Earlier Papers
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectAllTested}
                        className="text-[10px] text-indigo-300 hover:text-white cursor-pointer font-semibold lowercase"
                      >
                        select all tested ({testedChaptersList.length})
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {testedChaptersList.map((item) => {
                        const isSelected = allowedLinkedChapters.some(
                          (c) => c.toLowerCase() === item.chapter.toLowerCase()
                        );
                        const isSeen = Boolean(item.is_seen_in_bank || item.linked_count > 0 || seenChaptersSet.has(item.chapter.toLowerCase()));
                        return (
                          <button
                            key={item.chapter}
                            type="button"
                            onClick={() => toggleLinkedChapter(item.chapter)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                              isSelected
                                ? pillActive
                                : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-white/25 hover:text-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 shrink-0" />}
                            <span>{item.chapter}</span>
                            <span className="text-[9px] font-mono text-slate-400 opacity-80">
                              {item.subject ? item.subject.slice(0, 4) : ''}
                            </span>
                            {isSeen && (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Seen
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. MANUALLY ALLOWED CHAPTERS (not in suggestions or tested list) */}
                {allowedLinkedChapters.some(
                  (c) =>
                    !suggestions.some((s) => s.chapter.toLowerCase() === c.toLowerCase()) &&
                    !testedChaptersList.some((t) => t.chapter.toLowerCase() === c.toLowerCase())
                ) && (
                  <div className="pt-1 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Other Custom Allowed Chapters
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {allowedLinkedChapters
                        .filter(
                          (c) =>
                            !suggestions.some((s) => s.chapter.toLowerCase() === c.toLowerCase()) &&
                            !testedChaptersList.some((t) => t.chapter.toLowerCase() === c.toLowerCase())
                        )
                        .map((ch) => (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => toggleLinkedChapter(ch)}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition flex items-center gap-1.5 cursor-pointer ${pillActive}`}
                          >
                            <Check className="w-3 h-3 shrink-0" />
                            <span>{ch}</span>
                            <X className="w-3 h-3 opacity-70" />
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Browse / Search All Other Chapters */}
          <div className="pt-2 border-t border-white/5">
            <button
              type="button"
              onClick={() => setShowAllChapters((prev) => !prev)}
              className="text-[11px] font-bold text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1"
            >
              <span>{showAllChapters ? 'Hide Full Syllabus Chapter List' : '+ Browse / Search Any Other Chapter Across Syllabus'}</span>
            </button>

            {showAllChapters && (
              <div className="mt-2 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any syllabus chapter to allow as prerequisite..."
                    className="w-full pl-8 pr-7 py-1.5 bg-slate-900/90 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1.5 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                  {filteredOtherChapters.map((item) => {
                    const isSelected = allowedLinkedChapters.some(
                      (c) => c.toLowerCase() === item.chapter.toLowerCase()
                    );
                    return (
                      <button
                        key={`${item.subject}-${item.chapter}`}
                        type="button"
                        onClick={() => toggleLinkedChapter(item.chapter)}
                        className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] transition flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? pillActive
                            : 'bg-slate-900/60 border-white/5 text-slate-300 hover:border-white/20'
                        }`}
                      >
                        <span className="truncate font-medium">{item.chapter}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {item.isTested && (
                            <span className="text-[8px] font-mono px-1 rounded bg-cyan-500/20 text-cyan-300">
                              Tested
                            </span>
                          )}
                          <span className="text-[9px] font-mono text-slate-400">
                            {item.linkedCount > 0 ? `+${item.linkedCount} Qs` : item.subject.slice(0, 4)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
