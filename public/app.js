// State Management
const appState = {
    user: null,
    coords: { lat: null, lng: null, accuracy: null },
    contacts: [],
    sirenActive: false,
    audioCtx: null,
    osc: null,
    gainNode: null,
    sirenTimer: null,
    strobeActive: false,
    strobeTimer: null,
    mediaRecorder: null,
    audioChunks: []
};

// Elements
const authContainer = document.getElementById('authContainer');
const dashboardContainer = document.getElementById('dashboardContainer');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegisterLink = document.getElementById('showRegisterLink');
const showLoginLink = document.getElementById('showLoginLink');

const navUserName = document.getElementById('navUserName');
const profileFullName = document.getElementById('profileFullName');
const profileProfession = document.getElementById('profileProfession');
const profileAge = document.getElementById('profileAge');

const gpsRadarDot = document.getElementById('gpsRadarDot');
const gpsStatusHeader = document.getElementById('gpsStatusHeader');
const gpsCoordinates = document.getElementById('gpsCoordinates');

const sosTriggerBtn = document.getElementById('sosTriggerBtn');
const shareLiveMapBtn = document.getElementById('shareLiveMapBtn');
const refreshGpsBtn = document.getElementById('refreshGpsBtn');

const guardianList = document.getElementById('guardianList');
const newContactInput = document.getElementById('newContactInput');
const saveContactBtn = document.getElementById('saveContactBtn');

const sirenBtn = document.getElementById('sirenBtn');
const strobeBtn = document.getElementById('strobeBtn');
const fakeCallBtn = document.getElementById('fakeCallBtn');
const audioRecorderBtn = document.getElementById('audioRecorderBtn');
const recordStatusLabel = document.getElementById('recordStatusLabel');

// 1. Authentication Handlers
showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        name: document.getElementById('regName').value.trim(),
        username: document.getElementById('regUsername').value.trim(),
        password: document.getElementById('regPassword').value,
        age: document.getElementById('regAge').value,
        profession: document.getElementById('regProfession').value.trim()
    };

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            setupUserSession(data.user);
        } else {
            alert(data.message || 'Registration failed.');
        }
    } catch (err) {
        alert('Could not reach backend server.');
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        username: document.getElementById('loginUsername').value.trim(),
        password: document.getElementById('loginPassword').value
    };

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
            setupUserSession(data.user);
        } else {
            alert(data.message || 'Invalid Credentials');
        }
    } catch (err) {
        alert('Could not reach backend server.');
    }
});

function setupUserSession(user) {
    appState.user = user;
    appState.contacts = user.contacts || [];
    localStorage.setItem('sahaay_session', JSON.stringify(user));

    // Update UI elements
    navUserName.textContent = user.name.split(' ')[0];
    profileFullName.textContent = user.name;
    profileProfession.textContent = user.profession || 'Not Specified';
    profileAge.textContent = user.age || 'N/A';

    authContainer.classList.add('hidden');
    dashboardContainer.classList.remove('hidden');

    renderContacts();
    startGpsTracker();
}

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('sahaay_session');
    location.reload();
});

// Check Session on Start
window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('sahaay_session');
    if (saved) {
        setupUserSession(JSON.parse(saved));
    }
});

