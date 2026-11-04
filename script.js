// Firebase Initialization
const firebaseConfig = {
    apiKey: "AIzaSyAZhCOrlVWiTj-xuYprTciXlUbxnFeSE9E",
    authDomain: "my-home-74cf5.firebaseapp.com",
    projectId: "my-home-74cf5",
    storageBucket: "my-home-74cf5.firebasestorage.app",
    messagingSenderId: "7963220432",
    appId: "1:7963220432:web:1541c1437b859e8023c1d5"
};

try {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized");
} catch (e) {
    console.error("Firebase init error", e);
}

const db = firebase.firestore();

let todos = JSON.parse(localStorage.getItem('todos')) || [];
let audioContext;

function playAlarmSound() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    const duration = 10; // seconds
    const startTime = audioContext.currentTime;

    for (let i = 0; i < duration; i++) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, startTime + i);

        gainNode.gain.setValueAtTime(0, startTime + i);
        gainNode.gain.linearRampToValueAtTime(0.5, startTime + i + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + i + 0.5);

        oscillator.start(startTime + i);
        oscillator.stop(startTime + i + 0.5);
    }
}

function updateClock() {
    const now = new Date();

    // Date update
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
    const day = dayNames[now.getDay()];

    const dateEl = document.getElementById('date');
    if (dateEl) dateEl.textContent = `${year}년 ${month}월 ${date}일 (${day})`;

    const hoursStr = String(now.getHours()).padStart(2, '0');
    const minutesStr = String(now.getMinutes()).padStart(2, '0');
    const secondsStr = String(now.getSeconds()).padStart(2, '0');

    const clockEl = document.getElementById('clock');
    if (clockEl) clockEl.textContent = `${hoursStr}:${minutesStr}:${secondsStr}`;

    updateGreeting(now.getHours());

    // Alarm check
    const currentTime = `${hoursStr}:${minutesStr}`;
    todos.forEach(todo => {
        if (!todo.completed && !todo.alarmed && todo.time === currentTime) {
            todo.alarmed = true;
            playAlarmSound();
            alert(`⏰ 알람! "${todo.text}" 목표 시간이 되었습니다!`);
        }
    });
}

function updateGreeting(hour) {
    const greetingElement = document.getElementById('greeting');
    if (!greetingElement) return;

    let message = "";
    const nameStr = currentUser ? `${currentUser.username}님, ` : "";

    if (hour < 6) message = `${nameStr}아직 밤이 깊네요, 편안한 휴식 되세요.`;
    else if (hour < 12) message = `${nameStr}좋은 아침입니다! 활기찬 하루 시작하세요.`;
    else if (hour < 18) message = `${nameStr}즐거운 오후입니다. 잠시 휴식은 어떠신가요?`;
    else message = `${nameStr}오늘 하루도 수고 많으셨습니다. 편안한 밤 되세요.`;

    greetingElement.textContent = message;
}

// Todo List Logic
const clockEl = document.getElementById('clock');
const dateEl = document.getElementById('date');
const todoInput = document.getElementById('daily-goal-input'); // Renamed to avoid autofill
const todoList = document.getElementById('todo-list');
const addBtn = document.getElementById('add-btn');

// Time Selectors
const todoHourSelect = document.getElementById('todo-hour');
const todoMinuteSelect = document.getElementById('todo-minute');

