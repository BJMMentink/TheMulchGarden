import { randomUUID } from 'node:crypto';
import { createInitialState } from '../../src/default-data.js';
import { BOOTSTRAP_ACCOUNT } from '../bootstrap.js';
import { JsonStore } from '../lib/json-store.js';

export class Repository {
  constructor(directory) { this.users = new JsonStore(directory); this.sessions = new JsonStore(directory); this.userData = new JsonStore(directory); this.chat = new JsonStore(directory); }
  async ensureBootstrapAccount() {
    const users = await this.users.read('users', []);
    const bootstrap = users.find((user) => user.username?.toLowerCase() === BOOTSTRAP_ACCOUNT.username.toLowerCase());
    if (bootstrap && !bootstrap.role) {
      bootstrap.role = 'admin';
      await this.users.write('users', users);
    } else if (BOOTSTRAP_ACCOUNT.passwordHash && !bootstrap) {
      users.push({ id: randomUUID(), username: BOOTSTRAP_ACCOUNT.username, passwordHash: BOOTSTRAP_ACCOUNT.passwordHash, role: 'admin', createdAt: new Date().toISOString() });
      await this.users.write('users', users);
    }
  }
  async findUserByUsername(username) { return (await this.users.read('users', [])).find((user) => user.username?.toLowerCase() === username.toLowerCase()) || null; }
  async listPublicUsers() { return (await this.users.read('users', [])).filter((user) => user.username).map(({ id, username, role }) => ({ id, username, role: role || 'user' })).sort((left, right) => left.username.localeCompare(right.username)); }
  async countUsers() { return (await this.users.read('users', [])).filter((user) => user.username).length; }
  async updateUser(userId, changes) {
    const users = await this.users.read('users', []); const index = users.findIndex((user) => user.id === userId);
    if (index < 0) throw new Error('User not found.');
    users[index] = { ...users[index], ...changes }; await this.users.write('users', users); return users[index];
  }
  async createUser({ username, passwordHash, role = 'user' }) {
    const users = await this.users.read('users', []);
    const user = { id: randomUUID(), username, passwordHash, role, createdAt: new Date().toISOString() };
    users.push(user); await this.users.write('users', users); await this.userData.write(`user-${user.id}`, createInitialState()); return user;
  }
  async getState(userId) { const stored = await this.userData.read(`user-${userId}`, createInitialState()); return { ...createInitialState(), ...stored, memories: Array.isArray(stored.memories) ? stored.memories : [] }; }
  async saveState(userId, state) { await this.userData.write(`user-${userId}`, state); return state; }
  async listBoardProjects(user) {
    const users = (await this.users.read('users', [])).filter((item) => item.username);
    const projects = [];
    for (const owner of users) {
      const stored = await this.userData.read(`user-${owner.id}`, createInitialState());
      for (const project of Array.isArray(stored.board?.projects) ? stored.board.projects : []) {
        const visible = owner.id === user.id || project.visibility === 'all' || (Array.isArray(project.memberIds) && project.memberIds.includes(user.id));
        if (visible) projects.push({ ...project, ownerId: owner.id, ownerUsername: project.ownerUsername || owner.username });
      }
    }
    return projects.sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')));
  }
  async listBoardSocial(user) {
    const users = (await this.users.read('users', [])).filter((item) => item.username);
    const groups = [];
    const posts = [];
    const replies = [];
    const ideas = [];
    for (const owner of users) {
      const stored = await this.userData.read(`user-${owner.id}`, createInitialState());
      const board = stored.board || {};
      for (const group of Array.isArray(board.groups) ? board.groups : []) {
        const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
        const visible = owner.id === user.id || ['public', 'circle'].includes(group.visibility) || memberIds.includes(user.id);
        if (!visible) continue;
        const pendingIds = Array.isArray(group.pendingIds) ? group.pendingIds : [];
        const applicants = owner.id === user.id ? users.filter((candidate) => pendingIds.includes(candidate.id)).map(({ id, username }) => ({ id, username })) : [];
        groups.push({ ...group, ownerId: owner.id, ownerUsername: group.ownerUsername || owner.username, isOwner: owner.id === user.id, isMember: owner.id === user.id || memberIds.includes(user.id), pending: pendingIds.includes(user.id), memberCount: memberIds.length, pendingApplicants: applicants });
      }
      for (const post of Array.isArray(board.posts) ? board.posts : []) posts.push({ ...post, ownerId: owner.id, ownerUsername: post.ownerUsername || owner.username });
      for (const reply of Array.isArray(board.replies) ? board.replies : []) replies.push({ ...reply, ownerId: owner.id, ownerUsername: reply.ownerUsername || owner.username });
      for (const idea of Array.isArray(board.ideas) ? board.ideas : []) ideas.push({ ...idea, ownerId: owner.id, ownerUsername: idea.ownerUsername || owner.username });
    }
    const visibleGroupIds = new Set(groups.filter((group) => group.isMember).map((group) => group.id));
    return { groups: groups.sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''))), posts: posts.filter((post) => visibleGroupIds.has(post.groupId)).sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || ''))), replies: replies.filter((reply) => visibleGroupIds.has(reply.groupId)).sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || ''))), ideas: ideas.filter((idea) => !idea.archivedAt && (idea.ownerId === user.id || visibleGroupIds.has(idea.groupId))).sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || ''))) };
  }
  async boardSocialAction(user, body) {
    const action = String(body?.action || '');
    const users = (await this.users.read('users', [])).filter((item) => item.username);
    const now = new Date().toISOString();
    const readBoard = async (owner) => { const stored = await this.userData.read(`user-${owner.id}`, createInitialState()); stored.board = stored.board || {}; stored.board.groups = Array.isArray(stored.board.groups) ? stored.board.groups : []; stored.board.posts = Array.isArray(stored.board.posts) ? stored.board.posts : []; stored.board.replies = Array.isArray(stored.board.replies) ? stored.board.replies : []; stored.board.ideas = Array.isArray(stored.board.ideas) ? stored.board.ideas : []; return stored; };
    const findGroup = async (groupId) => { for (const owner of users) { const stored = await readBoard(owner); const group = stored.board.groups.find((item) => item.id === groupId); if (group) return { owner, stored, group }; } return null; };
    if (action === 'create-group') {
      const name = String(body.name || '').trim(); if (!name) throw new Error('Group name is required.');
      const visibility = ['public', 'private', 'circle'].includes(body.visibility) ? body.visibility : 'public';
      const stored = await readBoard(user); const memberIds = [...new Set([user.id, ...(Array.isArray(body.memberIds) ? body.memberIds.map(String) : [])])]; const groupId = randomUUID(); stored.board.groups.unshift({ id: groupId, name: name.slice(0, 80), description: String(body.description || '').trim().slice(0, 240), visibility, ownerId: user.id, ownerUsername: user.username, memberIds, pendingIds: [], createdAt: now, updatedAt: now }); await this.userData.write(`user-${user.id}`, stored); return { ok: true, groupId };
    }
    if (action === 'join-group') {
      const found = await findGroup(String(body.groupId || '')); if (!found) throw Object.assign(new Error('Group not found.'), { status: 404 });
      if (found.owner.id === user.id || found.group.memberIds?.includes(user.id)) return { ok: true };
      if (found.group.visibility === 'private') throw Object.assign(new Error('This private group is invite-only.'), { status: 403 });
      found.group.memberIds = Array.isArray(found.group.memberIds) ? found.group.memberIds : []; found.group.pendingIds = Array.isArray(found.group.pendingIds) ? found.group.pendingIds : [];
      if (found.group.visibility === 'circle') { if (!found.group.pendingIds.includes(user.id)) found.group.pendingIds.push(user.id); } else if (!found.group.memberIds.includes(user.id)) found.group.memberIds.push(user.id);
      found.group.updatedAt = now; await this.userData.write(`user-${found.owner.id}`, found.stored); return { ok: true };
    }
    if (action === 'approve-group-member') {
      const found = await findGroup(String(body.groupId || '')); if (!found || found.owner.id !== user.id) throw Object.assign(new Error('Only the group owner can approve members.'), { status: 403 });
      const applicantId = String(body.userId || ''); found.group.pendingIds = (found.group.pendingIds || []).filter((id) => id !== applicantId); found.group.memberIds = Array.isArray(found.group.memberIds) ? found.group.memberIds : []; if (!found.group.memberIds.includes(applicantId)) found.group.memberIds.push(applicantId); found.group.updatedAt = now; await this.userData.write(`user-${found.owner.id}`, found.stored); return { ok: true };
    }
    if (action === 'create-post') {
      const found = await findGroup(String(body.groupId || '')); if (!found || !(found.owner.id === user.id || found.group.memberIds?.includes(user.id))) throw Object.assign(new Error('Join this group before posting.'), { status: 403 });
      const text = String(body.body || '').trim(); if (!text) throw new Error('Post text is required.');
      const stored = await readBoard(user); stored.board.posts.unshift({ id: randomUUID(), groupId: found.group.id, body: text.slice(0, 2000), repoUrl: String(body.repoUrl || '').trim().slice(0, 500), repoPath: String(body.repoPath || '').trim().slice(0, 300), repoLine: String(body.repoLine || '').trim().slice(0, 40), repoQuery: String(body.repoQuery || '').trim().slice(0, 120), snippet: String(body.snippet || '').trim().slice(0, 1200), ownerId: user.id, ownerUsername: user.username, createdAt: now, updatedAt: now }); await this.userData.write(`user-${user.id}`, stored); return { ok: true };
    }
    if (action === 'create-reply') {
      const postId = String(body.postId || ''); let postFound = null; for (const owner of users) { const stored = await readBoard(owner); const post = stored.board.posts.find((item) => item.id === postId); if (post) { postFound = { owner, post }; break; } } if (!postFound) throw Object.assign(new Error('Post not found.'), { status: 404 });
      const group = await findGroup(postFound.post.groupId); if (!group || !(group.owner.id === user.id || group.group.memberIds?.includes(user.id))) throw Object.assign(new Error('Join this group before replying.'), { status: 403 });
      const text = String(body.body || '').trim(); if (!text) throw new Error('Reply text is required.'); const stored = await readBoard(user); stored.board.replies.push({ id: randomUUID(), postId, groupId: group.group.id, body: text.slice(0, 1000), ownerId: user.id, ownerUsername: user.username, createdAt: now }); await this.userData.write(`user-${user.id}`, stored); return { ok: true };
    }
    if (action === 'create-idea') {
      const title = String(body.title || '').trim(); if (!title) throw new Error('Idea title is required.');
      const groupId = String(body.groupId || ''); if (groupId) { const found = await findGroup(groupId); if (!found || !(found.owner.id === user.id || found.group.memberIds?.includes(user.id))) throw Object.assign(new Error('Join this group before adding an idea.'), { status: 403 }); }
      const stored = await readBoard(user); const ideaId = randomUUID(); stored.board.ideas.unshift({ id: ideaId, title: title.slice(0, 100), detail: String(body.detail || '').trim().slice(0, 500), groupId, stage: 'spark', ownerId: user.id, ownerUsername: user.username, createdAt: now, updatedAt: now }); await this.userData.write(`user-${user.id}`, stored); return { ok: true, ideaId };
    }
    if (action === 'move-idea' || action === 'archive-idea') {
      const ideaId = String(body.ideaId || ''); const stored = await readBoard(user); const idea = stored.board.ideas.find((item) => item.id === ideaId); if (!idea) throw Object.assign(new Error('Idea not found or not editable.'), { status: 404 });
      if (action === 'archive-idea') idea.archivedAt = now; else { const stage = String(body.stage || ''); if (!['spark', 'shape', 'test', 'ready'].includes(stage)) throw new Error('Invalid idea stage.'); idea.stage = stage; } idea.updatedAt = now; await this.userData.write(`user-${user.id}`, stored); return { ok: true };
    }
    throw new Error('Unknown board action.');
  }
  async removeBoardProject(projectId, actor) {
    const users = (await this.users.read('users', [])).filter((item) => item.username);
    for (const owner of users) {
      const stored = await this.userData.read(`user-${owner.id}`, createInitialState());
      const board = stored.board && Array.isArray(stored.board.projects) ? stored.board : null;
      const project = board?.projects.find((item) => item.id === projectId);
      if (!project) continue;
      if (owner.id !== actor.id && actor.role !== 'admin') throw Object.assign(new Error('You cannot remove another user\'s project.'), { status: 403 });
      board.projects = board.projects.filter((item) => item.id !== projectId);
      await this.userData.write(`user-${owner.id}`, stored);
      return { ok: true };
    }
    throw Object.assign(new Error('Project not found.'), { status: 404 });
  }
  async listChatMessages(limit) { return (await this.chat.read('chat', [])).slice(-limit); }
  async createChatMessage({ userId, username, message, maxMessages }) {
    const messages = await this.chat.read('chat', []);
    const created = { id: randomUUID(), userId, username, message, createdAt: new Date().toISOString() };
    messages.push(created);
    await this.chat.write('chat', messages.slice(-maxMessages));
    return created;
  }
  async createSession(userId, digest, expiresAt) { const sessions = await this.sessions.read('sessions', []); sessions.push({ digest, userId, expiresAt }); await this.sessions.write('sessions', sessions); }
  async findSession(digest) { return (await this.sessions.read('sessions', [])).find((item) => item.digest === digest && item.expiresAt > Date.now()) || null; }
  async deleteSession(digest) { const sessions = await this.sessions.read('sessions', []); await this.sessions.write('sessions', sessions.filter((item) => item.digest !== digest)); }
}
