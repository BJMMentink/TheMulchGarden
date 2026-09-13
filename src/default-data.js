export const SEEDED_INTERESTS = Object.freeze([
  { id: 'creator-nuxinor', name: 'Nuxinor', category: 'creator', rating: 5, source: 'seed' },
  { id: 'creator-luke-stephens', name: 'Luke Stephens', category: 'creator', rating: 5, source: 'seed' },
  { id: 'creator-asmongold', name: 'Asmongold', category: 'creator', rating: 5, source: 'seed' },
]);

export const DEFAULT_PROJECTS = Object.freeze([
  { id: 'project-saberdueler', name: 'SaberDueler', type: 'Personal', color: 'violet', todos: [{ id: 'todo-saberdueler-1', title: 'Define the next smallest playable slice', done: false }] },
  { id: 'project-gmche', name: 'GMCHE art class', type: 'Professional', color: 'green', todos: [{ id: 'todo-gmche-1', title: 'Prepare the next art class materials', done: false }] },
]);

export function createInitialState() {
  return {
    version: 1,
    onboarding: { completed: false, version: 0 },
    interests: SEEDED_INTERESTS.map((interest) => ({ ...interest })),
    projects: DEFAULT_PROJECTS.map((project) => ({ ...project, todos: project.todos.map((todo) => ({ ...todo })) })),
    feedback: [],
    memories: [],
  };
}