function renderTodos() {
    if (!todoList) return;
    todoList.innerHTML = '';
    todos.forEach(todo => {
        const li = document.createElement('li');
        li.className = `todo-item ${todo.completed ? 'completed' : ''} ${todo.isEditing ? 'editing' : ''}`;
        li.dataset.id = todo.id;

        if (todo.isEditing) {
            li.innerHTML = `
                <input type="text" class="edit-text-input" value="${todo.text}">
                <input type="time" class="edit-time-input" value="${todo.time || ''}">
                <button class="save-btn">저장</button>
                <button class="cancel-btn">취소</button>
            `;

            li.querySelector('.save-btn').onclick = () => {
                const newText = li.querySelector('.edit-text-input').value.trim();
                const newTime = li.querySelector('.edit-time-input').value;
                if (newText) {
                    todo.text = newText;
                    todo.time = newTime;
                    todo.isEditing = false;
                    todo.alarmed = false; // Reset alarm if time changed
                    saveTodos();
                    renderTodos();
                }
            };

            li.querySelector('.cancel-btn').onclick = () => {
                todo.isEditing = false;
                renderTodos();
            };
        } else {
            li.innerHTML = `
                <div class="checkbox"></div>
                <span>${todo.text}</span>
                ${todo.time ? `&nbsp;&nbsp;&nbsp;<span class="todo-deadline">${todo.time}까지</span>` : ''}
                <div class="todo-actions">
                    <button class="edit-btn">수정</button>
                    <button class="delete-btn">삭제</button>
                </div>
            `;

            li.querySelector('.checkbox').onclick = () => {
                todo.completed = !todo.completed;
                saveTodos();
                renderTodos();
            };

            li.querySelector('.edit-btn').onclick = () => {
                todo.isEditing = true;
                renderTodos();
            };

            li.querySelector('.delete-btn').onclick = () => {
                li.style.opacity = '0';
                li.style.transform = 'translateX(20px)';
                setTimeout(() => {
                    todos = todos.filter(t => t.id !== todo.id);
                    saveTodos();
                    renderTodos();
                }, 300);
            };
        }
        todoList.appendChild(li);
    });
}

function saveTodos() {
    localStorage.setItem('todos', JSON.stringify(todos));
}

function populateTimeSelectors() {
    if (!todoHourSelect || !todoMinuteSelect) return;

    // Hours 00-23
    for (let i = 0; i < 24; i++) {
        const option = document.createElement('option');
        const val = String(i).padStart(2, '0');
        option.value = val;
        option.textContent = val + '시';
        todoHourSelect.appendChild(option);
    }
    // Default empty or specific time? Let's add a default "Time" option or just start at 00
    // Actually, let's add an empty default option so user actively chooses
    const defaultHour = document.createElement('option');
    defaultHour.value = "";
    defaultHour.textContent = "시";
    defaultHour.selected = true;
    todoHourSelect.insertBefore(defaultHour, todoHourSelect.firstChild);


    // Minutes 00-59
    for (let i = 0; i < 60; i++) {
        const option = document.createElement('option');
        const val = String(i).padStart(2, '0');
        option.value = val;
        option.textContent = val + '분';
        todoMinuteSelect.appendChild(option);
    }
    const defaultMin = document.createElement('option');
    defaultMin.value = "";
    defaultMin.textContent = "분";
    defaultMin.selected = true;
    todoMinuteSelect.insertBefore(defaultMin, todoMinuteSelect.firstChild);
}

function addTodo() {
    if (!todoInput) return;
    const text = todoInput.value.trim();

    // Get Time
    let time = "";
    if (todoHourSelect && todoMinuteSelect) {
        const h = todoHourSelect.value;
        const m = todoMinuteSelect.value;
        if (h !== "" && m !== "") {
            time = `${h}:${m}`;
        }
    }

    if (text === "") return;

    const todoObj = {
        id: Date.now(),
        text: text,
        time: time,
        completed: false,
        alarmed: false,
        isEditing: false
    };

    todos.push(todoObj);
    saveTodos();
    renderTodos();

    todoInput.value = "";
    if (todoHourSelect) todoHourSelect.value = "";
    if (todoMinuteSelect) todoMinuteSelect.value = "";
}

const handleUserInteraction = () => {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
};

if (addBtn) {
    addBtn.addEventListener('click', () => {
        handleUserInteraction();
        addTodo();
    });
}

if (todoInput) {
    todoInput.onkeypress = (e) => {
        if (e.key === 'Enter') {
            handleUserInteraction();
            addTodo();
        }
    };
}

// Guest Request Logic (Firebase)
const requestInput = document.getElementById('request-input');
const sendRequestBtn = document.getElementById('send-request-btn');
const requestList = document.getElementById('request-list');
const depositList = document.getElementById('deposit-list');

