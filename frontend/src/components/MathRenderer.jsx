import React, { useMemo } from 'react';
import katex from 'katex';

export default function MathRenderer({ content, text: textProp, className = '' }) {
  const renderedHtml = useMemo(() => {
    const raw = content !== undefined && content !== null ? content : textProp;
    if (raw === undefined || raw === null || raw === '') return '';

    let text = String(raw);

    // 1. Normalize double/multiple backslashes before LaTeX command letters (e.g. \\sqrt -> \sqrt, \\frac -> \frac)
    text = text.replace(/\\{2,}([a-zA-Z]+)/g, '\\$1');

    // 2. Normalize Unicode radical '√' (\u221a)
    text = text
      .replace(/√\{([^}]+)\}/g, '$\\sqrt{$1}$')
      .replace(/√\(([^\)]+)\)/g, '$\\sqrt{$1}$')
      .replace(/√([a-zA-Z0-9]+)/g, '$\\sqrt{$1}$')
      .replace(/√/g, '$\\sqrt{}$');

    // Prevent accidental $$...$$ nesting if √ was already inside $...$
    text = text.replace(/\$\$+(\\sqrt\{[^}]*\})\$\$+/g, '$1');

    // 3. For options / formulas without $ / $$ / \( / \[ math delimiters:
    const hasDelimiters = /\$|\\\(|\\\[/.test(text);
    if (!hasDelimiters) {
      const isMathFormula = /(\\sqrt|\\frac|\\vec|\\hat|\\pm|\\times|\\alpha|\\beta|\\gamma|\\theta|\\omega|\\pi|\\left|\\right|\^|_)/.test(text);
      const hasSentenceStructure = (text.match(/[a-zA-Z]{3,}\s+[a-zA-Z]{3,}/g) || []).length > 0;
      if (isMathFormula && !hasSentenceStructure) {
        // Entire string is a math formula (like an MCQ option)
        text = `$${text}$`;
      } else if (isMathFormula) {
        // Standalone LaTeX commands in prose without $ delimiters
        text = text.replace(/(\\(?:sqrt|frac|vec|hat|pm|times|alpha|beta|theta|omega|pi)[a-zA-Z0-9_{}()^+\-*/\s]*)/g, '$$$1$$');
      }
    }

    // 4. Tokenize and render math safely so subsequent replacements (like newlines)
    // NEVER mutate KaTeX SVG markup (which contains newlines in <path d="...">)
    const mathTokens = [];
    const saveMath = (html) => {
      const key = `___KATEX_MATH_TOKEN_${mathTokens.length}___`;
      mathTokens.push({ key, html });
      return key;
    };

    // Replace display math $$...$$
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
      try {
        const rendered = katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
        return saveMath(`<div class="katex-display my-2 text-inherit overflow-x-auto">${rendered}</div>`);
      } catch (e) {
        return match;
      }
    });

    // Replace display math \[...\]
    text = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, math) => {
      try {
        const rendered = katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
        return saveMath(`<div class="katex-display my-2 text-inherit overflow-x-auto">${rendered}</div>`);
      } catch (e) {
        return match;
      }
    });

    // Replace inline math $...$ (avoiding double $$)
    text = text.replace(/(?<!\$)\$(?!\$)(.*?)(?<!\$)\$(?!\$)/g, (match, math) => {
      try {
        const rendered = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
        return saveMath(`<span class="inline-math text-inherit px-0.5">${rendered}</span>`);
      } catch (e) {
        return match;
      }
    });

    // Replace inline math \(...\)
    text = text.replace(/\\\(([\s\S]*?)\\\)/g, (match, math) => {
      try {
        const rendered = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
        return saveMath(`<span class="inline-math text-inherit px-0.5">${rendered}</span>`);
      } catch (e) {
        return match;
      }
    });

    // 5. Parse and format tables (safely tokenized before newline conversion)
    // First, convert list-style matching columns into markdown table if present
    const colSplit = text.split(/\n\s*(?:Column|List)\s*[-_–—]?\s*(?:II|2)\s*[:\-\(]?/i);
    if (colSplit.length === 2) {
      const part1 = colSplit[0];
      const part2 = colSplit[1];
      const c1Match = part1.match(/\n\s*(?:Column|List)\s*[-_–—]?\s*(?:I|1)\s*[:\-\(]?(.*)/is);
      if (c1Match) {
        const prefix = part1.substring(0, c1Match.index).trim();
        const c1Block = c1Match[1].trim();
        const c1HeaderLine = part1.substring(c1Match.index).trim().split('\n')[0].trim();

        const trailerMatch = part2.match(/\n\s*(?:(?:Codes?|Options?)\s*:|\([A-D]\)\s*[A-D]\s*[-–—→>]\s*[P-T]|Choose the correct)/i);
        const c2Block = trailerMatch ? part2.substring(0, trailerMatch.index).trim() : part2.trim();
        const suffix = trailerMatch ? part2.substring(trailerMatch.index).trim() : '';

        const extractItems = (block) => {
          const pattern = /(?:^|\n)\s*(?:\(([A-Za-z0-9ivxIVX]+)\)|([A-Za-z0-9ivxIVX]+)[\.:\)])\s+/g;
          const matches = [...block.matchAll(pattern)];
          if (!matches || matches.length === 0) return [];
          const items = [];
          for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index + matches[i][0].length;
            const end = i + 1 < matches.length ? matches[i + 1].index : block.length;
            const key = matches[i][1] || matches[i][2];
            const val = block.substring(start, end).trim();
            items.push({ key, val });
          }
          return items;
        };

        const c1Items = extractItems(c1Block);
        const c2Items = extractItems(c2Block);

        if (c1Items.length > 0 && c2Items.length > 0) {
          let c1Title = "Column-I";
          let c2Title = "Column-II";
          const q1Match = c1HeaderLine.match(/(?:Column|List)\s*[-_–—]?\s*(?:I|1)\s*(\([^\)]+\))/i);
          if (q1Match) c1Title += ` ${q1Match[1]}`;
          const c2HeaderLine = text.substring(part1.length).trim().split('\n')[0].trim();
          const q2Match = c2HeaderLine.match(/(?:Column|List)\s*[-_–—]?\s*(?:II|2)\s*(\([^\)]+\))/i);
          if (q2Match) c2Title += ` ${q2Match[1]}`;

          const maxRows = Math.max(c1Items.length, c2Items.length);
          const tableLines = [
            `| ${c1Title} | ${c2Title} |`,
            `| :--- | :--- |`
          ];
          for (let r = 0; r < maxRows; r++) {
            const cell1 = r < c1Items.length ? `(${c1Items[r].key}) ${c1Items[r].val}` : '';
            const cell2 = r < c2Items.length ? `(${c2Items[r].key}) ${c2Items[r].val}` : '';
            tableLines.push(`| ${cell1.replace(/\|/g, '\\|').replace(/\n/g, ' ')} | ${cell2.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`);
          }

          const tableMd = `\n\n${tableLines.join('\n')}\n\n`;
          text = `${prefix}${tableMd}${suffix}`.trim();
        }
      }
    }

    // Convert markdown tables into styled HTML tables and tokenize them
    const tableTokens = [];
    const saveTable = (html) => {
      const key = `___TABLE_TOKEN_${tableTokens.length}___`;
      tableTokens.push({ key, html });
      return key;
    };

    const tableRegex = /((?:^[ \t]*\|[^\n]+\|[ \t]*\r?\n)(?:^[ \t]*\|[ \t]*:?[-]+:?[ \t]*(?:\|[ \t]*:?[-]+:?[ \t]*)+\|[ \t]*\r?\n)(?:^[ \t]*\|[^\n]+\|[ \t]*(?:\r?\n|$))+)/gm;
    text = text.replace(tableRegex, (match) => {
      const lines = match.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length < 2) return match;

      const headerLine = lines[0];
      const headerCells = headerLine
        .split('|')
        .slice(1, -1)
        .map(c => c.trim());

      const sepLine = lines[1];
      const alignments = sepLine
        .split('|')
        .slice(1, -1)
        .map(c => {
          const t = c.trim();
          if (t.startsWith(':') && t.endsWith(':')) return 'text-center';
          if (t.endsWith(':')) return 'text-right';
          return 'text-left';
        });

      const bodyRows = lines.slice(2);

      let html = '<div class="my-4 overflow-x-auto rounded-xl border border-white/10 bg-[#121622]/90 shadow-md backdrop-blur-sm">';
      html += '<table class="w-full text-left border-collapse text-sm text-slate-200">';
      html += '<thead class="bg-[#181d2d] text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-white/10">';
      html += '<tr>';
      headerCells.forEach((cell, i) => {
        const align = alignments[i] || 'text-left';
        html += `<th scope="col" class="px-4 py-3 border-r border-white/5 last:border-r-0 ${align}">${cell}</th>`;
      });
      html += '</tr></thead>';
      html += '<tbody class="divide-y divide-white/5">';
      bodyRows.forEach((row, rowIdx) => {
        const cells = row.split('|').slice(1, -1).map(c => c.trim());
        const rowBg = rowIdx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]';
        html += `<tr class="${rowBg} hover:bg-white/[0.04] transition-colors">`;
        cells.forEach((cell, i) => {
          const align = alignments[i] || 'text-left';
          html += `<td class="px-4 py-3 font-normal border-r border-white/5 last:border-r-0 leading-relaxed ${align}">${cell}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      return saveTable(html);
    });

    // 6. Replace newlines on plain text only (safe because math and tables are tokenized)
    text = text.replace(/\n\n/g, '<div class="h-2"></div>').replace(/\n/g, '<br />');

    // 7. Restore table tokens
    tableTokens.forEach(({ key, html }) => {
      text = text.replace(key, html);
    });

    // 8. Restore rendered math tokens
    mathTokens.forEach(({ key, html }) => {
      text = text.replace(key, html);
    });

    return text;
  }, [content, textProp]);

  return (
    <div
      className={`leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
