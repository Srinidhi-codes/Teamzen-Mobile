export type MessagePart = {
  type: 'text' | 'balance' | 'attendance' | 'error' | 'insight' | 'leavetype' | 'pendingleave' | 'payroll';
  value: any;
};

/**
 * Extracts key-value pairs from a text string like "Key: Value | Key: Value"
 */
const parseContentToData = (content: string): Record<string, string> => {
  const data: Record<string, string> = {};
  const lines = content.split(/[|\n]/);

  lines.forEach((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      if (key) data[key] = value;
    }
  });

  return data;
};

export const parseMessage = (content: string): MessagePart[] => {
  const cardTypes = [
    { type: 'balance', start: '[BALANCE_CARD]', end: '[/BALANCE_CARD]' },
    { type: 'attendance', start: '[ATTENDANCE_CARD]', end: '[/ATTENDANCE_CARD]' },
    { type: 'error', start: '[ERROR_CARD]', end: '[/ERROR_CARD]' },
    { type: 'insight', start: '[INSIGHT_CARD]', end: '[/INSIGHT_CARD]' },
    { type: 'leavetype', start: '[LEAVE_TYPE_CARD]', end: '[/LEAVE_TYPE_CARD]' },
    { type: 'pendingleave', start: '[PENDING_LEAVE_CARD]', end: '[/PENDING_LEAVE_CARD]' },
    { type: 'payroll', start: '[PAYROLL_CARD]', end: '[/PAYROLL_CARD]' },
  ];

  const parts: MessagePart[] = [];
  const allMatches: any[] = [];
  const lastIndex = 0;

  // 1. Find all COMPLETE cards
  cardTypes.forEach(({ type, start, end }) => {
    const startEscaped = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const endEscaped = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`${startEscaped}([\\s\\S]*?)${endEscaped}`, 'g');

    let match;
    while ((match = regex.exec(content)) !== null) {
      allMatches.push({
        type,
        index: match.index,
        lastIndex: regex.lastIndex,
        data: match[1],
      });
    }
  });

  // 2. Handle partial cards (streaming fallback)
  let partialMatch: any = null;
  cardTypes.forEach(({ type, start, end }) => {
    const startIndex = content.lastIndexOf(start);
    if (startIndex > -1 && startIndex >= lastIndex) {
      const hasEnd = content.indexOf(end, startIndex) > -1;
      if (!hasEnd) {
        if (!partialMatch || startIndex > partialMatch.index) {
          partialMatch = {
            type,
            index: startIndex,
            lastIndex: content.length,
            data: content.slice(startIndex + start.length),
          };
        }
      }
    }
  });

  if (partialMatch) allMatches.push(partialMatch);
  allMatches.sort((a, b) => a.index - b.index);

  // 3. Assemble parts
  let currentPos = 0;
  allMatches.forEach((m) => {
    if (m.index < currentPos) return;

    if (m.index > currentPos) {
      parts.push({ type: 'text', value: content.slice(currentPos, m.index) });
    }

    parts.push({
      type: m.type as any,
      value: parseContentToData(m.data),
    });

    currentPos = m.lastIndex;
  });

  if (currentPos < content.length) {
    parts.push({ type: 'text', value: content.slice(currentPos) });
  }

  return parts;
};
export default parseMessage;
