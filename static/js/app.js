const socket = io();

// ── i18n ─────────────────────────────────────────────────
const i18n = {
  zh: {
    'profile-btn':'我的资料','logout-btn':'登出','login-open-btn':'登录 / 注册',
    'sidebar-rooms-title':'聊天室','create-room-btn':'＋ 创建房间','find-room-btn':'🔍 搜索房间',
    'no-room':'请先登录或注册','kicked':'你已被踢出该房间',
    'send-btn':'发送',
    'voice-join':'🎤 加入语音','voice-leave':'📵 离开语音',
    'voice-status-in':'🔊 正在 #{room} 语音','voice-status-in-en':'🔊 In #{room} voice',
    'share-audio':'🖥 共享音频','stop-sharing':'⏹ 停止共享',
    'live':'📺 直播','stop-live':'⏹ 停止直播',
    'mic-title':'闭麦 / 开麦','speaker-title':'静音扬声器（同时闭麦）',
    'sidebar-members-title':'成员',
    'settings-title':'⚙️ 设置','settings-tab-audio':'🎵 音频','settings-tab-general':'通用',
    'settings-mic-label':'🎤 麦克风','settings-speaker-label':'🔊 扬声器',
    'settings-mic-test-label':'🎚️ 麦克风测试',
    'start-mic-test-btn':'▶ 开始测试','stop-mic-test-btn':'■ 停止',
    'settings-lang-label':'🌐 语言 / Language','settings-close-btn':'关闭',
    'card-dm-btn':'💬 发私信',
    'card-set-admin-btn':'👑 设为管理员','card-remove-admin-btn':'取消管理员',
    'card-kick-btn':'🚪 踢出房间','card-invite-btn':'✉️ 邀请到聊天室',
    'card-voice-vol-label':'🔊 语音音量','card-stream-vol-label':'🎵 共享音频音量',
    'card-modal-close-btn':'关闭',
    'room-code-label':'房间号：','room-code-copy-btn':'复制',
    'room-card-close-btn':'🗑 关闭房间','room-card-leave-btn':'退出房间',
    'room-card-modal-close':'关闭','room-pw-confirm-btn':'确认设置',
    'room-pw-toggle-set':'🔒 添加密码','room-pw-toggle-remove':'🔓 取消密码',
    'tab-recos':'Recos','tab-me':'我','tab-me-label':'我',
    'mobile-me-title':'我的资料','mobile-me-bio-label':'简介','mobile-me-edit-btn':'编辑资料',
    'tab-login':'登录','tab-register':'注册',
    'login-submit-btn':'登录','forgot-pw-link':'忘记密码？','register-submit-btn':'注册',
    'forgot-title':'找回密码','forgot-next-btn':'下一步',
    'forgot-reset-btn':'重置密码','forgot-back-btn':'返回登录',
    'profile-title':'我的资料','profile-save-btn':'保存',
    'profile-changepw-btn':'修改密码','profile-close-btn':'关闭',
    'admin-reset-btn':'重置该用户密码',
    'changepw-title':'修改密码','changepw-confirm-btn':'确认修改','changepw-cancel-btn':'取消',
    'create-room-title':'创建房间','create-room-confirm-btn':'创建','create-room-cancel-btn':'取消',
    'find-room-title':'🔍 搜索房间','find-room-confirm-btn':'搜索','find-room-cancel-btn':'取消',
    'invite-room-title':'邀请到聊天室','invite-room-cancel-btn':'取消',
    'invite-notify-title':'📩 房间邀请','invite-accept-btn':'接受','invite-decline-btn':'拒绝',
    'room-pw-modal-title':'🔒 输入房间密码','room-pw-enter-btn':'进入','room-pw-cancel-btn':'取消',
    // placeholders
    'ph-room-search':'搜索…','ph-msg-input':'输入消息...',
    'ph-login-username':'用户名','ph-login-password':'密码',
    'ph-reg-username':'用户名（登录用，不可更改）','ph-reg-screenname':'显示名',
    'ph-reg-password':'密码（至少6位）','ph-reg-bio':'个人简介（可选）',
    'ph-reg-question':'选择安全问题...','ph-reg-answer':'安全问题答案',
    'sq0':'你的出生城市是？','sq1':'你的小学名字是？','sq2':'你最喜欢的宠物名字是？',
    'sq3':'你母亲的娘家姓是？','sq4':'你的第一辆车的品牌是？','sq5':'你最喜欢的老师叫什么？',
    'ph-forgot-username':'输入用户名','ph-forgot-answer':'输入答案',
    'ph-forgot-newpw':'新密码（至少6位）',
    'ph-profile-screenname':'显示名','ph-profile-bio':'个人简介',
    'ph-admin-reset-target':'输入要重置的用户名',
    'ph-old-password':'旧密码','ph-new-password':'新密码（至少6位）','ph-confirm-password':'确认新密码',
    'ph-new-room-name':'房间名','ph-new-room-password':'房间密码（可选，留空则不设密码）',
    'ph-find-room-code':'输入房间号（6位数字）',
    'ph-room-new-pw-input':'输入新密码','ph-room-pw-input':'密码',
    'room-pw-remember-label-text':'记住密码',
    'room-info-title':'查看房间信息',
    'voice-chat-title':'语音聊天',
  },
  en: {
    'profile-btn':'Profile','logout-btn':'Logout','login-open-btn':'Login / Register',
    'sidebar-rooms-title':'Rooms','create-room-btn':'＋ Create Room','find-room-btn':'🔍 Find Room',
    'no-room':'Please login or register','kicked':'You have been kicked from this room',
    'send-btn':'Send',
    'voice-join':'🎤 Join Voice','voice-leave':'📵 Leave Voice',
    'voice-status-in':'🔊 In #{room} voice','voice-status-in-en':'🔊 In #{room} voice',
    'share-audio':'🖥 Share Audio','stop-sharing':'⏹ Stop Sharing',
    'live':'📺 Live','stop-live':'⏹ Stop Live',
    'mic-title':'Mute / Unmute','speaker-title':'Mute Speaker',
    'sidebar-members-title':'Members',
    'settings-title':'⚙️ Settings','settings-tab-audio':'🎵 Audio','settings-tab-general':'General',
    'settings-mic-label':'🎤 Microphone','settings-speaker-label':'🔊 Speaker',
    'settings-mic-test-label':'🎚️ Mic Test',
    'start-mic-test-btn':'▶ Start Test','stop-mic-test-btn':'■ Stop',
    'settings-lang-label':'🌐 Language','settings-close-btn':'Close',
    'card-dm-btn':'💬 Direct Message',
    'card-set-admin-btn':'👑 Set Admin','card-remove-admin-btn':'Remove Admin',
    'card-kick-btn':'🚪 Kick','card-invite-btn':'✉️ Invite to Room',
    'card-voice-vol-label':'🔊 Voice Volume','card-stream-vol-label':'🎵 Shared Audio Volume',
    'card-modal-close-btn':'Close',
    'room-code-label':'Room Code: ','room-code-copy-btn':'Copy',
    'room-card-close-btn':'🗑 Close Room','room-card-leave-btn':'Leave Room',
    'room-card-modal-close':'Close','room-pw-confirm-btn':'Confirm',
    'room-pw-toggle-set':'🔒 Set Password','room-pw-toggle-remove':'🔓 Remove Password',
    'tab-recos':'Recos','tab-me':'Me','tab-me-label':'Me',
    'mobile-me-title':'Profile','mobile-me-bio-label':'Bio','mobile-me-edit-btn':'Edit Profile',
    'tab-login':'Login','tab-register':'Register',
    'login-submit-btn':'Login','forgot-pw-link':'Forgot password?','register-submit-btn':'Register',
    'forgot-title':'Forgot Password','forgot-next-btn':'Next',
    'forgot-reset-btn':'Reset Password','forgot-back-btn':'Back to Login',
    'profile-title':'My Profile','profile-save-btn':'Save',
    'profile-changepw-btn':'Change Password','profile-close-btn':'Close',
    'admin-reset-btn':'Reset User Password',
    'changepw-title':'Change Password','changepw-confirm-btn':'Confirm','changepw-cancel-btn':'Cancel',
    'create-room-title':'Create Room','create-room-confirm-btn':'Create','create-room-cancel-btn':'Cancel',
    'find-room-title':'🔍 Find Room','find-room-confirm-btn':'Search','find-room-cancel-btn':'Cancel',
    'invite-room-title':'Invite to Room','invite-room-cancel-btn':'Cancel',
    'invite-notify-title':'📩 Room Invite','invite-accept-btn':'Accept','invite-decline-btn':'Decline',
    'room-pw-modal-title':'🔒 Enter Room Password','room-pw-enter-btn':'Enter','room-pw-cancel-btn':'Cancel',
    // placeholders
    'ph-room-search':'🔍 Search…','ph-msg-input':'Type a message...',
    'ph-login-username':'Username','ph-login-password':'Password',
    'ph-reg-username':'Username (for login, cannot be changed)','ph-reg-screenname':'Display name',
    'ph-reg-password':'Password (min 6 chars)','ph-reg-bio':'Bio (optional)',
    'ph-reg-question':'Select a security question...','ph-reg-answer':'Security question answer',
    'sq0':'What city were you born in?','sq1':'What was the name of your primary school?',
    'sq2':'What is your favorite pet\'s name?','sq3':'What is your mother\'s maiden name?',
    'sq4':'What was the make of your first car?','sq5':'What is your favorite teacher\'s name?',
    'ph-forgot-username':'Enter username','ph-forgot-answer':'Enter answer',
    'ph-forgot-newpw':'New password (min 6 chars)',
    'ph-profile-screenname':'Display name','ph-profile-bio':'Bio',
    'ph-admin-reset-target':'Enter username to reset',
    'ph-old-password':'Current password','ph-new-password':'New password (min 6 chars)','ph-confirm-password':'Confirm new password',
    'ph-new-room-name':'Room name','ph-new-room-password':'Password (optional, leave blank for none)',
    'ph-find-room-code':'Enter 6-digit room code',
    'ph-room-new-pw-input':'Enter new password','ph-room-pw-input':'Password',
    'room-pw-remember-label-text':'Remember password',
    'room-info-title':'Room info',
    'voice-chat-title':'Voice Chat',
  }
};
let currentLang = localStorage.getItem('lang') || 'zh';
function t(key) { const v = (i18n[currentLang] || i18n.zh)[key]; return v !== undefined ? v : (i18n.zh[key] || key); }

function applyLang() {
  const L = i18n[currentLang] || i18n.zh;
  // Text content by ID
  const textIds = [
    'profile-btn','logout-btn','login-open-btn','sidebar-rooms-title','create-room-btn',
    'find-room-btn','send-btn',
    'settings-title','settings-tab-audio','settings-tab-general',
    'settings-mic-label','settings-speaker-label','settings-mic-test-label',
    'start-mic-test-btn','stop-mic-test-btn','settings-lang-label','settings-close-btn',
    'card-dm-btn','card-set-admin-btn','card-remove-admin-btn','card-kick-btn',
    'card-invite-btn','card-voice-vol-label','card-stream-vol-label','card-modal-close-btn',
    'room-code-label','room-code-copy-btn','room-card-close-btn','room-card-leave-btn',
    'room-card-modal-close','room-pw-confirm-btn',
    'tab-recos-label','tab-me-label',
    'tab-login','tab-register','login-submit-btn','forgot-pw-link','register-submit-btn',
    'forgot-title','forgot-next-btn','forgot-reset-btn','forgot-back-btn',
    'profile-title','profile-save-btn','profile-changepw-btn','profile-close-btn',
    'admin-reset-btn',
    'changepw-title','changepw-confirm-btn','changepw-cancel-btn',
    'create-room-title','create-room-confirm-btn','create-room-cancel-btn',
    'find-room-title','find-room-confirm-btn','find-room-cancel-btn',
    'invite-room-title','invite-room-cancel-btn','invite-notify-title','invite-accept-btn','invite-decline-btn',
    'room-pw-modal-title','room-pw-enter-btn','room-pw-cancel-btn',
  ];
  textIds.forEach(id => { const el = document.getElementById(id); if (el && L[id]) el.textContent = L[id]; });
  // Placeholders
  const phMap = {
    'room-search':'ph-room-search','msg-input':'ph-msg-input',
    'login-username':'ph-login-username','login-password':'ph-login-password',
    'reg-username':'ph-reg-username','reg-screenname':'ph-reg-screenname',
    'reg-password':'ph-reg-password','reg-bio':'ph-reg-bio',
    'reg-answer':'ph-reg-answer',
    'forgot-username':'ph-forgot-username','forgot-answer':'ph-forgot-answer','forgot-newpw':'ph-forgot-newpw',
    'profile-screenname':'ph-profile-screenname','profile-bio':'ph-profile-bio',
    'admin-reset-target':'ph-admin-reset-target',
    'old-password':'ph-old-password','new-password':'ph-new-password','confirm-password':'ph-confirm-password',
    'new-room-name':'ph-new-room-name','new-room-password':'ph-new-room-password',
    'find-room-code':'ph-find-room-code',
    'room-new-pw-input':'ph-room-new-pw-input','room-pw-input':'ph-room-pw-input',
  };
  Object.entries(phMap).forEach(([id, key]) => { const el = document.getElementById(id); if (el && L[key]) el.placeholder = L[key]; });
  // Titles
  const titleMap = { 'mic-toggle':'mic-title', 'speaker-toggle':'speaker-title' };
  Object.entries(titleMap).forEach(([id, key]) => { const el = document.getElementById(id); if (el && L[key]) el.title = L[key]; });
  if (currentRoom) _setChatTitle(currentRoom);
  updateVoiceCount();
  updateMembersCount();
  // Room pw remember label (has child checkbox, use lastChild)
  const remEl = document.getElementById('room-pw-remember-label');
  if (remEl) remEl.lastChild.textContent = ' ' + (L['room-pw-remember-label-text'] || '');
  // Dynamic state buttons
  const vjb = document.getElementById('voice-join-btn');
  if (vjb) vjb.textContent = t('voice-join');
  const vlb = document.getElementById('voice-leave-btn');
  if (vlb) vlb.textContent = t('voice-leave');
  const sab = document.getElementById('stream-audio-btn');
  if (sab) sab.textContent = isStreamingAudio ? t('stop-sharing') : t('share-audio');
  const lb = document.getElementById('live-btn');
  if (lb) lb.textContent = isStreaming ? t('stop-live') : t('live');
  // no-room hint (only if not kicked)
  const nr = document.getElementById('no-room');
  if (nr && !currentRoom) nr.textContent = t('no-room');
  // Language buttons active state
  document.getElementById('lang-zh-btn')?.classList.toggle('active', currentLang === 'zh');
  document.getElementById('lang-en-btn')?.classList.toggle('active', currentLang === 'en');
  // Re-populate security question select in correct language
  populateQuestionSelect();
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  applyLang();
}

function switchSettingsTab(tab) {
  document.getElementById('settings-tab-audio').classList.toggle('active', tab === 'audio');
  document.getElementById('settings-tab-general').classList.toggle('active', tab === 'general');
  document.getElementById('settings-audio-panel').style.display = tab === 'audio' ? '' : 'none';
  document.getElementById('settings-general-panel').style.display = tab === 'general' ? '' : 'none';
}

let currentUser = null;
let currentRoom = null;
let isAdmin = false;   // 有任何房间权限（管理员/房主）
let isOwner = false;   // 是房主
let isMod = false;     // 是管理员（非房主）
let memberOwner = '';  // 当前房间房主用户名
let currentIsDm = false; // 当前是否在私聊
let localStream = null;
let peerConnections = {}; // { username: RTCPeerConnection }
let audioElements = {};   // { username: HTMLAudioElement }
let audioGains = {};      // { username: GainNode }
let displayStream = null;
let isStreamingAudio = false;
let isStreaming = false;
let streamAudioTrack = null;
let streamQuality = { width: 1280, height: 720, frameRate: 15, bitrate: 1_500_000 };
const streamAudioElements = {}; // { username: HTMLAudioElement } — 对方的共享音频
const streamVideos = {};        // { username: HTMLVideoElement }
const voiceScreennames = {};    // { username: screenname }
let inVoice = false;
let voiceRoom = null;
let voiceMembers = new Set();
let _pillSpeaker = null;
let _pingInterval = null;
let isMuted = false;
let voiceBanned = new Set();
let ignoredUsers = new Set();
let cardTargetUsername = null;
let memberAdmins = new Set();
let roomHasPassword = {};
let savedRoomPasswords = JSON.parse(localStorage.getItem('roomPasswords') || '{}');
let pendingJoinRoom = null;
let speakerVolume = 1.0;
let micGainNode = null;
let audioContext = null;

let iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};
async function loadIceServers() {
  try {
    const u = currentUser ? encodeURIComponent(currentUser.username) : '';
    const r = await fetch('/api/ice-servers?u=' + u);
    const servers = await r.json();
    if (servers.length) iceServers = { iceServers: servers };
  } catch (e) {
    console.warn('Failed to fetch ICE servers, using STUN only', e);
  }
}

const SUN_SVG = `<svg width="17" height="17" viewBox="0 0 21 21" fill="none"><path d="M10.5 3.5V2M10.5 19v-1.5M3.5 10.5H2M19 10.5h-1.5M5.45 5.45 4.39 4.39M16.61 16.61l-1.06-1.06M5.45 15.55l-1.06 1.06M16.61 4.39l-1.06 1.06M14 10.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const MOON_SVG = `<svg width="17" height="17" viewBox="0 0 21 21" fill="none"><path d="M18.5 11.5A8 8 0 119.5 2.5a6 6 0 009 9z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// 恢复夜间模式
if (localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark');
}
updateThemeIcon();

let cachedQuestions = [];

// 应用语言（使用已保存的偏好）
applyLang();

// ── 头像系统常量（必须在恢复登录之前初始化）────────────────
const AVATAR_COLORS = ['#5865F2','#3BA55C','#FAA61A','#ED4245','#EB459E','#57F287','#0099E1','#9C84EC'];
const AVATAR_EXPRESSIONS = ['Smile','Laugh','BigLaugh','Angi','Sad','Em'];
const AVATAR_SVGS = {
  Smile: `<svg width="14" height="15" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.14151 0.129715C11.1504 0.12973 13.5894 2.56914 13.5898 5.57796C13.5897 7.71367 12.3603 9.56145 10.5712 10.4549L12.748 12.4168C13.1069 12.7404 13.1359 13.2942 12.8124 13.6532C12.4888 14.012 11.935 14.0402 11.5761 13.7166L8.5712 11.0086C8.42942 11.0197 8.28613 11.0272 8.14151 11.0272H6.11319L1.45401 13.8172C1.18371 13.979 0.847226 13.9833 0.573151 13.828C0.299407 13.6726 0.12988 13.382 0.129791 13.0672V3.51741C0.130127 1.64673 1.64678 0.129923 3.51749 0.129715H8.14151ZM3.51749 1.87971C2.61327 1.87992 1.88013 2.61323 1.87979 3.51741V11.5223L5.37979 9.42659C5.40947 9.40881 5.43982 9.39263 5.47061 9.37874C5.59267 9.31404 5.73204 9.27721 5.87979 9.27718H8.14151C10.1841 9.27716 11.8397 7.62057 11.8398 5.57796C11.8394 3.53564 10.1839 1.87973 8.14151 1.87971H3.51749ZM5.56827 5.79964C5.78143 5.70787 6.02448 5.81911 6.18155 5.99007C6.23473 6.04794 6.29408 6.10005 6.35831 6.14534C6.53706 6.27133 6.74751 6.33915 6.9628 6.33968C7.17806 6.34014 7.389 6.2734 7.56827 6.14827C7.63251 6.10339 7.69171 6.05142 7.74503 5.99397C7.90302 5.8238 8.14654 5.71362 8.35928 5.80647C8.562 5.89522 8.66186 6.13225 8.5419 6.31819C8.40375 6.53225 8.22653 6.71758 8.01944 6.86214C7.70584 7.08098 7.33738 7.19699 6.96085 7.19612C6.58412 7.19519 6.21597 7.07681 5.90323 6.85628C5.6968 6.7107 5.5199 6.5251 5.38272 6.31038C5.26381 6.12391 5.36519 5.88738 5.56827 5.79964ZM4.78018 3.37386C5.17783 3.37386 5.49991 3.69691 5.49991 4.09456C5.49965 4.49198 5.17767 4.81429 4.78018 4.81429C4.38273 4.81425 4.06072 4.49196 4.06046 4.09456C4.06046 3.69694 4.38257 3.37389 4.78018 3.37386ZM8.78018 3.15608C9.17767 3.15608 9.49966 3.47838 9.49991 3.87581C9.49991 4.27345 9.17783 4.59651 8.78018 4.59651C8.38257 4.59647 8.06046 4.27343 8.06046 3.87581C8.0607 3.4784 8.38272 3.15612 8.78018 3.15608Z" fill="white"/></svg>`,
  Laugh: `<svg width="14" height="15" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.14151 0.129715C11.1504 0.12973 13.5894 2.56914 13.5898 5.57796C13.5897 7.71367 12.3603 9.56145 10.5712 10.4549L12.748 12.4168C13.1069 12.7404 13.1359 13.2942 12.8124 13.6532C12.4888 14.012 11.935 14.0402 11.5761 13.7166L8.5712 11.0086C8.42942 11.0197 8.28613 11.0272 8.14151 11.0272H6.11319L1.45401 13.8172C1.18371 13.979 0.847226 13.9833 0.573151 13.828C0.299407 13.6726 0.12988 13.382 0.129791 13.0672V3.51741C0.130127 1.64673 1.64678 0.129923 3.51749 0.129715H8.14151ZM3.51749 1.87971C2.61327 1.87992 1.88013 2.61323 1.87979 3.51741V11.5223L5.37979 9.42659C5.40947 9.40881 5.43982 9.39263 5.47061 9.37874C5.59267 9.31404 5.73204 9.27721 5.87979 9.27718H8.14151C10.1841 9.27716 11.8397 7.62057 11.8398 5.57796C11.8394 3.53564 10.1839 1.87973 8.14151 1.87971H3.51749ZM7.78409 5.36604C7.98655 5.36609 8.15558 5.53293 8.10635 5.72932C8.04563 5.97141 7.92432 6.19477 7.75284 6.37483C7.49808 6.64227 7.15215 6.7928 6.7919 6.7928C6.43185 6.79272 6.08661 6.64208 5.83194 6.37483C5.66048 6.1948 5.53915 5.97137 5.47842 5.72932C5.42919 5.5329 5.59819 5.36604 5.80069 5.36604H7.78409ZM4.14346 4.34749C4.48096 4.34763 4.75479 4.62128 4.75479 4.95882C4.75458 5.29617 4.48084 5.57001 4.14346 5.57014C3.80597 5.57014 3.53234 5.29626 3.53214 4.95882C3.53214 4.6212 3.80584 4.34749 4.14346 4.34749ZM9.30557 4.34749C9.64307 4.34763 9.9169 4.62128 9.9169 4.95882C9.91669 5.29617 9.64294 5.57 9.30557 5.57014C8.96808 5.57014 8.69445 5.29626 8.69424 4.95882C8.69424 4.6212 8.96795 4.34749 9.30557 4.34749Z" fill="white"/></svg>`,
  BigLaugh: `<svg width="14" height="15" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.14151 0.129707C11.1504 0.129722 13.5894 2.56913 13.5898 5.57795C13.5897 7.71367 12.3603 9.56144 10.5712 10.4549L12.748 12.4168C13.1069 12.7404 13.1359 13.2942 12.8124 13.6531C12.4888 14.012 11.935 14.0402 11.5761 13.7166L8.5712 11.0086C8.42942 11.0197 8.28613 11.0272 8.14151 11.0272H6.11319L1.45401 13.8172C1.18371 13.979 0.847226 13.9833 0.573151 13.8279C0.299407 13.6725 0.12988 13.382 0.129791 13.0672V3.5174C0.130127 1.64672 1.64678 0.129916 3.51749 0.129707H8.14151ZM3.51749 1.87971C2.61327 1.87992 1.88013 2.61322 1.87979 3.5174V11.5223L5.37979 9.42658C5.40947 9.40881 5.43982 9.39262 5.47061 9.37873C5.59267 9.31403 5.73204 9.27721 5.87979 9.27717H8.14151C10.1841 9.27715 11.8397 7.62056 11.8398 5.57795C11.8394 3.53563 10.1839 1.87972 8.14151 1.87971H3.51749Z" fill="white"/><circle cx="4.2603" cy="5.0798" r="0.611312" fill="white"/><path d="M7.29625 6.07893C7.4845 6.10726 7.62081 6.2823 7.55538 6.46108C7.53126 6.52697 7.50234 6.5909 7.46879 6.65231C7.38117 6.81268 7.26369 6.95269 7.12306 7.06436C6.98243 7.17603 6.82141 7.25716 6.64919 7.30313C6.47697 7.3491 6.29692 7.359 6.11932 7.33227C5.94172 7.30554 5.77005 7.24271 5.61411 7.14735C5.45817 7.05199 5.32101 6.92599 5.21047 6.77652C5.09994 6.62705 5.01818 6.45705 4.96987 6.27623C4.95326 6.21403 4.94071 6.15098 4.93226 6.0875C4.9059 5.88931 5.09293 5.74733 5.29064 5.77709L6.28133 5.92619L7.29625 6.07893Z" fill="white"/><circle cx="9.01485" cy="5.07981" r="0.611312" fill="white"/></svg>`,
  Angi: `<svg width="14" height="15" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.14151 0.129707C11.1504 0.129722 13.5894 2.56913 13.5898 5.57795C13.5897 7.71367 12.3603 9.56144 10.5712 10.4549L12.748 12.4168C13.1069 12.7404 13.1359 13.2942 12.8124 13.6531C12.4888 14.012 11.935 14.0402 11.5761 13.7166L8.5712 11.0086C8.42942 11.0197 8.28613 11.0272 8.14151 11.0272H6.11319L1.45401 13.8172C1.18371 13.979 0.847226 13.9833 0.573151 13.8279C0.299407 13.6725 0.12988 13.382 0.129791 13.0672V3.5174C0.130127 1.64672 1.64678 0.129916 3.51749 0.129707H8.14151ZM3.51749 1.87971C2.61327 1.87992 1.88013 2.61322 1.87979 3.5174V11.5223L5.37979 9.42658C5.40947 9.40881 5.43982 9.39262 5.47061 9.37873C5.59267 9.31403 5.73204 9.27721 5.87979 9.27717H8.14151C10.1841 9.27715 11.8397 7.62056 11.8398 5.57795C11.8394 3.53563 10.1839 1.87972 8.14151 1.87971H3.51749Z" fill="white"/><ellipse cx="5.2604" cy="4.88763" rx="0.543389" ry="0.475465" fill="white"/><circle cx="8.92822" cy="4.8197" r="0.543389" fill="white"/><line x1="5.74956" y1="3.46124" x2="6.4521" y2="4.16378" stroke="white" stroke-width="0.543389" stroke-linecap="round"/><line x1="0.271694" y1="-0.271694" x2="1.26524" y2="-0.271694" transform="matrix(-0.707107 0.707107 0.707107 0.707107 8.82321 3.46124)" stroke="white" stroke-width="0.543389" stroke-linecap="round"/><path d="M6.17035 6.78949C5.96785 6.78949 5.79918 6.6229 5.84841 6.42647C5.90911 6.18431 6.03004 5.96099 6.20157 5.78087C6.45634 5.51337 6.80187 5.36309 7.16216 5.36309C7.52245 5.36309 7.86798 5.51337 8.12274 5.78087C8.29428 5.96098 8.4152 6.18431 8.4759 6.42647C8.52514 6.6229 8.35647 6.78949 8.15397 6.78949L7.16216 6.78949H6.17035Z" fill="white"/></svg>`,
  Sad: `<svg width="14" height="15" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.14151 0.129711C11.1504 0.129726 13.5894 2.56914 13.5898 5.57795C13.5897 7.71367 12.3603 9.56144 10.5712 10.4549L12.748 12.4168C13.1069 12.7404 13.1359 13.2942 12.8124 13.6531C12.4888 14.012 11.935 14.0402 11.5761 13.7166L8.5712 11.0086C8.42942 11.0197 8.28613 11.0272 8.14151 11.0272H6.11319L1.45401 13.8172C1.18371 13.979 0.847226 13.9833 0.573151 13.828C0.299407 13.6725 0.12988 13.382 0.129791 13.0672V3.51741C0.130127 1.64672 1.64678 0.129919 3.51749 0.129711H8.14151ZM3.51749 1.87971C2.61327 1.87992 1.88013 2.61322 1.87979 3.51741V11.5223L5.37979 9.42659C5.40947 9.40881 5.43982 9.39262 5.47061 9.37873C5.59267 9.31404 5.73204 9.27721 5.87979 9.27717H8.14151C10.1841 9.27716 11.8397 7.62057 11.8398 5.57795C11.8394 3.53564 10.1839 1.87973 8.14151 1.87971H3.51749Z" fill="white"/><line x1="0.407542" y1="-0.407542" x2="1.70574" y2="-0.407542" transform="matrix(0.707107 -0.707107 -0.707107 -0.707107 4.42636 5.22)" stroke="white" stroke-width="0.815083" stroke-linecap="round"/><line x1="9.69144" y1="5.22" x2="8.77347" y2="4.30203" stroke="white" stroke-width="0.815083" stroke-linecap="round"/><path d="M6.42325 6.91809C6.22075 6.91809 6.05208 6.7515 6.10131 6.55508C6.16201 6.31291 6.28294 6.08959 6.45447 5.90948C6.70924 5.64197 7.05477 5.49169 7.41506 5.49169C7.77535 5.49169 8.12088 5.64197 8.37564 5.90947C8.54718 6.08959 8.6681 6.31291 8.7288 6.55508C8.77804 6.7515 8.60937 6.91809 8.40686 6.91809L7.41506 6.91809H6.42325Z" fill="white"/></svg>`,
  Em: `<svg width="14" height="15" viewBox="0 0 14 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8.14151 0.129711C11.1504 0.129726 13.5894 2.56914 13.5898 5.57795C13.5897 7.71367 12.3603 9.56144 10.5712 10.4549L12.748 12.4168C13.1069 12.7404 13.1359 13.2942 12.8124 13.6531C12.4888 14.012 11.935 14.0402 11.5761 13.7166L8.5712 11.0086C8.42942 11.0197 8.28613 11.0272 8.14151 11.0272H6.11319L1.45401 13.8172C1.18371 13.979 0.847226 13.9833 0.573151 13.828C0.299407 13.6725 0.12988 13.382 0.129791 13.0672V3.51741C0.130127 1.64672 1.64678 0.129919 3.51749 0.129711H8.14151ZM3.51749 1.87971C2.61327 1.87992 1.88013 2.61322 1.87979 3.51741V11.5223L5.37979 9.42659C5.40947 9.40881 5.43982 9.39262 5.47061 9.37873C5.59267 9.31404 5.73204 9.27721 5.87979 9.27717H8.14151C10.1841 9.27716 11.8397 7.62057 11.8398 5.57795C11.8394 3.53564 10.1839 1.87973 8.14151 1.87971H3.51749Z" fill="white"/><line x1="4.08698" y1="5.07693" x2="5.17376" y2="5.07693" stroke="white" stroke-width="0.815083" stroke-linecap="round"/><line x1="8.02641" y1="5.07694" x2="9.11318" y2="5.07694" stroke="white" stroke-width="0.815083" stroke-linecap="round"/><path d="M5.67615 7.18257C5.47365 7.18257 5.30497 7.01598 5.35421 6.81956C5.41491 6.57739 5.53584 6.35407 5.70737 6.17396C5.96213 5.90645 6.30767 5.75617 6.66796 5.75617C7.02825 5.75617 7.37378 5.90645 7.62854 6.17396C7.80008 6.35407 7.921 6.57739 7.9817 6.81956C8.03094 7.01598 7.86227 7.18257 7.65976 7.18257L6.66796 7.18257H5.67615Z" fill="white"/></svg>`
};
const _GROUP_PATH = `<path d="M14.0224 17.3498V15.9776C14.0224 15.2497 14.3116 14.5517 14.8262 14.037C15.3409 13.5223 16.039 13.2332 16.7668 13.2332H22.2556C22.9835 13.2332 23.6815 13.5223 24.1962 14.037C24.7109 14.5517 25 15.2497 25 15.9776V17.3498M9.90585 17.3498V15.9776C9.9063 15.3695 10.1087 14.7788 10.4812 14.2982C10.8538 13.8176 11.3754 13.4744 11.9641 13.3224M14.7085 5.08919C14.1182 5.24034 13.595 5.58366 13.2213 6.06504C12.8477 6.54641 12.6449 7.13845 12.6449 7.74782C12.6449 8.35719 12.8477 8.94923 13.2213 9.43061C13.595 9.91198 14.1182 10.2553 14.7085 10.4065M16.7668 7.74439C16.7668 9.26008 17.9955 10.4888 19.5112 10.4888C21.0269 10.4888 22.2556 9.26008 22.2556 7.74439C22.2556 6.22871 21.0269 5 19.5112 5C17.9955 5 16.7668 6.22871 16.7668 7.74439Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
function groupSVG(w, h) { return `<svg width="${w}" height="${h}" viewBox="0 0 30 22" fill="none">${_GROUP_PATH}</svg>`; }
const GROUP_SVG = groupSVG(24, 18);
const userAvatarCache = {};  // { username: { expression, color } }

// 恢复登录状态
const savedUser = localStorage.getItem('currentUser');
if (savedUser) {
  currentUser = JSON.parse(savedUser);
  if (!currentUser.avatar_expression) currentUser.avatar_expression = 'Smile';
  if (!currentUser.avatar_color) currentUser.avatar_color = defaultAvatarColor(currentUser.username);
  userAvatarCache[currentUser.username] = { expression: currentUser.avatar_expression, color: currentUser.avatar_color };
  updateSidebarAvatar();
}

// 不支持 getDisplayMedia 的设备（如 iOS）隐藏直播/共享音频按钮
if (!navigator.mediaDevices?.getDisplayMedia) {
  document.getElementById('stream-audio-btn').style.display = 'none';
  document.getElementById('live-btn-row').style.display = 'none';
}

// 启动时获取房间列表
let _socketConnectedBefore = false;
socket.on('connect', function() {
  const isReconnect = _socketConnectedBefore;
  _socketConnectedBefore = true;
  if (currentUser) {
    socket.emit('get_rooms', { username: currentUser.username });
    socket.emit('get_dms', { username: currentUser.username });
    socket.emit('user_online', { username: currentUser.username });
    if (currentRoom) {
      const wasInVoice = inVoice;
      if (isReconnect && wasInVoice) {
        Object.values(peerConnections).forEach(pc => pc.close());
        peerConnections = {};
        Object.values(audioElements).forEach(audio => {
          try { audio.pause(); audio.srcObject = null; if (audio.parentNode) audio.parentNode.removeChild(audio); } catch(e) {}
        });
        audioElements = {};
        audioGains = {};
        if (isStreamingAudio) stopStreamAudio(true);
        if (isStreaming) stopStream(true);
        Object.values(streamAudioElements).forEach(a => { try { a.pause(); a.srcObject = null; a.remove(); } catch(e) {} });
        for (const u in streamAudioElements) delete streamAudioElements[u];
        Object.keys(streamVideos).forEach(u => removeStreamCard(u));
        document.querySelectorAll('.stream-vol-row').forEach(el => el.remove());
        document.querySelectorAll('.stream-indicator').forEach(el => el.remove());
        document.querySelectorAll('.stream-floater').forEach(el => el.remove());
      }
      if (currentIsDm) {
        socket.emit('join_dm', { username: currentUser.username, dm_room: currentRoom });
      } else {
        _submitJoin(currentRoom, savedRoomPasswords[currentRoom] || '', isReconnect);
        if (isReconnect && wasInVoice) {
          socket.emit('voice_join', { username: currentUser.username, screenname: currentUser.screenname, room: currentRoom });
        }
      }
    }
  }
});

socket.on('rooms_list', function(data) {
  data.rooms.forEach(r => {
    addRoomToList(r.name, r.has_password, r.code);
    if (currentUser) socket.emit('room_subscribe', { room: r.name });
  });
  if (!currentUser) return;
  const last = localStorage.getItem('lastRoom');
  _mobileAutoJoin = true;
  if (last && !last.startsWith('dm:') && document.getElementById('room-' + last)) {
    joinRoom(last);
  } else if (!currentRoom || currentRoom === '大厅') {
    joinRoom('大厅');
  }
  _mobileAutoJoin = false;
});

function renderMembers(members) {
  const list = document.getElementById('member-list');
  list.innerHTML = '';
  memberAdmins.clear();
  memberOwner = '';
  members.forEach(m => {
    if (m.is_admin) memberAdmins.add(m.username);
    if (m.is_owner) memberOwner = m.username;
    if (m.avatar_expression || m.avatar_color) {
      userAvatarCache[m.username] = { expression: m.avatar_expression || 'Smile', color: m.avatar_color || defaultAvatarColor(m.username) };
    }
    const div = document.createElement('div');
    div.className = 'member-item' + (m.is_online ? '' : ' offline');
    div.id = 'member-' + m.username;
    const av = getAvatarData(m.username);
    const badge = m.is_owner ? '👑' : (m.is_admin ? '🛡' : '');
    div.innerHTML = avatarHTML(av.expression, av.color, 26) +
      `<span class="member-name">${m.screenname}</span>` +
      (badge ? `<span class="member-badge">${badge}</span>` : '');
    div.onclick = () => openMemberCard(m.username);
    list.appendChild(div);
  });
  updateMembersCount();
}

socket.on('members_list', function(data) {
  if (data.room) memberCache[data.room] = data.members;
  if (data.room === currentRoom || !data.room) renderMembers(data.members);
});

socket.on('new_room_created', function(data) {
  addRoomToList(data.room, data.has_password);
});

socket.on('voice_members_view', function(data) {
  (data.banned || []).forEach(u => voiceBanned.add(u));
  data.members.forEach(m => addVoiceMember(m.username, m.screenname, m.avatar_expression, m.avatar_color));
});

socket.on('online_status_changed', function(data) {
  // patch all cached room member lists
  Object.values(memberCache).forEach(members => {
    const m = members.find(m => m.username === data.username);
    if (m) m.is_online = data.online;
  });
  // patch live DOM if visible
  const el = document.getElementById('member-' + data.username);
  if (el) el.classList.toggle('offline', !data.online);
});

// ── 设置 ─────────────────────────────────────────────────
let savedMicDeviceId = localStorage.getItem('micDeviceId') || '';
let savedSpeakerDeviceId = localStorage.getItem('speakerDeviceId') || '';
let micTestStream = null;
let micTestContext = null;
let micTestAnimFrame = null;

async function openSettings() {
  openModal('settings-modal');
  await populateAudioDevices();
}

function closeSettings() {
  stopMicTest();
  closeModal('settings-modal');
}

async function populateAudioDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    const speakers = devices.filter(d => d.kind === 'audiooutput');

    const micSel = document.getElementById('mic-select');
    micSel.innerHTML = '';
    if (!mics.length) {
      micSel.innerHTML = '<option>未检测到麦克风</option>';
    } else {
      mics.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || ('麦克风 ' + (i + 1));
        if (d.deviceId === savedMicDeviceId) opt.selected = true;
        micSel.appendChild(opt);
      });
    }

    const spkRow = document.getElementById('speaker-select')?.closest('div');
    const spkSel = document.getElementById('speaker-select');
    const supportsSink = typeof HTMLAudioElement.prototype.setSinkId === 'function';
    if (!supportsSink) {
      // 设备不支持扬声器切换（iOS等），直接隐藏整行
      if (spkRow) spkRow.style.display = 'none';
    } else {
      if (spkRow) spkRow.style.display = '';
      spkSel.innerHTML = '';
      if (!speakers.length) {
        spkSel.innerHTML = '<option>未检测到扬声器</option>';
        spkSel.disabled = true;
      } else {
        spkSel.disabled = false;
        speakers.forEach((d, i) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.textContent = d.label || ('扬声器 ' + (i + 1));
          if (d.deviceId === savedSpeakerDeviceId) opt.selected = true;
          spkSel.appendChild(opt);
        });
      }
    }
  } catch(e) {
    console.warn('无法枚举音频设备:', e);
  }
}

function saveMicDevice(deviceId) {
  savedMicDeviceId = deviceId;
  localStorage.setItem('micDeviceId', deviceId);
}

function saveSpeakerDevice(deviceId) {
  savedSpeakerDeviceId = deviceId;
  localStorage.setItem('speakerDeviceId', deviceId);
  Object.values(audioElements).forEach(audio => {
    if (typeof audio.setSinkId === 'function') {
      audio.setSinkId(deviceId).catch(e => console.warn('setSinkId:', e));
    }
  });
}

async function startMicTest() {
  stopMicTest();
  try {
    if (savedMicDeviceId) {
      try {
        micTestStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: savedMicDeviceId } } });
      } catch(e) {
        micTestStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } else {
      micTestStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    // 权限拿到后重新枚举（显示完整设备名）
    await populateAudioDevices();
    micTestContext = new AudioContext();
    const source = micTestContext.createMediaStreamSource(micTestStream);
    const analyser = micTestContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    document.getElementById('mic-test-bar').style.display = '';
    document.getElementById('stop-mic-test-btn').style.display = '';
    document.getElementById('start-mic-test-btn').style.display = 'none';

    const data = new Uint8Array(analyser.frequencyBinCount);
    function animate() {
      micTestAnimFrame = requestAnimationFrame(animate);
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      document.getElementById('mic-test-level').style.width = Math.min(avg * 3, 100) + '%';
    }
    animate();
  } catch(e) {
    alert('无法访问麦克风：' + e.message);
  }
}

function stopMicTest() {
  if (micTestAnimFrame) { cancelAnimationFrame(micTestAnimFrame); micTestAnimFrame = null; }
  if (micTestStream) { micTestStream.getTracks().forEach(t => t.stop()); micTestStream = null; }
  if (micTestContext) { micTestContext.close(); micTestContext = null; }
  const bar = document.getElementById('mic-test-bar');
  const stopBtn = document.getElementById('stop-mic-test-btn');
  const startBtn = document.getElementById('start-mic-test-btn');
  if (bar) bar.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'none';
  if (startBtn) startBtn.style.display = '';
  const lvl = document.getElementById('mic-test-level');
  if (lvl) lvl.style.width = '0%';
}

// ── 主题 ────────────────────────────────────────────────
function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.innerHTML = document.body.classList.contains('dark') ? SUN_SVG : MOON_SVG;
}

function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  updateThemeIcon();
}

// ── 弹窗工具 ─────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('.modal').forEach(function(modal) {
  modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(modal.id); });
});

// ── 登录/注册 ─────────────────────────────────────────────
function openAuth() { openModal('auth-modal'); loadQuestions(); }

function switchTab(tab) {
  document.getElementById('login-form').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  if (tab === 'register') loadQuestions();
}

function loadQuestions() {
  socket.emit('get_questions_list');
}

socket.on('questions_list', function(data) {
  cachedQuestions = data.questions;
  populateQuestionSelect();
});

function populateQuestionSelect() {
  const sel = document.getElementById('reg-question');
  if (!sel) return;
  const selected = sel.value;
  sel.innerHTML = '<option value="">' + t('ph-reg-question') + '</option>';
  cachedQuestions.forEach((q, i) => {
    const opt = document.createElement('option');
    opt.value = q; // value stays as the Chinese string (stored in DB)
    opt.textContent = t('sq' + i) !== ('sq' + i) ? t('sq' + i) : q;
    if (q === selected) opt.selected = true;
    sel.appendChild(opt);
  });
}

function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('login-error').textContent = '';
  socket.emit('login', { username, password });
}

socket.on('login_result', function(data) {
  if (!data.success) {
    document.getElementById('login-error').textContent = data.msg;
    return;
  }
  currentUser = { username: data.username, screenname: data.screenname, bio: data.bio || '', is_admin: data.is_admin,
    avatar_expression: data.avatar_expression || 'Smile', avatar_color: data.avatar_color || defaultAvatarColor(data.username) };
  localStorage.setItem('currentUser', JSON.stringify(currentUser));
  userAvatarCache[data.username] = { expression: currentUser.avatar_expression, color: currentUser.avatar_color };
  closeModal('auth-modal');
  updateSidebarAvatar();
  socket.emit('user_online', { username: currentUser.username });
  socket.emit('get_rooms', { username: currentUser.username });
  socket.emit('get_dms', { username: currentUser.username });
});

function doRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const screenname = document.getElementById('reg-screenname').value.trim();
  const password = document.getElementById('reg-password').value;
  const bio = document.getElementById('reg-bio').value;
  const security_question = document.getElementById('reg-question').value;
  const security_answer = document.getElementById('reg-answer').value.trim();
  document.getElementById('register-error').textContent = '';

  if (!username) { document.getElementById('register-error').textContent = '请输入用户名'; return; }
  if (!screenname) { document.getElementById('register-error').textContent = '请输入显示名'; return; }
  if (!password) { document.getElementById('register-error').textContent = '请输入密码'; return; }
  if (!security_question) { document.getElementById('register-error').textContent = '请选择安全问题'; return; }
  if (!security_answer) { document.getElementById('register-error').textContent = '请输入安全问题答案'; return; }

  socket.emit('register', { username, screenname, password, bio, security_question, security_answer });
}
socket.on('register_result', function(data) {
  if (!data.success) {
    document.getElementById('register-error').textContent = data.msg;
    return;
  }
  document.getElementById('register-error').textContent = '';
  switchTab('login');
  document.getElementById('login-error').textContent = '';
  alert('注册成功！请登录');
});

function logout() {
  if (currentUser) socket.emit('user_offline', { username: currentUser.username });
  currentUser = null;
  localStorage.removeItem('currentUser');
  currentRoom = null;
  currentIsDm = false;
  isAdmin = false; isOwner = false; isMod = false; memberOwner = '';
  for (const k in openDms) delete openDms[k];
  // 恢复语音和成员区域
  document.getElementById('voice-section').style.display = '';
  document.getElementById('members-divider').style.display = '';
  document.getElementById('sidebar-members-title').style.display = '';
  updateSidebarAvatar();
  document.getElementById('room-list').innerHTML = '';
  document.getElementById('no-room').textContent = t('no-room');
  document.getElementById('no-room').style.display = 'flex';
  document.getElementById('chat-main').style.display = 'none';
  document.getElementById('messages').innerHTML = '';
  document.getElementById('member-list').innerHTML = '';
  document.getElementById('voice-members-list').innerHTML = '';
  voiceBanned.clear();
}

// ── 忘记密码 ──────────────────────────────────────────────
function openForgotPassword() {
  closeModal('auth-modal');
  document.getElementById('forgot-step1').style.display = '';
  document.getElementById('forgot-step2').style.display = 'none';
  document.getElementById('forgot-error').textContent = '';
  document.getElementById('forgot-success').textContent = '';
  openModal('forgot-modal');
}

function closeForgot() {
  closeModal('forgot-modal');
  openModal('auth-modal');
}

function getForgotQuestion() {
  const username = document.getElementById('forgot-username').value.trim();
  socket.emit('get_security_question', { username });
}

socket.on('security_question_result', function(data) {
  if (!data.success) {
    document.getElementById('forgot-error').textContent = data.msg;
    return;
  }
  document.getElementById('forgot-step1').style.display = 'none';
  document.getElementById('forgot-step2').style.display = '';
  document.getElementById('forgot-question').textContent = data.question;
});

function doResetPassword() {
  const username = document.getElementById('forgot-username').value.trim();
  const answer = document.getElementById('forgot-answer').value;
  const new_password = document.getElementById('forgot-newpw').value;
  socket.emit('reset_password', { username, answer, new_password });
}

socket.on('reset_password_result', function(data) {
  if (!data.success) {
    document.getElementById('forgot-error').textContent = data.msg;
    return;
  }
  document.getElementById('forgot-success').textContent = '密码重置成功！';
  setTimeout(() => { closeForgot(); }, 1500);
});

// ── 个人资料 ──────────────────────────────────────────────
function openProfile() {
  if (!currentUser) { openAuth(); return; }
  document.getElementById('profile-screenname').value = currentUser.screenname;
  document.getElementById('profile-error').textContent = '';
  document.getElementById('profile-success').textContent = '';
  document.getElementById('admin-area').style.display = currentUser.is_admin ? '' : 'none';
  const av = getAvatarData(currentUser.username);
  initAvatarPicker(av.expression, av.color);
  socket.emit('get_profile', { username: currentUser.username });
  openModal('profile-modal');
}

function saveProfile() {
  const screenname = document.getElementById('profile-screenname').value.trim();
  const bio = document.getElementById('profile-bio').value;
  if (!screenname) { document.getElementById('profile-error').textContent = '显示名不能为空'; return; }
  socket.emit('update_profile', { username: currentUser.username, screenname, bio });
  socket.emit('save_avatar', { username: currentUser.username, expression: selectedAvatarExpression, color: selectedAvatarColor });
}

socket.on('update_profile_result', function(data) {
  if (!data.success) {
    document.getElementById('profile-error').textContent = data.msg;
    return;
  }
  currentUser.screenname = data.screenname;
  currentUser.bio = data.bio ?? '';
  localStorage.setItem('currentUser', JSON.stringify(currentUser));
  updateSidebarAvatar();
  renderMobileMe();
  document.getElementById('profile-success').textContent = '保存成功！';
});

// ── 权限层级 ──────────────────────────────────────────────
function getMyLevel() {
  if (currentUser?.username === 'admin') return 3;
  if (isOwner) return 2;
  if (isMod) return 1;
  return 0;
}
function getTargetLevel(username) {
  if (username === 'admin') return 3;
  if (username === memberOwner) return 2;
  if (memberAdmins.has(username)) return 1;
  return 0;
}

// ── 成员卡片 ──────────────────────────────────────────────
function openMemberCard(username) {
  cardTargetUsername = username;
  const isSelf = currentUser && username === currentUser.username;
  const myLevel = getMyLevel();
  const tgtLevel = getTargetLevel(username);
  const canDm = !isSelf && !!currentUser;
  const canSetAdmin = !isSelf && !currentIsDm && myLevel >= 2 && tgtLevel === 0;
  const canRemoveAdmin = !isSelf && !currentIsDm && myLevel >= 2 && tgtLevel === 1;
  const canKick = !isSelf && !currentIsDm && myLevel >= 1 && myLevel > tgtLevel;
  const canInvite = !isSelf && !currentIsDm && isAdmin;
  document.getElementById('card-dm-btn').style.display = canDm ? '' : 'none';
  document.getElementById('card-set-admin-btn').style.display = canSetAdmin ? '' : 'none';
  document.getElementById('card-remove-admin-btn').style.display = canRemoveAdmin ? '' : 'none';
  document.getElementById('card-kick-btn').style.display = canKick ? '' : 'none';
  document.getElementById('card-invite-btn').style.display = canInvite ? '' : 'none';
  document.getElementById('card-actions').style.display = (canDm || canSetAdmin || canRemoveAdmin || canKick || canInvite) ? 'flex' : 'none';
  const showVolume = inVoice && username !== currentUser?.username && !!audioElements[username];
  document.getElementById('card-voice-volume').style.display = showVolume ? '' : 'none';
  if (showVolume) {
    const vol = Math.round((audioElements[username].volume ?? 1) * 100);
    document.getElementById('card-volume-slider').value = vol;
    document.getElementById('card-volume-val').textContent = vol + '%';
  }
  const showStreamVol = inVoice && username !== currentUser?.username && !!streamAudioElements[username];
  document.getElementById('card-stream-volume').style.display = showStreamVol ? '' : 'none';
  if (showStreamVol) {
    const vol = Math.round((streamAudioElements[username].volume ?? 0.8) * 100);
    document.getElementById('card-stream-slider').value = vol;
    document.getElementById('card-stream-val').textContent = vol + '%';
  }
  socket.emit('get_profile', { username });
  openModal('member-card-modal');
}

socket.on('profile_result', function(data) {
  if (document.getElementById('member-card-modal').classList.contains('show')) {
    document.getElementById('card-screenname').textContent = data.screenname || '';
    document.getElementById('card-username').textContent = '@' + cardTargetUsername;
    document.getElementById('card-bio').textContent = data.bio || '这个人很神秘，什么都没写';
  } else {
    if (data.success) {
      const bio = data.bio ?? '';
      document.getElementById('profile-bio').value = bio;
      if (currentUser) {
        currentUser.bio = bio;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        const bioEl = document.getElementById('mobile-me-bio');
        if (bioEl) bioEl.textContent = bio;
      }
    }
  }
});

// ── 修改密码 ──────────────────────────────────────────────
function openChangePassword() {
  closeModal('profile-modal');
  document.getElementById('changepw-error').textContent = '';
  document.getElementById('changepw-success').textContent = '';
  openModal('changepw-modal');
}

function doChangePassword() {
  const old_password = document.getElementById('old-password').value;
  const new_password = document.getElementById('new-password').value;
  const confirm = document.getElementById('confirm-password').value;
  if (new_password !== confirm) { document.getElementById('changepw-error').textContent = '两次密码不一致'; return; }
  socket.emit('change_password', { username: currentUser.username, old_password, new_password });
}

socket.on('change_password_result', function(data) {
  if (!data.success) { document.getElementById('changepw-error').textContent = data.msg; return; }
  document.getElementById('changepw-success').textContent = '修改成功！';
  setTimeout(() => closeModal('changepw-modal'), 1500);
});

// ── 超级管理员重置密码 ────────────────────────────────────
function doAdminReset() {
  const target_username = document.getElementById('admin-reset-target').value.trim();
  socket.emit('admin_reset_password', { requester: currentUser.username, target_username });
}

socket.on('admin_reset_result', function(data) {
  if (!data.success) { document.getElementById('admin-reset-error').textContent = data.msg; return; }
  document.getElementById('admin-reset-success').textContent = data.msg;
});

// ── 房间 ──────────────────────────────────────────────────
function openCreateRoom() {
  if (!currentUser) { openAuth(); return; }
  document.getElementById('create-room-error').textContent = '';
  document.getElementById('new-room-name').value = '';
  document.getElementById('new-room-password').value = '';
  openModal('create-room-modal');
}

function doCreateRoom() {
  const room = document.getElementById('new-room-name').value.trim();
  const password = document.getElementById('new-room-password').value;
  if (!room) return;
  socket.emit('create_room', { username: currentUser.username, room, password });
}

socket.on('create_room_result', function(data) {
  if (!data.success) { document.getElementById('create-room-error').textContent = data.msg; return; }
  closeModal('create-room-modal');
  addRoomToList(data.room, data.has_password, data.code);
  joinRoom(data.room);
  if (data.code) alert(`房间创建成功！\n房间号：${data.code}\n（可在房间卡片中随时查看）`);
});

const roomCodes    = {};
const roomMessages = {};   // { roomName: [msgData, ...] }  max 100
const roomLastTs   = {};   // { roomName: ISO timestamp }
const memberCache  = {};   // { roomName: [memberObj, ...] }
function addRoomToList(room, hasPassword, code) {
  roomHasPassword[room] = !!hasPassword;
  if (code) roomCodes[room] = code;
  const list = document.getElementById('room-list');
  if (document.getElementById('room-' + room)) return;
  const div = document.createElement('div');
  div.className = 'room-item';
  div.id = 'room-' + room;
  div.innerHTML = `<span class="room-icon">${GROUP_SVG}</span><span class="room-name-label">${room}</span>${hasPassword ? '<span class="room-lock">🔒</span>' : ''}`;
  div.onclick = () => joinRoom(room);
  list.appendChild(div);
}

function filterRooms(query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll('#room-list .room-item').forEach(el => {
    const name = el.id.replace('room-', '').toLowerCase();
    el.style.display = name.includes(q) ? '' : 'none';
  });
}

function leaveRoomFromCard() {
  closeModal('room-card-modal');
  leaveRoom(currentRoom);
}

function leaveRoom(room) {
  if (!confirm(`退出 #${room}？\n退出后需要重新搜索房间号才能加入。`)) return;
  socket.emit('leave_room', { username: currentUser.username, room });
}

