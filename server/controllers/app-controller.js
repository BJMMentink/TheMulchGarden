export function createAppController(repository, auth) {
  return {
    async getState(user) { return repository.getState(user.id); },
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

