/* ===================================
   MSD CLOCK - SCRIPT.JS
=================================== */

// --- Global Variables & Selectors ---
let clockFormat = '12';
let alarms = JSON.parse(localStorage.getItem('msd_alarms')) || [];
let reminders = JSON.parse(localStorage.getItem('msd_reminders')) || [];

// Speech Synthesis & Notification Loop
const synth = window.speechSynthesis;
let voices = [];
let activeNotificationInterval = null;
let isNotificationActive = false;

// Stopwatch Variables
let swStartTime = 0;
let swElapsedTime = 0;
let swInterval = null;
let isRunning = false;
let lapCounter = 1;

// --- Language Support ---
let currentLang = localStorage.getItem('msd_lang') || 'en';

// --- Translation Maps for Voice ---
const voiceTranslations = {
    'ml': {
        "o'clock": 'മണി',
        'AM': 'രാവിലെ',
        'PM': 'വൈകുന്നേരം',
        'Voice test successful. This is how I sound.': 'ശബ്ദ പരിശോധന വിജയകരം. ഞാൻ ഇങ്ങനെയാണ് സംസാരിക്കുന്നത്.',
        'It is': 'സമയം',
        'Reminder': 'ഓർമ്മപ്പെടുത്തൽ',
        'Drink Water': 'വെള്ളം കുടിക്കുക',
        'Meeting': 'മീറ്റിംഗ്',
        'Call': 'കോൾ',
        'Task': 'ജോലി',
        'Birthday': 'ജന്മദിനം'
    }
};

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    loadSettings();
    renderAlarms();
    renderReminders();
    initVoice();
    
    // Start main clock loop with 100ms interval for better precision
    setInterval(updateClock, 100);
    updateClock(); // Initial call
    
    // Load saved language
    currentLang = document.getElementById('langSelect').value;
    
    // Enable keyboard navigation for time inputs
    enableTimeInputKeyboardNav();
});

// --- Enable Keyboard Navigation for Time Inputs ---
function enableTimeInputKeyboardNav() {
    // For alarm time input
    const alarmTimeInput = document.getElementById('alarmTime');
    if (alarmTimeInput) {
        alarmTimeInput.addEventListener('keydown', handleAlarmTimeKeydown);
        alarmTimeInput.addEventListener('input', handleAlarmTimeInput);
        alarmTimeInput.addEventListener('blur', validateAlarmTime);
        alarmTimeInput.addEventListener('click', handleTimeInputClick);
        alarmTimeInput.addEventListener('focus', handleTimeInputFocus);
    }
    
    // For reminder datetime input
    const reminderTimeInput = document.getElementById('reminderTime');
    if (reminderTimeInput) {
        reminderTimeInput.addEventListener('keydown', handleDateTimeInputKeydown);
        reminderTimeInput.addEventListener('input', handleDateTimeInputChange);
    }
}

function handleTimeInputClick(e) {
    const input = e.target;
    const cursorPos = input.selectionStart;
    // If clicking on a colon, move to the next editable position
    if (input.value[cursorPos] === ':') {
        input.setSelectionRange(cursorPos + 1, cursorPos + 1);
    }
}

function handleTimeInputFocus(e) {
    const input = e.target;
    // Place cursor at the first editable position (HH)
    if (input.value.length === 0 || input.value === '') {
        input.setSelectionRange(0, 0);
    } else {
        // Find first digit position
        let pos = 0;
        while (pos < input.value.length && input.value[pos] === ':') {
            pos++;
        }
        input.setSelectionRange(pos, pos);
    }
}

function handleAlarmTimeKeydown(e) {
    const input = e.target;
    const cursorPos = input.selectionStart;
    const value = input.value;
    
    // Allow navigation keys
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
        e.key === 'Delete' || e.key === 'Backspace' || 
        e.key === 'Tab' || e.key === 'Home' || e.key === 'End') {
        return;
    }
    
    // Handle number input
    if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        insertAlarmDigitSmart(input, e.key, cursorPos);
    }
}

