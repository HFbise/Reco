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

  // Feedback
  'feedback-btn': '写反馈',
  'feedback-title': '写反馈',
  'feedback-ph': '告诉我们你的想法、遇到的问题或建议…',
  'feedback-submit': '提交',
  'feedback-sent': '感谢你的反馈！',

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
  'dm-blocked': '无法发送：你们之间有一方拉黑了对方',

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
  'close-dm': '关闭私信',
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

  // Server messages, system messages, security questions, misc
  'srv-invalid_username': '用户名需为 3-20 位小写字母、数字或下划线',
  'srv-username_taken': '用户名已存在',
  'srv-invalid_screenname': '显示名需为 1-{max} 个字符',
  'srv-password_too_short': '密码至少 {min} 位',
  'srv-too_many_attempts': '尝试过多，请 {secs} 秒后重试',
  'srv-user_not_found': '用户不存在',
  'srv-wrong_password': '密码错误',
  'srv-wrong_old_password': '当前密码错误',
  'srv-wrong_answer': '答案错误',
  'srv-missing_fields': '请填写必填项',
  'srv-invalid_profile': '显示名 1-{max_name} 字，简介最多 {max_bio} 字',
  'srv-invalid_room_name': '房间名需为 1-{max} 个字符',
  'srv-room_exists': '房间已存在',
  'srv-room_not_found': '房间不存在',
  'srv-kicked_from_room': '你已被踢出该房间',
  'srv-cannot_leave_lobby': '无法退出大厅',
  'srv-no_permission': '无权限',
  'srv-user_not_in_room': '该用户不在房间内',
  'srv-room_code_not_found': '找不到该房间号',
  'srv-cannot_invite': '无法邀请该用户',
  'srv-feedback_empty': '内容不能为空',
  'srv-feedback_too_long': '反馈不能超过 {max} 字',
  'srv-server_error': '服务器错误，请稍后再试',
  'srv-guest_read_only': '演示模式下不能这样做，注册后即可使用',
  'srv-invalid_mode': '无效的匹配模式',
  'demo-view': '先看看演示',
  'demo-banner': '这是只读演示。注册后即可聊天、创建房间和使用语音。',
  'guest-name': '访客',
  'load-older': '加载更早的消息',
  'nav-chats': '聊天',
  'nav-match': '匹配',
  'nav-me': '我的',
  'match-title': '随机匹配',
  'match-subtitle': '匿名和陌生人聊天，聊得来再交换身份。',
  'match-private-note': '对方看不到你的用户名和资料。',
  'match-text': '文字',
  'match-voice': '语音 + 文字',
  'match-tags-label': '兴趣标签（可选，最多 5 个）',
  'match-tags-count': '已选 {n}/{max}',
  'match-start': '开始匹配',
  'match-searching': '正在寻找……',
  'match-searching-tags': '正在寻找同样喜欢 {tags} 的人……',
  'match-widening': '暂时没有兴趣相同的人，正在扩大范围……',
  'stranger': '陌生人',
  'match-shared': '共同兴趣',
  'match-keep': '保持联系',
  'match-keep-waiting': '已发送，等对方也同意',
  'match-next': '下一个',
  'match-leave': '结束',
  'match-report': '举报',
  'match-report-confirm': '举报并屏蔽对方？这段对话会提交给管理员。',
  'match-typing': '对方正在输入……',
  'match-empty': '打个招呼吧 👋',
  'match-revealed': '你们已互相公开身份：{name}。可以在私信里继续聊。',
  'match-open-dm': '打开私信',
  'match-ended-partner': '对方已离开',
  'match-ended-you': '你已结束对话',
  'match-ended-reported': '已举报并屏蔽对方，谢谢你的反馈。',
  'match-again': '再找一个',
  'match-back': '返回',
  'match-voice-connecting': '正在连接语音……',
  'match-voice-connected': '语音已连接',
  'match-voice-unavailable': '语音匹配暂不可用',
  'match-voice-mic': '无法使用麦克风',
  'match-voice-failed': '语音连接失败',
  'match-mute': '静音',
  'match-unmute': '取消静音',
  'tagcat-chat': '聊天',
  'tagcat-entertainment': '娱乐',
  'tagcat-games': '游戏',
  'tagcat-sports': '运动',
  'tagcat-lifestyle': '生活',
  'tagcat-learning': '学习与职业',
  'tag-just_chat': '随便聊聊',
  'tag-make_friends': '交朋友',
  'tag-deep_talk': '深度聊天',
  'tag-advice': '求建议',
  'tag-late_night': '深夜聊天',
  'tag-language_exchange': '语言交换',
  'tag-memes': '梗图',
  'tag-music': '音乐',
  'tag-movies': '电影',
  'tag-tv_shows': '剧集',
  'tag-anime': '动漫',
  'tag-books': '读书',
  'tag-kpop': 'K-pop',
  'tag-podcasts': '播客',
  'tag-pc_games': 'PC 游戏',
  'tag-console_games': '主机游戏',
  'tag-mobile_games': '手游',
  'tag-esports': '电竞',
  'tag-minecraft': '我的世界',
  'tag-indie_games': '独立游戏',
  'tag-board_games': '桌游',
  'tag-fitness': '健身',
  'tag-basketball': '篮球',
  'tag-soccer': '足球',
  'tag-running': '跑步',
  'tag-hiking': '徒步',
  'tag-cycling': '骑行',
  'tag-swimming': '游泳',
  'tag-food': '美食',
  'tag-cooking': '做饭',
  'tag-travel': '旅行',
  'tag-pets': '宠物',
  'tag-photography': '摄影',
  'tag-fashion': '穿搭',
  'tag-coffee': '咖啡',
  'tag-programming': '编程',
  'tag-design': '设计',
  'tag-science': '科学',
  'tag-languages': '学语言',
  'tag-study_buddy': '一起学习',
  'tag-career': '职业发展',
  'tag-startups': '创业',
  'sys-user_joined': '{name} 加入了房间',
  'sys-user_left': '{name} 离开了房间',
  'sys-user_kicked': '{name} 被踢出了房间',
  'sys-admin_added': '{name} 成为了管理员',
  'sys-admin_removed': '{name} 被取消了管理员',
  'sys-room_closed': '房间已被关闭',
  'sys-match_connected': '你们通过随机匹配认识了，打个招呼吧',
  'secq-birth_city': '你的出生城市是？',
  'secq-primary_school': '你的小学名字是？',
  'secq-pet_name': '你最喜欢的宠物名字是？',
  'secq-mother_maiden_name': '你母亲的娘家姓是？',
  'secq-first_car': '你的第一辆车的品牌是？',
  'secq-favorite_teacher': '你最喜欢的老师叫什么？',
  'lobby': '大厅',
  'invite-text': '{name} 邀请你加入房间 {room}',
  'copy': '复制',
  'copied': '已复制',
  'switch': '切换',
  'switch-voice-title': '切换语音',
  'switch-voice-msg': '你当前在「{from}」语音中，切换到「{to}」？',
  'reconnected': '已重新连接',
  'reconnecting': '连接已断开，正在重连…',
  'stream-fullscreen': '全屏',
  'stream-pop-out': '弹出',
  'stream-pop-in': '归位',
  'stream-live': '{name} 正在直播',
  'stream-rewatch': '重新观看',
  'share-audio-missing': '未检测到共享音频，请勾选「共享系统音频」',
  'duration-1m': '1 分钟',
  'duration-5m': '5 分钟',
  'duration-10m': '10 分钟',
  'duration-30m': '30 分钟',
  'duration-1h': '1 小时',
  'duration-1d': '1 天',
  'duration-forever': '永久',
  'date-month-day': '{month}月{day}日',
} as const;