// No longer using localStorage for requests
let guestRequests = [];

function renderRequests() {
    if (requestList) requestList.innerHTML = '';
    if (depositList) depositList.innerHTML = '';

    // Always render for everyone (Guestbook mode)
    // if (!currentUser) return; // REMOVED to allow global visibility

    guestRequests.forEach(req => {
        const isDepositRequest = req.text.includes('[💸 입금 확인 요청]');
        const targetList = isDepositRequest ? depositList : requestList;

        if (!targetList) return;

        const li = document.createElement('li');
        li.className = 'request-item';
        if (isDepositRequest) li.style.padding = '8px';

        let displayDate = "";
        if (req.timestamp) {
            try {
                // Formatting timestamp
                const d = req.timestamp.toDate ? req.timestamp.toDate() : new Date(req.timestamp);
                displayDate = `<span style="font-size:0.7em; color:#aaa; margin-left:8px;">${d.getMonth() + 1}/${d.getDate()}</span>`;
            } catch (e) { }
        }

        const authorTag = `<small style="display:inline-block; opacity:0.6; margin-bottom:4px; font-weight:bold;">${req.author}</small>`;

        li.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
            ${authorTag} ${displayDate}
            <div style="word-break: break-all;">${req.text}</div>
        </div>
                ${currentUser && (currentUser.username === 'admin' || currentUser.grade === 'admin') ?
                `<button class="delete-req-btn" style="background:none; border:none; cursor:pointer; font-size:1.1rem; opacity:0.7;">🗑️</button>` : ''
            }
            </div>
    `;

        const delBtn = li.querySelector('.delete-req-btn');
        if (delBtn) {
            delBtn.onclick = () => deleteRequest(req.id);
        }

        targetList.appendChild(li);
    });
}

// Realtime Listener for Request
function initRequestSync() {
    db.collection("guestRequests")
        .orderBy("timestamp", "desc")
        .onSnapshot((snapshot) => {
            guestRequests = [];
            snapshot.forEach((doc) => {
                guestRequests.push({ id: doc.id, ...doc.data() });
            });
            renderRequests();
        }, (error) => {
            console.error("Error getting requests: ", error);
        });
}

function deleteRequest(id) {
    if (!currentUser || (currentUser.username !== 'admin' && currentUser.grade !== 'admin')) return;
    if (confirm("정말 이 메시지를 삭제하시겠습니까? (복구할 수 없습니다)")) {
        db.collection("guestRequests").doc(id).delete()
            .then(() => {
                alert("삭제되었습니다.");
            }).catch((error) => {
                console.error("Error removing document: ", error);
                alert("삭제 실패: " + error.message);
            });
    }
}

function sendRequest() {
    const text = requestInput.value.trim();
    if (text === '' || !currentUser) return;

    const requestObj = {
        text: text,
        author: currentUser.username,
        timestamp: firebase.firestore.FieldValue.serverTimestamp() // Use Server Time
    };

    db.collection("guestRequests").add(requestObj)
        .then(() => {
            requestInput.value = '';
            handleUserInteraction();
        })
        .catch((error) => {
            console.error("Error adding document: ", error);
            alert("저장 실패: " + error.message);
        });
}

if (sendRequestBtn) sendRequestBtn.onclick = sendRequest;
if (requestInput) {
    requestInput.onkeypress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendRequest();
        }
    };
}

// Deposit Request Logic
// Global function for deposit submission
window.submitDepositRequest = function () {
    const depositNameInput = document.getElementById('deposit-name');
    const depositAmountInput = document.getElementById('deposit-amount');
    const depositModal = document.getElementById('deposit-modal');

    if (!depositNameInput || !depositAmountInput) {
        console.error("Deposit inputs not found");
        return;
    }

    const name = depositNameInput.value.trim();
    const amount = depositAmountInput.value.trim();

    if (!name || !amount) {
        alert('입금자명과 금액을 모두 입력해주세요.');
        return;
    }

    // Create formatted message
    const message = `[💸 입금 확인 요청]입금자: ${name} / 금액: ${amount}원`;

    // Send to Guestbook
    const requestObj = {
        text: message,
        author: currentUser ? currentUser.username : 'Guest',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    db.collection("guestRequests").add(requestObj)
        .then(() => {
            alert('요청이 전송되었습니다! 관리자가 확인 후 등급을 변경해드립니다.');
            if (depositModal) {
                depositModal.classList.remove('active');
                depositModal.style.display = 'none';
            }
            depositNameInput.value = '';
            depositAmountInput.value = '';
            // Redirect to homepage to see the request list
            window.location.href = 'index.html';
        })
        .catch((error) => {
            console.error("Error adding document: ", error);
            alert("전송 실패: " + error.message);
        });
};

// Lecture links open YouTube directly; no embedded popup is required.

// Auth Logic (Firebase Authentication)
const authBtn = document.getElementById('auth-btn');
const authModal = document.getElementById('auth-modal');
const closeModal = document.getElementById('close-modal');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const modalTitle = document.getElementById('modal-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const emailInput = document.getElementById('auth-email');
const usernameInput = document.getElementById('auth-username');
const passwordInput = document.getElementById('auth-password');
const userInfo = document.getElementById('user-info');

let users = []; // Initialize empty array for users (fetched from specific query if needed)
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null; // Hydrate from storage
let authMode = 'login'; // 'login' or 'register'

// Auth State Observer
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        // User is signed in.
        console.log("User signed in: ", user.email);

        // Update Last Login Timestamp
        const userRef = db.collection('users').doc(user.uid);

        const batch = db.batch();
        batch.set(userRef, { lastLogin: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });

        batch.commit().catch(err => console.error("Stats update failed:", err));

        // Fetch user details from Firestore
        db.collection('users').doc(user.uid).get().then((doc) => {
            if (doc.exists) {
                const data = doc.data();

                // Sticky Admin Logic: Check local storage before overwriting
                const storedUser = JSON.parse(localStorage.getItem('currentUser'));
                let grade = data.grade || 'A';

                // If local says Admin but DB says 'A' (or missing), preserve Admin to prevent regression
                if (storedUser && (storedUser.grade || '').toLowerCase() === 'admin' && grade === 'A') {
                    console.warn("Preserving local Admin status against DB regression");
                    grade = 'admin';
                }

                // Fallback for missing data
                currentUser = {
                    uid: user.uid,
                    ...data,
                    username: data.username || user.displayName || user.email.split('@')[0] || 'Member',
                    grade: grade
                };
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                updateAuthUI();
            } else {
                console.log("No user profile found in Firestore.");
            }
        }).catch((error) => {
            console.log("Error getting document:", error);
        });
    } else {
        // User is signed out.
        console.log("User signed out");
        currentUser = null;
        localStorage.removeItem('currentUser');
        updateAuthUI();
    }
});

// Emergency Admin Recovery Tool (Global)
window.restoreAdmin = () => {
    const user = firebase.auth().currentUser;
    if (!user) return alert("로그인이 필요합니다.");

    db.collection('users').doc(user.uid).set({
        grade: 'admin',
        username: '관리자',
        email: user.email,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true })
        .then(() => {
            // Update local state immediately - ROBUST FIX
            if (!currentUser) {
                currentUser = {
                    uid: user.uid,
                    email: user.email,
                    username: '관리자',
                    grade: 'admin'
                };
            } else {
                currentUser.grade = 'admin';
                currentUser.username = '관리자';
            }
            localStorage.setItem('currentUser', JSON.stringify(currentUser));

            alert("관리자(admin) 등급으로 복구되었습니다! 확인을 누르면 새로고침됩니다.");
            window.location.reload();
        })
        .catch((err) => {
            alert("복구 실패: 보안 규칙을 '테스트 모드(모두 허용)'로 변경한 뒤 다시 시도해주세요.\n" + err.message);
        });
};

function updateAuthUI() {
    const requestInputArea = document.querySelector('.request-input-group');
    const requestListContainer = document.querySelector('.request-list-container');
    const depositListContainer = document.getElementById('deposit-list-container');
    const requestHint = document.querySelector('.request-section p');
    const adminEditors = document.querySelectorAll('.admin-daily-editor');
    const videoLockOverlay = document.getElementById('video-lock-overlay');
    const openVideoPopupBtn = document.getElementById('open-video-popup-btn');
    const adminLink = document.getElementById('admin-link-container');

    // Re-render requests to show/hide delete buttons
    renderRequests();

    // Determine Admin Status
    const isAdmin = currentUser && (currentUser.grade || '').toLowerCase() === 'admin';

    // Show/Hide Admin Link (Global Check)
    if (adminLink) {
        adminLink.style.display = isAdmin ? 'block' : 'none';
    }

    if (currentUser) {
        // Show grade in greeting
        const grade = currentUser.grade || 'A';
        if (userInfo) {
            userInfo.textContent = isAdmin
                ? `admin님, 환영합니다!`
                : `${currentUser.username}님 (${grade}등급), 환영합니다!`;
        }
        if (authBtn) authBtn.textContent = '로그아웃';
        updateGreeting(new Date().getHours());

        if (requestInputArea) requestInputArea.style.display = 'flex';
        if (requestHint) requestHint.textContent = '나에게 요청사항이 있으면 알려주세요'; // Changed per user preference? Or keep original

        if (requestListContainer) requestListContainer.style.display = 'block';

        // Deposit List (Visible to all for now per user request)
        if (depositListContainer) {
            depositListContainer.style.display = 'block';
        }

        // Lecture Video Access - OPEN TO ALL
        if (videoLockOverlay) videoLockOverlay.style.display = 'none';
        if (openVideoPopupBtn) openVideoPopupBtn.style.display = 'block';

        const userMgmtSection = document.getElementById('user-management-section');
        // Admin Sections
        if (isAdmin) {
            if (userMgmtSection) userMgmtSection.style.display = 'block';
            adminEditors.forEach(editor => editor.style.display = 'block');
            initAdminUserList(); // Fetch and render users
        } else {
            if (userMgmtSection) userMgmtSection.style.display = 'none';
            adminEditors.forEach(editor => editor.style.display = 'none');
        }
    } else {
        if (userInfo) userInfo.textContent = '';
        if (authBtn) authBtn.textContent = '로그인';

        const userMgmtSection = document.getElementById('user-management-section');

        if (userMgmtSection) userMgmtSection.style.display = 'none';
        adminEditors.forEach(editor => editor.style.display = 'none');

        if (videoLockOverlay) videoLockOverlay.style.display = 'none';
        if (openVideoPopupBtn) openVideoPopupBtn.style.display = 'block';

        if (requestInputArea) requestInputArea.style.display = 'none';
        if (requestHint) requestHint.textContent = '로그인 후 요청사항 작성이 가능합니다.';
        if (requestListContainer) requestListContainer.style.display = 'block';

        // Also show deposit list even if not logged in (to see history)
        if (depositListContainer) depositListContainer.style.display = 'block';
    }
}

function showAuthModal() {
    if (authModal) authModal.classList.add('active');
    setAuthMode('login');
}

function hideAuthModal() {
    if (authModal) authModal.classList.remove('active');
    if (emailInput) emailInput.value = '';
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
}

// Password Toggle Logic
const togglePasswordBtn = document.getElementById('toggle-password');
if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePasswordBtn.textContent = type === 'password' ? '👁️' : '🚫'; // Change icon
    });
}

function setAuthMode(mode) {
    authMode = mode;
    if (mode === 'login') {
        if (modalTitle) modalTitle.textContent = '로그인';
        if (authSubmitBtn) authSubmitBtn.textContent = '로그인';
        if (tabLogin) tabLogin.classList.add('active');
        if (tabRegister) tabRegister.classList.remove('active');
        if (usernameInput) usernameInput.style.display = 'none'; // Hide name on login
    } else {
        if (modalTitle) modalTitle.textContent = '회원가입';
        if (authSubmitBtn) authSubmitBtn.textContent = '회원가입';
        if (tabLogin) tabLogin.classList.remove('active');
        if (tabRegister) tabRegister.classList.add('active');
        if (usernameInput) usernameInput.style.display = 'block'; // Show name on register
    }
}

if (authBtn) {
    authBtn.onclick = () => {
        if (currentUser) {
            firebase.auth().signOut().then(() => {
                alert("로그아웃 되었습니다.");
            }).catch((error) => {
                console.error("Sign out error", error);
            });
        } else {
            showAuthModal();
        }
    };
}

if (closeModal) closeModal.onclick = hideAuthModal;
if (tabLogin) tabLogin.onclick = () => setAuthMode('login');
if (tabRegister) tabRegister.onclick = () => setAuthMode('register');

if (authSubmitBtn) {
    authSubmitBtn.onclick = () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (email === '' || password === '') {
            alert('이메일과 비밀번호를 입력해주세요.');
            return;
        }

        if (authMode === 'register') {
            const username = usernameInput.value.trim();
            if (username === '') {
                alert('이름(닉네임)을 입력해주세요.');
                return;
            }

            firebase.auth().createUserWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    // Signed in 
                    const user = userCredential.user;

                    // Create user document in Firestore
                    return db.collection('users').doc(user.uid).set({
                        username: username,
                        email: email,
                        grade: 'A', // Default grade
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                })
                .then(() => {
                    alert('회원가입이 완료되었습니다!');
                    hideAuthModal();
                })
                .catch((error) => {
                    console.error("Registration Error", error);
                    alert("회원가입 실패: " + error.message);
                });

        } else {
            // Login
            firebase.auth().signInWithEmailAndPassword(email, password)
                .then((userCredential) => {
                    // Signed in
                    hideAuthModal();
                })
                .catch((error) => {
                    console.error("Login Error", error);
                    alert("로그인 실패: " + error.message);
                });
        }
    };
}

// User Management Logic
// User Management Logic (Firebase Integration)
const userList = document.getElementById('user-list');
let userUnsubscribe = null;

function initAdminUserList() {
    if (userUnsubscribe) userUnsubscribe(); // Detach previous listener if any

    if (currentUser && currentUser.grade === 'admin') {
        userUnsubscribe = db.collection('users')
            .orderBy('createdAt', 'desc')
            .onSnapshot((snapshot) => {
                users = []; // Reset global users array
                snapshot.forEach((doc) => {
                    users.push({ uid: doc.id, ...doc.data() });
                });
                renderUserList();
            }, (error) => {
                console.error("Error fetching users:", error);
            });
    }
}

function renderUserList() {
    if (!userList) return;
    userList.innerHTML = '';

    users.forEach(user => {
        // Skip current admin user from list (optional, prevents self-deletion)
        if (user.uid === currentUser.uid) return;

        const li = document.createElement('li');
        li.className = 'user-item';

        // Grade Selector
        const currentGrade = user.grade || 'A';

        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <span>
                    ${user.username} 
                    <small style="color:var(--accent-color);">(${currentGrade})</small>
                    <br><small style="color:#64748b; font-size:0.75rem;">${user.email}</small>
                </span>
                <div style="display:flex; gap:5px; align-items:center;">
                    <select class="grade-select" data-uid="${user.uid}" style="padding:4px; border-radius:4px; background:#1e293b; color:white; border:1px solid #475569;">
                        <option value="A" ${currentGrade === 'A' ? 'selected' : ''}>A</option>
                        <option value="B" ${currentGrade === 'B' ? 'selected' : ''}>B</option>
                        <option value="C" ${currentGrade === 'C' ? 'selected' : ''}>C</option>
                        <option value="admin" ${currentGrade === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                    <button class="delete-user-btn" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">삭제</button>
                </div>
            </div>
        `;

        // Handle Grade Change (Firestore)
        const select = li.querySelector('.grade-select');
        select.onchange = (e) => {
            const newGrade = e.target.value;
            changeUserGrade(user.uid, user.username, newGrade);
        };

        // Handle Delete (Firestore)
        const delBtn = li.querySelector('.delete-user-btn');
        delBtn.onclick = () => {
            if (confirm(`'${user.username}' 회원을 삭제하시겠습니까? (복구 불가)`)) {
                deleteUser(user.uid);
            }
        };

        userList.appendChild(li);
    });
}