function insertAlarmDigitSmart(input, digit, cursorPos) {
    let value = input.value;
    let newValue = value;
    
    // Find the position to insert/replace
    let insertPos = cursorPos;
    
    // If cursor is on a colon, move to next position
    if (insertPos < value.length && value[insertPos] === ':') {
        insertPos++;
    }
    
    // If cursor is at the end, append
    if (insertPos >= value.length) {
        // Find the first : position to determine segment
        let colon1 = value.indexOf(':');
        let colon2 = value.indexOf(':', colon1 + 1);
        
        if (colon1 === -1) {
            // No colon yet, just append
            newValue = value + digit;
        } else if (colon2 === -1) {
            // Only first colon exists
            let parts = value.split(':');
            if (parts[0].length < 2) {
                newValue = parts[0] + digit + ':' + parts[1];
            } else {
                newValue = parts[0] + ':' + parts[1] + digit;
            }
        } else {
            // Both colons exist
            let parts = value.split(':');
            let segment = parts.length - 1;
            if (parts[segment].length < 2) {
                parts[segment] = parts[segment] + digit;
                newValue = parts.join(':');
            }
        }
    } else {
        // Replace at cursor position
        newValue = value.substring(0, insertPos) + digit + value.substring(insertPos + 1);
    }
    
    // Remove any invalid characters
    newValue = newValue.replace(/[^0-9:]/g, '');
    
    // Auto-add colons based on position
    if (newValue.length === 2 && !newValue.includes(':')) {
        newValue = newValue + ':';
    } else if (newValue.length === 5 && newValue.split(':').length === 2) {
        newValue = newValue + ':';
    }
    
    // Limit to 8 characters (HH:MM:SS)
    if (newValue.length > 8) {
        newValue = newValue.substring(0, 8);
    }
    
    // Validate the new value
    if (isValidTimePartial(newValue)) {
        input.value = newValue;
        
        // Calculate new cursor position
        let newPos = insertPos + 1;
        
        // Skip over colons automatically
        while (newPos < newValue.length && newValue[newPos] === ':') {
            newPos++;
        }
        
        // If we've completed a segment (2 digits), move to next segment
        let segmentLength = 0;
        let currentSegment = 0;
        for (let i = 0; i < newPos && i < newValue.length; i++) {
            if (newValue[i] === ':') {
                currentSegment++;
                segmentLength = 0;
            } else {
                segmentLength++;
                if (segmentLength >= 2 && i + 1 < newValue.length && newValue[i + 1] !== ':') {
                    // Completed a segment, move to next
                    newPos = i + 2;
                    while (newPos < newValue.length && newValue[newPos] === ':') {
                        newPos++;
                    }
                    break;
                }
            }
        }
        
        // Ensure we don't go past the end
        if (newPos > newValue.length) {
            newPos = newValue.length;
        }
        
        input.setSelectionRange(newPos, newPos);
    }
}

function isValidTimePartial(value) {
    // Check if value is a valid partial time
    const partialRegex = /^([0-9]?[0-9]?:?[0-9]?[0-9]?:?[0-9]?[0-9]?)$/;
    if (!partialRegex.test(value)) return false;
    
    // Remove colons for validation
    const clean = value.replace(/:/g, '');
    if (clean.length === 0) return true;
    
    // Check each segment
    const parts = value.split(':');
    if (parts.length > 3) return false;
    
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].length > 2) return false;
        if (parts[i].length === 0) continue;
        const num = parseInt(parts[i]);
        if (isNaN(num)) return false;
        
        if (i === 0 && (num < 0 || num > 23)) return false;
        if (i === 1 && (num < 0 || num > 59)) return false;
        if (i === 2 && (num < 0 || num > 59)) return false;
    }
    
    return true;
}

function handleAlarmTimeInput(e) {
    const input = e.target;
    let value = input.value.replace(/[^0-9:]/g, '');
    
    // Auto-format: HH:MM:SS
    if (value.length === 2 && !value.includes(':')) {
        value = value + ':';
    } else if (value.length === 5 && value.split(':').length === 2) {
        value = value + ':';
    }
    
    // Limit to 8 characters (HH:MM:SS)
    if (value.length > 8) {
        value = value.substring(0, 8);
    }
    
    input.value = value;
}

function validateAlarmTime(e) {
    const input = e.target;
    let value = input.value;
    
    // Check if time is in HH:MM:SS format
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    if (value && !timeRegex.test(value)) {
        // Try to auto-correct
        const parts = value.split(':');
        if (parts.length === 3) {
            let h = parseInt(parts[0]);
            let m = parseInt(parts[1]);
            let s = parseInt(parts[2]);
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && s >= 0 && s <= 59) {
                input.value = `${padZero(h)}:${padZero(m)}:${padZero(s)}`;
            }
        }
    }
}

function handleDateTimeInputKeydown(e) {
    const input = e.target;
    const cursorPos = input.selectionStart;
    const value = input.value;
    
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
        e.key === 'Delete' || e.key === 'Backspace' || 
        e.key === 'Tab' || e.key === 'Home' || e.key === 'End') {
        return;
    }
    
    if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        insertDateTimeDigitSmart(input, e.key, cursorPos);
    }
}