const en: Record<keyof typeof zh, string> = {
  // Auth
  'login': 'Log in',
  'register': 'Sign up',
  'ph-username': 'Username',
  'ph-screenname': 'Display name',
  'ph-password': 'Password',
  'err-fill-user-pass': 'Please enter username and password',
  'err-fill-required': 'Please fill in all required fields',
  'register-success': 'Account created',
  'please-login': 'Please log in',

  // Rooms
  'rooms': 'Rooms',
  'create-room': 'Create Room',
  'ph-room-name': 'Room name',
  'ph-room-password': 'Password (optional)',
  'err-room-name-required': 'Please enter a room name',
  'err-create-failed': "Couldn't create the room",

  // Chat
  'ph-message': 'Type a message...',
  'edit-message': 'Edit Message',
  'msg-recalled': 'This message was unsent',
  'msg-edited': '(edited)',
  'edit': 'Edit',
  'recall': 'Unsend',
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
  'logout': 'Log out',
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
  'audio-managed': 'Audio devices are managed by the system',

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

  // Feedback
  'feedback-btn': 'Feedback',
  'feedback-title': 'Write Feedback',
  'feedback-ph': 'Tell us your thoughts, issues, or suggestions…',
  'feedback-submit': 'Submit',
  'feedback-sent': 'Thanks for your feedback!',

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
  'kicked-title': 'Removed from room',
  'kicked-msg': 'An admin removed you from this room',
  'you-are-muted': 'You are muted',
  'dm-blocked': "Can't send: one of you has blocked the other",

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
  'close-dm': 'Close DM',
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

  // Server messages, system messages, security questions, misc
  'srv-invalid_username': 'Username must be 3-20 lowercase letters, digits or underscores',
  'srv-username_taken': 'That username is taken',
  'srv-invalid_screenname': 'Display name must be 1-{max} characters',
  'srv-password_too_short': 'Password must be at least {min} characters',
  'srv-too_many_attempts': 'Too many attempts. Try again in {secs}s',
  'srv-user_not_found': 'User not found',
  'srv-wrong_password': 'Wrong password',
  'srv-wrong_old_password': 'Current password is incorrect',
  'srv-wrong_answer': 'Incorrect answer',
  'srv-missing_fields': 'Please fill in all required fields',
  'srv-invalid_profile': 'Display name must be 1-{max_name} characters and bio at most {max_bio}',
  'srv-invalid_room_name': 'Room name must be 1-{max} characters',
  'srv-room_exists': 'A room with that name already exists',
  'srv-room_not_found': 'Room not found',
  'srv-kicked_from_room': 'You were removed from this room',
  'srv-cannot_leave_lobby': "You can't leave the lobby",
  'srv-no_permission': "You don't have permission to do that",
  'srv-user_not_in_room': "That user isn't in this room",
  'srv-room_code_not_found': 'No room with that code',
  'srv-cannot_invite': "You can't invite this user",
  'srv-feedback_empty': 'Feedback cannot be empty',
  'srv-feedback_too_long': 'Feedback must be at most {max} characters',
  'srv-server_error': 'Something went wrong. Please try again',
  'srv-guest_read_only': 'Sign up to do that. The demo is read-only.',
  'srv-invalid_mode': 'Unknown match mode',
  'demo-view': 'Take a look first',
  'demo-banner': "You're viewing a read-only demo. Sign up to chat, create rooms and use voice.",
  'guest-name': 'Guest',
  'load-older': 'Load earlier messages',
  'nav-chats': 'Chats',
  'nav-match': 'Match',
  'nav-me': 'Me',
  'match-title': 'Meet someone new',
  'match-subtitle': 'Chat anonymously with a stranger. Swap names only if you both want to.',
  'match-private-note': "They can't see your username or profile.",
  'match-text': 'Text',
  'match-voice': 'Voice + text',
  'match-tags-label': 'Interests (optional, up to 5)',
  'match-tags-count': '{n}/{max} selected',
  'match-start': 'Start',
  'match-searching': 'Looking for someone…',
  'match-searching-tags': 'Looking for someone into {tags}…',
  'match-widening': 'No one with the same interests yet. Widening the search…',
  'stranger': 'Stranger',
  'match-shared': 'You both like',
  'match-keep': 'Keep in touch',
  'match-keep-waiting': 'Waiting for them to agree',
  'match-next': 'Next',
  'match-leave': 'End',
  'match-report': 'Report',
  'match-report-confirm': 'Report and block this person? The conversation will be sent to moderators.',
  'match-typing': 'Stranger is typing…',
  'match-empty': 'Say hi 👋',
  'match-revealed': "You're now connected with {name}. Keep chatting in your DMs.",
  'match-open-dm': 'Open DM',
  'match-ended-partner': 'The stranger left',
  'match-ended-you': 'You ended the chat',
  'match-ended-reported': 'Reported and blocked. Thanks for letting us know.',
  'match-again': 'Find someone new',
  'match-back': 'Back',
  'match-voice-connecting': 'Connecting voice…',
  'match-voice-connected': 'Voice connected',
  'match-voice-unavailable': 'Voice matching is unavailable right now',
  'match-voice-mic': 'Microphone unavailable',
  'match-voice-failed': 'Voice connection failed',
  'match-mute': 'Mute',
  'match-unmute': 'Unmute',
  'tagcat-chat': 'Chat',
  'tagcat-entertainment': 'Entertainment',
  'tagcat-games': 'Games',
  'tagcat-sports': 'Sports',
  'tagcat-lifestyle': 'Lifestyle',
  'tagcat-learning': 'Learning & career',
  'tag-just_chat': 'Just chatting',
  'tag-make_friends': 'Making friends',
  'tag-deep_talk': 'Deep talks',
  'tag-advice': 'Advice',
  'tag-late_night': 'Late night',
  'tag-language_exchange': 'Language exchange',
  'tag-memes': 'Memes',
  'tag-music': 'Music',
  'tag-movies': 'Movies',
  'tag-tv_shows': 'TV shows',
  'tag-anime': 'Anime',
  'tag-books': 'Books',
  'tag-kpop': 'K-pop',
  'tag-podcasts': 'Podcasts',
  'tag-pc_games': 'PC games',
  'tag-console_games': 'Console games',
  'tag-mobile_games': 'Mobile games',
  'tag-esports': 'Esports',
  'tag-minecraft': 'Minecraft',
  'tag-indie_games': 'Indie games',
  'tag-board_games': 'Board games',
  'tag-fitness': 'Fitness',
  'tag-basketball': 'Basketball',
  'tag-soccer': 'Soccer',
  'tag-running': 'Running',
  'tag-hiking': 'Hiking',
  'tag-cycling': 'Cycling',
  'tag-swimming': 'Swimming',
  'tag-food': 'Food',
  'tag-cooking': 'Cooking',
  'tag-travel': 'Travel',
  'tag-pets': 'Pets',
  'tag-photography': 'Photography',
  'tag-fashion': 'Fashion',
  'tag-coffee': 'Coffee',
  'tag-programming': 'Programming',
  'tag-design': 'Design',
  'tag-science': 'Science',
  'tag-languages': 'Languages',
  'tag-study_buddy': 'Study buddy',
  'tag-career': 'Career',
  'tag-startups': 'Startups',
  'sys-user_joined': '{name} joined the room',
  'sys-user_left': '{name} left the room',
  'sys-user_kicked': '{name} was removed from the room',
  'sys-admin_added': '{name} is now an admin',
  'sys-admin_removed': '{name} is no longer an admin',
  'sys-room_closed': 'This room has been closed',
  'sys-match_connected': 'You met through Match. Say hi!',
  'secq-birth_city': 'What city were you born in?',
  'secq-primary_school': 'What was the name of your primary school?',
  'secq-pet_name': "What is your favorite pet's name?",
  'secq-mother_maiden_name': "What is your mother's maiden name?",
  'secq-first_car': 'What was the make of your first car?',
  'secq-favorite_teacher': 'What was the name of your favorite teacher?',
  'lobby': 'Lobby',
  'invite-text': '{name} invited you to join {room}',
  'copy': 'Copy',
  'copied': 'Copied',
  'switch': 'Switch',
  'switch-voice-title': 'Switch voice channel',
  'switch-voice-msg': "You're in voice in {from}. Switch to {to}?",
  'reconnected': 'Reconnected',
  'reconnecting': 'Connection lost. Reconnecting…',
  'stream-fullscreen': 'Fullscreen',
  'stream-pop-out': 'Pop out',
  'stream-pop-in': 'Dock',
  'stream-live': '{name} is live',
  'stream-rewatch': 'Watch again',
  'share-audio-missing': 'No audio was shared. Tick "Share system audio" and try again',
  'duration-1m': '1 minute',
  'duration-5m': '5 minutes',
  'duration-10m': '10 minutes',
  'duration-30m': '30 minutes',
  'duration-1h': '1 hour',
  'duration-1d': '1 day',
  'duration-forever': 'Permanently',
  'date-month-day': '{monthName} {day}',
};

