const scriptEl = document.currentScript;
const scriptSrc = scriptEl ? scriptEl.src : '';
const urlParams = new URLSearchParams(new URL(scriptSrc).search);
const WORKER_URL = urlParams.get('worker');

// === Utility ===
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function stripEmojis(str){ return str.replace(/\p{Extended_Pictographic}/gu, ""); }

// === UI ===
const container = document.querySelector('#log.sl__chat__layout');

const style = document.createElement('style');
style.textContent = `
#queueList {
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding-right: 6px;
}
#queueList::-webkit-scrollbar { width: 0; height: 0; }
.queue-box-resize-handle {
  width: 14px; height: 14px;
  cursor: se-resize;
  position: absolute;
  right: 6px;
  bottom: 6px;
  background: #666;
  border-radius: 2px;
}
`;
document.head.appendChild(style);

const box = document.createElement('div');
Object.assign(box.style, {
  position: 'fixed',
  top: '20px',
  right: '20px',
  width: '250px',
  height: '300px',
  display: 'flex',
  flexDirection: 'column',
  background: '#222',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: '8px',
  zIndex: 9999,
  boxSizing: 'border-box',
  overflow: 'hidden',
  minWidth: '150px',
  minHeight: '150px'
});

const dragBar = document.createElement('div');
Object.assign(dragBar.style, {
  background: '#444',
  padding: '6px 8px',
  cursor: 'move',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  userSelect: 'none'
});
dragBar.innerHTML = `<span style="font-weight:bold;">Queue</span>`;
box.appendChild(dragBar);

const destroyBtn = document.createElement('button');
destroyBtn.textContent = '✖';
Object.assign(destroyBtn.style, { background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer' });
dragBar.appendChild(destroyBtn);

const list = document.createElement('ul');
list.id = 'queueList';
Object.assign(list.style, {
  listStyle: 'none',
  padding: '10px',
  margin: '0',
  overflowY: 'auto',
  flex: '1',
  marginBottom: '28px'
});
box.appendChild(list);

const resizeHandle = document.createElement('div');
resizeHandle.className = 'queue-box-resize-handle';
box.appendChild(resizeHandle);

document.body.appendChild(box);

// === Drag + Resize ===
let offsetX, offsetY, dragging = false;
let resizing = false, startWidth, startHeight, startX, startY;

dragBar.addEventListener('mousedown', e => {
  if (resizing) return;
  dragging = true;
  offsetX = e.clientX - box.offsetLeft;
  offsetY = e.clientY - box.offsetTop;
  e.preventDefault();
});

resizeHandle.addEventListener('mousedown', e => {
  resizing = true;
  dragging = false;
  startWidth = box.offsetWidth;
  startHeight = box.offsetHeight;
  startX = e.clientX;
  startY = e.clientY;
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (dragging) {
    box.style.left = (e.clientX - offsetX) + 'px';
    box.style.top = (e.clientY - offsetY) + 'px';
    box.style.right = 'auto';
  } else if (resizing) {
    const newWidth = startWidth + (e.clientX - startX);
    const newHeight = startHeight + (e.clientY - startY);
    if (newWidth > 150) box.style.width = newWidth + 'px';
    if (newHeight > 150) box.style.height = newHeight + 'px';
  }
});

document.addEventListener('mouseup', () => { dragging = false; resizing = false; });

// === State ===
const seenIDs = new Set();
const cooldowns = new Map();
let observer = null;

// === Sync with server ===
function syncToServer() {
  const lines = [...list.querySelectorAll('li')].map(li => li.dataset.raw);
  fetch(WORKER_URL, {
    method: "POST",
    body: lines.join("\n"),
    headers: { "Content-Type": "text/plain" }
  }).catch(()=>{});
}

// === Add item ===
function addItem(username, idText) {
  const cleanUser = stripEmojis(username);
  const cleanID = stripEmojis(idText);

  const li = document.createElement('li');
  li.dataset.raw = `${cleanUser}: ${cleanID}`;
  li.style.display = 'flex';
  li.style.justifyContent = 'space-between';
  li.style.alignItems = 'center';
  li.style.marginBottom = '6px';

  const label = document.createElement('span');
  label.innerHTML = `<strong>${escapeHtml(cleanUser)}:</strong> ${escapeHtml(cleanID)}`;
  li.appendChild(label);

  const controls = document.createElement('span');
  controls.innerHTML = `
    <button class="up">⬆</button>
    <button class="down">⬇</button>
    <button class="copy">📋</button>
    <button class="del">❌</button>`;
  li.appendChild(controls);
  list.appendChild(li);

  const up = controls.querySelector('.up');
  const down = controls.querySelector('.down');
  const copy = controls.querySelector('.copy');
  const del = controls.querySelector('.del');

  up.onclick = () => { li.previousElementSibling && list.insertBefore(li, li.previousElementSibling); syncToServer(); };
  down.onclick = () => { li.nextElementSibling && list.insertBefore(li.nextElementSibling, li); syncToServer(); };
  copy.onclick = () => navigator.clipboard.writeText(`${cleanID}`).catch(()=>{});
  del.onclick = () => { li.remove(); seenIDs.delete(cleanID); syncToServer(); };

  list.scrollTop = list.scrollHeight;
  syncToServer();
}

// === Bottom div check ===
// === Configurable prefixes ===
const PREFIXES = ["!id", "!rq", "!level", "!request" "/id", "/rq", "/level", "/request"];

// === Bottom div check ===
function checkBottomDiv() {
  if (!container) return;
  const divs = container.querySelectorAll('div');
  if (divs.length === 0) return;

  const bottomMost = divs[divs.length - 1];
  const nameSpan = bottomMost.querySelector('span.name');
  const messageSpan = bottomMost.querySelector('span.message');
  if (!messageSpan) return;

  const text = messageSpan.textContent.trim();
  const lower = text.toLowerCase();

  // find prefix match
  const prefix = PREFIXES.find(p => lower.startsWith(p.toLowerCase()));
  if (!prefix) return;

  // grab everything after prefix
  const remainder = text.slice(prefix.length).trim();

  // find the first all-numeric token
  const match = remainder.match(/\b\d+\b/);
  if (!match) return;

  const username = nameSpan ? nameSpan.textContent.trim() : 'Unknown';
  const idText = match[0]; // first number found

  if (seenIDs.has(idText)) return;

  const now = Date.now();
  const last = cooldowns.get(username) || 0;
  if (now - last < 5000) return;

  cooldowns.set(username, now);
  seenIDs.add(idText);
  addItem(username, idText);
}

// === Observe new chat messages ===
observer = new MutationObserver(() => checkBottomDiv());
if (container) observer.observe(container, { childList: true });

// === Destroy GUI ===
destroyBtn.addEventListener('click', () => {
  if (observer) observer.disconnect();
  box.remove();
  style.remove();
});

// === Load saved list on start ===
fetch(WORKER_URL)
  .then(r => r.text())
  .then(data => {
    data.split("\n").forEach(line => {
      if (!line.trim()) return;
      const [username, id] = line.split(":").map(s => s.trim());
      if (username && id) {
        seenIDs.add(id);
        addItem(username, id);
      }
    });
  }).catch(()=>{});




