export type Lang = 'zh' | 'en';

const zh = {
  // Auth
  'login': '登录',
  'register': '注册',
  'ph-username': '用户名',
  'ph-screenname': '显示名',
  'ph-password': '密码',
  'err-fill-user-pass': '请填写用户名和密码',
  'err-fill-required': '请填写必填项',
  'register-success': '注册成功',
  'please-login': '请登录',

  // Rooms
  'rooms': '聊天室',
  'create-room': '创建房间',
  'ph-room-name': '房间名',
  'ph-room-password': '密码（可选）',
  'err-room-name-required': '请输入房间名',
  'err-create-failed': '创建失败',

  // Chat
  'ph-message': '输入消息...',
  'edit-message': '编辑消息',
  'msg-recalled': '此消息已撤回',
  'msg-edited': '(已编辑)',
  'edit': '编辑',
  'recall': '撤回',
  'invite-code': '邀请码',
  'members': '成员',
  'people-unit': '人',
  'close': '关闭',
  'leave-room': '退出房间',
  'cancel': '取消',
  'save': '保存',
  'saving': '保存中…',

  // Voice
  'voice-chat': '语音聊天',
  'join-voice': '🎤 加入语音',
  'leave-voice': '离开语音',
  'voice-not-supported': '不支持',
  'voice-not-supported-msg': '当前环境不支持语音，请使用原生应用',
  'voice-join-failed': '无法加入语音',
  'voice-mic-error': '麦克风访问失败',
  'voice-stream-error': '无法获取音频流',
  'voice-banned-title': '已被禁言',
  'voice-banned-msg': '管理员已将你从语音中移除',
  'share-audio': '🖥 共享音频',
  'stop-sharing': '⏹ 停止共享',
  'live-stream': '📺 直播',
  'stop-live': '⏹ 停止直播',

  // Members panel
  'online': '在线',
  'offline': '离线',
  'owner': '房主',
  'admin': '管理员',

  // Profile
  'my-profile': '我的资料',
  'display-name': '显示名',
  'bio-label': '简介',
  'ph-bio': '个人简介（可选）',
  'no-bio': '还没有简介',
  'edit-profile': '编辑资料',
  'logout': '登出',
  'select-emoji': '选择表情',
  'select-color': '选择颜色',
  'err-name-required': '显示名不能为空',
  'err-save-failed': '保存失败',

  // Desktop shell
  'select-room': '选择一个房间开始聊天',
  'settings': '设置',
  'tab-general': '通用',
  'tab-audio': '音频',
  'settings-mic-label': '麦克风',
  'settings-speaker-label': '扬声器',
  'dark-mode': '夜晚模式',
  'audio-managed': '音频设备由系统管理',

  // Emoji picker
  'emoji-search': '搜索表情…',
  'emoji-no-result': '无结果',
  'emoji-group-0': '😀 表情',
  'emoji-group-1': '🧑 人物',
  'emoji-group-2': '🐶 动物',
  'emoji-group-3': '🍎 食物',
  'emoji-group-4': '✈️ 旅行',
  'emoji-group-5': '🎉 活动',
  'emoji-group-6': '💡 物品',
  'emoji-group-7': '💯 符号',
  'emoji-group-8': '🏳️ 旗帜',

  // DM
  'direct-messages': '私信',
  'send-dm': '私信',
  'invite-to-room': '邀请加入',
  'no-dms': '暂无私信',

  // Password
  'forgot-password': '忘记密码？',
  'security-question': '安全问题',
  'ph-security-answer': '安全问题答案',
  'ph-new-password': '新密码',
  'reset-password': '重置密码',
  'change-password': '修改密码',
  'ph-old-password': '当前密码',
  'err-wrong-answer': '答案不正确',
  'err-reset-failed': '重置失败',
  'password-changed': '密码已修改',
  'err-change-failed': '修改失败',
  'ph-confirm-password': '确认新密码',
  'err-password-mismatch': '两次密码不一致',

  // Account deletion
  'delete-account': '删除账号',
  'confirm-delete-title': '确认删除账号',
  'confirm-delete-msg': '此操作不可撤销，你的账号和所有数据将永久删除。请输入密码确认。',
  'account-deleted': '账号已删除',

  // Block / report
  'block': '屏蔽',
  'unblock': '取消屏蔽',
  'report': '举报',
  'report-reason': '举报原因（可选）',
  'report-sent': '举报已提交',
  'blocked-label': '已屏蔽',

  // Privacy
  'privacy-policy': '隐私政策',

  // Kicked / muted
  'kicked-title': '被踢出房间',
  'kicked-msg': '管理员将你踢出了该房间',
  'you-are-muted': '你已被禁言',

  // Admin controls
  'kick-member': '踢出成员',
  'set-as-admin': '设为管理员',
  'remove-admin': '取消管理员',
  'ban-voice': '禁言',
  'unban-voice': '解除禁言',
  'confirm-kick': '确定踢出该成员吗？',
  'confirm-kick-title': '踢出成员',
  'ok': '确定',

  // Push notifications
  'new-message': '新消息',

  // Find room / password
  'find-room': '搜索房间',
  'ph-find-code': '输入6位房间号',
  'enter-room-pw': '输入房间密码',
  'room-code': '房间号',
  'err-find-failed': '搜索失败',
  'wrong-password': '密码错误',
  'remember-password': '记住密码',
  'set-room-pw': '🔒 添加密码',
  'remove-room-pw': '🔓 取消密码',
  'ph-set-room-pw': '输入新密码',
  'confirm-set-pw': '确认设置',
  'err-pw-required': '请输入密码',

  // Language name
  'lang-name': '中文',
  'language': '语言',
  // Room invite
  'room-invite-title': '房间邀请',
  'room-invite-msg': '邀请你加入',
  'join': '加入',
} as const;

