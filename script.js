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
                ${todo.time ? `<span class="todo-deadline">${todo.time}까지</span>` : ''}
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
                `<button class="delete-req-btn" style="background:none; border:none; cursor:pointer; font-size:1.1rem; opacity:0.7;">🗑️</button>` : ''}
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
const openDepositBtn = document.getElementById('open-deposit-modal-btn');
const depositModal = document.getElementById('deposit-modal');
const closeDepositModal = document.getElementById('close-deposit-modal');
const depositSubmitBtn = document.getElementById('deposit-submit-btn');
const depositNameInput = document.getElementById('deposit-name');
const depositAmountInput = document.getElementById('deposit-amount');

if (openDepositBtn) {
    openDepositBtn.onclick = () => {
        if (!currentUser) {
            alert('로그인이 필요한 기능입니다.');
            showAuthModal();
            return;
        }
        if (depositModal) depositModal.classList.add('active');
    };
}

if (closeDepositModal) {
    closeDepositModal.onclick = () => {
        if (depositModal) depositModal.classList.remove('active');
    };
}

if (depositSubmitBtn) {
    depositSubmitBtn.onclick = () => {
        const name = depositNameInput.value.trim();
        const amount = depositAmountInput.value.trim();

        if (!name || !amount) {
            alert('입금자명과 금액을 모두 입력해주세요.');
            return;
        }

        // Create formatted message
        const message = `[💸 입금 확인 요청] 입금자: ${name} / 금액: ${amount}원`;

        // Send to Guestbook
        const requestObj = {
            text: message,
            author: currentUser.username,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        db.collection("guestRequests").add(requestObj)
            .then(() => {
                alert('요청이 전송되었습니다! 관리자가 확인 후 등급을 변경해드립니다.');
                if (depositModal) depositModal.classList.remove('active');
                depositNameInput.value = '';
                depositAmountInput.value = '';
            })
            .catch((error) => {
                console.error("Error adding document: ", error);
                alert("전송 실패: " + error.message);
            });
    };
}

const openVideoPopupBtn = document.getElementById('open-video-popup-btn');
if (openVideoPopupBtn) {
    openVideoPopupBtn.onclick = () => {
        const popup = window.open('', 'LecturePopup', 'width=1280,height=720');
        if (popup) {
            popup.document.write(`
                <html>
                <head>
                    <title>특별 강의 크게 보기</title>
                    <style>
                        body { margin: 0; background-color: black; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
                        iframe { width: 100%; height: 100%; border: none; }
                    </style>
                </head>
                <body>
                    <iframe src="https://www.youtube.com/embed/coi0usPOiKU?autoplay=1" 
                        title="YouTube video player" frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowfullscreen>
                    </iframe>
                </body>
                </html>
            `);
            popup.document.close(); // Ensure page loads
        } else {
            alert('팝업 차단을 해제해주세요.');
        }
    };
}

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
let currentUser = null; // Holds Firestore user data
let authMode = 'login'; // 'login' or 'register'

// Auth State Observer
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        // User is signed in.
        console.log("User signed in: ", user.email);
        // Fetch user details from Firestore
        db.collection('users').doc(user.uid).get().then((doc) => {
            if (doc.exists) {
                currentUser = { uid: user.uid, ...doc.data() };
                localStorage.setItem('currentUser', JSON.stringify(currentUser)); // Optional backup
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

function updateAuthUI() {
    const requestInputArea = document.querySelector('.request-input-group');
    const requestListContainer = document.querySelector('.request-list-container');
    const depositListContainer = document.getElementById('deposit-list-container');
    const requestHint = document.querySelector('.request-section p');
    const adminEditors = document.querySelectorAll('.admin-daily-editor');
    const videoLockOverlay = document.getElementById('video-lock-overlay');
    const openVideoPopupBtn = document.getElementById('open-video-popup-btn');

    // Re-render requests to show/hide delete buttons
    renderRequests();

    if (currentUser) {
        // Show grade in greeting
        const grade = currentUser.grade || 'A';
        if (userInfo) {
            userInfo.textContent = (currentUser.grade === 'admin')
                ? `admin님, 환영합니다!`
                : `${currentUser.username}님 (${grade}등급), 환영합니다!`;
        }
        if (authBtn) authBtn.textContent = '로그아웃';
        updateGreeting(new Date().getHours());

        if (requestInputArea) requestInputArea.style.display = 'flex';
        if (requestHint) requestHint.textContent = '나에게 요청사항이 있으면 알려주세요';

        if (requestListContainer) requestListContainer.style.display = 'block';

        // Deposit List (Admin only)
        if (depositListContainer) {
            depositListContainer.style.display = (currentUser.grade === 'admin') ? 'block' : 'none';
        }

        // Lecture Video Access
        if (currentUser.grade === 'admin' || grade === 'C') {
            if (videoLockOverlay) videoLockOverlay.style.display = 'none';
            if (openVideoPopupBtn) openVideoPopupBtn.style.display = 'block';
        } else {
            if (videoLockOverlay) videoLockOverlay.style.display = 'flex';
            if (openVideoPopupBtn) openVideoPopupBtn.style.display = 'none';
        }

        const userMgmtSection = document.getElementById('user-management-section');
        if (currentUser.grade === 'admin') {
            if (userMgmtSection) userMgmtSection.style.display = 'block';
            adminEditors.forEach(editor => editor.style.display = 'block');
            renderUserList();
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

        if (videoLockOverlay) videoLockOverlay.style.display = 'flex';
        if (openVideoPopupBtn) openVideoPopupBtn.style.display = 'none';

        if (requestInputArea) requestInputArea.style.display = 'none';
        if (requestHint) requestHint.textContent = '로그인 후 요청사항 작성이 가능합니다.';
        if (requestListContainer) requestListContainer.style.display = 'block';
        if (depositListContainer) depositListContainer.style.display = 'none';
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
const userList = document.getElementById('user-list');

function renderUserList() {
    if (!userList) return;
    userList.innerHTML = '';
    users.forEach(user => {
        if (user.username === 'admin') return; // Don't allow deleting admin

        const li = document.createElement('li');
        li.className = 'user-item';

        // Grade Selector
        const currentGrade = user.grade || 'A';

        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <span>${user.username} <small style="color:var(--accent-color);">(${currentGrade})</small></span>
                <div style="display:flex; gap:5px;">
                    <select class="grade-select" data-user="${user.username}">
                        <option value="A" ${currentGrade === 'A' ? 'selected' : ''}>A</option>
                        <option value="B" ${currentGrade === 'B' ? 'selected' : ''}>B</option>
                        <option value="C" ${currentGrade === 'C' ? 'selected' : ''}>C</option>
                    </select>
                    <button class="delete-user-btn">삭제</button>
                </div>
            </div>
        `;

        // Handle Grade Change
        li.querySelector('.grade-select').onchange = (e) => {
            const newGrade = e.target.value;
            changeUserGrade(user.username, newGrade);
        };

        li.querySelector('.delete-user-btn').onclick = () => {
            if (confirm(`'${user.username}' 회원을 삭제하시겠습니까?`)) {
                deleteUser(user.username);
            }
        };
        userList.appendChild(li);
    });
}

function changeUserGrade(username, newGrade) {
    const user = users.find(u => u.username === username);
    if (user) {
        user.grade = newGrade;
        localStorage.setItem('users', JSON.stringify(users));
        renderUserList();
        // If updating current user (unlikely for admin, but safe to add)
        if (currentUser && currentUser.username === username) {
            currentUser.grade = newGrade;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateAuthUI();
        }
        alert(`${username}님의 등급이 ${newGrade}로 변경되었습니다.`);
    }
}

function deleteUser(username) {
    users = users.filter(u => u.username !== username);
    localStorage.setItem('users', JSON.stringify(users));
    renderUserList();
}

// Daily Life Section (Firebase)
function initDailyLife(prefix) {
    const displayImg1 = document.getElementById(`${prefix}-display-img-1`);
    const displayImg2 = document.getElementById(`${prefix}-display-img-2`);

    // Upload inputs
    const imgUpload1 = document.getElementById(`${prefix}-img-upload-1`);
    const imgUpload2 = document.getElementById(`${prefix}-img-upload-2`);

    // Save buttons
    const saveBtn1 = document.getElementById(`${prefix}-save-btn-1`);
    const saveBtn2 = document.getElementById(`${prefix}-save-btn-2`);

    // Firestore Document Reference
    const docRef = db.collection('dailyLife').doc(prefix);

    // Realtime Listener
    docRef.onSnapshot((doc) => {
        if (doc.exists) {
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
            btn.onclick = () => {
                const file = uploadInput.files[0];
                if (!file) {
                    alert("업로드할 사진을 선택해주세요.");
                    return;
                }

                const reader = new FileReader();
                reader.onload = async (e) => {
                    let result = e.target.result;

                    // Simple size check before compression logic
                    if (result.length > 500000) { // > ~375KB
                        try {
                            result = await compressImage(result);
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
                            alert('저장되었습니다! ✨');
                            uploadInput.value = '';
                        })
                        .catch((error) => {
                            console.error("Error writing document: ", error);
                            alert("저장 실패: " + error.message);
                        });
                };
                reader.readAsDataURL(file);
            };
        }
    };

    handleSave(saveBtn1, imgUpload1, 'image1', displayImg1);
    handleSave(saveBtn2, imgUpload2, 'image2', displayImg2);
}

// Visitor Counter Logic
function initVisitorCounter() {
    const visitorEl = document.getElementById('visitor-count');
    const docRef = db.collection('siteStats').doc('visitors');

    // Realtime Listener
    docRef.onSnapshot((doc) => {
        if (doc.exists) {
            const count = doc.data().count || 0;
            if (visitorEl) visitorEl.textContent = `방문자: ${count.toLocaleString()}명`;
        } else {
            // Initialize if missing
            if (visitorEl) visitorEl.textContent = `방문자: 0명`;
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
        initDailyLife('ryeoeun');

        updateAuthUI();
        renderTodos();
        renderUserList();

    } catch (err) {
        console.error(err);
    }
});