// 2. High-Accuracy Geolocation Tracker
function startGpsTracker() {
    if (!('geolocation' in navigator)) {
        gpsStatusHeader.textContent = 'Geolocation Not Supported';
        return;
    }

    navigator.geolocation.watchPosition(
        (pos) => {
            appState.coords.lat = pos.coords.latitude.toFixed(6);
            appState.coords.lng = pos.coords.longitude.toFixed(6);
            appState.coords.accuracy = Math.round(pos.coords.accuracy);

            gpsRadarDot.classList.add('locked');
            gpsStatusHeader.textContent = `High-Precision GPS Locked (±${appState.coords.accuracy}m)`;
            gpsCoordinates.textContent = `Lat: ${appState.coords.lat} | Long: ${appState.coords.lng}`;
        },
        (err) => {
            gpsRadarDot.classList.remove('locked');
            gpsStatusHeader.textContent = 'GPS Permission Denied. Please Enable.';
            console.warn('GPS Error: ' + err.message);
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
}

refreshGpsBtn.addEventListener('click', startGpsTracker);

shareLiveMapBtn.addEventListener('click', () => {
    if (!appState.coords.lat) {
        alert('Coordinates are still calibrating.');
        return;
    }
    const mapUrl = `https://www.google.com/maps?q=${appState.coords.lat},${appState.coords.lng}`;
    navigator.clipboard.writeText(mapUrl);
    alert('Live Google Maps link copied to clipboard!');
});

// 3. Primary SOS Trigger (SMS / WhatsApp + Server Log)
sosTriggerBtn.addEventListener('click', async () => {
    if (!appState.coords.lat) {
        alert('Acquiring GPS location. Please allow location permissions and try again.');
        return;
    }

    const mapUrl = `https://www.google.com/maps?q=${appState.coords.lat},${appState.coords.lng}`;
    const sosMessage = `EMERGENCY ALERT from ${appState.user?.name || 'Sahaay User'}! I need immediate help. My current live location is: ${mapUrl}`;

    // 1. Dispatch Telemetry to Backend API
    try {
        fetch('/api/sos/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: appState.user?.username,
                latitude: appState.coords.lat,
                longitude: appState.coords.lng,
                accuracy: appState.coords.accuracy,
                contacts: appState.contacts
            })
        });
    } catch (e) {
        console.error('Failed to notify backend API:', e);
    }

    // 2. Multi-contact Native SMS or WhatsApp Blast
    if (appState.contacts.length > 0) {
        const numbers = appState.contacts.join(',');
        window.location.href = `sms:${numbers}?body=${encodeURIComponent(sosMessage)}`;
    } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(sosMessage)}`, '_blank');
    }
});

// 4. Guardian Contact Management & Direct Phone Call Button
function renderContacts() {
    guardianList.innerHTML = '';
    if (appState.contacts.length === 0) {
        guardianList.innerHTML = `<li style="font-size: 0.8rem; color: #64748b; padding: 6px 0;">No guardian numbers added yet.</li>`;
        return;
    }

    appState.contacts.forEach((phone, idx) => {
        const li = document.createElement('li');
        li.className = 'guardian-item';
        li.innerHTML = `
            <div>
                <span class="guardian-phone">+91 ${phone}</span>
            </div>
            <div class="guardian-actions">
                <a href="tel:+91${phone}" class="btn-call-direct" title="Make Phone Call">📞 Call</a>
                <button class="btn-delete-contact" onclick="deleteContact(${idx})">✕</button>
            </div>
        `;
        guardianList.appendChild(li);
    });
}

saveContactBtn.addEventListener('click', async () => {
    const num = newContactInput.value.trim();
    if (!/^\d{10}$/.test(num)) {
        alert('Please enter a valid 10-digit mobile number.');
        return;
    }

    if (appState.contacts.includes(num)) {
        alert('Number is already in your guardian list.');
        return;
    }

    appState.contacts.push(num);
    newContactInput.value = '';
    renderContacts();

    // Persist to Backend API
    if (appState.user) {
        await fetch('/api/user/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: appState.user.username,
                contacts: appState.contacts
            })
        });
    }
});

window.deleteContact = async (idx) => {
    appState.contacts.splice(idx, 1);
    renderContacts();
    if (appState.user) {
        await fetch('/api/user/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: appState.user.username,
                contacts: appState.contacts
            })
        });
    }
};

// 5. Dual-Frequency Siren (Zero Audio Files Needed - Uses Web Audio API)
sirenBtn.addEventListener('click', () => {
    if (!appState.sirenActive) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        appState.audioCtx = new AudioCtx();
        appState.osc = appState.audioCtx.createOscillator();
        appState.gainNode = appState.audioCtx.createGain();

        appState.osc.type = 'sawtooth';
        appState.gainNode.gain.setValueAtTime(1.0, appState.audioCtx.currentTime);

        let toggle = false;
        appState.sirenTimer = setInterval(() => {
            if (!appState.osc) return;
            const freq = toggle ? 1000 : 750;
            appState.osc.frequency.setTargetAtTime(freq, appState.audioCtx.currentTime, 0.08);
            toggle = !toggle;
        }, 250);

        appState.osc.connect(appState.gainNode);
        appState.gainNode.connect(appState.audioCtx.destination);
        appState.osc.start();

        appState.sirenActive = true;
        sirenBtn.classList.add('active');
        sirenBtn.querySelector('strong').textContent = 'Stop Siren';
    } else {
        clearInterval(appState.sirenTimer);
        if (appState.osc) {
            appState.osc.stop();
            appState.osc.disconnect();
        }
        appState.sirenActive = false;
        sirenBtn.classList.remove('active');
        sirenBtn.querySelector('strong').textContent = 'Acoustic Siren';
    }
});

// 6. Visual Strobe Disorientation Light
strobeBtn.addEventListener('click', () => {
    const strobe = document.getElementById('strobeOverlay');
    if (!appState.strobeActive) {
        strobe.classList.remove('hidden');
        let white = true;
        appState.strobeTimer = setInterval(() => {
            strobe.style.backgroundColor = white ? '#ffffff' : '#ff0037';
            white = !white;
        }, 70);
        appState.strobeActive = true;
        strobeBtn.querySelector('strong').textContent = 'Stop Strobe';
    } else {
        clearInterval(appState.strobeTimer);
        strobe.classList.add('hidden');
        appState.strobeActive = false;
        strobeBtn.querySelector('strong').textContent = 'Disorient Strobe';
    }
});

// 7. Simulated Incoming Call
fakeCallBtn.addEventListener('click', () => {
    fakeCallBtn.querySelector('small').textContent = 'Calling in 10s...';
    setTimeout(() => {
        const modal = document.getElementById('fakeCallModal');
        modal.classList.remove('hidden');

        document.getElementById('declineCallBtn').onclick = () => {
            modal.classList.add('hidden');
            fakeCallBtn.querySelector('small').textContent = 'Ring in 10 Seconds';
        };

        document.getElementById('acceptCallBtn').onclick = () => {
            document.getElementById('fakeCallStateText').textContent = '00:04 | Audio Connected';
            alert('Call Connected: "Beta, I am just 100 meters away near the main turn, stay right there."');
            modal.classList.add('hidden');
            fakeCallBtn.querySelector('small').textContent = 'Ring in 10 Seconds';
        };
    }, 10000);
});

// 8. Evidence Microphone Recording
audioRecorderBtn.addEventListener('click', async () => {
    if (!appState.mediaRecorder || appState.mediaRecorder.state === 'inactive') {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            appState.mediaRecorder = new MediaRecorder(stream);
            appState.audioChunks = [];

            appState.mediaRecorder.ondataavailable = (e) => appState.audioChunks.push(e.data);
            appState.mediaRecorder.onstop = () => {
                const blob = new Blob(appState.audioChunks, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(blob);
                const container = document.getElementById('audioPlaybackBox');

                container.innerHTML = `
                    <audio controls src="${audioUrl}" style="width: 100%; margin-top: 8px;"></audio>
                    <a href="${audioUrl}" download="sahaay_evidence_${Date.now()}.webm" 
                       style="color: #38bdf8; display: inline-block; margin-top: 8px; font-size: 0.85rem; font-weight: 600;">
                       ⬇️ Download Evidence Audio
                    </a>
                `;
                document.getElementById('audioLogCard').classList.remove('hidden');
            };

            appState.mediaRecorder.start();
            recordStatusLabel.textContent = 'RECORDING ACTIVE...';
            recordStatusLabel.style.color = '#ff334b';
        } catch (err) {
            alert('Microphone permission required for capturing legal evidence.');
        }
    } else {
        appState.mediaRecorder.stop();
        recordStatusLabel.textContent = 'Secret Microphone Log';
        recordStatusLabel.style.color = '';
    }
});

// 9. Camouflage Calculator Decoy
let calcExpr = '';
document.getElementById('decoyToggleBtn').addEventListener('click', () => {
    document.getElementById('decoyCalcModal').classList.remove('hidden');
});

window.calcDigit = (d) => {
    calcExpr += d;
    document.getElementById('calcDisplay').innerText = calcExpr;
};

window.calcOp = (op) => {
    if (op === 'C') calcExpr = '';
    else calcExpr += op;
    document.getElementById('calcDisplay').innerText = calcExpr || '0';
};

window.calcEvaluate = () => {
    try {
        calcExpr = String(eval(calcExpr));
        document.getElementById('calcDisplay').innerText = calcExpr;
    } catch {
        document.getElementById('calcDisplay').innerText = '0';
        calcExpr = '';
    }
};

window.exitDecoy = () => {
    document.getElementById('decoyCalcModal').classList.add('hidden');
};