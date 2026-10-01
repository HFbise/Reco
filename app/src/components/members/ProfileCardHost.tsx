import { useState } from 'react';
import { EditProfileModal } from '../account/AccountModals';
import { ProfileCard } from './ProfileCard';
import { useCardStore } from '../../store/cardStore';

interface Props {
  /** The room whose voice you're in, if any (their volume slider shows there) */
  voiceRoom?: string | null;
  onOpenDm: (person: { username: string; screenname: string; avatar_expression?: string; avatar_color?: string }) => void;
  onOpenRoom: (room: string) => void;
}

/** Shows the person card opened anywhere (useCardStore). One per layout: the desktop shell,
 *  or the phone's chat screen. */
export function ProfileCardHost({ voiceRoom, onOpenDm, onOpenRoom }: Props) {
  const { person, room, hide } = useCardStore();
  const [editing, setEditing] = useState(false);
  return (
    <>
      {person && (
        <ProfileCard person={person} room={room} inVoiceHere={!!room && room === voiceRoom}
          onOpenDm={onOpenDm} onOpenRoom={onOpenRoom} onEditProfile={() => setEditing(true)} onClose={hide} />
      )}
      <EditProfileModal visible={editing} onClose={() => setEditing(false)} />
    </>
  );
}
