// Authentication Logic - LANDING PAGE ONLY (index.html)
const API_BASE_URL = 'http://127.0.0.1:5000';

const firebaseConfig = {
    apiKey: "AIzaSyCx6LXOhV92Zx42_vDpmITEcj2blPx0yBY",
    authDomain: "skillmatcher-b91dd.firebaseapp.com",
    projectId: "skillmatcher-b91dd",
    storageBucket: "skillmatcher-b91dd.appspot.com",
    messagingSenderId: "1062862079783",
    appId: "1:1062862079783:web:60c50a836a045574854b02",
    databaseURL: "https://skillmatcher-b91dd-default-rtdb.firebaseio.com/"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

document.addEventListener('DOMContentLoaded', () => {
    const ui = {
        authButtons: document.getElementById('auth-buttons'),
        userSession: document.getElementById('user-session'),
        userEmailDisplay: document.getElementById('userEmail'),
        signUpBtn: document.getElementById('signUpBtn'),
        signInBtn: document.getElementById('signInBtn'),
        logoutBtn: document.getElementById('logoutBtn'),
        profileBtn: document.getElementById('profileBtn'),
        signUpModal: document.getElementById('signUpModal'),
        signInModal: document.getElementById('signInModal'),
        profileModal: document.getElementById('profileModal'),
        closeSignUpModal: document.getElementById('closeSignUpModal'),
        closeSignInModal: document.getElementById('closeSignInModal'),
        closeProfileModal: document.getElementById('closeProfileModal'),
        signUpForm: document.getElementById('signUpForm'),
        signInForm: document.getElementById('signInForm'),
        profileForm: document.getElementById('profileForm'),
        signUpError: document.getElementById('signUpError'),
        signInError: document.getElementById('signInError'),
        profileMessage: document.getElementById('profileMessage'),
        signInSuccessMessage: document.getElementById('signInSuccessMessage'),
        googleSignUpBtn: document.getElementById('googleSignUpBtn'),
        googleSignInBtn: document.getElementById('googleSignInBtn'),
        profilePicContainer: document.getElementById('profilePicContainer'),
        profilePicInput: document.getElementById('profilePicInput'),
        profilePicPreview: document.getElementById('profilePicPreview')
    };

    let selectedProfilePicFile = null;

    const openModal = modal => modal?.classList.remove('hidden');
    const closeModal = modal => modal?.classList.add('hidden');

    const showMessage = (el, text, isError = false, duration = 3000) => {
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('text-red-500', isError);
        el.classList.toggle('text-green-600', !isError);
        if (duration) setTimeout(() => el.textContent = '', duration);
    };

    const getStoredUser = () => JSON.parse(localStorage.getItem('user'));

    const fetchWithAuth = async (url, options = {}) => {
        const user = getStoredUser();
        if (!user || !user.idToken) {
            throw new Error("User not authenticated. Please sign in.");
        }
        const headers = { Authorization: `Bearer ${user.idToken}`, ...options.headers };
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401) {
            localStorage.removeItem('user');
            throw new Error('Session expired. Please sign in again.');
        }
        return response;
    };

    const updateUIForLoggedInUser = user => {
        ui.authButtons.classList.add('hidden');
        ui.userSession.classList.remove('hidden');
        ui.userSession.classList.add('flex');
        ui.userEmailDisplay.textContent = user.email;
        closeModal(ui.signInModal);
        closeModal(ui.signUpModal);
        window.location.href = 'job_seekers.html';
    };

    const updateUIForLoggedOutUser = () => {
        localStorage.removeItem('user');
        ui.authButtons.classList.remove('hidden');
        ui.userSession.classList.add('hidden');
        ui.userSession.classList.remove('flex');
        ui.userEmailDisplay.textContent = '';
    };

    // Event Listeners
    ui.signUpBtn?.addEventListener('click', () => openModal(ui.signUpModal));
    ui.signInBtn?.addEventListener('click', () => {
        if (ui.signInSuccessMessage) ui.signInSuccessMessage.textContent = '';
        openModal(ui.signInModal);
    });
    ui.profileBtn?.addEventListener('click', () => {
        loadProfileData();
        openModal(ui.profileModal);
    });
    ui.closeSignUpModal?.addEventListener('click', () => closeModal(ui.signUpModal));
    ui.closeSignInModal?.addEventListener('click', () => closeModal(ui.signInModal));
    ui.closeProfileModal?.addEventListener('click', () => closeModal(ui.profileModal));

    ui.logoutBtn?.addEventListener('click', () => {
        auth.signOut();
        updateUIForLoggedOutUser();
    });

    // Google Sign In/Up
    ui.googleSignUpBtn?.addEventListener('click', handleGoogleSignIn);
    ui.googleSignInBtn?.addEventListener('click', handleGoogleSignIn);

    async function handleGoogleSignIn() {
        try {
            const result = await auth.signInWithPopup(googleProvider);
            const idToken = await result.user.getIdToken();
            const response = await fetch(`${API_BASE_URL}/api/auth/google-signin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Google sign in failed');
            localStorage.setItem('user', JSON.stringify(data.user));
            updateUIForLoggedInUser(data.user);
        } catch (error) {
            showMessage(ui.signInError, error.message, true);
            showMessage(ui.signUpError, error.message, true);
        }
    }

    // Sign Up Form
    ui.signUpForm?.addEventListener('submit', async e => {
        e.preventDefault();
        ui.signUpError.textContent = '';
        const email = document.getElementById('signUpEmail').value;
        const password = document.getElementById('signUpPassword').value;
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Sign up failed');
            showMessage(ui.signInSuccessMessage, 'Sign up successful! Please sign in.', false, null);
            closeModal(ui.signUpModal);
            openModal(ui.signInModal);
        } catch (error) {
            showMessage(ui.signUpError, error.message, true);
        }
    });

    // Sign In Form
    ui.signInForm?.addEventListener('submit', async e => {
        e.preventDefault();
        ui.signInError.textContent = '';
        const email = document.getElementById('signInEmail').value;
        const password = document.getElementById('signInPassword').value;
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/signin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Sign in failed');
            localStorage.setItem('user', JSON.stringify(data.user));
            updateUIForLoggedInUser(data.user);
        } catch (error) {
            showMessage(ui.signInError, error.message, true);
        }
    });

    // Profile Management (for landing page if user is logged in)
    const loadProfileData = async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/user/profile`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            const user = data.user;
            document.getElementById('profileFullName').value = user.full_name || '';
            document.getElementById('profileEmail').value = user.email || '';
            document.getElementById('profileWebsiteUrl').value = user.website_url || '';
            document.getElementById('profileCity').value = user.city || '';
            document.getElementById('profileCountry').value = user.country || '';
            document.getElementById('profileAbout').value = user.about || '';
            document.getElementById('memberSince').textContent = new Date(user.created_at).toLocaleDateString();
            ui.profilePicPreview.src = user.profile_image_url || 'https://placehold.co/100x100/e2e8f0/475569?text=Avatar';
        } catch (err) {
            showMessage(ui.profileMessage, `Error loading profile: ${err.message}`, true);
        }
    };

    ui.profileForm?.addEventListener('submit', async e => {
        e.preventDefault();
        showMessage(ui.profileMessage, 'Saving...', false, null);
        const profileData = {
            full_name: document.getElementById('profileFullName').value,
            website_url: document.getElementById('profileWebsiteUrl').value,
            city: document.getElementById('profileCity').value,
            country: document.getElementById('profileCountry').value,
            about: document.getElementById('profileAbout').value
        };
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/user/profile`, {
                method: 'PUT',
                body: JSON.stringify(profileData)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            if (selectedProfilePicFile) {
                const formData = new FormData();
                formData.append('profile_picture', selectedProfilePicFile);
                const picRes = await fetchWithAuth(`${API_BASE_URL}/api/user/profile-picture`, {
                    method: 'POST',
                    body: formData
                });
                const picData = await picRes.json();
                if (!picRes.ok) throw new Error(picData.message);
                ui.profilePicPreview.src = picData.profile_image_url;
                selectedProfilePicFile = null;
            }
            showMessage(ui.profileMessage, 'Profile saved successfully!', false);
        } catch (err) {
            showMessage(ui.profileMessage, `Error: ${err.message}`, true);
        }
    });

    ui.profilePicContainer?.addEventListener('click', () => ui.profilePicInput?.click());
    ui.profilePicInput?.addEventListener('change', event => {
        const file = event.target.files[0];
        if (file) {
            selectedProfilePicFile = file;
            const reader = new FileReader();
            reader.onload = e => { ui.profilePicPreview.src = e.target.result; };
            reader.readAsDataURL(file);
        }
    });

    // Check if user is already logged in
    const checkUserSession = () => {
        const user = getStoredUser();
        if (user) {
            ui.authButtons?.classList.add('hidden');
            ui.userSession?.classList.remove('hidden');
            ui.userSession?.classList.add('flex');
            if (ui.userEmailDisplay) ui.userEmailDisplay.textContent = user.email;
        } else {
            updateUIForLoggedOutUser();
        }
    };

    checkUserSession();
});