function insertDateTimeDigitSmart(input, digit, cursorPos) {
    let value = input.value;
    let insertPos = cursorPos;
    
    // Skip over separators
    while (insertPos < value.length && (value[insertPos] === '-' || value[insertPos] === ':' || value[insertPos] === 'T')) {
        insertPos++;
    }
    
    let newValue = value.substring(0, insertPos) + digit + value.substring(insertPos + 1);
    
    // Basic validation for datetime-local
    if (isValidDateTime(newValue)) {
        input.value = newValue;
        let newPos = insertPos + 1;
        
        // Skip over separators
        while (newPos < newValue.length && (newValue[newPos] === '-' || newValue[newPos] === ':' || newValue[newPos] === 'T')) {
            newPos++;
        }
        
        // Check if we completed a segment
        let segmentLength = 0;
        for (let i = 0; i < newPos && i < newValue.length; i++) {
            if (newValue[i] === '-' || newValue[i] === ':' || newValue[i] === 'T') {
                segmentLength = 0;
            } else {
                segmentLength++;
                // Segment lengths: year=4, month=2, day=2, hour=2, minute=2
                let maxLength = 4;
                if (i > 4) maxLength = 2;
                if (segmentLength >= maxLength && i + 1 < newValue.length && 
                    newValue[i + 1] !== '-' && newValue[i + 1] !== ':' && newValue[i + 1] !== 'T') {
                    newPos = i + 2;
                    while (newPos < newValue.length && (newValue[newPos] === '-' || newValue[newPos] === ':' || newValue[newPos] === 'T')) {
                        newPos++;
                    }
                    break;
                }
            }
        }
        
        if (newPos > newValue.length) newPos = newValue.length;
        input.setSelectionRange(newPos, newPos);
    }
}

function isValidDateTime(value) {
    // Accept partial datetime input
    const datetimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    if (datetimeRegex.test(value)) return true;
    
    // Allow partial input
    if (/^\d{0,4}$/.test(value) || /^\d{4}-\d{0,2}$/.test(value) || 
        /^\d{4}-\d{2}-\d{0,2}$/.test(value) || /^\d{4}-\d{2}-\d{2}T\d{0,2}$/.test(value) ||
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{0,2}$/.test(value)) {
        return true;
    }
    return false;
}

// --- Navigation ---
function initNavigation() {
    const tabs = document.querySelectorAll('.tab');
    const pages = document.querySelectorAll('.page');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            pages.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.page).classList.add('active');
        });
    });
}

// --- Main Clock & World Clocks ---
function updateClock() {
    const now = new Date();
    
    let hours = now.getHours();
    let minutes = padZero(now.getMinutes());
    let seconds = padZero(now.getSeconds());
    let ampm = hours >= 12 ? 'PM' : 'AM';

    if (clockFormat === '12') {
        hours = hours % 12 || 12; 
    } else {
        ampm = ''; 
    }

    document.getElementById('digitalClock').textContent = `${padZero(hours)}:${minutes}:${seconds}`;
    document.getElementById('ampm').textContent = ampm;

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('dateText').textContent = now.toLocaleDateString(undefined, options);

    drawAnalogClock(now.getHours(), now.getMinutes(), now.getSeconds());
    updateWorldClocks(now);

    // Check alarms and reminders every second for precise timing
    checkAlarms(now);
    checkReminders(now);
    
    // Check hourly announcement at minute 0 second 0
    if (now.getMinutes() === 0 && now.getSeconds() === 0) {
        checkHourlyAnnouncement(now);
    }
}

function padZero(num) {
    return num.toString().padStart(2, '0');
}

// Remove leading zero for voice (e.g., 05 -> 5)
function formatNumberForVoice(num) {
    return parseInt(num).toString();
}

// --- Format time for voice announcement ---
function formatTimeForVoice(hours, minutes, seconds) {
    let ampm = hours >= 12 ? 'PM' : 'AM';
    let hour12 = hours % 12 || 12;
    let hourStr = formatNumberForVoice(hour12);
    let minuteStr = formatNumberForVoice(minutes);
    
    // If seconds are 0, don't mention them
    if (seconds === 0) {
        if (minutes === 0) {
            return `${hourStr} o'clock ${ampm}`;
        } else {
            return `${hourStr} ${minuteStr} ${ampm}`;
        }
    } else {
        let secondStr = formatNumberForVoice(seconds);
        return `${hourStr} ${minuteStr} ${secondStr} ${ampm}`;
    }
}