socket.on('leave_room_result', function(data) {
  if (!data.success) { alert(data.msg); return; }
  const el = document.getElementById('room-' + data.room);
  if (el) el.remove();
  delete roomHasPassword[data.room];
  delete roomCodes[data.room];
  if (currentRoom === data.room) joinRoom('大厅');
});

function joinRoom(room) {
  if (!currentUser) { openAuth(); return; }
  // 从 DM 切回普通房间时，恢复语音和成员区域
  currentIsDm = false;
  document.getElementById('voice-section').style.display = '';
  document.getElementById('members-divider').style.display = '';
  document.getElementById('sidebar-members-title').style.display = '';
  const titleEl = document.getElementById('chat-title');
  if (titleEl) titleEl.onclick = openRoomCard;
  pendingJoinRoom = room;
  if (roomHasPassword[room]) {
    const saved = savedRoomPasswords[room];
    if (saved) { _submitJoin(room, saved); return; }
    document.getElementById('room-pw-error').textContent = '';
    document.getElementById('room-pw-input').value = '';
    document.getElementById('room-pw-remember').checked = false;
    openModal('room-pw-modal');
    return;
  }
  _submitJoin(room, '');
}

function _submitJoin(room, password, isReconnect = false) {
  currentRoom = room;
  clearUnread(room);
  if (!_mobileAutoJoin) mobileShowChat();
  document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('room-' + room);
  if (el) el.classList.add('active');
  _setChatTitle(room);
  document.getElementById('no-room').style.display = 'none';
  document.getElementById('chat-main').style.display = 'flex';
  document.getElementById('chat-main').style.flexDirection = 'column';
  closeAllSidebars();
  if (room !== '大厅') localStorage.setItem('lastRoom', room);
  if (!isReconnect) _loadingHistory.add(room);

  if (isReconnect) {
    // 断线重连：保留当前消息，只让服务端重注册 socket 房间 + 更新成员列表
    socket.emit('join', { username: currentUser.username, screenname: currentUser.screenname, room, password, skip_history: true });
  } else {
    // 主动切换房间：立即显示缓存，再向服务端请求增量消息
    document.getElementById('messages').innerHTML = '';
    document.getElementById('voice-members-list').innerHTML = '';
    voiceBanned.clear();
    (roomMessages[room] || []).forEach(msg => appendMessage(msg, false));
    if (memberCache[room]) renderMembers(memberCache[room]);
    else document.getElementById('member-list').innerHTML = '';
    const since = roomLastTs[room] || null;
    socket.emit('join', { username: currentUser.username, screenname: currentUser.screenname, room, password, since });
  }
}

