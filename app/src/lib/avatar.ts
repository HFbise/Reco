const AVATAR_COLORS = ['#5865F2','#3BA55C','#FAA61A','#ED4245','#EB459E','#57F287','#0099E1','#9C84EC'];

export function getAvatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) & 0x7fffffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