const en: Record<keyof typeof zh, string> = {
  // Auth
  'login': 'Login',
  'register': 'Register',
  'ph-username': 'Username',
  'ph-screenname': 'Display name',
  'ph-password': 'Password',
  'err-fill-user-pass': 'Please enter username and password',
  'err-fill-required': 'Please fill in all required fields',
  'register-success': 'Registered successfully',
  'please-login': 'Please log in',

  // Rooms
  'rooms': 'Rooms',
  'create-room': 'Create Room',
  'ph-room-name': 'Room name',
  'ph-room-password': 'Password (optional)',
  'err-room-name-required': 'Please enter a room name',
  'err-create-failed': 'Failed to create',

  // Chat
  'ph-message': 'Type a message...',
  'edit-message': 'Edit Message',
  'msg-recalled': 'This message was recalled',
  'msg-edited': '(edited)',
  'edit': 'Edit',
  'recall': 'Recall',
  'invite-code': 'Invite Code',
  'members': 'Members',
  'people-unit': '',
  'close': 'Close',
  'leave-room': 'Leave Room',
  'cancel': 'Cancel',
  'save': 'Save',
  'saving': 'Saving…',

  // Voice
  'voice-chat': 'Voice Chat',
  'join-voice': '🎤 Join Voice',
  'leave-voice': 'Leave Voice',
  'voice-not-supported': 'Not Supported',
  'voice-not-supported-msg': 'Voice is not supported in this environment, please use the native app',
  'voice-join-failed': 'Failed to join voice',
  'voice-mic-error': 'Microphone access failed',
  'voice-stream-error': 'Failed to get audio stream',
  'voice-banned-title': 'Removed from Voice',
  'voice-banned-msg': 'An admin has removed you from voice',
  'share-audio': '🖥 Share Audio',
  'stop-sharing': '⏹ Stop Sharing',
  'live-stream': '📺 Live',
  'stop-live': '⏹ Stop Live',

  // Members panel
  'online': 'Online',
  'offline': 'Offline',
  'owner': 'Owner',
  'admin': 'Admin',

  // Profile
  'my-profile': 'My Profile',
  'display-name': 'Display Name',
  'bio-label': 'Bio',
  'ph-bio': 'Bio (optional)',
  'no-bio': 'No bio yet',
  'edit-profile': 'Edit Profile',
  'logout': 'Logout',
  'select-emoji': 'Select Emoji',
  'select-color': 'Select Color',
  'err-name-required': 'Display name is required',
  'err-save-failed': 'Failed to save',

  // Desktop shell
  'select-room': 'Select a room to start chatting',
  'settings': 'Settings',
  'tab-general': 'General',
  'tab-audio': 'Audio',
  'settings-mic-label': 'Microphone',
  'settings-speaker-label': 'Speaker',
  'dark-mode': 'Dark Mode',
  'audio-managed': 'Audio devices are managed by system',

  // Emoji picker
  'emoji-search': 'Search emoji…',
  'emoji-no-result': 'No results',
  'emoji-group-0': '😀 Smileys',
  'emoji-group-1': '🧑 People',
  'emoji-group-2': '🐶 Animals',
  'emoji-group-3': '🍎 Food',
  'emoji-group-4': '✈️ Travel',
  'emoji-group-5': '🎉 Activities',
  'emoji-group-6': '💡 Objects',
  'emoji-group-7': '💯 Symbols',
  'emoji-group-8': '🏳️ Flags',

  // DM
  'direct-messages': 'Direct Messages',
  'send-dm': 'Message',
  'invite-to-room': 'Invite',
  'no-dms': 'No direct messages',

  // Password
  'forgot-password': 'Forgot password?',
  'security-question': 'Security Question',
  'ph-security-answer': 'Security answer',
  'ph-new-password': 'New password',
  'reset-password': 'Reset Password',
  'change-password': 'Change Password',
  'ph-old-password': 'Current password',
  'err-wrong-answer': 'Incorrect answer',
  'err-reset-failed': 'Reset failed',
  'password-changed': 'Password changed',
  'err-change-failed': 'Failed to change password',
  'ph-confirm-password': 'Confirm new password',
  'err-password-mismatch': 'Passwords do not match',

  // Account deletion
  'delete-account': 'Delete Account',
  'confirm-delete-title': 'Delete Account',
  'confirm-delete-msg': 'This cannot be undone. Your account and all data will be permanently deleted. Enter your password to confirm.',
  'account-deleted': 'Account deleted',

  // Block / report
  'block': 'Block',
  'unblock': 'Unblock',
  'report': 'Report',
  'report-reason': 'Reason (optional)',
  'report-sent': 'Report submitted',
  'blocked-label': 'Blocked',

  // Privacy
  'privacy-policy': 'Privacy Policy',

  // Kicked / muted
  'kicked-title': 'Kicked from Room',
  'kicked-msg': 'An admin removed you from this room',
  'you-are-muted': 'You are muted',

  // Admin controls
  'kick-member': 'Kick Member',
  'set-as-admin': 'Set as Admin',
  'remove-admin': 'Remove Admin',
  'ban-voice': 'Mute (Voice)',
  'unban-voice': 'Unmute (Voice)',
  'confirm-kick': 'Are you sure you want to kick this member?',
  'confirm-kick-title': 'Kick Member',
  'ok': 'OK',

  // Push notifications
  'new-message': 'New Message',

  // Find room / password
  'find-room': 'Find Room',
  'ph-find-code': 'Enter 6-digit room code',
  'enter-room-pw': 'Enter room password',
  'room-code': 'Room Code',
  'err-find-failed': 'Search failed',
  'wrong-password': 'Wrong password',
  'remember-password': 'Remember password',
  'set-room-pw': '🔒 Set Password',
  'remove-room-pw': '🔓 Remove Password',
  'ph-set-room-pw': 'Enter new password',
  'confirm-set-pw': 'Confirm',
  'err-pw-required': 'Please enter a password',

  // Language name
  'lang-name': 'English',
  'language': 'Language',
  // Room invite
  'room-invite-title': 'Room Invite',
  'room-invite-msg': 'invited you to join',
  'join': 'Join',
};

const strings: Record<Lang, Record<keyof typeof zh, string>> = { zh, en };

export type I18nKey = keyof typeof zh;

export function t(lang: Lang, key: I18nKey): string {
  return strings[lang]?.[key] ?? strings.zh[key] ?? key;
}

export const EMOJI_CDN: Record<Lang, string> = {
  zh: 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1/zh/cldr-native/data.json',
  en: 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1/en/cldr/data.json',
};