function formatTimeForVoiceML(hours, minutes, seconds) {
    let ampm = hours >= 12 ? 'PM' : 'AM';
    let hour12 = hours % 12 || 12;
    let hourStr = formatNumberForVoice(hour12);
    let minuteStr = formatNumberForVoice(minutes);
    let ampmML = ampm === 'AM' ? 'രാവിലെ' : 'വൈകുന്നേരം';
    
    if (seconds === 0) {
        if (minutes === 0) {
            return `${hourStr} മണി ${ampmML}`;
        } else {
            return `${hourStr} ${minuteStr} ${ampmML}`;
        }
    } else {
        let secondStr = formatNumberForVoice(seconds);
        return `${hourStr} ${minuteStr} ${secondStr} ${ampmML}`;
    }
}

// --- Analog Clock Drawing with Numbers and Points ---
function drawAnalogClock(hour, minute, second) {
    const canvas = document.getElementById('analogClock');
    const ctx = canvas.getContext('2d');
    const radius = canvas.width / 2;
    const centerX = radius;
    const centerY = radius;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw clock face
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.95, '#f0f0f0');
    gradient.addColorStop(1, '#e0e0e0');
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 5, 0, 2 * Math.PI);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Inner circle decoration
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius - 15, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(44, 62, 80, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Draw hour numbers (1-12)
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let i = 1; i <= 12; i++) {
        const angle = (i * Math.PI / 6) - Math.PI / 2;
        const numRadius = radius - 28;
        const x = centerX + numRadius * Math.cos(angle);
        const y = centerY + numRadius * Math.sin(angle);
        ctx.fillText(i.toString(), x, y);
    }
    
    // Draw minute points (small circles)
    for (let i = 0; i < 60; i++) {
        const angle = (i * Math.PI / 30) - Math.PI / 2;
        const pointRadius = radius - 12;
        const x = centerX + pointRadius * Math.cos(angle);
        const y = centerY + pointRadius * Math.sin(angle);
        
        ctx.beginPath();
        if (i % 5 === 0) {
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fillStyle = '#2c3e50';
        } else {
            ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
            ctx.fillStyle = '#95a5a6';
        }
        ctx.fill();
    }
    
    // Draw hands with improved styling
    hour = hour % 12;
    let hourAngle = (hour * Math.PI / 6) + (minute * Math.PI / (6 * 60)) + (second * Math.PI / (360 * 60));
    
    // Hour hand - shorter and thicker
    drawHand(ctx, centerX, centerY, hourAngle, radius * 0.45, 8, '#1a1a2e');
    // Add shadow to hour hand
    drawHandWithShadow(ctx, centerX, centerY, hourAngle, radius * 0.45, 8, '#1a1a2e');
    
    // Minute hand - longer and medium thickness
    let minuteAngle = (minute * Math.PI / 30) + (second * Math.PI / (30 * 60));
    drawHand(ctx, centerX, centerY, minuteAngle, radius * 0.65, 5, '#2c3e50');
    drawHandWithShadow(ctx, centerX, centerY, minuteAngle, radius * 0.65, 5, '#2c3e50');
    
    // Second hand - thin and red with tail
    let secondAngle = (second * Math.PI / 30);
    drawSecondHand(ctx, centerX, centerY, secondAngle, radius * 0.75, 2, '#e74c3c');
    
    // Center dot with gradient
    const centerGradient = ctx.createRadialGradient(centerX - 2, centerY - 2, 0, centerX, centerY, 6);
    centerGradient.addColorStop(0, '#2c3e50');
    centerGradient.addColorStop(1, '#1a1a2e');
    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI);
    ctx.fillStyle = centerGradient;
    ctx.fill();
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function drawHand(ctx, x, y, pos, length, width, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pos);
    
    // Main hand
    ctx.beginPath();
    ctx.moveTo(-width/3, 0);
    ctx.lineTo(0, -length);
    ctx.lineTo(width/3, 0);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    
    // Glossy effect
    const glossGradient = ctx.createLinearGradient(0, -length, 0, 0);
    glossGradient.addColorStop(0, 'rgba(255,255,255,0.3)');
    glossGradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.moveTo(-width/6, 0);
    ctx.lineTo(0, -length * 0.8);
    ctx.lineTo(width/6, 0);
    ctx.closePath();
    ctx.fillStyle = glossGradient;
    ctx.fill();
    
    ctx.restore();
}

function drawHandWithShadow(ctx, x, y, pos, length, width, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pos);
    
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    ctx.beginPath();
    ctx.moveTo(-width/3, 0);
    ctx.lineTo(0, -length);
    ctx.lineTo(width/3, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    ctx.restore();
}

function drawSecondHand(ctx, x, y, pos, length, width, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pos);
    
    // Second hand with tail
    ctx.beginPath();
    ctx.moveTo(0, length * 0.15);
    ctx.lineTo(0, -length);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Red tip
    ctx.beginPath();
    ctx.arc(0, -length, 3, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    
    // Tail
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, length * 0.2);
    ctx.strokeStyle = 'rgba(231, 76, 60, 0.3)';
    ctx.lineWidth = width * 0.7;
    ctx.stroke();
    
    ctx.restore();
}