const strings: Record<Lang, Record<keyof typeof zh, string>> = { zh, en };

export type I18nKey = keyof typeof zh;

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Params = Record<string, string | number>;

/** Translate `key`, filling `{placeholders}` from `params`. */
export function t(lang: Lang, key: I18nKey, params?: Params): string {
  const template: string = strings[lang][key] ?? strings.zh[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

export function hasKey(key: string): key is I18nKey {
  return key in zh;
}

/** Match interest tag id → label (unknown ids are shown as-is). */
export function tagLabel(lang: Lang, id: string): string {
  const key = `tag-${id}`;
  return hasKey(key) ? t(lang, key) : id;
}

/** Text for a failed server reply: its error `code` when known, else `fallback`. */
export function serverError(lang: Lang, data: { code?: string; params?: Params; msg?: string } | null | undefined,
                            fallback: I18nKey): string {
  const key = data?.code ? `srv-${data.code}` : '';
  if (hasKey(key)) return t(lang, key, data?.params);
  return data?.msg || t(lang, fallback);
}

/** A system message rendered in the reader's language (older messages only have Chinese text). */
export function systemMessage(lang: Lang, msg: { text: string; meta?: any }): string {
  const sys = msg.meta?.system;
  const key = sys?.code ? `sys-${sys.code}` : '';
  return hasKey(key) ? t(lang, key, sys.params) : msg.text;
}

/** Security questions are stored as ids; accounts from before that store the question text. */
export function securityQuestion(lang: Lang, idOrText: string): string {
  const key = `secq-${idOrText}`;
  return hasKey(key) ? t(lang, key) : idOrText;
}

export const LOBBY_ID = '大厅';

/** Display name for a room: the lobby's id is Chinese, so show it translated. */
export function roomLabel(lang: Lang, room: string): string {
  return room === LOBBY_ID ? t(lang, 'lobby') : room;
}

export function monthDay(lang: Lang, d: Date): string {
  return t(lang, 'date-month-day', { month: d.getMonth() + 1, monthName: MONTHS_EN[d.getMonth()], day: d.getDate() });
}

export const EMOJI_CDN: Record<Lang, string> = {
  zh: 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1/zh/cldr-native/data.json',
  en: 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1/en/cldr/data.json',
};
