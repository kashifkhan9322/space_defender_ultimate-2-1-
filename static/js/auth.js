// auth.js — Login & Registration Logic
// Manages localStorage auth state, form validation, and API calls

console.log('Auth module loaded');

// ── Auth Guard ──
(function authGuard() {
    const user = localStorage.getItem('sd_user');
    if (user) {
        // Already logged in → send to dashboard
        window.location.href = '/dashboard';
    }
})();

// ── Helpers ──
function showMessage(text, type) {
    const el = document.getElementById('loginMessage');
    el.textContent = text;
    el.className = 'login-message ' + type;
}

function clearMessage() {
    const el = document.getElementById('loginMessage');
    el.className = 'login-message';
    el.textContent = '';
}

function setFieldError(fieldId, errorId, hasError) {
    const field = document.getElementById(fieldId);
    const error = document.getElementById(errorId);
    if (hasError) {
        field.classList.add('error');
        error.classList.add('visible');
    } else {
        field.classList.remove('error');
        error.classList.remove('visible');
    }
}

function validateForm() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    let valid = true;

    if (!username) {
        setFieldError('username', 'usernameError', true);
        valid = false;
    } else {
        setFieldError('username', 'usernameError', false);
    }

    if (!password) {
        setFieldError('password', 'passwordError', true);
        valid = false;
    } else {
        setFieldError('password', 'passwordError', false);
    }

    return valid;
}

function setLoading(loading) {
    const btn = document.getElementById('loginBtn');
    if (loading) {
        btn.classList.add('loading');
        btn.innerHTML = '<span class="spinner"></span> Connecting...';
    } else {
        btn.classList.remove('loading');
        btn.innerHTML = 'Launch';
    }
}

// ── Login ──
async function handleLogin(e) {
    e.preventDefault();
    clearMessage();

    if (!validateForm()) return false;

    const username = document.getElementById('username').value.trim();

    setLoading(true);

    try {
        // Try login first
        let response = await fetch('/api/player/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        let result = await response.json();

        if (result.success) {
            // Save to localStorage
            localStorage.setItem('sd_user', JSON.stringify(result.player));
            showMessage('Login successful! Launching...', 'success');

            // Fade out and redirect
            setTimeout(() => {
                document.getElementById('loginPage').classList.add('page-exit');
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 300);
            }, 500);
        } else {
            showMessage('Pilot not found. Click "Register here" to create an account.', 'error');
            setLoading(false);
        }
    } catch (err) {
        console.error('Login error:', err);
        showMessage('Connection failed. Is the server running?', 'error');
        setLoading(false);
    }

    return false;
}

// ── Register ──
async function handleRegister(e) {
    e.preventDefault();
    clearMessage();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username) {
        setFieldError('username', 'usernameError', true);
        showMessage('Enter a username to register.', 'error');
        return;
    }
    if (!password) {
        setFieldError('password', 'passwordError', true);
        showMessage('Enter a password to register.', 'error');
        return;
    }

    setLoading(true);

    try {
        const response = await fetch('/api/player/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const result = await response.json();

        if (result.success) {
            localStorage.setItem('sd_user', JSON.stringify(result.player));
            showMessage('Account created! Launching...', 'success');

            setTimeout(() => {
                document.getElementById('loginPage').classList.add('page-exit');
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 300);
            }, 500);
        } else {
            showMessage(result.error || 'Registration failed.', 'error');
            setLoading(false);
        }
    } catch (err) {
        console.error('Register error:', err);
        showMessage('Connection failed. Is the server running?', 'error');
        setLoading(false);
    }
}