// --- World Clocks ---
function updateWorldClocks() {
    const getZonedTime = (zone) => {
        return new Date().toLocaleTimeString('en-US', { timeZone: zone, timeStyle: 'short', hour12: clockFormat === '12' });
    };

    document.getElementById('indiaTime').textContent = getZonedTime('Asia/Kolkata');
    document.getElementById('londonTime').textContent = getZonedTime('Europe/London');
    document.getElementById('newYorkTime').textContent = getZonedTime('America/New_York');
    document.getElementById('tokyoTime').textContent = getZonedTime('Asia/Tokyo');
    document.getElementById('dubaiTime').textContent = getZonedTime('Asia/Dubai');
}

// --- Central Notification Screen Logic ---
function triggerNotificationScreen(title, message) {
    // Don't trigger if notification is already active
    if (isNotificationActive) return;
    
    const modal = document.getElementById('notificationModal');
    const notifTitle = document.getElementById('notifTitle');
    const notifMessage = document.getElementById('notifMessage');
    
    // Display notification with title and message
    notifTitle.textContent = title;
    notifMessage.textContent = message;
    
    modal.style.display = 'flex';
    isNotificationActive = true;

    // Start continuous announcements - SPEAK ONLY THE MESSAGE CONTENT
    startContinuousAnnouncements(message, currentLang);
}

function startContinuousAnnouncements(text, lang = currentLang) {
    // Clear any existing interval
    if (activeNotificationInterval) {
        clearInterval(activeNotificationInterval);
        activeNotificationInterval = null;
    }
    
    // Function to speak and then schedule next
    function speakAndSchedule() {
        if (!isNotificationActive) {
            if (activeNotificationInterval) {
                clearInterval(activeNotificationInterval);
                activeNotificationInterval = null;
            }
            return;
        }
        
        // Speak only the message content, not the title
        speakText(text, lang, () => {
            if (isNotificationActive) {
                if (activeNotificationInterval) {
                    clearInterval(activeNotificationInterval);
                    activeNotificationInterval = null;
                }
                activeNotificationInterval = setTimeout(() => {
                    speakAndSchedule();
                }, 1000);
            }
        });
    }
    
    speakAndSchedule();
}

document.getElementById('dismissNotifBtn').addEventListener('click', () => {
    document.getElementById('notificationModal').style.display = 'none';
    isNotificationActive = false;
    
    if (activeNotificationInterval) {
        clearInterval(activeNotificationInterval);
        activeNotificationInterval = null;
    }
    
    if (synth.speaking) {
        synth.cancel();
    }
});

// --- Alarms with Edit Functionality ---
let editingAlarmId = null;

document.getElementById('addAlarm').addEventListener('click', () => {
    const timeVal = document.getElementById('alarmTime').value;
    if (!timeVal) {
        alert('Please enter a valid time in HH:MM:SS format');
        return;
    }
    
    // Validate time format
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
    if (!timeRegex.test(timeVal)) {
        alert('Please enter time in HH:MM:SS format (e.g., 14:30:00)');
        return;
    }

    const editingId = document.getElementById('editingAlarmId').value;
    
    if (editingId) {
        const index = alarms.findIndex(a => a.id === parseInt(editingId));
        if (index !== -1) {
            alarms[index].time = timeVal;
            saveAndRenderAlarms();
            cancelAlarmEdit();
        }
    } else {
        alarms.push({ id: Date.now(), time: timeVal });
        saveAndRenderAlarms();
        document.getElementById('alarmTime').value = '';
    }
});

function cancelAlarmEdit() {
    editingAlarmId = null;
    document.getElementById('editingAlarmId').value = '';
    document.getElementById('alarmFormTitle').textContent = 'Set New Alarm';
    document.getElementById('addAlarm').textContent = 'Add Alarm';
    document.getElementById('cancelEditAlarm').style.display = 'none';
    document.getElementById('alarmTime').value = '';
}

document.getElementById('cancelEditAlarm').addEventListener('click', cancelAlarmEdit);

function editAlarm(id) {
    const alarm = alarms.find(a => a.id === id);
    if (!alarm) return;
    
    editingAlarmId = id;
    document.getElementById('editingAlarmId').value = id;
    document.getElementById('alarmFormTitle').textContent = 'Edit Alarm';
    document.getElementById('addAlarm').textContent = 'Update Alarm';
    document.getElementById('cancelEditAlarm').style.display = 'block';
    document.getElementById('alarmTime').value = alarm.time;
    
    document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
}

