import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/api';
import MathRenderer from './MathRenderer';
import {
  FileText,
  Printer,
  Download,
  X,
  Clock,
  Shield,
  BookOpen,
  Award,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

const escapeHtml = (str) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export default function QuestionPaperModal({ testId, testTitle, paperData: directPaperData, onClose }) {
  const [paperData, setPaperData] = useState(directPaperData || null);
  const [loading, setLoading] = useState(!directPaperData && Boolean(testId));
  const [error, setError] = useState('');
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  const [portalNode, setPortalNode] = useState(null);

  const paperRef = useRef(null);

  useEffect(() => {
    let node = document.getElementById('question-paper-portal-root');
    if (!node) {
      node = document.createElement('div');
      node.id = 'question-paper-portal-root';
      document.body.appendChild(node);
    }
    setPortalNode(node);
  }, []);

  useEffect(() => {
    if (directPaperData) {
      setPaperData(directPaperData);
      setLoading(false);
      return;
    }
    if (!testId) return;
    setLoading(true);
    setError('');

    api.scheduledTests.getPaper(testId)
      .then((data) => {
        setPaperData(data);
      })
      .catch((err) => {
        setError(err.message || 'Failed to retrieve question paper.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [testId, directPaperData]);

  // Direct Custom PDF Generation & Download without relying on browser print dialog
  const handleDownloadPdf = async () => {
    if (!paperRef.current || isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress('Preparing...');

    try {
      setDownloadProgress('Loading PDF engine...');
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;

      setDownloadProgress('Formatting document...');
      const element = paperRef.current;
      const safeTitle = (paperData?.title || testTitle || 'Question_Paper')
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .replace(/_+/g, '_');
      const filename = `JEE_${examType}_${safeTitle}.pdf`;

      setDownloadProgress('Generating PDF pages...');
      const opt = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollY: 0,
          windowWidth: 1024
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait'
        },
        pagebreak: {
          mode: ['avoid-all', 'css', 'legacy']
        }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error('Failed to generate PDF download:', err);
      alert('Custom PDF download encountered an issue: ' + (err.message || 'Error') + '. You can use Print / Browser PDF or Download HTML.');
    } finally {
      setIsDownloading(false);
      setDownloadProgress('');
    }
  };

  // 1-Click Offline Standalone HTML Document Download
  const handleDownloadHtml = () => {
    if (!paperRef.current) return;
    const content = paperRef.current.innerHTML;
    const safeTitle = (paperData?.title || testTitle || 'Question_Paper')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_+/g, '_');

    const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(paperData?.title || testTitle || 'JEE Question Paper')}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Inter:wght@400;600;700;900&display=swap');
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #fff; color: #0f172a; margin: 0; padding: 24px; line-height: 1.6; }
    .paper-root { max-width: 56rem; margin: 0 auto; }
    @media print {
      body { padding: 0; margin: 0; }
      .paper-root { max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="paper-root">
    ${content}
  </div>
</body>
</html>`;

    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JEE_${examType}_${safeTitle}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Isolated Print Dialog with guaranteed background page hiding
  const handlePrint = () => {
    const rootEl = document.getElementById('root');
    const prevDisplay = rootEl ? rootEl.style.display : '';
    if (rootEl) rootEl.style.display = 'none';

    window.print();

    setTimeout(() => {
      if (rootEl) rootEl.style.display = prevDisplay;
    }, 600);
  };

  if (typeof document === 'undefined') return null;

  // Group questions by subject
  const subjectsMap = {};
  if (paperData?.questions) {
    for (const q of paperData.questions) {
      const s = q.subject || 'General';
      if (!subjectsMap[s]) subjectsMap[s] = [];
      subjectsMap[s].push(q);
    }
  }

  const examType = paperData?.exam_type || 'MAIN';
  const isAdvanced = examType === 'ADVANCED';
  const markingScheme = paperData?.marking_scheme || {
    correct: 4,
    incorrect: isAdvanced ? -2 : -1,
    numerical_incorrect: 0,
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] bg-[#0c101a]/95 backdrop-blur-md flex flex-col items-center justify-start overflow-y-auto p-2 sm:p-4 print:p-0 print:bg-white print:static print:overflow-visible">
      {/* Strict CSS Isolation for Print: Hides `#root` and all background content */}
      <style>{`
        @media print {
          #root {
            display: none !important;
          }
          body > *:not(#question-paper-portal-root) {
            display: none !important;
          }
          #question-paper-portal-root {
            display: block !important;
            position: static !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          .print-avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Top Floating Action Bar (HIDDEN IN PRINT) */}
      <div className="w-full max-w-4xl bg-[#141926]/95 border border-white/10 rounded-2xl p-3.5 mb-4 shadow-2xl flex items-center justify-between gap-3 sticky top-2 z-50 backdrop-blur-md print:hidden">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                JEE {examType} Question Paper
              </span>
              <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                Offline Practice Edition
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-black text-white truncate">
              {paperData?.title || testTitle || 'Official Question Paper'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Answer Key Toggle */}
          {paperData?.answer_key && (
            <button
              type="button"
              onClick={() => setShowAnswerKey(!showAnswerKey)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                showAnswerKey
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
              }`}
              title="Toggle Answer Key & Solutions at the end of paper"
            >
              {showAnswerKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="hidden sm:inline">{showAnswerKey ? 'Hide Key' : 'Show Answer Key'}</span>
            </button>
          )}

          {/* Custom Direct Download PDF Button (No Print Dialog Needed) */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={loading || !!error || isDownloading}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer disabled:opacity-50"
            title="Download PDF directly to your device without relying on the browser print dialog"
          >
            {isDownloading ? (
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-200" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{isDownloading ? (downloadProgress || 'Generating PDF...') : 'Download PDF'}</span>
          </button>

          {/* Print / Save as PDF Button with strict isolation */}
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading || !!error || isDownloading}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            title="Print or Save via browser dialog (isolated to paper only)"
          >
            <Printer className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Print / System PDF</span>
          </button>

          {/* Download Standalone Offline HTML */}
          <button
            type="button"
            onClick={handleDownloadHtml}
            disabled={loading || !!error || isDownloading}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition cursor-pointer"
            title="Download clean standalone HTML paper (opens anywhere offline)"
          >
            <FileText className="w-4 h-4" />
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition cursor-pointer"
            title="Close Question Paper View"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="w-full max-w-4xl bg-[#141926] border border-white/10 rounded-3xl p-16 text-center space-y-4 my-auto shadow-2xl">
          <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin mx-auto" />
          <h3 className="text-lg font-bold text-white">Assembling Official Question Paper...</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Formatting questions, diagrams, and KaTeX mathematical formulas into printable layout.
          </p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="w-full max-w-4xl bg-rose-950/40 border border-rose-500/40 rounded-3xl p-12 text-center space-y-4 my-auto shadow-2xl">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
          <h3 className="text-lg font-bold text-white">Unable to Load Question Paper</h3>
          <p className="text-xs text-rose-300 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 transition cursor-pointer"
          >
            Return to Tests
          </button>
        </div>
      )}

      {/* PRINTABLE PAPER DOCUMENT BODY */}
      {!loading && !error && paperData && (
        <div
          ref={paperRef}
          className="w-full max-w-4xl bg-white text-slate-900 rounded-3xl p-6 sm:p-10 shadow-2xl print:shadow-none print:p-0 print:m-0 print:rounded-none print:max-w-none print:w-full font-serif leading-relaxed text-sm"
        >
          {/* Official Cover Header */}
          <div className="border-b-2 border-slate-900 pb-5 mb-8 text-center">
            <div className="text-[11px] font-sans font-bold uppercase tracking-widest text-slate-600 mb-1">
              {isAdvanced ? 'Indian Institutes of Technology (IIT)' : 'National Testing Agency (NTA)'}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black font-sans uppercase tracking-tight text-slate-900">
              Joint Entrance Examination ({examType}) 2026
            </h1>
            <div className="text-base font-bold font-sans text-indigo-900 mt-1">
              {paperData.title}
            </div>

            {/* Test Specs Strip */}
            <div className="mt-4 pt-3 border-t border-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-sans text-slate-700">
              <div>
                <span className="text-slate-500 uppercase text-[10px] block">Time Allowed</span>
                <strong className="text-slate-900">{paperData.duration_minutes} Minutes</strong>
              </div>
              <div>
                <span className="text-slate-500 uppercase text-[10px] block">Total Questions</span>
                <strong className="text-slate-900">{paperData.total_questions} Questions</strong>
              </div>
              <div>
                <span className="text-slate-500 uppercase text-[10px] block">Maximum Marks</span>
                <strong className="text-slate-900">{paperData.total_marks} Marks</strong>
              </div>
              <div>
                <span className="text-slate-500 uppercase text-[10px] block">Marking Scheme</span>
                <strong className="text-slate-900">
                  +{markingScheme.correct} / {markingScheme.incorrect}
                </strong>
              </div>
            </div>

            {/* Important Instructions Box */}
            <div className="mt-4 p-3 bg-slate-100 rounded-xl border border-slate-300 text-left font-sans text-[11px] text-slate-700 space-y-1">
              <div className="font-bold uppercase tracking-wider text-slate-900 text-xs mb-1">
                Important Instructions to Candidates:
              </div>
              <div>1. This question paper contains {Object.keys(subjectsMap).length} subjects: {Object.keys(subjectsMap).join(', ')}.</div>
              <div>2. Multiple Choice Questions (Single Option Correct): <strong>+{markingScheme.correct}</strong> marks for correct response, <strong>{markingScheme.incorrect}</strong> for incorrect response.</div>
              <div>3. Numerical Value Questions: <strong>+{markingScheme.correct}</strong> marks for correct response, <strong>{markingScheme.numerical_incorrect}</strong> for incorrect response.</div>
              <div>4. Use of calculators, logarithmic tables, and cellular phones is strictly prohibited.</div>
              <div className="text-indigo-800 font-medium">
                * Note: Since CBT mode is closed, solve this paper offline at home. Your answers can be verified against the official Answer Key provided at the end of this paper.
              </div>
            </div>
          </div>

          {/* QUESTIONS ORGANIZED BY SUBJECT */}
          <div className="space-y-10">
            {Object.entries(subjectsMap).map(([subject, qList], sIdx) => (
              <div key={subject} className="print:break-inside-avoid">
                {/* Subject Header */}
                <div className="bg-slate-900 text-white px-4 py-2 rounded-lg font-sans font-black text-sm uppercase tracking-wider mb-6 flex items-center justify-between">
                  <span>Part {sIdx + 1} — {subject}</span>
                  <span className="text-xs font-normal text-slate-300">
                    Questions {qList[0]?.qnum} to {qList[qList.length - 1]?.qnum} ({qList.length} Questions)
                  </span>
                </div>

                {/* Questions List */}
                <div className="space-y-8">
                  {qList.map((q) => {
                    const isNumerical = q.question_type === 'NUMERICAL';
                    return (
                      <div
                        key={q.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white print:border-b print:border-slate-300 print:rounded-none print:p-3 print:break-inside-avoid print-avoid-break"
                        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                      >
                        {/* Question Meta Strip */}
                        <div className="flex items-center justify-between text-xs font-sans font-bold text-slate-500 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-black text-xs font-mono">
                              Q.{q.qnum}
                            </span>
                            <span className="text-slate-700 font-semibold">{q.chapter}</span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-600">
                            [{isNumerical ? 'Numerical Value' : 'Single Correct'} • +{q.correct_mark} / {q.incorrect_mark}]
                          </div>
                        </div>

                        {/* Question Statement with KaTeX */}
                        <div className="text-slate-900 font-serif text-[15px] leading-relaxed my-3 font-normal">
                          <MathRenderer text={q.text} />
                        </div>

                        {/* Diagrams if present */}
                        {q.has_diagram && q.diagram_urls && q.diagram_urls.length > 0 && (
                          <div className="my-4 text-center">
                            {q.diagram_urls.map((url, dIdx) => (
                              <img
                                key={dIdx}
                                src={url}
                                alt={`Diagram for Question ${q.qnum}`}
                                className="max-h-72 max-w-full mx-auto object-contain rounded border border-slate-300 bg-white p-1 my-2"
                              />
                            ))}
                          </div>
                        )}

                        {/* Options for MCQ */}
                        {!isNumerical && q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-2 font-sans text-sm">
                            {q.options.map((opt, oIdx) => {
                              const label = opt.key || String.fromCharCode(65 + oIdx);
                              return (
                                <div
                                  key={opt.key || oIdx}
                                  className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-300 bg-slate-50/50 print:bg-transparent"
                                >
                                  <span className="font-bold text-slate-900 font-mono shrink-0">
                                    ({label})
                                  </span>
                                  <div className="text-slate-800 text-[14px]">
                                    <MathRenderer text={opt.text} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Blank for Numerical */}
                        {isNumerical && (
                          <div className="mt-4 pt-2 font-sans text-xs text-slate-600 flex items-center gap-2">
                            <span className="font-bold">Answer:</span>
                            <span className="inline-block w-48 border-b-2 border-slate-400 h-6"></span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* OFFICIAL ANSWER KEY (SHOWN IF TOGGLED ON SCREEN, OR ALWAYS AVAILABLE ON SEPARATE PAGE AT THE END) */}
          {(showAnswerKey || typeof window !== 'undefined') && paperData.answer_key && (
            <div
              className={`mt-12 pt-8 border-t-2 border-slate-900 print:block print:break-before-page ${
                showAnswerKey ? 'block' : 'hidden print:block'
              }`}
            >
              <div className="text-center mb-6">
                <div className="text-[11px] font-sans font-bold uppercase tracking-widest text-slate-600 mb-0.5">
                  Official Verification Key
                </div>
                <h2 className="text-xl sm:text-2xl font-black font-sans uppercase tracking-tight text-slate-900">
                  Answer Key & Reference Guide
                </h2>
                <p className="text-xs font-sans text-slate-500 mt-1">
                  Use this key to evaluate your offline attempt after completing the paper.
                </p>
              </div>

              {/* Answer Key Grid Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left font-sans text-xs border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                      <th className="p-2 border border-slate-300 text-center w-14">Q.No</th>
                      <th className="p-2 border border-slate-300">Subject</th>
                      <th className="p-2 border border-slate-300">Type</th>
                      <th className="p-2 border border-slate-300 font-black">Correct Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(paperData.answer_key) ? paperData.answer_key : Object.values(paperData.answer_key || {})).map((ak, idx) => (
                      <tr
                        key={ak.qnum || idx}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                      >
                        <td className="p-2 border border-slate-300 text-center font-black font-mono">
                          {ak.qnum || idx + 1}
                        </td>
                        <td className="p-2 border border-slate-300 font-semibold text-slate-700">
                          {ak.subject}
                        </td>
                        <td className="p-2 border border-slate-300 text-slate-600">
                          {ak.question_type === 'NUMERICAL' ? 'Numerical' : 'MCQ'}
                        </td>
                        <td className="p-2 border border-slate-300 font-mono font-black text-indigo-900">
                          {ak.correct_answer || ak.correct_key || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* End of paper marker */}
          <div className="mt-12 pt-6 border-t border-slate-300 text-center text-xs font-sans text-slate-500">
            *** END OF QUESTION PAPER ***
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, portalNode || document.body);
}
