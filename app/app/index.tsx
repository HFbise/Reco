import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function Index() {
  const { currentUser } = useAuthStore();
  return <Redirect href={currentUser ? '/(main)' : '/(auth)'} />;
}