function saveAndRenderAlarms() {
    localStorage.setItem('msd_alarms', JSON.stringify(alarms));
    renderAlarms();
}

function renderAlarms() {
    const list = document.getElementById('alarmList');
    list.innerHTML = '';
    
    if (alarms.length === 0) {
        list.innerHTML = 'No alarms added.';
        return;
    }

    alarms.forEach(alarm => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <span>⏰ ${alarm.time}</span>
            <div>
                <button onclick="editAlarm(${alarm.id})" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; margin-right: 8px; padding: 8px 12px;">✏️ Edit</button>
                <button onclick="deleteAlarm(${alarm.id})" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 8px 12px;">Remove</button>
            </div>
        `;
        list.appendChild(div);
    });
}

window.deleteAlarm = (id) => {
    if (editingAlarmId === id) {
        cancelAlarmEdit();
    }
    alarms = alarms.filter(a => a.id !== id);
    saveAndRenderAlarms();
};

function checkAlarms(now) {
    const currentHours = padZero(now.getHours());
    const currentMinutes = padZero(now.getMinutes());
    const currentSeconds = padZero(now.getSeconds());
    const currentTime = `${currentHours}:${currentMinutes}:${currentSeconds}`;
    
    alarms.forEach(alarm => {
        if (alarm.time === currentTime && !isNotificationActive) {
            let hours = now.getHours();
            let minutes = now.getMinutes();
            let seconds = now.getSeconds();
            
            let displayTitle = '⏰ Alarm';
            let displayMessage = `It is ${formatTimeForVoice(hours, minutes, seconds)}`;
            let voiceContent = formatTimeForVoice(hours, minutes, seconds);
            
            if (currentLang === 'ml') {
                displayTitle = '⏰ അലാറം';
                displayMessage = `സമയം ${formatTimeForVoiceML(hours, minutes, seconds)}`;
                voiceContent = formatTimeForVoiceML(hours, minutes, seconds);
            }
            
            triggerNotificationWithVoice(displayTitle, displayMessage, voiceContent);
        }
    });
}

// --- Reminders with Edit Functionality ---
let editingReminderId = null;

document.getElementById('addReminder').addEventListener('click', () => {
    const title = document.getElementById('reminderTitle').value;
    const timeVal = document.getElementById('reminderTime').value;
    
    if (!title || !timeVal) return;

    const editingId = document.getElementById('editingReminderId').value;
    
    if (editingId) {
        const index = reminders.findIndex(r => r.id === parseInt(editingId));
        if (index !== -1) {
            reminders[index].title = title;
            reminders[index].time = timeVal;
            saveAndRenderReminders();
            cancelReminderEdit();
        }
    } else {
        reminders.push({ id: Date.now(), title, time: timeVal });
        document.getElementById('reminderTitle').value = '';
        document.getElementById('reminderTime').value = '';
        saveAndRenderReminders();
    }
});

function cancelReminderEdit() {
    editingReminderId = null;
    document.getElementById('editingReminderId').value = '';
    document.getElementById('reminderFormTitle').textContent = 'Create Reminder';
    document.getElementById('addReminder').textContent = 'Add Reminder';
    document.getElementById('cancelEditReminder').style.display = 'none';
    document.getElementById('reminderTitle').value = '';
    document.getElementById('reminderTime').value = '';
}

document.getElementById('cancelEditReminder').addEventListener('click', cancelReminderEdit);

function editReminder(id) {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;
    
    editingReminderId = id;
    document.getElementById('editingReminderId').value = id;
    document.getElementById('reminderFormTitle').textContent = 'Edit Reminder';
    document.getElementById('addReminder').textContent = 'Update Reminder';
    document.getElementById('cancelEditReminder').style.display = 'block';
    document.getElementById('reminderTitle').value = reminder.title;
    document.getElementById('reminderTime').value = reminder.time;
    
    document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
}

function saveAndRenderReminders() {
    localStorage.setItem('msd_reminders', JSON.stringify(reminders));
    renderReminders();
}

function renderReminders() {
    const list = document.getElementById('reminderList');
    list.innerHTML = '';
    
    if (reminders.length === 0) {
        list.innerHTML = 'No reminders.';
        return;
    }

    reminders.forEach(rem => {
        const d = new Date(rem.time);
        const displayTime = d.toLocaleString();
        
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div>
                <strong>📝 ${rem.title}</strong><br>
                <small>${displayTime}</small>
            </div>
            <div>
                <button onclick="editReminder(${rem.id})" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; margin-right: 8px; padding: 8px 12px;">✏️ Edit</button>
                <button onclick="deleteReminder(${rem.id})" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 8px 12px;">Remove</button>
            </div>
        `;
        list.appendChild(div);
    });
}

