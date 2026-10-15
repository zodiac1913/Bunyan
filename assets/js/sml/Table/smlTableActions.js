export function resolveTableActions(payload) {
  const query = payload?.query || payload?.Query;
  const nestedActions = query?.queryActions || query?.QueryActions;
  const topLevelActions = payload?.actions || payload?.Actions;

  return (Array.isArray(nestedActions) && nestedActions.length > 0 ? nestedActions : null)
    || (Array.isArray(topLevelActions) && topLevelActions.length > 0 ? topLevelActions : null)
    || (Array.isArray(nestedActions) ? nestedActions : null)
    || (Array.isArray(topLevelActions) ? topLevelActions : []);
}