function submitRoomPassword() {
  const pw = document.getElementById('room-pw-input').value;
  if (!pw) return;
  if (document.getElementById('room-pw-remember').checked) {
    savedRoomPasswords[pendingJoinRoom] = pw;
    localStorage.setItem('roomPasswords', JSON.stringify(savedRoomPasswords));
  }
  closeModal('room-pw-modal');
  _submitJoin(pendingJoinRoom, pw);
}

socket.on('join_result', function(data) {
  _loadingHistory.delete(data.room || currentRoom);
  if (data.room && data.room !== currentRoom) return; // 已切换到其他房间，丢弃
  if (!data.success) {
    document.getElementById('chat-main').style.display = 'none';
    document.getElementById('no-room').style.display = 'flex';
    document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
    if (currentRoom) {
      const prev = document.getElementById('room-' + currentRoom);
      if (prev) prev.classList.add('active');
    }
    currentRoom = null;
    if (data.wrong_password) {
      delete savedRoomPasswords[pendingJoinRoom];
      localStorage.setItem('roomPasswords', JSON.stringify(savedRoomPasswords));
      document.getElementById('room-pw-error').textContent = data.msg;
      document.getElementById('room-pw-input').value = '';
      openModal('room-pw-modal');
    } else {
      alert(data.msg);
    }
    return;
  }
  isMod = data.is_admin || false;
  isOwner = data.is_owner || false;
  isAdmin = isMod || isOwner || (currentUser?.username === 'admin');
  if (data.code && data.room) roomCodes[data.room] = data.code;
  _setChatTitle(currentRoom);
  if (data.members && data.room) {
    memberCache[data.room] = data.members;
    renderMembers(data.members);
  }
});

// ── 消息 ──────────────────────────────────────────────────
const _loadingHistory = new Set();
let _pendingDmRoom = null;
let _mobileAutoJoin = false;

function isMobile() { return window.innerWidth <= 768; }

function mobileShowList() {
  if (!isMobile()) return;
  document.body.classList.remove('in-chat');
  document.getElementById('members-sidebar').classList.remove('mobile-open');
  const _ca = document.getElementById('chat-area');
  _ca.style.bottom = ''; _ca.style.transition = '';
  document.getElementById('sidebar').classList.remove('mobile-hidden');
  document.getElementById('chat-area').classList.remove('mobile-active');
  document.getElementById('mobile-me-view')?.classList.remove('mobile-active');
  document.getElementById('mobile-logo').style.display = '';
  document.getElementById('mobile-back-btn').style.display = 'none';
  document.getElementById('mobile-room-title').style.display = 'none';
  document.getElementById('mobile-me-title').style.display = 'none';
  document.getElementById('mobile-topbar-spacer').style.display = '';
  document.getElementById('mobile-plus-wrap').style.display = '';
  document.getElementById('mobile-menu-btn').style.display = 'none';
  document.getElementById('mobile-settings-btn').style.display = 'none';
  const _mlb = document.getElementById('mobile-login-btn');
  if (_mlb) _mlb.style.display = currentUser ? 'none' : '';
  document.getElementById('tab-recos-btn')?.classList.add('active');
  document.getElementById('tab-me-btn')?.classList.remove('active');
}

function mobileShowChat(isDm = false) {
  if (!isMobile()) return;
  document.body.classList.add('in-chat');
  document.getElementById('sidebar').classList.add('mobile-hidden');
  document.getElementById('chat-area').classList.add('mobile-active');
  document.getElementById('mobile-me-view')?.classList.remove('mobile-active');
  document.getElementById('mobile-logo').style.display = 'none';
  document.getElementById('mobile-back-btn').style.display = '';
  document.getElementById('mobile-room-title').style.display = '';
  document.getElementById('mobile-me-title').style.display = 'none';
  document.getElementById('mobile-topbar-spacer').style.display = 'none';
  document.getElementById('mobile-plus-wrap').style.display = 'none';
  document.getElementById('mobile-menu-btn').style.display = isDm ? 'none' : '';
  document.getElementById('mobile-settings-btn').style.display = 'none';
  document.getElementById('tab-recos-btn')?.classList.add('active');
  document.getElementById('tab-me-btn')?.classList.remove('active');
}

function mobileMenuAction() {
  toggleMembersBar();
}

function mobileTabMe() {
  if (!isMobile()) return;
  document.body.classList.remove('in-chat');
  document.getElementById('sidebar').classList.add('mobile-hidden');
  document.getElementById('chat-area').classList.remove('mobile-active');
  document.getElementById('mobile-me-view')?.classList.add('mobile-active');
  document.getElementById('mobile-logo').style.display = 'none';
  document.getElementById('mobile-back-btn').style.display = 'none';
  document.getElementById('mobile-room-title').style.display = 'none';
  document.getElementById('mobile-me-title').style.display = '';
  document.getElementById('mobile-topbar-spacer').style.display = 'none';
  document.getElementById('mobile-plus-wrap').style.display = 'none';
  document.getElementById('mobile-menu-btn').style.display = 'none';
  document.getElementById('mobile-settings-btn').style.display = '';
  const _mobileLoginBtn = document.getElementById('mobile-login-btn');
  if (_mobileLoginBtn) _mobileLoginBtn.style.display = 'none';
  document.getElementById('tab-me-btn')?.classList.add('active');
  document.getElementById('tab-recos-btn')?.classList.remove('active');
  renderMobileMe();
}

function renderMobileMe() {
  const avatarWrap = document.getElementById('mobile-me-avatar-wrap');
  const nameEl = document.getElementById('mobile-me-screenname');
  const handleEl = document.getElementById('mobile-me-handle');
  const bioEl = document.getElementById('mobile-me-bio');
  const loggedIn = document.getElementById('mobile-me-logged-in');
  const guest = document.getElementById('mobile-me-guest');
  if (!avatarWrap) return;
  const titleEl = document.getElementById('mobile-me-title');
  if (titleEl) titleEl.textContent = t('mobile-me-title');
  const bioLabel = document.getElementById('mobile-me-bio-label');
  if (bioLabel) bioLabel.textContent = t('mobile-me-bio-label');
  const editBtn = document.getElementById('mobile-me-edit-btn');
  if (editBtn) editBtn.textContent = t('mobile-me-edit-btn');
  if (currentUser) {
    const av = getAvatarData(currentUser.username);
    avatarWrap.innerHTML = avatarHTML(av.expression, av.color, 64);
    nameEl.textContent = currentUser.screenname || currentUser.username;
    handleEl.textContent = '@' + currentUser.username;
    bioEl.textContent = currentUser.bio || '';
    loggedIn.style.display = '';
    guest.style.display = 'none';
    socket.emit('get_profile', { username: currentUser.username });
  } else {
    loggedIn.style.display = 'none';
    guest.style.display = '';
  }
}