window.deleteReminder = (id) => {
    if (editingReminderId === id) {
        cancelReminderEdit();
    }
    reminders = reminders.filter(r => r.id !== id);
    saveAndRenderReminders();
};

function checkReminders(now) {
    reminders.forEach(rem => {
        const remDate = new Date(rem.time);
        if (remDate.getFullYear() === now.getFullYear() && 
            remDate.getMonth() === now.getMonth() && 
            remDate.getDate() === now.getDate() &&
            remDate.getHours() === now.getHours() && 
            remDate.getMinutes() === now.getMinutes() &&
            remDate.getSeconds() === now.getSeconds() &&
            !isNotificationActive) {
            
            let hours = remDate.getHours();
            let minutes = remDate.getMinutes();
            let seconds = remDate.getSeconds();
            
            // Build display message
            let timeStr = formatTimeForVoice(hours, minutes, seconds);
            let displayTitle = '📝 Reminder';
            let displayMessage = `${timeStr} - ${rem.title}`;
            
            // Voice content: "2:30 PM - Drink Water"
            let voiceContent = `${timeStr} - ${rem.title}`;
            
            if (currentLang === 'ml') {
                let timeStrML = formatTimeForVoiceML(hours, minutes, seconds);
                displayTitle = '📝 ഓർമ്മപ്പെടുത്തൽ';
                displayMessage = `${timeStrML} - ${rem.title}`;
                
                // Translate reminder title if possible
                let translatedTitle = rem.title;
                const translations = voiceTranslations['ml'];
                if (translations) {
                    Object.keys(translations).forEach(key => {
                        if (translatedTitle.includes(key)) {
                            translatedTitle = translatedTitle.replace(new RegExp(key, 'g'), translations[key]);
                        }
                    });
                }
                voiceContent = `${timeStrML} - ${translatedTitle}`;
            }
            
            triggerNotificationWithVoice(displayTitle, displayMessage, voiceContent);
        }
    });
}

// --- New function to handle notification with separate voice content ---
function triggerNotificationWithVoice(displayTitle, displayMessage, voiceContent) {
    if (isNotificationActive) return;
    
    const modal = document.getElementById('notificationModal');
    const notifTitle = document.getElementById('notifTitle');
    const notifMessage = document.getElementById('notifMessage');
    
    notifTitle.textContent = displayTitle;
    notifMessage.textContent = displayMessage;
    
    modal.style.display = 'flex';
    isNotificationActive = true;

    // Start continuous announcements - speak only the voice content
    startContinuousAnnouncements(voiceContent, currentLang);
}

// --- Stopwatch ---
const swDisplay = document.getElementById('stopwatchDisplay');
const lapList = document.getElementById('lapList');

function formatSWTime(ms) {
    let date = new Date(ms);
    let h = padZero(date.getUTCHours());
    let m = padZero(date.getUTCMinutes());
    let s = padZero(date.getUTCSeconds());
    let msStr = padZero(Math.floor(date.getUTCMilliseconds() / 10));
    return `${h !== '00' ? h + ':' : ''}${m}:${s}.${msStr}`;
}

document.getElementById('startSW').addEventListener('click', () => {
    if (!isRunning) {
        swStartTime = Date.now() - swElapsedTime;
        swInterval = setInterval(() => {
            swElapsedTime = Date.now() - swStartTime;
            swDisplay.textContent = formatSWTime(swElapsedTime);
        }, 10);
        isRunning = true;
    }
});

document.getElementById('pauseSW').addEventListener('click', () => {
    clearInterval(swInterval);
    isRunning = false;
});

document.getElementById('resetSW').addEventListener('click', () => {
    clearInterval(swInterval);
    isRunning = false;
    swElapsedTime = 0;
    swDisplay.textContent = "00:00:00.00";
    lapList.innerHTML = 'No laps recorded yet.';
    lapCounter = 1;
});

document.getElementById('lapSW').addEventListener('click', () => {
    if (isRunning) {
        if (lapCounter === 1) lapList.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = `Lap ${lapCounter}: ${formatSWTime(swElapsedTime)}`;
        lapList.prepend(div);
        lapCounter++;
    }
});

// --- Voice Features with Malayalam Support ---
function initVoice() {
    const populateVoices = () => {
        voices = synth.getVoices();
        const voiceSelect = document.getElementById('voiceSelect');
        voiceSelect.innerHTML = '';
        voices.forEach((voice, i) => {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });
    };

    populateVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoices;
    }
}

