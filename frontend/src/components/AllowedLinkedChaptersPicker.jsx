import React, { useState, useEffect, useMemo } from 'react';
import { Link2, Search, X, Check, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';

/**
 * Reusable picker for selecting "Allowed Linked Chapters" (prerequisite/supporting concepts)
 * in custom chapter tests. Multi-concept questions from selected primary chapters that also
 * reference these linked chapters become eligible, without pulling in standalone questions
 * of the linked chapters themselves.
 */
export default function AllowedLinkedChaptersPicker({
  selectedChapters = [],
  allowedLinkedChapters = [],
  onChange,
  chaptersMap = {},
  accentColor = 'indigo', // 'indigo' | 'orange'
}) {
  const [expanded, setExpanded] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllChapters, setShowAllChapters] = useState(false);

  // Strip any chapter from allowedLinkedChapters if it was promoted to a primary chapter
  useEffect(() => {
    if (!allowedLinkedChapters.length || !selectedChapters.length) return;
    const primarySet = new Set(selectedChapters.map((c) => c.toLowerCase()));
    const filtered = allowedLinkedChapters.filter((c) => !primarySet.has(c.toLowerCase()));
    if (filtered.length !== allowedLinkedChapters.length) {
      onChange(filtered);
    }
  }, [selectedChapters, allowedLinkedChapters, onChange]);

  // Fetch detected linked-chapter suggestions for the currently selected primary chapters
  useEffect(() => {
    if (!selectedChapters || selectedChapters.length === 0) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    setLoadingSuggestions(true);
    const timer = setTimeout(() => {
      api.questions
        .getLinkedSuggestions(selectedChapters)
        .then((res) => {
          if (!cancelled) {
            setSuggestions(Array.isArray(res?.suggestions) ? res.suggestions : []);
          }
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingSuggestions(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedChapters]);

  // Flatten all chapters from chaptersMap excluding primary chapters
  const allOtherChapters = useMemo(() => {
    const primarySet = new Set(selectedChapters.map((c) => c.toLowerCase()));
    const suggestionCountMap = new Map(
      suggestions.map((s) => [s.chapter.toLowerCase(), s.count])
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
        });
      }
    });

    return list;
  }, [chaptersMap, selectedChapters, suggestions]);

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

  const isIndigo = accentColor === 'indigo';
  const borderAccent = isIndigo ? 'border-indigo-500/30' : 'border-orange-500/30';
  const bgAccent = isIndigo ? 'bg-indigo-950/20' : 'bg-orange-950/20';
  const pillActive = isIndigo
    ? 'bg-indigo-600/30 border-indigo-400 text-indigo-100'
    : 'bg-orange-600/30 border-orange-400 text-orange-100';
  const badgeBg = isIndigo ? 'bg-indigo-500/20 text-indigo-300' : 'bg-orange-500/20 text-orange-300';
  const iconColor = isIndigo ? 'text-indigo-400' : 'text-orange-400';

  return (
    <div className={`mt-3 rounded-xl border ${borderAccent} ${bgAccent} overflow-hidden transition-all`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Link2 className={`w-4 h-4 shrink-0 ${iconColor}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-white">
                Allowed Linked Chapters (Prerequisites)
              </span>
              {allowedLinkedChapters.length > 0 && (
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${badgeBg}`}>
                  {allowedLinkedChapters.length} allowed
                </span>
              )}
              {!loadingSuggestions && suggestions.length > 0 && (
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  {suggestions.length} detected in bank
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
              Allow multi-concept questions from your selected chapters that also use these chapters — without adding their standalone questions.
            </p>
          </div>
        </div>
        <div className="shrink-0 text-slate-400">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 pt-1 border-t border-white/10 space-y-3">
          {/* Detected / Suggested Linked Chapters */}
          {loadingSuggestions ? (
            <div className="text-[11px] text-slate-400 font-mono py-1">
              Scanning multi-concept prerequisites...
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Detected Linked Concepts in Selected Chapters
                </span>
                {allowedLinkedChapters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="text-[10px] font-bold text-slate-400 hover:text-rose-300 transition cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((item) => {
                  const isSelected = allowedLinkedChapters.some(
                    (c) => c.toLowerCase() === item.chapter.toLowerCase()
                  );
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
                      <span className="text-[10px] font-mono opacity-75">
                        (+{item.count} Qs)
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 py-1">
              No extra linked-concept prerequisites detected for the selected chapters. You can still allow chapters manually below.
            </div>
          )}

          {/* Selected manual chapters that weren't in suggestions */}
          {allowedLinkedChapters.some(
            (c) => !suggestions.some((s) => s.chapter.toLowerCase() === c.toLowerCase())
          ) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {allowedLinkedChapters
                .filter(
                  (c) => !suggestions.some((s) => s.chapter.toLowerCase() === c.toLowerCase())
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
          )}

          {/* Browse / Search All Other Chapters */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAllChapters((prev) => !prev)}
              className="text-[11px] font-bold text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1"
            >
              <span>{showAllChapters ? 'Hide All Chapters Picker' : '+ Browse / Search Any Other Chapter'}</span>
            </button>

            {showAllChapters && (
              <div className="mt-2 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search any chapter to allow as linked concept..."
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

                <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
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
                        <span className="text-[9px] font-mono text-slate-400 shrink-0">
                          {item.linkedCount > 0 ? `+${item.linkedCount} Qs` : item.subject.slice(0, 4)}
                        </span>
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
