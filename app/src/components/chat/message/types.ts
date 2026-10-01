/** A chat message as the client holds it (the server's fields, plus isOwn). */
export interface Message {
  id: number;
  username: string;
  screenname: string;
  text: string;
  time: string;
  recalled?: boolean;
  edited?: boolean;
  /** emoji → the usernames who added it */
  reactions?: Record<string, string[]>;
  /** Sent by the signed-in person */
  isOwn: boolean;
  system?: boolean;
  meta?: {
    invite?: { room: string; code: string };
    image?: { id: string; w: number; h: number };
    /** Who it @mentions: username → display name (see lib/mentions) */
    mentions?: Record<string, string>;
  } | null;
  avatar_expression?: string;
  avatar_color?: string;
  /** The message this one replies to, as quoted by the server */
  reply?: { id: number; username: string; screenname: string; text: string; recalled: boolean } | null;
}