function changeUserGrade(uid, username, newGrade) {
    if (!uid) return;

    db.collection('users').doc(uid).update({
        grade: newGrade
    }).then(() => {
        alert(`${username}님의 등급이 ${newGrade}(으)로 변경되었습니다.`);
    }).catch((error) => {
        console.error("Error updating grade:", error);
        alert("등급 변경 실패: " + error.message);
    });
}

function deleteUser(uid) {
    if (!uid) return;

    db.collection('users').doc(uid).delete().then(() => {
        alert("회원이 삭제되었습니다.");
    }).catch((error) => {
        console.error("Error deleting user:", error);
        alert("회원 삭제 실패: " + error.message);
    });
}

// Daily Life Section (Firebase)
function initDailyLife(prefix) {
    console.log(`[DEBUG] Initializing Daily Life for: ${prefix}`);

    const displayImg1 = document.getElementById(`${prefix}-display-img-1`);
    const displayImg2 = document.getElementById(`${prefix}-display-img-2`);
    console.log(`[DEBUG] Img1: ${displayImg1}, Img2: ${displayImg2}`);

    // Upload inputs
    const imgUpload1 = document.getElementById(`${prefix}-img-upload-1`);
    const imgUpload2 = document.getElementById(`${prefix}-img-upload-2`);
    console.log(`[DEBUG] Upload1: ${imgUpload1}, Upload2: ${imgUpload2}`);

    // Save buttons
    const saveBtn1 = document.getElementById(`${prefix}-save-btn-1`);
    const saveBtn2 = document.getElementById(`${prefix}-save-btn-2`);
    console.log(`[DEBUG] Btn1: ${saveBtn1}, Btn2: ${saveBtn2}`);

    // Firestore Document Reference
    const docRef = db.collection('dailyLife').doc(prefix);

    // Realtime Listener
    docRef.onSnapshot((doc) => {
        if (doc.exists) {
            console.log("[DEBUG] Document data loaded:", doc.data());
            const data = doc.data();

            // Handle Photo 1
            if (displayImg1 && data.image1) {
                displayImg1.src = data.image1;
                displayImg1.style.display = 'block'; // Ensure visible
            }
            // Handle Photo 2
            if (displayImg2 && data.image2) {
                displayImg2.src = data.image2;
                displayImg2.style.display = 'block'; // Ensure visible
            }
        } else {
            console.log("[DEBUG] No document found for:", prefix);
        }
    });

    // Image Compression Helper
    const compressImage = (base64Str, maxWidth = 800, quality = 0.7) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = base64Str;

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                } catch (e) {
                    reject(e);
                }
            };

            img.onerror = (e) => reject(new Error("Image load failed"));
        });
    };

    const handleSave = (btn, uploadInput, fieldName, displayElement) => {
        if (btn && uploadInput) {
            btn.addEventListener('click', () => { // Changed to addEventListener
                console.log(`[DEBUG] Save button clicked for ${fieldName}`);
                const file = uploadInput.files[0];
                if (!file) {
                    alert("업로드할 사진을 선택해주세요.");
                    return;
                }
                console.log(`[DEBUG] File selected: ${file.name}, size: ${file.size}`);

                const reader = new FileReader();
                reader.onload = async (e) => {
                    let result = e.target.result;
                    console.log(`[DEBUG] File read complete. Length: ${result.length}`);

                    // Simple size check before compression logic
                    if (result.length > 500000) { // > ~375KB
                        try {
                            console.log("Compressing image...");
                            result = await compressImage(result);
                            console.log(`[DEBUG] Compression complete. New Length: ${result.length}`);
                        } catch (err) {
                            console.error("Compression failed, trying original...", err);
                            // Fallback to original if compression fails, but check size again
                        }
                    }

                    if (result.length > 1048487) {
                        alert("이미지 용량이 너무 큽니다 (1MB 초과). 더 작은 사진을 선택해주세요.");
                        return;
                    }

                    // Immediate UI update
                    if (displayElement) {
                        displayElement.src = result;
                        displayElement.style.display = 'block';
                    }

                    // Prepare update data
                    const updateData = {
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    updateData[fieldName] = result;

                    docRef.set(updateData, { merge: true })
                        .then(() => {
                            console.log("[DEBUG] Firestore save success");
                            alert('저장되었습니다! ✨');
                            uploadInput.value = '';
                        })
                        .catch((error) => {
                            console.error("Error writing document: ", error);
                            alert("저장 실패: " + error.message);
                        });
                };
                reader.readAsDataURL(file);
            });
        } else {
            console.error(`[DEBUG] Missing elements for ${fieldName} - Btn: ${btn}, Input: ${uploadInput}`);
        }
    };

    handleSave(saveBtn1, imgUpload1, 'image1', displayImg1);
    handleSave(saveBtn2, imgUpload2, 'image2', displayImg2);
}

