const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Database File Helpers
function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initialData = { users: [], incidents: [] };
            fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
            return initialData;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data || '{"users":[],"incidents":[]}');
    } catch (err) {
        console.error('Error reading database.json:', err);
        return { users: [], incidents: [] };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error writing to database.json:', err);
    }
}

// ---------------- REST API ENDPOINTS ----------------

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'active', platform: 'Sahaay Security Core' });
});

// 1. User Registration
app.post('/api/auth/register', (req, res) => {
    try {
        const { name, username, password, age, profession } = req.body;
        if (!name || !username || !password) {
            return res.status(400).json({ success: false, message: 'Name, username, and password are required.' });
        }

        const db = readDB();
        const cleanUser = username.trim().toLowerCase();
        const existing = db.users.find(u => u.username.toLowerCase() === cleanUser);

        if (existing) {
            return res.status(409).json({ success: false, message: 'Username is already taken. Please choose another.' });
        }

        const newUser = {
            id: 'USR-' + Date.now(),
            name: name.trim(),
            username: cleanUser,
            password: password,
            age: age || 'Not Specified',
            profession: profession ? profession.trim() : 'Student',
            contacts: [],
            recordings: [],
            createdAt: new Date().toISOString()
        };

        db.users.push(newUser);
        writeDB(db);

        const { password: _, ...safeUser } = newUser;
        return res.status(201).json({ success: true, user: safeUser });
    } catch (err) {
        console.error('Register error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// 2. User Login
app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Enter both username and password.' });
        }

        const db = readDB();
        const cleanUser = username.trim().toLowerCase();
        const user = db.users.find(u => u.username.toLowerCase() === cleanUser && u.password === password);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }

        const { password: _, ...safeUser } = user;
        return res.status(200).json({ success: true, user: safeUser });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});
// Sync and Save User Contacts to Cloud Database
app.post('/api/user/contacts', (req, res) => {
    try {
        const { username, contacts } = req.body;
        if (!username) {
            return res.status(400).json({ success: false, message: 'Username is required.' });
        }

        const db = readDB();
        const userIdx = db.users.findIndex(u => u.username.toLowerCase() === username.trim().toLowerCase());

        if (userIdx === -1) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Save contacts to server database
        db.users[userIdx].contacts = contacts || [];
        writeDB(db);

        console.log(`[CONTACTS UPDATED] User: ${username} | Saved Contacts: ${db.users[userIdx].contacts.length}`);
        return res.status(200).json({ 
            success: true, 
            contacts: db.users[userIdx].contacts,
            user: db.users[userIdx]
        });
    } catch (err) {
        console.error('Error saving contacts:', err);
        return res.status(500).json({ success: false, message: 'Error saving contacts.' });
    }
});

// Fetch latest profile & contacts (for cross-device synchronization)
app.get('/api/user/profile/:username', (req, res) => {
    try {
        const db = readDB();
        const user = db.users.find(u => u.username.toLowerCase() === req.params.username.trim().toLowerCase());
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const { password: _, ...safeUser } = user;
        return res.status(200).json({ success: true, user: safeUser });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error fetching profile.' });
    }
});

// 4. Save Audio Evidence Recording
app.post('/api/user/recordings', (req, res) => {
    try {
        const { username, recording } = req.body;
        const db = readDB();
        const userIdx = db.users.findIndex(u => u.username.toLowerCase() === (username || '').toLowerCase());

        if (userIdx === -1) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (!db.users[userIdx].recordings) {
            db.users[userIdx].recordings = [];
        }

        db.users[userIdx].recordings.unshift(recording);
        writeDB(db);
        return res.status(200).json({ success: true, recordings: db.users[userIdx].recordings });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error saving audio evidence.' });
    }
});

// 5. Delete Audio Evidence Recording
app.delete('/api/user/recordings', (req, res) => {
    try {
        const { username, recordingId } = req.body;
        const db = readDB();
        const userIdx = db.users.findIndex(u => u.username.toLowerCase() === (username || '').toLowerCase());

        if (userIdx === -1) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        if (db.users[userIdx].recordings) {
            db.users[userIdx].recordings = db.users[userIdx].recordings.filter(r => r.id !== recordingId);
            writeDB(db);
        }

        return res.status(200).json({ success: true, recordings: db.users[userIdx].recordings || [] });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error deleting recording.' });
    }
});

// 6. SOS Telemetry Dispatch
app.post('/api/sos/broadcast', (req, res) => {
    try {
        const { userDetails, coordinates, timestamp } = req.body;
        const db = readDB();

        const incidentRecord = {
            incidentId: 'INC-' + Date.now(),
            user: userDetails || {},
            coordinates: coordinates || {},
            mapsUrl: `https://www.google.com/maps?q=${coordinates?.latitude},${coordinates?.longitude}`,
            timestamp: timestamp || new Date().toISOString()
        };

        db.incidents.unshift(incidentRecord);
        writeDB(db);

        console.log(`[ALERT DISPATCHED] User: ${incidentRecord.user?.name} | Lat: ${coordinates?.latitude}, Lng: ${coordinates?.longitude}`);
        return res.status(201).json({ success: true, incident: incidentRecord });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Dispatch log failed.' });
    }
});

// 7. Admin Incident Telemetry View
app.get('/api/admin/incidents', (req, res) => {
    const db = readDB();
    res.status(200).json({ total: db.incidents.length, incidents: db.incidents });
});

// SPA Route Catch-All
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(` Sahaay Safety Portal v2.5 Live`);
    console.log(` Server running on http://localhost:${PORT}`);
    console.log(`===============================================`);
});