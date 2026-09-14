export function createAppController(repository, auth, config) {
  return {
    async getState(user) { return repository.getState(user.id); },
    async listMembers() { return repository.listPublicUsers(); },
    async listChatMessages() { return repository.listChatMessages(config.chatMaxMessages); },
    async dailyWordle() {
      const date = new Date().toISOString().slice(0, 10);
      const response = await fetch(`https://www.nytimes.com/svc/wordle/v2/${date}.json`);
      if (!response.ok) throw new Error('Daily Wordle is temporarily unavailable.');
      const payload = await response.json();
      return { date, answer: String(payload.solution || '').toLocaleUpperCase() };
    },
    async createChatMessage(user, body) {
      const message = String(body?.message || '').trim();
      if (!message) throw new Error('Message is required.');
      if (message.length > config.chatMaxMessageLength) throw new Error(`Messages must be ${config.chatMaxMessageLength} characters or fewer.`);
      return repository.createChatMessage({ userId: user.id, username: user.username, message, maxMessages: config.chatMaxMessages });
    },
    async saveState(user, body) {
      if (!body || body.version !== 1 || !Array.isArray(body.interests) || !Array.isArray(body.projects)) throw new Error('Invalid application state.');
      return repository.saveState(user.id, body);
    },
    async requireUser(request) {
      const user = await auth.current(request);
      if (!user) throw Object.assign(new Error('Authentication required.'), { status: 401 });
      return user;
    },
  };
}