// 右滑返回列表手势
// ── iOS 键盘高度补偿 ──────────────────────────────────────
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', _onVVResize);
  window.visualViewport.addEventListener('scroll', _onVVResize);
}
function _onVVResize() {
  if (!isMobile()) return;
  const chatArea = document.getElementById('chat-area');
  if (!chatArea || !chatArea.classList.contains('mobile-active')) return;
  const vv = window.visualViewport;
  const keyboardH = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
  if (keyboardH > 80) {
    chatArea.style.bottom = keyboardH + 'px';
    chatArea.style.transition = 'none';
  } else {
    chatArea.style.bottom = '';
    chatArea.style.transition = '';
  }
}

let _swipeStartX = 0, _swipeStartY = 0;
document.addEventListener('touchstart', function(e) {
  _swipeStartX = e.touches[0].clientX;
  _swipeStartY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', function(e) {
  if (!isMobile()) return;
  if (!document.getElementById('chat-area').classList.contains('mobile-active')) return;
  const dx = e.changedTouches[0].clientX - _swipeStartX;
  const dy = Math.abs(e.changedTouches[0].clientY - _swipeStartY);
  if (dx > 60 && dx > dy) mobileShowList();
}, { passive: true });

const unreadCounts = {};

function addUnread(room) {
  if (!room) return;
  unreadCounts[room] = (unreadCounts[room] || 0) + 1;
  const count = unreadCounts[room];
  const el = room.startsWith('dm:')
    ? document.getElementById('dm-item-' + getDmOtherUser(room))
    : document.getElementById('room-' + room);
  if (!el) return;
  let badge = el.querySelector('.room-badge');
  if (!badge) { badge = document.createElement('span'); badge.className = 'room-badge'; el.appendChild(badge); }
  badge.textContent = count > 99 ? '99+' : count;
}

function clearUnread(room) {
  if (!room) return;
  delete unreadCounts[room];
  const el = room.startsWith('dm:')
    ? document.getElementById('dm-item-' + getDmOtherUser(room))
    : document.getElementById('room-' + room);
  if (el) { const badge = el.querySelector('.room-badge'); if (badge) badge.remove(); }
}

function saveRoomOrder() {
  const list = document.getElementById('room-list');
  if (!list) return;
  const order = Array.from(list.children).map(el => el.id);
  localStorage.setItem('roomOrder', JSON.stringify(order));
}

function restoreRoomOrder() {
  const list = document.getElementById('room-list');
  if (!list) return;
  const saved = JSON.parse(localStorage.getItem('roomOrder') || '[]');
  if (!saved.length) return;
  const items = Array.from(list.children);
  items.sort((a, b) => {
    const ai = saved.indexOf(a.id);
    const bi = saved.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  items.forEach(el => list.appendChild(el));
}

function bumpRoomToTop(room) {
  if (!room) return;
  const list = document.getElementById('room-list');
  if (!list) return;
  const el = room.startsWith('dm:')
    ? document.getElementById('dm-item-' + getDmOtherUser(room))
    : document.getElementById('room-' + room);
  if (el && list.firstChild !== el) {
    list.prepend(el);
    saveRoomOrder();
  }
}

function appendMessage(data, cache = true) {
  const msgRoom = data.room || currentRoom;

  // 写缓存（系统消息不缓存，避免重复显示）
  if (cache && msgRoom && !data.system) {
    if (!roomMessages[msgRoom]) roomMessages[msgRoom] = [];
    roomMessages[msgRoom].push(data);
    if (roomMessages[msgRoom].length > 100) roomMessages[msgRoom].shift();
    if (data.time) roomLastTs[msgRoom] = data.time;
  }

  // 非当前房间的消息只缓存，不渲染
  if (msgRoom !== currentRoom) return;

  const div = document.getElementById('messages');
  const msg = document.createElement('div');

  if (data.system) {
    msg.className = 'msg system';
    const t = document.createElement('span');
    t.className = 'msg-sys-text';
    t.textContent = data.text;
    msg.appendChild(t);
  } else {
    // 时间戳分隔线
    const lastSep = div.dataset.lastSepTime;
    const tsLabel = formatMsgTime(data.time);
    if (tsLabel && tsLabel !== lastSep) {
      const sep = document.createElement('div');
      sep.className = 'msg-separator';
      sep.textContent = tsLabel;
      div.appendChild(sep);
      div.dataset.lastSepTime = tsLabel;
    }

    const isOwn = currentUser && data.username === currentUser.username;
    msg.className = 'msg' + (isOwn ? ' own' : '');
    const av = getAvatarData(data.username);

    const avDiv = document.createElement('div');
    avDiv.className = 'msg-av';
    avDiv.innerHTML = avatarHTML(av.expression, av.color, 32);
    avDiv.style.cursor = 'pointer';
    avDiv.onclick = () => openMemberCard(data.username);
    msg.appendChild(avDiv);

    const body = document.createElement('div');
    body.className = 'msg-body';
    if (!isOwn) {
      const name = document.createElement('span');
      name.className = 'msg-name';
      name.style.color = av.color;
      name.textContent = data.screenname;
      name.onclick = () => openMemberCard(data.username);
      body.appendChild(name);
    }
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    const text = document.createElement('div');
    text.className = 'msg-text';
    text.textContent = data.text;
    bubble.appendChild(text);
    body.appendChild(bubble);
    msg.appendChild(body);
  }

  div.appendChild(msg);
  div.scrollTop = div.scrollHeight;
}

socket.on('message', function(data) {
  appendMessage(data);
  const _msgRoom = data.room || currentRoom;
  if (!data.system && !_loadingHistory.has(_msgRoom)) bumpRoomToTop(_msgRoom);
  if (!data.system && _msgRoom !== currentRoom && !_loadingHistory.has(_msgRoom)) addUnread(_msgRoom);
  if (data.system && data.room === currentRoom) {
    socket.emit('get_members', { room: currentRoom });
  }
});

function formatMsgTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function sendMessage() {
  if (!currentUser) { openAuth(); return; }
  if (!currentRoom) return;
  const text = document.getElementById('msg-input').value.trim();
  if (!text) return;
  socket.emit('message', { username: currentUser.username, screenname: currentUser.screenname, text, room: currentRoom });
  document.getElementById('msg-input').value = '';
}

document.getElementById('msg-input').addEventListener('keypress', e => {
  if (e.key === 'Enter') sendMessage();
});

// ── 管理员功能 ────────────────────────────────────────────
function doCardSetAdmin(remove) {
  if (!cardTargetUsername || !currentRoom) return;
  socket.emit('set_admin', { requester: currentUser.username, target: cardTargetUsername, room: currentRoom, remove: !!remove });
}

socket.on('set_admin_result', function(data) {
  if (!data.success) { alert(data.msg); return; }
  closeModal('member-card-modal');
});

function doCardKick() {
  if (!cardTargetUsername || !currentRoom) return;
  const screenname = document.getElementById('card-screenname').textContent;
  if (!confirm(`确定踢出「${screenname}」？对方将无法重新进入该房间。`)) return;
  socket.emit('kick_member', { requester: currentUser.username, target: cardTargetUsername, room: currentRoom });
}

socket.on('kick_result', function(data) {
  if (!data.success) { alert(data.msg); return; }
  closeModal('member-card-modal');
});

function setCardVoiceVolume(val) {
  document.getElementById('card-volume-val').textContent = val + '%';
  const a = audioElements[cardTargetUsername];
  if (a) a.volume = Math.min(val / 100, 1);
}

function setCardStreamVolume(val) {
  document.getElementById('card-stream-val').textContent = val + '%';
  const audio = streamAudioElements[cardTargetUsername];
  if (audio) audio.volume = parseInt(val) / 100;
}

socket.on('kicked_from_room', function(data) {
  if (data.room !== currentRoom) return;
  currentRoom = null;
  isAdmin = false;
  document.getElementById('no-room').textContent = t('kicked');
  document.getElementById('no-room').style.display = 'flex';
  document.getElementById('chat-main').style.display = 'none';
  document.getElementById('messages').innerHTML = '';
  document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
});

function openRoomCard() {
  if (!currentRoom) return;
  document.getElementById('room-card-title').textContent = '# ' + currentRoom;
  document.getElementById('room-card-code').textContent = roomCodes[currentRoom] || '——';
  const canManage = isOwner || (currentUser?.username === 'admin');
  if (canManage) {
    document.getElementById('room-pw-toggle-btn').textContent = roomHasPassword[currentRoom] ? t('room-pw-toggle-remove') : t('room-pw-toggle-set');
    document.getElementById('room-pw-set-area').style.display = 'none';
    document.getElementById('room-new-pw-input').value = '';
    document.getElementById('room-pw-set-error').textContent = '';
    document.getElementById('room-card-close-btn').style.display = currentRoom === '大厅' ? 'none' : '';
    document.getElementById('room-card-admin-btns').style.display = 'flex';
  } else {
    document.getElementById('room-card-admin-btns').style.display = 'none';
  }
  document.getElementById('room-card-leave-area').style.display = currentRoom === '大厅' ? 'none' : '';
  openModal('room-card-modal');
}

function copyRoomCode() {
  const code = roomCodes[currentRoom];
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => alert('房间号已复制：' + code)).catch(() => alert('房间号：' + code));
}

function toggleRoomPasswordAction() {
  if (roomHasPassword[currentRoom]) {
    if (confirm(`确定取消"${currentRoom}"的密码吗？`)) {
      socket.emit('set_room_password', { requester: currentUser.username, room: currentRoom, password: null });
    }
  } else {
    const area = document.getElementById('room-pw-set-area');
    area.style.display = area.style.display === 'none' ? 'flex' : 'none';
  }
}

function submitSetRoomPassword() {
  const pw = document.getElementById('room-new-pw-input').value.trim();
  if (!pw) { document.getElementById('room-pw-set-error').textContent = '请输入密码'; return; }
  socket.emit('set_room_password', { requester: currentUser.username, room: currentRoom, password: pw });
}

socket.on('set_room_password_result', function(data) {
  if (!data.success) { document.getElementById('room-pw-set-error').textContent = data.msg; return; }
  closeModal('room-card-modal');
});

socket.on('room_password_changed', function(data) {
  roomHasPassword[data.room] = data.has_password;
  const el = document.getElementById('room-' + data.room);
  if (el) el.innerHTML = `<span class="room-icon">${GROUP_SVG}</span><span class="room-name-label">${data.room}</span>${data.has_password ? '<span class="room-lock">🔒</span>' : ''}`;
  if (!data.has_password) {
    delete savedRoomPasswords[data.room];
    localStorage.setItem('roomPasswords', JSON.stringify(savedRoomPasswords));
  }
});

function confirmCloseRoomFromCard() {
  closeModal('room-card-modal');
  confirmCloseRoom();
}

// ── 搜索房间 ──────────────────────────────────────────────
function openFindRoom() {
  document.getElementById('find-room-code').value = '';
  document.getElementById('find-room-error').textContent = '';
  openModal('find-room-modal');
}

function doFindRoom() {
  const code = document.getElementById('find-room-code').value.trim();
  if (!code) return;
  socket.emit('find_room', { code });
}

document.getElementById('find-room-code').addEventListener('keypress', e => {
  if (e.key === 'Enter') doFindRoom();
});

socket.on('find_room_result', function(data) {
  if (!data.success) { document.getElementById('find-room-error').textContent = data.msg; return; }
  closeModal('find-room-modal');
  addRoomToList(data.room, data.has_password, data.code);
  joinRoom(data.room);
});

// ── 邀请功能 ──────────────────────────────────────────────
let pendingInviteRoom = null;
let pendingInviteFrom = null;

function openInviteModal() {
  if (!cardTargetUsername) return;
  document.getElementById('invite-target-name').textContent = '邀请 @' + cardTargetUsername + ' 到：';
  const list = document.getElementById('invite-room-list');
  list.innerHTML = '<span style="color:#888;font-size:0.85rem;">加载中...</span>';
  socket.emit('get_my_admin_rooms', { username: currentUser.username });
  closeModal('member-card-modal');
  openModal('invite-room-modal');
}

socket.on('my_admin_rooms', function(data) {
  const list = document.getElementById('invite-room-list');
  if (!document.getElementById('invite-room-modal').classList.contains('show')) return;
  list.innerHTML = '';
  if (!data.rooms.length) {
    list.innerHTML = '<span style="color:#888;font-size:0.85rem;">你没有管理权限的聊天室</span>';
    return;
  }
  data.rooms.forEach(r => {
    const btn = document.createElement('button');
    btn.textContent = '# ' + r.name + (r.code ? '  (' + r.code + ')' : '');
    btn.style.cssText = 'width:100%; text-align:left;';
    btn.onclick = () => {
      socket.emit('invite_to_room', { requester: currentUser.username, target: cardTargetUsername, room: r.name });
      closeModal('invite-room-modal');
      alert(`已邀请 @${cardTargetUsername} 进入 #${r.name}`);
    };
    list.appendChild(btn);
  });
});

socket.on('room_invite', function(data) {
  pendingInviteFrom = data.from;
  pendingInviteRoom = data.room;
  document.getElementById('invite-notify-text').textContent = `${data.from} 邀请你加入聊天室 #${data.room}`;
  openModal('invite-notify-modal');
});

function acceptInvite() {
  closeModal('invite-notify-modal');
  if (!pendingInviteRoom) return;
  addRoomToList(pendingInviteRoom, false);
  joinRoom(pendingInviteRoom);
  pendingInviteRoom = null;
}

function declineInvite() {
  closeModal('invite-notify-modal');
  pendingInviteRoom = null;
}

function confirmCloseRoom() {
  if (confirm(`确定关闭房间 "${currentRoom}" 吗？所有人将被踢出。`)) {
    socket.emit('close_room', { requester: currentUser.username, room: currentRoom });
  }
}

socket.on('room_closed', function(data) {
  const closedRoom = currentRoom;
  currentRoom = null;
  isAdmin = false;
  document.getElementById('no-room').style.display = 'flex';
  document.getElementById('chat-main').style.display = 'none';
  document.getElementById('messages').innerHTML = '';
  const el = document.getElementById('room-' + closedRoom);
  if (el) el.remove();
});

// ── 语音：加入/离开 ───────────────────────────────────────
async function toggleVoice() {
  if (!currentUser) { openAuth(); return; }
  if (!currentRoom) { alert('请先进入房间'); return; }
  
  if (!inVoice) {
    await joinVoice();
  } else {
    leaveVoice();
  }
}

async function joinVoice() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('语音功能需要 HTTPS 连接，直接用 IP 地址访问时不可用。\n请通过 https:// 地址访问本站。');
    return;
  }
  await loadIceServers();
  try {
    let localRaw;
    if (savedMicDeviceId) {
      try {
        localRaw = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: savedMicDeviceId } } });
      } catch(e) {
        // 保存的设备 ID 在此设备上不存在（跨设备/手机），回退到默认麦克风
        localRaw = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } else {
      localRaw = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    localStream = localRaw;

    // 发送侧：与原来一致，通过 AudioContext 处理后发出
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(localStream);
    const gainNode = audioContext.createGain();
    micGainNode = gainNode;
    const dest = audioContext.createMediaStreamDestination();
    source.connect(gainNode);
    gainNode.connect(dest);
    localStream = dest.stream;

    // 说话检测
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    detectSpeaking(analyser);
    
    inVoice = true;
    voiceRoom = currentRoom;
    updateVoicePill();
    const pingEl = document.getElementById('voice-ping');
    if (pingEl) pingEl.textContent = '…';
    const _doPing = () => socket.emit('ping_check', { t: Date.now() });
    _doPing();
    _pingInterval = setInterval(_doPing, 3000);
    document.getElementById('voice-join-btn').style.display = 'none';
    document.getElementById('voice-in-controls').classList.add('show');
    document.getElementById('voice-vol-controls').style.display = '';
    document.getElementById('stream-audio-btn').classList.add('show-ctrl');
    document.getElementById('live-btn-row').classList.add('show-ctrl');

    // iOS Safari 切后台时可能强制停止麦克风轨道，检测到后更新UI提示重连
    dest.stream.getTracks().forEach(track => {
      track.onended = () => {
        if (inVoice) {
          leaveVoice();
          const vs2 = document.getElementById('voice-status');
          vs2.innerHTML = '⚠️ 语音已断开 <button onclick="toggleVoice()" style="font-size:0.75rem;padding:2px 8px;margin-left:4px;background:#4f8ef7;color:white;border:none;border-radius:4px;cursor:pointer;">重新加入</button>';
          vs2.style.display = '';
        }
      };
    });

    const myAv = getAvatarData(currentUser.username);
    addVoiceMember(currentUser.username, currentUser.screenname, myAv.expression, myAv.color);
    socket.emit('voice_join', { username: currentUser.username, screenname: currentUser.screenname, room: currentRoom, avatar_expression: myAv.expression, avatar_color: myAv.color });
  } catch (e) {
    alert('无法访问麦克风：' + e.message);
  }
}

