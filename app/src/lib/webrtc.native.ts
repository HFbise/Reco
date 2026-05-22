// Native platform (iOS/Android): use react-native-webrtc
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
} from 'react-native-webrtc';

export const RTCPeerConnectionImpl = RTCPeerConnection;
export const RTCSessionDescriptionImpl = RTCSessionDescription;
export const RTCIceCandidateImpl = RTCIceCandidate;

export async function getUserMedia(constraints: any): Promise<any> {
  return mediaDevices.getUserMedia(constraints);
}

export const isSupported = true;

// react-native-webrtc plays audio automatically via native audio subsystem
export function playRemoteStream(_username: string, _stream: any): void {}
export function stopRemoteStream(_username: string): void {}
export function setSpeakerVolumeAll(_vol: number): void {}

export async function getDisplayMedia(_constraints: any): Promise<MediaStream | null> { return null; }
export function setSpeakerDevice(_deviceId: string): void {}
