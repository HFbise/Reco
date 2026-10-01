/** Someone in a room's member list (see room_access.members_view on the server) */
export interface Member {
  username: string;
  screenname: string;
  is_admin: boolean;
  is_owner: boolean;
  is_online: boolean;
  avatar_color?: string;
  avatar_expression?: string;
}
