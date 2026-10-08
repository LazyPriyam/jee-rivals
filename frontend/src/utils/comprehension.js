/**
 * comprehension.js - Utility for JEE Comprehension & Paragraph Questions
 * 
 * Supports:
 * - Parsing & expanding any unparsed legacy comprehension questions on the fly
 * - Grouping contiguous subquestions belonging to the same passage
 * - Formatting subquestion numbers, labels, and paragraph spans ("Paragraph for Questions 14 to 16")
 */


export function parseInlineComprehension(q) {
  if (!q || !q.text) return [q];

  // If already parsed with passage_text, return as-is
  if (q.passage_text && q.passage_text.trim().length > 0) {
    return [q];
  }

  // Only attempt inline split if marked as COMPREHENSION or text starts with PASSAGE / Read the following
  const isCompType = q.question_type === 'COMPREHENSION';
  const text = q.text.trim();
  const startsWithPassage = /^(PASSAGE\s+\d+|Paragraph\s+\d+|Read the following)/i.test(text);

  if (!isCompType && !startsWithPassage) {
    return [q];
  }

  // Regex to detect numbered subquestions: "\n1.", "\n2.", "\n35.", "\n(1)"
  const qSplitRegex = /(?:\n+|^)\s*(?:(?:Question\s*)?(\d{1,2})\.|\((\d{1,2})\))\s+/gi;
  const matches = [...text.matchAll(qSplitRegex)];

  if (matches.length < 2) {
    // If not multiple subquestions, return as-is with question_type ensured
    return [{
      ...q,
      is_comprehension: isCompType || startsWithPassage
    }];
  }

  const firstMatch = matches[0];
  const passageText = text.substring(0, firstMatch.index).trim();

  let passageTitle = 'Comprehension Passage';
  const titleMatch = passageText.match(/^(PASSAGE\s+\d+|Paragraph\s+\d+|COMPREHENSION\s+\d+)/i);
  let cleanPassage = passageText;
  if (titleMatch) {
    passageTitle = titleMatch[1].toUpperCase();
    cleanPassage = passageText.substring(titleMatch[0].length).trim();
  }

  const subquestions = [];
  const totalSubs = matches.length;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const qNum = m[1] || m[2];
    const startPos = m.index + m[0].length;
    const endPos = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
    const chunk = text.substring(startPos, endPos).trim();

    // Parse options out of chunk: (a), (b), (c), (d) or (A), (B), (C), (D)
    const optRegex = /(?:^|[\s\t\n]+)(?:\(([a-dA-D1-4])\)|([a-dA-D])\.)\s+/g;
    const optMatches = [...chunk.matchAll(optRegex)];

    let qStem = chunk;
    let parsedOpts = q.options || [];

    if (optMatches.length >= 2) {
      qStem = chunk.substring(0, optMatches[0].index).trim();
      parsedOpts = [];
      for (let j = 0; j < optMatches.length; j++) {
        const om = optMatches[j];
        const keyRaw = (om[1] || om[2]).toUpperCase();
        const numMap = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
        const key = numMap[keyRaw] || keyRaw;

        const optStart = om.index + om[0].length;
        const optEnd = (j + 1 < optMatches.length) ? optMatches[j + 1].index : chunk.length;
        const optText = chunk.substring(optStart, optEnd).trim().replace(/\s+/g, ' ');
        parsedOpts.push({ key, text: optText });
      }
    }

    subquestions.push({
      ...q,
      id: `${q.id}_sub${i + 1}`,
      text: qStem,
      options: parsedOpts,
      passage_id: q.passage_id || q.id,
      passage_title: passageTitle,
      passage_text: cleanPassage || passageText,
      subquestion_index: i + 1,
      subquestion_total: totalSubs,
      is_comprehension: true
    });
  }

  return subquestions;
}

/**
 * Expands all questions in an array, unbundling any lumped comprehension questions
 * so each subquestion is an individual, sequential element.
 */
export function normalizeQuestionsWithComprehensions(questions = []) {
  if (!questions || !Array.isArray(questions)) return [];

  const normalized = [];
  for (const q of questions) {
    const expanded = parseInlineComprehension(q);
    normalized.push(...expanded);
  }
  return normalized;
}

/**
 * Calculates comprehension passage groups across a question list.
 * Returns a map of index -> group info:
 * {
 *   isPassage: boolean,
 *   passageTitle: string,
 *   passageText: string,
 *   groupLabel: "Paragraph for Questions 14 to 16",
 *   subIndex: 1,
 *   subTotal: 3,
 *   isFirstInGroup: boolean,
 *   isLastInGroup: boolean
 * }
 */
export function buildComprehensionGroupMap(questions = []) {
  const map = {};
  if (!questions || questions.length === 0) return map;

  let i = 0;
  while (i < questions.length) {
    const q = questions[i];
    const passageId = q.passage_id || (q.passage_text ? `pass_${q.id}` : null);

    if (passageId && q.passage_text) {
      // Find range of consecutive questions with the same passageId
      let j = i;
      while (j < questions.length) {
        const nextQ = questions[j];
        const nextPid = nextQ.passage_id || (nextQ.passage_text ? `pass_${nextQ.id}` : null);
        if (nextPid === passageId) {
          j++;
        } else {
          break;
        }
      }

      const count = j - i;
      const startNum = i + 1;
      const endNum = j;
      const label = count > 1
        ? `Paragraph for Questions ${startNum} to ${endNum}`
        : `Paragraph for Question ${startNum}`;

      for (let k = i; k < j; k++) {
        const subIdx = k - i + 1;
        map[k] = {
          isPassage: true,
          passageId,
          passageTitle: questions[k].passage_title || 'Comprehension Passage',
          passageText: questions[k].passage_text,
          groupLabel: label,
          subIndex: questions[k].subquestion_index || subIdx,
          subTotal: questions[k].subquestion_total || count,
          groupStart: i,
          groupEnd: j - 1,
          isFirstInGroup: k === i,
          isLastInGroup: k === j - 1
        };
      }

      i = j;
    } else {
      map[i] = { isPassage: false };
      i++;
    }
  }

  return map;
}
