export function findAdminGroupIndex(groups, view) {
  return groups.findIndex((group) => group.views.includes(view));
}

export function cycleAdminGroupIndex(groups, currentIndex, direction) {
  if (!groups.length) return -1;
  const current = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < groups.length ? currentIndex : 0;
  const step = direction < 0 ? -1 : 1;
  return (current + step + groups.length) % groups.length;
}

export function resolveAdminGroupView(group, savedView, availableViews) {
  if (!group) return null;
  const validViews = group.views.filter((view) => availableViews.includes(view));
  return validViews.includes(savedView) ? savedView : validViews[0] ?? null;
}
