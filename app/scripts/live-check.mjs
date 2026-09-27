// Post-deploy smoke check against the live server (read-only: never writes data).
// Usage: node scripts/live-check.mjs [https://your-deployment]
import { io } from 'socket.io-client';

const URL = process.argv[2] || 'https://chat-5wg8.onrender.com';
let failed = false;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed = true;
}

function once(socket, event, ms = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    socket.once(event, (data) => { clearTimeout(timer); resolve(data); });
  });
}

const health = await fetch(`${URL}/health`).then((r) => r.json()).catch(() => null);
check('health endpoint', health?.status === 'ok', JSON.stringify(health));

const anon = io(URL, { transports: ['websocket'], reconnection: false });
await once(anon, 'connect');
anon.emit('get_rooms', {});
check('anonymous request is rejected', (await once(anon, 'auth_required')) !== undefined);

anon.emit('guest_login', {});
const guest = await once(anon, 'guest_login_result');
check('guest demo login', guest?.success === true && guest.username?.startsWith('guest:'));

anon.emit('get_rooms', {});
const rooms = await once(anon, 'rooms_list');
const names = rooms?.rooms?.map((r) => r.name) ?? [];
check('guest sees only the demo room', names.length === 1 && names[0] === 'Reco Demo', JSON.stringify(names));

const history = [];
anon.on('message', (m) => history.push(m));
anon.emit('join', { room: 'Reco Demo' });
const joined = await once(anon, 'join_result');
check('guest can open the demo room', joined?.success === true);
check('demo history arrives', history.length > 3, `${history.length} messages`);

anon.emit('message', { room: 'Reco Demo', text: 'should be refused' });
check('guest write is refused', (await once(anon, 'guest_read_only')) !== undefined);

anon.emit('join', { room: '大厅' });
const lobby = await once(anon, 'join_result');
check('guest cannot open the real lobby', lobby?.code === 'guest_read_only');

anon.disconnect();
process.exit(failed ? 1 : 0);