function leaveVoice() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};
  Object.values(audioElements).forEach(audio => { try { audio.pause(); audio.srcObject = null; if (audio.parentNode) audio.parentNode.removeChild(audio); } catch(e) {} });
  audioElements = {};
  Object.values(audioGains).forEach(g => { try { g.disconnect(); } catch(e) {} });
  audioGains = {};
  if (audioContext) { audioContext.close(); audioContext = null; }
  if (isStreamingAudio) stopStreamAudio(true);
  if (isStreaming) stopStream(true);
  Object.values(streamAudioElements).forEach(a => { try { a.pause(); a.srcObject = null; a.remove(); } catch(e) {} });
  for (const u in streamAudioElements) delete streamAudioElements[u];
  Object.keys(streamVideos).forEach(u => removeStreamCard(u));
  document.querySelectorAll('.stream-vol-row').forEach(el => el.remove());
  document.querySelectorAll('.stream-indicator').forEach(el => el.remove());
  document.querySelectorAll('.stream-floater').forEach(el => el.remove());

  inVoice = false;
  voiceRoom = null;
  voiceMembers.clear();
  _pillSpeaker = null;
  if (_pingInterval) { clearInterval(_pingInterval); _pingInterval = null; }
  const pingEl = document.getElementById('voice-ping');
  if (pingEl) pingEl.textContent = '';
  updateVoicePill();
  isMuted = false;
  isSpeakerMuted = false;
  document.getElementById('voice-join-btn').style.display = '';
  document.getElementById('voice-in-controls').classList.remove('show');
  document.getElementById('voice-vol-controls').style.display = 'none';
  document.getElementById('stream-audio-btn').classList.remove('show-ctrl');
  document.getElementById('live-btn-row').classList.remove('show-ctrl');
  document.getElementById('stream-settings').style.display = 'none';
  document.getElementById('stream-settings-btn').classList.remove('active');
  document.getElementById('mic-toggle').classList.remove('muted');
  document.getElementById('speaker-toggle').classList.remove('muted');
  
  socket.emit('voice_leave', { username: currentUser.username, room: currentRoom });
}

// ── 语音：WebRTC 连接 ─────────────────────────────────────
async function createPeerConnection(targetUsername) {
  const pc = new RTCPeerConnection(iceServers);
  peerConnections[targetUsername] = pc;
  
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    if (event.track.kind === 'video') {
      if (!streamVideos[targetUsername]) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.setAttribute('playsinline', '');
        video.muted = true;
        video.srcObject = new MediaStream([event.track]);
        streamVideos[targetUsername] = video;
        addStreamCard(targetUsername, voiceScreennames[targetUsername] || targetUsername);
        event.track.onended = () => removeStreamCard(targetUsername);
      }
      return;
    }

    if (!audioElements[targetUsername]) {
      // 第一条音轨 = 麦克风
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.srcObject = new MediaStream([event.track]);
      document.body.appendChild(audio);
      if (savedSpeakerDeviceId && typeof audio.setSinkId === 'function') {
        audio.setSinkId(savedSpeakerDeviceId).catch(() => {});
      }
      if (isSpeakerMuted) audio.muted = true;
      audio.volume = Math.min(speakerVolume, 1);
      audio.play().catch(e => console.warn('audio play blocked:', e));
      audioElements[targetUsername] = audio;
      audioGains[targetUsername] = audio;

    } else if (!streamAudioElements[targetUsername]) {
      // 第二条音轨 = 对方共享的音频
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.srcObject = new MediaStream([event.track]);
      document.body.appendChild(audio);
      if (isSpeakerMuted) audio.muted = true;
      audio.volume = 0.8;
      audio.play().catch(() => {});
      streamAudioElements[targetUsername] = audio;
      showStreamVolControl(targetUsername);
      event.track.onended = () => hideStreamVolControl(targetUsername);

    }
  };

  let _iceRetries = 0;
  const ICE_MAX_RETRIES = 5;
  pc.oniceconnectionstatechange = () => {
    const el = document.getElementById('vm-' + targetUsername);
    const state = pc.iceConnectionState;
    if (state === 'connected' || state === 'completed') {
      if (el) { el.style.opacity = ''; el.title = ''; }
      _iceRetries = 0;
    } else if (state === 'disconnected') {
      if (el) { el.style.opacity = '0.5'; el.title = '连接中断，等待恢复…'; }
    } else if (state === 'failed') {
      if (_iceRetries < ICE_MAX_RETRIES) {
        _iceRetries++;
        if (el) { el.style.opacity = '0.4'; el.title = `重连中… (${_iceRetries}/${ICE_MAX_RETRIES})`; }
        try { pc.restartIce(); } catch(e) {}
      } else {
        if (el) { el.style.opacity = '0.2'; el.title = '连接失败'; }
        const sn = voiceScreennames[targetUsername] || targetUsername;
        const vs = document.getElementById('voice-status');
        if (vs) { vs.textContent = `⚠ 与 ${sn} 的语音连接失败`; vs.style.display = ''; vs.style.color = '#e74c3c'; }
      }
    }
  };

  pc.onnegotiationneeded = async () => {
    // Only renegotiate if we have more live senders than already-negotiated send m-lines.
    // This prevents spurious renegotiation on the answering side (whose onnegotiationneeded
    // fires after the initial handshake even though no new tracks were added).
    const activeSenders = pc.getSenders().filter(s => s.track?.readyState === 'live').length;
    const localSdp = pc.localDescription?.sdp || '';
    const sendMlines = (localSdp.match(/a=(sendrecv|sendonly)/gm) || []).length;
    if (pc.localDescription && activeSenders <= sendMlines) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice_offer', { room: currentRoom, from: currentUser.username, to: targetUsername, offer });
    } catch(e) { console.warn('renegotiation failed:', e); }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('voice_ice', {
        room: currentRoom,
        from: currentUser.username,
        to: targetUsername,
        candidate: event.candidate
      });
    }
  };
  
  return pc;
}

// ── 语音：信令处理 ────────────────────────────────────────
socket.on('voice_current_members', async function(data) {
  for (const member of data.members) {
    if (member.username !== currentUser.username && !peerConnections[member.username]) {
      addVoiceMember(member.username, member.screenname);
      const pc = await createPeerConnection(member.username);
      // Include any live stream tracks in the initial offer so late joiners
      // receive the stream without needing a separate renegotiation round.
      if (displayStream) {
        displayStream.getTracks().filter(t => t.readyState === 'live').forEach(t => {
          try { pc.addTrack(t, displayStream); } catch(e) {}
        });
      } else if (isStreamingAudio && streamAudioTrack?.readyState === 'live') {
        try { pc.addTrack(streamAudioTrack, new MediaStream([streamAudioTrack])); } catch(e) {}
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice_offer', {
        room: currentRoom,
        from: currentUser.username,
        to: member.username,
        offer: offer
      });
    }
  }
});

socket.on('voice_user_joined', async function(data) {
  if (data.username === currentUser?.username) return;
  addVoiceMember(data.username, data.screenname, data.avatar_expression, data.avatar_color);
});

socket.on('voice_offer', async function(data) {
  if (data.to !== currentUser?.username || !inVoice) return;
  // 如果已有未关闭的连接，直接复用（重协商），不新建
  let pc = peerConnections[data.from];
  if (!pc || pc.signalingState === 'closed') {
    pc = await createPeerConnection(data.from);
  }
  await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('voice_answer', {
    room: currentRoom,
    from: currentUser.username,
    to: data.from,
    answer: answer
  });
  // After answer, signaling state returns to 'stable' — safe to add stream tracks now.
  // This lets late joiners receive ongoing streams via renegotiation.
  if (displayStream) {
    displayStream.getTracks().filter(t => t.readyState === 'live').forEach(t => {
      const alreadySending = pc.getSenders().find(s => s.track === t);
      if (!alreadySending) try { pc.addTrack(t, displayStream); } catch(e) {}
    });
  } else if (isStreamingAudio && streamAudioTrack?.readyState === 'live') {
    const alreadySending = pc.getSenders().find(s => s.track === streamAudioTrack);
    if (!alreadySending) try { pc.addTrack(streamAudioTrack, new MediaStream([streamAudioTrack])); } catch(e) {}
  }
});

socket.on('voice_answer', async function(data) {
  if (data.to !== currentUser?.username) return;
  const pc = peerConnections[data.from];
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('voice_ice', async function(data) {
  if (data.to !== currentUser?.username) return;
  const pc = peerConnections[data.from];
  if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
});

socket.on('voice_user_left', function(data) {
  removeVoiceMember(data.username);
  if (peerConnections[data.username]) {
    peerConnections[data.username].close();
    delete peerConnections[data.username];
  }
  if (audioElements[data.username]) {
    try { const a = audioElements[data.username]; a.pause(); a.srcObject = null; if (a.parentNode) a.parentNode.removeChild(a); } catch(e) {}
    delete audioElements[data.username];
  }
});

// ── 语音：UI 更新 ─────────────────────────────────────────
function canBanUser(username) {
  if (!currentUser || username === currentUser.username) return false;
  const myLevel = getMyLevel();
  const tgtLevel = getTargetLevel(username);
  return myLevel >= 1 && myLevel > tgtLevel;
}

function addVoiceMember(username, screenname, avatarExpression, avatarColor) {
  voiceScreennames[username] = screenname || username;
  if (avatarExpression || avatarColor) {
    userAvatarCache[username] = { expression: avatarExpression || 'Smile', color: avatarColor || defaultAvatarColor(username) };
  }
  const list = document.getElementById('voice-members-list');
  if (document.getElementById('vm-' + username)) return;
  const display = screenname || username;
  const div = document.createElement('div');
  div.className = 'voice-member';
  div.id = 'vm-' + username;
  const av = getAvatarData(username);
  const banBtn = canBanUser(username)
    ? (voiceBanned.has(username)
        ? `<button class="voice-btn" style="font-size:0.7rem;" onclick="unbanVoice('${username}')">解除禁言</button>`
        : `<button class="voice-btn" style="font-size:0.7rem;" onclick="banVoice('${username}')">禁言</button>`)
    : '';
  div.innerHTML = avatarHTML(av.expression, av.color, 24) +
    `<span class="voice-icon">🎤</span>` +
    `<span style="cursor:pointer;flex:1;font-size:0.85rem;" onclick="openMemberCard('${username}')">${display}</span>` +
    banBtn;
  list.appendChild(div);
  voiceMembers.add(username);
  updateVoiceCount();
}

function removeVoiceMember(username) {
  if (_pillSpeaker === username) _pillSpeaker = null;
  voiceMembers.delete(username);
  const el = document.getElementById('vm-' + username);
  if (el) el.remove();
  removeStreamCard(username);
  delete voiceScreennames[username];
  updateVoiceCount();
}

// ── 语音：说话检测 ────────────────────────────────────────
function detectSpeaking(analyser) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  let speaking = false;
  
  setInterval(() => {
    analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b) / data.length;
    const nowSpeaking = avg > 10;
    
    if (nowSpeaking !== speaking) {
      speaking = nowSpeaking;
      socket.emit('voice_speaking', {
        room: currentRoom,
        username: currentUser.username,
        speaking: speaking
      });
      const el = document.getElementById('vm-' + currentUser.username);
      if (el) el.classList.toggle('speaking', speaking);
      if (speaking) _pillSpeaker = currentUser.username;
      else if (_pillSpeaker === currentUser.username) _pillSpeaker = null;
      updateVoicePill();
    }
  }, 100);
}

socket.on('voice_speaking', function(data) {
  const el = document.getElementById('vm-' + data.username);
  if (el) el.classList.toggle('speaking', data.speaking);
  if (data.speaking) _pillSpeaker = data.username;
  else if (_pillSpeaker === data.username) _pillSpeaker = null;
  updateVoicePill();
});

socket.on('pong_check', function(data) {
  const ms = Date.now() - data.t;
  const el = document.getElementById('voice-ping');
  if (el) el.textContent = ms + ' ms';
});

// ── 语音：音量控制 ────────────────────────────────────────
function setMicVolume(val) {
  if (micGainNode) micGainNode.gain.value = val / 100;
  const pct = document.getElementById('mic-vol-pct');
  if (pct) pct.textContent = val + '%';
}

function setSpeakerVolume(val) {
  speakerVolume = val / 100;
  for (const [u, a] of Object.entries(audioElements)) {
    if (a && !ignoredUsers.has(u)) a.volume = speakerVolume;
  }
  const pct = document.getElementById('speaker-vol-pct');
  if (pct) pct.textContent = val + '%';
}

function toggleMute() {
  isMuted = !isMuted;
  if (localStream) localStream.getTracks().forEach(t => t.enabled = !isMuted);
  document.getElementById('mic-toggle').classList.toggle('muted', isMuted);
  socket.emit('voice_mute_status', { room: currentRoom, username: currentUser.username, muted: isMuted });
}

let isSpeakerMuted = false;
let _preSpeakerVol = 100;

function toggleSpeaker() {
  isSpeakerMuted = !isSpeakerMuted;
  const btn = document.getElementById('speaker-toggle');
  if (isSpeakerMuted) {
    _preSpeakerVol = parseFloat(document.getElementById('speaker-volume').value);
    Object.values(audioElements).forEach(a => { if (a) a.muted = true; });
    Object.values(streamAudioElements).forEach(a => { if (a) a.muted = true; });
    btn.classList.add('muted');
    if (!isMuted) toggleMute();
  } else {
    Object.values(audioElements).forEach(a => { if (a) a.muted = false; });
    Object.values(streamAudioElements).forEach(a => { if (a) a.muted = false; });
    document.getElementById('speaker-volume').value = _preSpeakerVol;
    setSpeakerVolume(_preSpeakerVol);
    btn.classList.remove('muted');
    if (isMuted) toggleMute();
  }
}

socket.on('voice_mute_status', function(data) {
  const el = document.getElementById('vm-' + data.username);
  if (el) {
    const icon = el.querySelector('.voice-icon');
    if (icon) icon.textContent = data.muted ? '🔇' : '🎤';
  }
});

// ── 语音：拒听 ────────────────────────────────────────────
function toggleIgnore(username) {
  if (ignoredUsers.has(username)) {
    ignoredUsers.delete(username);
    if (audioElements[username]) audioElements[username].volume = speakerVolume;
  } else {
    ignoredUsers.add(username);
    if (audioElements[username]) audioElements[username].volume = 0;
  }
}

// ── 语音：禁言 ────────────────────────────────────────────
function banVoice(username) {
  socket.emit('voice_ban', {
    requester: currentUser.username,
    room: currentRoom,
    target: username
  });
}

socket.on('voice_banned', function(data) {
  voiceBanned.add(data.target);
  if (data.target === currentUser?.username) {
    if (localStream) localStream.getTracks().forEach(t => t.enabled = false);
    alert('你已被管理员禁言');
  }
  const el = document.getElementById('vm-' + data.target);
  if (el) {
    const icon = el.querySelector('.voice-icon');
    if (icon) icon.textContent = '🚫';
    const btn = el.querySelector('.voice-btn');
    if (btn) { btn.textContent = '解除禁言'; btn.onclick = () => unbanVoice(data.target); }
  }
});

socket.on('voice_unbanned', function(data) {
  voiceBanned.delete(data.target);
  if (data.target === currentUser?.username) {
    if (localStream) localStream.getTracks().forEach(t => t.enabled = true);
    alert('你已被解除禁言');
  }
  const el = document.getElementById('vm-' + data.target);
  if (el) {
    const icon = el.querySelector('.voice-icon');
    if (icon) icon.textContent = '🎤';
    const btn = el.querySelector('.voice-btn');
    if (btn) { btn.textContent = '禁言'; btn.onclick = () => banVoice(data.target); }
  }
});

