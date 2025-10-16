export function isHostUser(hostName, currentUserName) {
  if (!hostName || !currentUserName) return false;
  return hostName.trim().toLowerCase() === currentUserName.trim().toLowerCase();
} 