function speakText(text, lang = currentLang, callback = null) {
    if (!document.getElementById('voiceEnabled').checked) {
        if (callback) callback();
        return;
    }
    
    if (synth.speaking) {
        synth.cancel();
    }
    
    let finalText = text;
    let targetLang = 'en-US';
    
    if (lang === 'ml') {
        const translations = voiceTranslations['ml'];
        if (translations) {
            Object.keys(translations).forEach(key => {
                if (typeof translations[key] === 'string') {
                    finalText = finalText.replace(new RegExp(key, 'gi'), translations[key]);
                }
            });
        }
        targetLang = 'ml-IN';
    }

    const utterance = new SpeechSynthesisUtterance(finalText);
    
    const matchingVoice = voices.find(v => v.lang.includes('ml'));
    if (matchingVoice) {
        utterance.voice = matchingVoice;
    } else {
        utterance.lang = targetLang;
    }
    
    utterance.rate = document.getElementById('speechRate').value;
    utterance.pitch = document.getElementById('speechPitch').value;
    
    utterance.onend = () => {
        if (callback) callback();
    };
    
    utterance.onerror = () => {
        if (callback) callback();
    };
    
    synth.speak(utterance);
}

document.getElementById('testVoice').addEventListener('click', () => {
    let testText = "Voice test successful. This is how I sound.";
    if (currentLang === 'ml') {
        testText = "ശബ്ദ പരിശോധന വിജയകരം. ഞാൻ ഇങ്ങനെയാണ് സംസാരിക്കുന്നത്.";
    }
    speakText(testText);
});

document.getElementById('voiceNowBtn').addEventListener('click', () => {
    const now = new Date();
    let hours = now.getHours();
    let ampm = hours >= 12 ? 'PM' : 'AM';
    let mins = now.getMinutes();
    let secs = now.getSeconds();
    
    let hour12 = hours % 12 || 12;
    let hourStr = formatNumberForVoice(hour12);
    let minStr = formatNumberForVoice(mins);
    let secStr = formatNumberForVoice(secs);
    
    let text;
    if (secs === 0) {
        if (mins === 0) {
            text = `The time is ${hourStr} o'clock ${ampm}`;
        } else {
            text = `The time is ${hourStr} ${minStr} ${ampm}`;
        }
    } else {
        text = `The time is ${hourStr} ${minStr} ${secStr} ${ampm}`;
    }
    
    if (currentLang === 'ml') {
        let ampmML = ampm === 'AM' ? 'രാവിലെ' : 'വൈകുന്നേരം';
        if (secs === 0) {
            if (mins === 0) {
                text = `സമയം ${hourStr} മണി ${ampmML}`;
            } else {
                text = `സമയം ${hourStr} ${minStr} ${ampmML}`;
            }
        } else {
            text = `സമയം ${hourStr} ${minStr} ${secStr} ${ampmML}`;
        }
    }
    
    speakText(text);
});

function checkHourlyAnnouncement(now) {
    if (document.getElementById('hourlyVoice').checked && now.getMinutes() === 0 && now.getSeconds() === 0 && !isNotificationActive) {
        let h = now.getHours() % 12 || 12;
        let hourStr = formatNumberForVoice(h);
        let text = `It is ${hourStr} o'clock.`;
        
        if (currentLang === 'ml') {
            text = `ഇത് ${hourStr} മണി ആയി.`;
        }
        
        speakText(text);
    }
}

// --- Settings & Themes ---
function loadSettings() {
    const savedFormat = localStorage.getItem('msd_format') || '12';
    const savedTheme = localStorage.getItem('msd_theme') || 'dark';
    const savedLang = localStorage.getItem('msd_lang') || 'en';
    
    document.getElementById('clockFormat').value = savedFormat;
    document.getElementById('themeSelect').value = savedTheme;
    document.getElementById('langSelect').value = savedLang;
    
    clockFormat = savedFormat;
    currentLang = savedLang;
    document.body.className = savedTheme;
}

document.getElementById('saveSettings').addEventListener('click', () => {
    clockFormat = document.getElementById('clockFormat').value;
    const theme = document.getElementById('themeSelect').value;
    currentLang = document.getElementById('langSelect').value;
    
    localStorage.setItem('msd_format', clockFormat);
    localStorage.setItem('msd_theme', theme);
    localStorage.setItem('msd_lang', currentLang);
    
    document.body.className = theme;
    updateClock(); 
});

const themes = ['dark', 'light', 'blue', 'green', 'purple'];
document.getElementById('themeBtn').addEventListener('click', () => {
    let current = document.body.className;
    let nextIndex = (themes.indexOf(current) + 1) % themes.length;
    let nextTheme = themes[nextIndex];
    
    document.body.className = nextTheme;
    document.getElementById('themeSelect').value = nextTheme;
    localStorage.setItem('msd_theme', nextTheme);
});