function unbanVoice(username) {
  socket.emit('voice_unban', { requester: currentUser.username, room: currentRoom, target: username });
}

// ── 语音：共享音频 ────────────────────────────────────────
function toggleStreamAudio() {
  if (isStreamingAudio) stopStreamAudio(false);
  else startStreamAudio();
}

async function startStreamAudio() {
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch(e) {
    if (e.name !== 'NotAllowedError') alert('无法捕获音频：' + e.message);
    return;
  }
  const audioTracks = displayStream.getAudioTracks();
  if (!audioTracks.length) {
    displayStream.getTracks().forEach(t => t.stop());
    displayStream = null;
    alert('未检测到共享音频。\n选择窗口/屏幕时，请勾选"分享音频"或"共享系统音频"。');
    return;
  }
  displayStream.getVideoTracks().forEach(t => t.stop());
  streamAudioTrack = audioTracks[0];
  isStreamingAudio = true;
  const btn = document.getElementById('stream-audio-btn');
  btn.textContent = t('stop-sharing');
  btn.classList.add('active');
  for (const [, pc] of Object.entries(peerConnections)) {
    try { pc.addTrack(streamAudioTrack, displayStream); } catch(e) {}
  }
  socket.emit('stream_audio_start', { room: currentRoom, username: currentUser.username });
  streamAudioTrack.onended = () => stopStreamAudio(false);
}

function stopStreamAudio(silent) {
  if (!isStreamingAudio) return;
  for (const [, pc] of Object.entries(peerConnections)) {
    const sender = pc.getSenders().find(s => s.track === streamAudioTrack);
    if (sender) try { pc.removeTrack(sender); } catch(e) {}
  }
  if (streamAudioTrack) { try { streamAudioTrack.stop(); } catch(e) {} streamAudioTrack = null; }
  if (displayStream) { displayStream.getTracks().forEach(t => { try { t.stop(); } catch(e) {} }); displayStream = null; }
  isStreamingAudio = false;
  const btn = document.getElementById('stream-audio-btn');
  if (btn) { btn.textContent = t('share-audio'); btn.classList.remove('active'); }
  if (!silent) socket.emit('stream_audio_stop', { room: currentRoom, username: currentUser.username });
}

function showStreamVolControl(username) {
  const vmEl = document.getElementById('vm-' + username);
  if (!vmEl || document.getElementById('sva-' + username)) return;
  const nameSpan = vmEl.querySelector('span:nth-child(2)');
  if (nameSpan && !nameSpan.querySelector('.stream-indicator')) {
    nameSpan.insertAdjacentHTML('beforeend', '<span class="stream-indicator"> 🖥</span>');
  }
  const row = document.createElement('div');
  row.className = 'stream-vol-row';
  row.id = 'sva-' + username;
  row.innerHTML = `<span style="font-size:0.8rem;opacity:0.6">🎵</span><input type="range" min="0" max="100" value="80" oninput="setStreamVol('${username}',this.value)"><span id="svol-pct-${username}" style="font-size:0.75rem;min-width:30px;text-align:right">80%</span>`;
  vmEl.insertAdjacentElement('afterend', row);
}

function hideStreamVolControl(username) {
  const row = document.getElementById('sva-' + username);
  if (row) row.remove();
  const vmEl = document.getElementById('vm-' + username);
  if (vmEl) { const ind = vmEl.querySelector('.stream-indicator'); if (ind) ind.remove(); }
  if (streamAudioElements[username]) {
    try { streamAudioElements[username].pause(); streamAudioElements[username].srcObject = null; streamAudioElements[username].remove(); } catch(e) {}
    delete streamAudioElements[username];
  }
}

function setStreamVol(username, val) {
  const audio = streamAudioElements[username];
  if (audio) audio.volume = parseInt(val) / 100;
  const span = document.getElementById('svol-pct-' + username);
  if (span) span.textContent = val + '%';
}

socket.on('stream_audio_start', function(data) {
  const vmEl = document.getElementById('vm-' + data.username);
  if (vmEl && !vmEl.querySelector('.stream-indicator')) {
    const nameSpan = vmEl.querySelector('span:nth-child(2)');
    if (nameSpan) nameSpan.insertAdjacentHTML('beforeend', '<span class="stream-indicator"> 🖥</span>');
  }
});

socket.on('stream_audio_stop', function(data) {
  hideStreamVolControl(data.username);
});

// ── 语音：直播（视频+音频）────────────────────────────────
function toggleLive() {
  if (isStreaming) stopStream(false);
  else startStream();
}

async function startStream() {
  if (isStreamingAudio) stopStreamAudio(false);
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: streamQuality.frameRate, max: streamQuality.frameRate }, width: { ideal: streamQuality.width }, height: { ideal: streamQuality.height } },
      audio: true
    });
  } catch(e) {
    if (e.name !== 'NotAllowedError') alert('无法捕获屏幕：' + e.message);
    return;
  }
  displayStream = stream;
  streamAudioTrack = stream.getAudioTracks()[0] || null;
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    stream.getTracks().forEach(t => t.stop());
    displayStream = null;
    alert('未获取到视频轨道。');
    return;
  }
  isStreaming = true;
  if (streamAudioTrack) isStreamingAudio = true;
  document.getElementById('live-btn').textContent = t('stop-live');
  document.getElementById('live-btn').classList.add('active');
  for (const [, pc] of Object.entries(peerConnections)) {
    try {
      const sender = pc.addTrack(videoTrack, stream);
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = streamQuality.bitrate;
      sender.setParameters(params).catch(() => {});
    } catch(e) {}
    if (streamAudioTrack) try { pc.addTrack(streamAudioTrack, stream); } catch(e) {}
  }
  socket.emit('stream_start', { room: currentRoom, username: currentUser.username, screenname: currentUser.screenname });
  videoTrack.onended = () => stopStream(false);
}

function stopStream(silent) {
  if (!isStreaming) return;
  for (const [, pc] of Object.entries(peerConnections)) {
    pc.getSenders().forEach(sender => {
      if (displayStream && sender.track && displayStream.getTracks().includes(sender.track)) {
        try { pc.removeTrack(sender); } catch(e) {}
      }
    });
  }
  if (displayStream) { displayStream.getTracks().forEach(t => { try { t.stop(); } catch(e) {} }); displayStream = null; }
  streamAudioTrack = null;
  isStreaming = false;
  isStreamingAudio = false;
  const btn = document.getElementById('live-btn');
  if (btn) { btn.textContent = t('live'); btn.classList.remove('active'); }
  if (!silent) socket.emit('stream_stop', { room: currentRoom, username: currentUser.username });
}

function toggleStreamSettings() {
  const panel = document.getElementById('stream-settings');
  const btn = document.getElementById('stream-settings-btn');
  const open = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = open ? 'block' : 'none';
  btn.classList.toggle('active', open);
}

function updateStreamQuality() {
  const res = parseInt(document.getElementById('stream-res').value);
  const fps = parseInt(document.getElementById('stream-fps').value);
  const bitrate = parseInt(document.getElementById('stream-bitrate').value);
  const widths = { 480: 854, 720: 1280, 1080: 1920 };
  streamQuality = { width: widths[res] || 1280, height: res, frameRate: fps, bitrate };
}

// ── 直播面板 UI ───────────────────────────────────────────
function addStreamCard(username, screenname) {
  if (document.getElementById('stream-card-' + username)) return;
  const video = streamVideos[username];
  if (!video) return;
  const waiting = document.getElementById('stream-waiting-' + username);
  if (waiting) { clearTimeout(waiting._timeout); waiting.remove(); }
  const panel = document.getElementById('stream-panel');
  const grid = document.getElementById('stream-grid');
  const card = document.createElement('div');
  card.className = 'stream-card';
  card.id = 'stream-card-' + username;
  video.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
  card.appendChild(video);
  card.insertAdjacentHTML('beforeend',
    `<div class="stream-card-label">${screenname}</div>` +
    `<div class="stream-card-btns">` +
    `<button class="stream-card-btn" onclick="fullscreenStream('${username}')" title="全屏">⤢</button>` +
    `<button class="stream-card-btn" onclick="popOutStream('${username}')" title="浮出">⧉</button>` +
    `<button class="stream-card-btn" onclick="hideStreamCard('${username}')" title="停止观看">✕</button>` +
    `</div>`
  );
  grid.appendChild(card);
  panel.classList.add('active');
  document.getElementById('stream-resize-handle').classList.add('active');
}

function watchStream(username) {
  closeAllSidebars();
  // 手机端确保聊天区可见
  const chatMain = document.getElementById('chat-main');
  if (chatMain) { chatMain.style.display = 'flex'; chatMain.style.flexDirection = 'column'; }

  const card = document.getElementById('stream-card-' + username);
  if (card) {
    card.style.display = '';
    document.getElementById('stream-panel').classList.add('active');
    document.getElementById('stream-resize-handle').classList.add('active');
    card.style.outline = '2px solid #4f8ef7';
    setTimeout(() => { card.style.outline = ''; }, 1200);
  } else {
    // 轨道还没到，等最多5秒
    const panel = document.getElementById('stream-panel');
    panel.classList.add('active');
    document.getElementById('stream-resize-handle').classList.add('active');
    const grid = document.getElementById('stream-grid');
    let waiting = document.getElementById('stream-waiting-' + username);
    if (!waiting) {
      waiting = document.createElement('div');
      waiting.id = 'stream-waiting-' + username;
      waiting.className = 'stream-placeholder';
      waiting.textContent = '等待直播画面…';
      grid.appendChild(waiting);
    }
    const t = setTimeout(() => {
      if (waiting.parentNode) waiting.remove();
      if (!document.querySelector('.stream-card')) {
        panel.classList.remove('active');
        document.getElementById('stream-resize-handle').classList.remove('active');
      }
    }, 15000);
    waiting._timeout = t;
  }
}

function hideStreamCard(username) {
  const card = document.getElementById('stream-card-' + username);
  if (card) card.style.display = 'none';
  const floater = document.getElementById('stream-float-' + username);
  if (floater) floater.remove();
  const visible = document.querySelectorAll('.stream-card:not([style*="display: none"])');
  if (!visible.length) {
    document.getElementById('stream-panel').classList.remove('active');
    document.getElementById('stream-resize-handle').classList.remove('active');
  }
}

function removeStreamCard(username) {
  const card = document.getElementById('stream-card-' + username);
  if (card) card.remove();
  const floater = document.getElementById('stream-float-' + username);
  if (floater) floater.remove();
  if (streamVideos[username]) {
    try { streamVideos[username].srcObject = null; } catch(e) {}
    delete streamVideos[username];
  }
  if (!document.querySelector('.stream-card')) {
    document.getElementById('stream-panel').classList.remove('active');
    document.getElementById('stream-resize-handle').classList.remove('active');
  }
}

function popOutStream(username) {
  const video = streamVideos[username];
  const card = document.getElementById('stream-card-' + username);
  if (!video || !card) return;
  const screenname = card.querySelector('.stream-card-label')?.textContent || username;
  const floater = document.createElement('div');
  floater.className = 'stream-floater';
  floater.id = 'stream-float-' + username;
  floater.style.cssText = 'right:20px;bottom:20px;';
  floater.innerHTML =
    `<div class="stream-floater-bar">` +
    `<span>${screenname}</span>` +
    `<div style="display:flex;gap:4px">` +
    `<button class="stream-floater-btn" onclick="fullscreenStream('${username}')" title="全屏">⤢</button>` +
    `<button class="stream-floater-btn" onclick="popInStream('${username}')" title="归位">⊡</button>` +
    `</div></div>`;
  video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;';
  floater.appendChild(video);
  document.body.appendChild(floater);
  makeDraggable(floater, floater.querySelector('.stream-floater-bar'));
  // 隐藏卡片，面板区域缩小；若没有可见卡片则收起面板
  card.style.display = 'none';
  const panel = document.getElementById('stream-panel');
  const hasVisible = panel.querySelector('.stream-card:not([style*="display: none"]):not([style*="display:none"])');
  if (!hasVisible) {
    panel.classList.remove('active');
    document.getElementById('stream-resize-handle').classList.remove('active');
  }
}

function popInStream(username) {
  const floater = document.getElementById('stream-float-' + username);
  const card = document.getElementById('stream-card-' + username);
  const video = streamVideos[username];
  if (!video || !card) { if (floater) floater.remove(); return; }
  video.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
  card.insertBefore(video, card.firstChild);
  if (floater) floater.remove();
  // 恢复卡片和面板
  card.style.display = '';
  document.getElementById('stream-panel').classList.add('active');
  document.getElementById('stream-resize-handle').classList.add('active');
}

function fullscreenStream(username) {
  const floater = document.getElementById('stream-float-' + username);
  const card = document.getElementById('stream-card-' + username);
  const video = (floater || card)?.querySelector('video');
  if (!video) return;
  // webkitEnterFullscreen 是 iOS Safari 上视频全屏的正确方法
  if (video.requestFullscreen) video.requestFullscreen();
  else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
  else if (video.mozRequestFullScreen) video.mozRequestFullScreen();
}

function makeDraggable(el, handle) {
  handle = handle || el;
  let sx, sy, sl, st;

  function startDrag(cx, cy) {
    sx = cx; sy = cy;
    sl = el.offsetLeft; st = el.offsetTop;
    el.style.right = 'auto'; el.style.bottom = 'auto';
  }
  function applyDrag(cx, cy) {
    el.style.left = Math.max(0, sl + cx - sx) + 'px';
    el.style.top  = Math.max(0, st + cy - sy) + 'px';
  }

  handle.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    startDrag(e.clientX, e.clientY);
    const onMove = e2 => applyDrag(e2.clientX, e2.clientY);
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });

  handle.addEventListener('touchstart', e => {
    if (e.target.tagName === 'BUTTON') return;
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
    const onMove = e2 => { e2.preventDefault(); const t2 = e2.touches[0]; applyDrag(t2.clientX, t2.clientY); };
    const onEnd = () => { handle.removeEventListener('touchmove', onMove); handle.removeEventListener('touchend', onEnd); };
    handle.addEventListener('touchmove', onMove, { passive: false });
    handle.addEventListener('touchend', onEnd);
    e.preventDefault();
  }, { passive: false });
}

// 直播面板拖拽缩放
(function() {
  const handle = document.getElementById('stream-resize-handle');
  let dragging = false, startY = 0, startH = 0;

  function startResize(y) {
    dragging = true; startY = y;
    startH = document.getElementById('stream-panel').offsetHeight;
    handle.classList.add('dragging');
  }
  function applyResize(y) {
    if (!dragging) return;
    const newH = Math.max(90, Math.min(window.innerHeight * 0.72, startH + y - startY));
    document.getElementById('stream-panel').style.height = newH + 'px';
  }
  function endResize() { if (dragging) { dragging = false; handle.classList.remove('dragging'); } }

  handle.addEventListener('mousedown', e => { startResize(e.clientY); e.preventDefault(); });
  document.addEventListener('mousemove', e => applyResize(e.clientY));
  document.addEventListener('mouseup', endResize);

  handle.addEventListener('touchstart', e => { startResize(e.touches[0].clientY); e.preventDefault(); }, { passive: false });
  handle.addEventListener('touchmove', e => { e.preventDefault(); applyResize(e.touches[0].clientY); }, { passive: false });
  handle.addEventListener('touchend', endResize);
})();

socket.on('stream_start', function(data) {
  const vmEl = document.getElementById('vm-' + data.username);
  if (vmEl && !vmEl.querySelector('.live-indicator')) {
    const nameSpan = vmEl.querySelector('span:nth-child(2)');
    if (nameSpan) nameSpan.insertAdjacentHTML('beforeend',
      `<span class="live-indicator" onclick="event.stopPropagation();watchStream('${data.username}')" style="font-size:0.7rem;background:#e74c3c;color:white;border-radius:3px;padding:0 4px;margin-left:4px;cursor:pointer;" title="点击观看直播">LIVE</span>`
    );
  }
});

socket.on('stream_stop', function(data) {
  removeStreamCard(data.username);
  const vmEl = document.getElementById('vm-' + data.username);
  if (vmEl) { const ind = vmEl.querySelector('.live-indicator'); if (ind) ind.remove(); }
});

// 浏览器关闭时通知服务端离开语音
window.addEventListener('pagehide', () => {
  if (inVoice && currentRoom && currentUser && navigator.sendBeacon) {
    navigator.sendBeacon('/api/voice-leave', JSON.stringify({
      username: currentUser.username,
      room: currentRoom
    }));
  }
});

