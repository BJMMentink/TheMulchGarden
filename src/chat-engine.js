export function shouldShowChatTimestamp(messages, index, gapMs) {
  if (index === 0) return true;
  const previous = Date.parse(messages[index - 1]?.createdAt || '');
  const current = Date.parse(messages[index]?.createdAt || '');
  return !Number.isFinite(previous) || !Number.isFinite(current) || current - previous >= gapMs;
}

export function findNewChatMessages(previousMessages = [], nextMessages = []) {
  const knownIds = new Set(previousMessages.map((message) => message.id));
  return nextMessages.filter((message) => message.id && !knownIds.has(message.id));
}
