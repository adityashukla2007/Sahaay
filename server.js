const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Local JSON Database
function readDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initialData = { users: [], incidents: [] };
            fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data || '{"users":[],"incidents":[]}');
    } catch (err) {
        console.error('Error reading database file:', err);
        return { users: [], incidents: [] };
    }
}

function writeDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error writing to database:', err);
    }
}

// ---------------- API ROUTES ----------------

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'active', platform: 'Sahaay Security Core' });
});

// 1. User Registration
app.post('/api/auth/register', (req, res) => {
    const { name, username, password, age, profession } = req.body;

    if (!name || !username || !password) {
        return res.status(400).json({ success: false, message: 'All required fields must be filled.' });
    }

    const db = readDatabase();
    const existing = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (existing) {
        return res.status(409).json({ success: false, message: 'Username is already registered.' });
    }

    const newUser = {
        id: 'USR-' + Date.now(),
        name,
        username: username.toLowerCase(),
        password, // For academic demo. In production, use bcrypt hashing.
        age: age || 'N/A',
        profession: profession || 'Student',
        contacts: [],
        createdAt: new Date().toISOString()
    };

    db.users.push(newUser);
    writeDatabase(db);

    const { password: _, ...safeUser } = newUser;
    return res.status(201).json({ success: true, user: safeUser });
});

// 2. User Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    const db = readDatabase();
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

    if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const { password: _, ...safeUser } = user;
    return res.status(200).json({ success: true, user: safeUser });
});

// 3. Update User Contacts
app.post('/api/user/contacts', (req, res) => {
    const { username, contacts } = req.body;

    const db = readDatabase();
    const userIndex = db.users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());

    if (userIndex === -1) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }

    db.users[userIndex].contacts = contacts || [];
    writeDatabase(db);

    return res.status(200).json({ success: true, contacts: db.users[userIndex].contacts });
});

// 4. Trigger SOS & Broadcast Incident
app.post('/api/sos/broadcast', (req, res) => {
    const { username, latitude, longitude, accuracy, battery, contacts } = req.body;

    const incident = {
        incidentId: 'INC-' + Date.now(),
        username: username || 'Anonymous User',
        coordinates: { latitude, longitude, accuracy },
        mapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
        batteryLevel: battery || 'Unknown',
        alertedContacts: contacts || [],
        timestamp: new Date().toISOString()
    };

    const db = readDatabase();
    db.incidents.unshift(incident);
    writeDatabase(db);

    console.log(`[EMERGENCY INCIDENT] User: ${incident.username} | Lat: ${latitude} | Long: ${longitude}`);
    return res.status(201).json({ success: true, incident });
});

// 5. Admin Logs
app.get('/api/admin/incidents', (req, res) => {
    const db = readDatabase();
    res.status(200).json({ total: db.incidents.length, incidents: db.incidents });
});

// Fallback to Single Page App
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(` Sahaay Safety Portal v2.0 Live`);
    console.log(` Listening on: http://localhost:${PORT}`);
    console.log(`===============================================`);
});