// ── 手机边缘滑动手势 ──────────────────────────────────────
(function() {
  const EDGE = 28;       // 触发区域宽度 px（距屏幕边缘）
  const MIN_SWIPE = 55;  // 最小滑动距离 px
  const MAX_VERT = 60;   // 最大允许垂直偏移 px（防止误触滚动）
  let t0x = 0, t0y = 0;

  document.addEventListener('touchstart', e => {
    t0x = e.touches[0].clientX;
    t0y = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    // 有弹窗打开时不触发
    if (document.querySelector('.modal.show')) return;
    const dx = e.changedTouches[0].clientX - t0x;
    const dy = e.changedTouches[0].clientY - t0y;
    if (Math.abs(dy) > MAX_VERT) return;  // 竖向滑动，跳过

    const W = window.innerWidth;
    if (t0x <= EDGE && dx >= MIN_SWIPE) {
      // 左边缘右滑 → 打开聊天室列表
      const sidebar = document.getElementById('sidebar');
      if (!sidebar.classList.contains('mobile-open')) toggleSidebar();
    } else if (t0x >= W - EDGE && dx <= -MIN_SWIPE) {
      // 右边缘左滑 → 打开成员列表
      const membersBar = document.getElementById('members-sidebar');
      if (!membersBar.classList.contains('mobile-open')) toggleMembersBar();
    }
  }, { passive: true });
})();

// ── 手机侧栏切换 ─────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const isOpen = sidebar.classList.contains('mobile-open');
  document.getElementById('members-sidebar').classList.remove('mobile-open');
  sidebar.classList.toggle('mobile-open', !isOpen);
  document.getElementById('sidebar-overlay').classList.toggle('show', !isOpen);
}

function toggleMembersBar() {
  const membersBar = document.getElementById('members-sidebar');
  const isOpen = membersBar.classList.contains('mobile-open');
  document.getElementById('sidebar').classList.remove('mobile-open');
  membersBar.classList.toggle('mobile-open', !isOpen);
  document.getElementById('sidebar-overlay').classList.toggle('show', !isOpen);
}

function closeAllSidebars() {
  if (isMobile()) return;
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('members-sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

// ── 头像系统 ──────────────────────────────────────────────

function defaultAvatarColor(username) {
  let h = 0;
  for (const c of (username || '')) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getAvatarData(username) {
  return userAvatarCache[username] || { expression: 'Smile', color: defaultAvatarColor(username) };
}

function avatarHTML(expression, color, size) {
  size = size || 32;
  const baseSvg = AVATAR_SVGS[expression] || AVATAR_SVGS.Smile;
  const svgW = Math.round(size * 0.62);
  const svgH = Math.round(svgW * 15 / 14);
  const svg = baseSvg
    .replace(/width="\d+"/, `width="${svgW}"`)
    .replace(/height="\d+"/, `height="${svgH}"`);
  return `<div class="av" style="width:${size}px;height:${size}px;background:${color || '#5865F2'}">${svg}</div>`;
}

// ── Plus 菜单 ────────────────────────────────────────────
function togglePlusMenu() {
  const dd = document.getElementById('plus-dropdown');
  dd.style.display = dd.style.display === 'none' ? '' : 'none';
}
function closePlusMenu() {
  const dd = document.getElementById('plus-dropdown');
  if (dd) dd.style.display = 'none';
}
function toggleMobilePlusMenu() {
  const dd = document.getElementById('mobile-plus-dropdown');
  dd.style.display = dd.style.display === 'none' ? '' : 'none';
}
function closeMobilePlusMenu() {
  const dd = document.getElementById('mobile-plus-dropdown');
  if (dd) dd.style.display = 'none';
}
document.addEventListener('click', function(e) {
  const btn = document.getElementById('plus-btn');
  const dd = document.getElementById('plus-dropdown');
  if (btn && dd && !btn.contains(e.target) && !dd.contains(e.target)) dd.style.display = 'none';
  const mBtn = document.getElementById('mobile-plus-btn');
  const mDd = document.getElementById('mobile-plus-dropdown');
  if (mBtn && mDd && !mBtn.contains(e.target) && !mDd.contains(e.target)) mDd.style.display = 'none';
});

// ── 更新侧栏头像 ─────────────────────────────────────────
function updateSidebarAvatar() {
  const wrap = document.getElementById('topbar-user-avatar');
  const nameEl = document.getElementById('topbar-name');
  const logoutBtn = document.getElementById('logout-btn');
  const loginBtn = document.getElementById('login-open-btn');
  if (!wrap) return;
  const mobileLoginBtn = document.getElementById('mobile-login-btn');
  if (!currentUser) {
    wrap.innerHTML = ''; wrap.style.display = 'none';
    if (nameEl) { nameEl.textContent = ''; nameEl.style.display = 'none'; }
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (loginBtn) loginBtn.style.display = '';
    if (mobileLoginBtn) mobileLoginBtn.style.display = '';
    return;
  }
  const av = getAvatarData(currentUser.username);
  wrap.innerHTML = avatarHTML(av.expression, av.color, 30);
  wrap.style.display = 'flex';
  if (nameEl) { nameEl.textContent = currentUser.screenname; nameEl.style.display = 'inline'; }
  if (logoutBtn) logoutBtn.style.display = 'flex';
  if (loginBtn) loginBtn.style.display = 'none';
  if (mobileLoginBtn) mobileLoginBtn.style.display = 'none';
  updateTabMeIcon();
}

function updateTabMeIcon() {
  const iconEl = document.getElementById('tab-me-icon');
  if (!iconEl) return;
  if (currentUser) {
    const av = getAvatarData(currentUser.username);
    iconEl.innerHTML = avatarHTML(av.expression, av.color, 26);
  } else {
    iconEl.innerHTML = `<svg class="tab-icon-svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
}

const _INFO_SVG = `<svg width="13" height="12" viewBox="0 0 15 14" fill="none" style="opacity:0.45;flex-shrink:0"><path d="M7.99996 9.33332V6.99999M7.99996 4.66666H8.00579M13.8333 6.99999C13.8333 10.2217 11.2216 12.8333 7.99996 12.8333C4.7783 12.8333 2.16663 10.2217 2.16663 6.99999C2.16663 3.77833 4.7783 1.16666 7.99996 1.16666C11.2216 1.16666 13.8333 3.77833 13.8333 6.99999Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function _setChatTitle(room) {
  const el = document.getElementById('chat-title');
  if (!el || !room) return;
  el.title = t('room-info-title');
  el.innerHTML = groupSVG(18, 14) + `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${room}</span>` + _INFO_SVG;
  const mt = document.getElementById('mobile-room-title');
  if (mt) { mt.innerHTML = el.innerHTML; mt.onclick = openRoomCard; }
}

function updateVoiceCount() {
  const list = document.getElementById('voice-members-list');
  const count = list ? list.children.length : 0;
  const title = document.getElementById('voice-section-title');
  const base = t('voice-chat-title');
  if (title) title.textContent = count > 0 ? `${base} (${count})` : base;
  updateVoicePill();
}

function updateVoicePill() {
  const pill = document.getElementById('mobile-voice-pill');
  if (!pill) return;
  if (!inVoice) { pill.style.display = 'none'; return; }
  pill.style.display = 'flex';
  const countEl = document.getElementById('mobile-voice-pill-count');
  if (countEl) countEl.textContent = '(' + voiceMembers.size + ')';
  const avWrap = document.getElementById('mobile-voice-pill-av');
  if (avWrap) {
    const isSpeaking = !!_pillSpeaker && voiceMembers.has(_pillSpeaker);
    if (!isSpeaking) _pillSpeaker = null;
    const username = _pillSpeaker || (currentUser ? currentUser.username : null);
    if (username) {
      const av = getAvatarData(username);
      avWrap.innerHTML = avatarHTML(av.expression, av.color, 22);
      const avEl = avWrap.querySelector('.av');
      if (avEl) avEl.classList.toggle('pill-speaking', isSpeaking);
    }
  }
}

function mobileVoicePillClick() {
  if (voiceRoom && voiceRoom !== currentRoom) {
    joinRoom(voiceRoom);
    if (isMobile()) { setTimeout(() => { mobileShowChat(); setTimeout(() => toggleMembersBar(), 320); }, 100); }
    else toggleMembersBar();
  } else {
    if (isMobile()) { mobileShowChat(); setTimeout(() => toggleMembersBar(), 320); }
    else toggleMembersBar();
  }
}

function updateMembersCount() {
  const list = document.getElementById('member-list');
  const count = list ? list.children.length : 0;
  const title = document.getElementById('sidebar-members-title');
  const base = t('sidebar-members-title');
  if (title) title.textContent = count > 0 ? `${base} (${count})` : base;
}

// ── 头像选择器 ───────────────────────────────────────────
let selectedAvatarExpression = 'Smile';
let selectedAvatarColor = '#5865F2';

function initAvatarPicker(expression, color) {
  selectedAvatarExpression = expression || 'Smile';
  selectedAvatarColor = color || '#5865F2';

  const exprRow = document.getElementById('av-expr-row');
  const colorRow = document.getElementById('av-color-row');
  const preview = document.getElementById('profile-avatar-preview');
  if (!exprRow || !colorRow) return;

  exprRow.innerHTML = '';
  AVATAR_EXPRESSIONS.forEach(expr => {
    const d = document.createElement('div');
    d.className = 'av-expr-opt' + (expr === selectedAvatarExpression ? ' sel' : '');
    d.style.background = selectedAvatarColor;
    d.innerHTML = AVATAR_SVGS[expr] || '';
    d.onclick = () => {
      selectedAvatarExpression = expr;
      document.querySelectorAll('.av-expr-opt').forEach(el => {
        el.classList.toggle('sel', el.dataset.expr === expr);
      });
      refreshAvatarPickerPreview();
    };
    d.dataset.expr = expr;
    exprRow.appendChild(d);
  });

  colorRow.innerHTML = '';
  AVATAR_COLORS.forEach(c => {
    const d = document.createElement('div');
    d.className = 'av-color-opt' + (c === selectedAvatarColor ? ' sel' : '');
    d.style.background = c;
    d.onclick = () => {
      selectedAvatarColor = c;
      document.querySelectorAll('.av-color-opt').forEach(el => el.classList.toggle('sel', el.dataset.color === c));
      document.querySelectorAll('.av-expr-opt').forEach(el => el.style.background = c);
      refreshAvatarPickerPreview();
    };
    d.dataset.color = c;
    colorRow.appendChild(d);
  });

  refreshAvatarPickerPreview();
}

function refreshAvatarPickerPreview() {
  const preview = document.getElementById('profile-avatar-preview');
  if (preview) preview.innerHTML = avatarHTML(selectedAvatarExpression, selectedAvatarColor, 80);
}

// ── 私聊 (DM) ─────────────────────────────────────────────
const openDms = {}; // { dm_room: { otherUsername, otherScreenname } }

function getDmRoom(u1, u2) {
  const sorted = [u1, u2].sort();
  return `dm:${sorted[0]}:${sorted[1]}`;
}

function getDmOtherUser(dmRoom) {
  if (!currentUser) return '';
  const parts = dmRoom.split(':');
  return parts[1] === currentUser.username ? parts[2] : parts[1];
}

function addDmToList(dmRoom, otherUsername, otherScreenname, avatarExpr, avatarColor) {
  if (document.getElementById('dm-item-' + otherUsername)) return;
  openDms[dmRoom] = { otherUsername, otherScreenname };
  if (avatarExpr || avatarColor) {
    userAvatarCache[otherUsername] = { expression: avatarExpr || 'Smile', color: avatarColor || defaultAvatarColor(otherUsername) };
  }
  const list = document.getElementById('room-list');
  const div = document.createElement('div');
  div.className = 'room-item';
  div.id = 'dm-item-' + otherUsername;
  const av = getAvatarData(otherUsername);
  div.innerHTML = `<span class="room-icon">${avatarHTML(av.expression, av.color, 24)}</span><span class="room-name-label">${otherScreenname}</span>`;
  div.onclick = () => joinDm(dmRoom);
  list.appendChild(div);
}

function joinDm(dmRoom) {
  if (!currentUser) { openAuth(); return; }
  const otherUsername = getDmOtherUser(dmRoom);
  const info = openDms[dmRoom] || {};
  const otherScreenname = info.otherScreenname || otherUsername;

  currentRoom = dmRoom;
  clearUnread(dmRoom);
  currentIsDm = true;
  isAdmin = false; isOwner = false; isMod = false;
  localStorage.setItem('lastRoom', dmRoom);
  _pendingDmRoom = dmRoom;
  _loadingHistory.add(dmRoom);

  document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
  const dmEl = document.getElementById('dm-item-' + otherUsername);
  if (dmEl) dmEl.classList.add('active');

  document.getElementById('messages').innerHTML = '';
  document.getElementById('voice-members-list').innerHTML = '';
  voiceBanned.clear();
  document.getElementById('no-room').style.display = 'none';
  document.getElementById('chat-main').style.display = 'flex';
  document.getElementById('chat-main').style.flexDirection = 'column';
  if (!_mobileAutoJoin) mobileShowChat(true);

  // 设置 DM 标题
  const titleEl = document.getElementById('chat-title');
  if (titleEl) {
    const av = getAvatarData(otherUsername);
    titleEl.innerHTML = `<span class="room-icon" style="margin-right:4px">${avatarHTML(av.expression, av.color, 18)}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${otherScreenname}</span>`;
    titleEl.title = '';
    titleEl.onclick = null; // DM 不显示房间卡片
  }
  const mt = document.getElementById('mobile-room-title');
  if (mt) { mt.innerHTML = titleEl ? titleEl.innerHTML : otherScreenname; mt.onclick = null; }

  // 隐藏成员列表（DM 不需要），语音区域保留
  document.getElementById('members-divider').style.display = 'none';
  document.getElementById('sidebar-members-title').style.display = 'none';
  document.getElementById('member-list').innerHTML = '';

  // 显示缓存消息
  (roomMessages[dmRoom] || []).forEach(msg => appendMessage(msg, false));
  const since = roomLastTs[dmRoom] || null;
  socket.emit('join_dm', { username: currentUser.username, dm_room: dmRoom, since });

  closeAllSidebars();
}

function openDm(username) {
  if (!currentUser) { openAuth(); return; }
  if (!username || username === currentUser.username) return;
  const screenname = document.getElementById('card-screenname')?.textContent || username;
  const av = getAvatarData(username);
  closeModal('member-card-modal');
  const dmRoom = getDmRoom(currentUser.username, username);
  addDmToList(dmRoom, username, screenname, av.expression, av.color);
  joinDm(dmRoom);
}

socket.on('dms_list', function(data) {
  data.dms.forEach(dm => {
    addDmToList(dm.dm_room, dm.other_username, dm.other_screenname, dm.avatar_expression, dm.avatar_color);
  });
  restoreRoomOrder();
  if (!currentUser) return;
  const last = localStorage.getItem('lastRoom');
  if (last && last.startsWith('dm:') && (!currentRoom || currentRoom === '大厅')) {
    const other = getDmOtherUser(last);
    _mobileAutoJoin = true;
    if (document.getElementById('dm-item-' + other)) joinDm(last);
    _mobileAutoJoin = false;
  }
});

socket.on('join_dm_result', function(data) {
  const dmRoom = _pendingDmRoom;
  _pendingDmRoom = null;
  if (dmRoom) _loadingHistory.delete(dmRoom);
});

socket.on('new_dm_notification', function(data) {
  if (!currentUser) return;
  const dmRoom = data.dm_room;
  const otherUsername = getDmOtherUser(dmRoom);
  if (!document.getElementById('dm-item-' + otherUsername)) {
    const av = getAvatarData(otherUsername);
    addDmToList(dmRoom, otherUsername, data.from_screenname || otherUsername, av.expression, av.color);
    // 订阅该 DM 房间以接收后续消息
    socket.emit('join_dm', { username: currentUser.username, dm_room: dmRoom, since: null });
  }
});

// ── 房间列表：加入Group图标 ──────────────────────────────
socket.on('save_avatar_result', function(data) {
  if (!data.success) return;
  currentUser.avatar_expression = data.expression;
  currentUser.avatar_color = data.color;
  localStorage.setItem('currentUser', JSON.stringify(currentUser));
  userAvatarCache[currentUser.username] = { expression: data.expression, color: data.color };
  updateSidebarAvatar();
  const s = document.getElementById('profile-success');
  if (s) s.textContent = '保存成功！';
});

