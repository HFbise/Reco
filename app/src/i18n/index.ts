// 直接从现有项目迁移过来的 i18n 系统
type LangKey = 'zh' | 'en';

const i18n: Record<LangKey, Record<string, string>> = {
  zh: {
    'login': '登录',
    'register': '注册',
    'logout': '登出',
    'send': '发送',
    'settings': '设置',
    'rooms': '聊天室',
    'members': '成员',
    'voice-join': '加入语音',
    'voice-leave': '离开语音',
    'no-room': '请先登录或注册',
    'msg-recalled': '此消息已撤回',
    'msg-edited': '已编辑',
  },
  en: {
    'login': 'Login',
    'register': 'Register',
    'logout': 'Logout',
    'send': 'Send',
    'settings': 'Settings',
    'rooms': 'Rooms',
    'members': 'Members',
    'voice-join': 'Join Voice',
    'voice-leave': 'Leave Voice',
    'no-room': 'Login or register to start',
    'msg-recalled': 'This message was recalled',
    'msg-edited': 'Edited',
  },
};

let currentLang: LangKey = 'zh';

export function setLang(lang: LangKey) { currentLang = lang; }
export function getLang() { return currentLang; }
export function t(key: string): string {
  return i18n[currentLang]?.[key] ?? i18n.zh[key] ?? key;
}