// Visitor Counter Logic
function initVisitorCounter() {
    const visitorEl = document.getElementById('visitor-count-display');
    const docRef = db.collection('stats').doc('visitorStats');

    // Realtime Listener
    docRef.onSnapshot((doc) => {
        if (doc.exists) {
            let count = doc.data().count || 0;
            // Migration: Restore legacy count if reset
            if (count < 300) {
                count = 352;
                docRef.set({ count: 352 }, { merge: true });
            }
            if (visitorEl) visitorEl.textContent = `방문자 : ${count.toLocaleString()}명`;
        } else {
            // Initialize with legacy count
            if (visitorEl) visitorEl.textContent = `방문자 : 352명`;
            docRef.set({ count: 352 }, { merge: true });
        }
    });

    // Increment Count (Session based)
    const hasVisited = sessionStorage.getItem('hasVisited');
    if (!hasVisited) {
        docRef.set({
            count: firebase.firestore.FieldValue.increment(1)
        }, { merge: true })
            .then(() => {
                console.log("Visitor count incremented");
                sessionStorage.setItem('hasVisited', 'true');
            })
            .catch((error) => {
                console.error("Error incrementing visitor count: ", error);
            });
    }
}


// Initial calls
document.addEventListener('DOMContentLoaded', () => {
    try {
        setInterval(updateClock, 1000);
        updateClock();

        // Listeners start
        initRequestSync();
        initVisitorCounter();
        populateTimeSelectors(); // Populating time dropdowns
        // initDailyLife('ryeoeun');

        renderUserList();
        fetchWeather(); // Initial weather fetch

    } catch (err) {
        console.error(err);
    }
});

// Weather Function using Open-Meteo
async function fetchWeather() {
    const weatherEl = document.getElementById('weather');
    if (!weatherEl) return;

    try {
        // Seoul Coordinates: 37.5665, 126.9780
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current_weather=true&timezone=Asia%2FTokyo');
        const data = await response.json();

        if (data && data.current_weather) {
            const temp = Math.round(data.current_weather.temperature);
            const code = data.current_weather.weathercode;

            // Weather Codes: https://open-meteo.com/en/docs
            let icon = '☀️';
            if (code >= 1 && code <= 3) icon = '🌤️';
            else if (code >= 45 && code <= 48) icon = '🌫️';
            else if (code >= 51 && code <= 67) icon = '🌧️';
            else if (code >= 71 && code <= 77) icon = '❄️';
            else if (code >= 80 && code <= 82) icon = '🌦️';
            else if (code >= 95) icon = '⚡';

            weatherEl.textContent = `${icon} ${temp}°C`;
        }
    } catch (error) {
        console.error("Weather fetch error:", error);
        weatherEl.textContent = "";
    }
}

// Update weather every hour
setInterval(fetchWeather, 3600000);
