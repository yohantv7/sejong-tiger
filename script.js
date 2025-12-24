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
const todoInput = document.getElementById('todo-input');
const todoHourSelect = document.getElementById('todo-hour');
const todoMinuteSelect = document.getElementById('todo-minute');
const addBtn = document.getElementById('add-btn');
const todoList = document.getElementById('todo-list');

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

// No longer using localStorage for requests
let guestRequests = [];

function renderRequests() {
    if (!requestList) return;
    requestList.innerHTML = '';

    // Always render for everyone (Guestbook mode)
    // if (!currentUser) return; // REMOVED to allow global visibility

    guestRequests.forEach(req => {
        const li = document.createElement('li');
        li.className = 'request-item';

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
                ${currentUser && currentUser.username === 'admin' ?
                `<button class="delete-req-btn" style="background:none; border:none; cursor:pointer; font-size:1.1rem; opacity:0.7;">🗑️</button>` : ''}
            </div>
        `;

        const delBtn = li.querySelector('.delete-req-btn');
        if (delBtn) {
            delBtn.onclick = () => deleteRequest(req.id);
        }

        requestList.appendChild(li);
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
    if (!currentUser || currentUser.username !== 'admin') return;
    if (confirm("정말 이 메시지를 삭제하시겠습니까?")) {
        db.collection("guestRequests").doc(id).delete()
            .then(() => {
                console.log("Document successfully deleted!");
            }).catch((error) => {
                console.error("Error removing document: ", error);
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

// Auth Logic (Keep LocalStorage for now to avoid complexity)
const authBtn = document.getElementById('auth-btn');
const authModal = document.getElementById('auth-modal');
const closeModal = document.getElementById('close-modal');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const modalTitle = document.getElementById('modal-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const usernameInput = document.getElementById('auth-username');
const passwordInput = document.getElementById('auth-password');
const userInfo = document.getElementById('user-info');

let users = JSON.parse(localStorage.getItem('users')) || [];
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let authMode = 'login'; // 'login' or 'register'

function updateAuthUI() {
    const requestInputArea = document.querySelector('.request-input-group');
    const requestListContainer = document.querySelector('.request-list-container');
    const requestHint = document.querySelector('.request-section p');
    const adminEditors = document.querySelectorAll('.admin-daily-editor');
    const downloadBtns = document.querySelectorAll('.download-btn');
    const videoLockOverlay = document.getElementById('video-lock-overlay');
    const lectureVideo = document.getElementById('lecture-video');
    const openVideoPopupBtn = document.getElementById('open-video-popup-btn');

    if (currentUser) {
        // Show grade in greeting
        const grade = currentUser.grade || 'A';
        if (userInfo) userInfo.textContent = `${currentUser.username}님 (${grade}등급), 환영합니다!`;
        if (authBtn) authBtn.textContent = '로그아웃';
        updateGreeting(new Date().getHours());

        if (requestInputArea) requestInputArea.style.display = 'flex';
        if (requestHint) requestHint.textContent = '나에게 요청사항이 있으면 알려주세요';

        if (requestListContainer) {
            if (currentUser.username === 'admin') {
                requestListContainer.style.display = 'block';
            } else {
                requestListContainer.style.display = 'none';
            }
        }
        // renderRequests(); // Listener handles this

        // Show download buttons based on grade
        // Admin, Grade B, Grade C can download
        if (currentUser.username === 'admin' || grade === 'B' || grade === 'C') {
            downloadBtns.forEach(btn => btn.style.display = 'block');
        } else {
            downloadBtns.forEach(btn => btn.style.display = 'none');
        }

        // Lecture Video Access (Only C and Admin)
        if (currentUser.username === 'admin' || grade === 'C') {
            if (videoLockOverlay) videoLockOverlay.style.display = 'none';
            // if (lectureVideo) lectureVideo.controls = true; // Use iframe controls
            if (openVideoPopupBtn) openVideoPopupBtn.style.display = 'block';
        } else {
            if (videoLockOverlay) videoLockOverlay.style.display = 'flex';
            // if (lectureVideo) {
            // lectureVideo.controls = false;
            // lectureVideo.pause(); // Cannot pause iframe easily without API, overlay prevents click
            // }
            if (openVideoPopupBtn) openVideoPopupBtn.style.display = 'none';
        }

        const userMgmtSection = document.getElementById('user-management-section');
        if (currentUser.username === 'admin') {
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
        downloadBtns.forEach(btn => btn.style.display = 'none'); // Hide download buttons

        // Lock Video for Guests
        if (videoLockOverlay) videoLockOverlay.style.display = 'flex';
        // if (lectureVideo) {
        //     lectureVideo.controls = false;
        //     lectureVideo.pause();
        // }
        if (openVideoPopupBtn) openVideoPopupBtn.style.display = 'none';

        // Allow guests to see list, but not input
        if (requestInputArea) requestInputArea.style.display = 'none';
        if (requestHint) requestHint.textContent = '로그인 후 요청사항 작성이 가능합니다.';
        if (requestListContainer) requestListContainer.style.display = 'none';
    }
}

function showAuthModal() {
    if (authModal) authModal.classList.add('active');
    setAuthMode('login');
}

function hideAuthModal() {
    if (authModal) authModal.classList.remove('active');
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
    } else {
        if (modalTitle) modalTitle.textContent = '회원가입';
        if (authSubmitBtn) authSubmitBtn.textContent = '회원가입';
        if (tabLogin) tabLogin.classList.remove('active');
        if (tabRegister) tabRegister.classList.add('active');
    }
}

if (authBtn) {
    authBtn.onclick = () => {
        if (currentUser) {
            currentUser = null;
            localStorage.removeItem('currentUser');
            updateAuthUI();
            updateGreeting(new Date().getHours());
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
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (username === '' || password === '') {
            alert('아이디와 비밀번호를 입력해주세요.');
            return;
        }

        if (authMode === 'register') {
            if (users.find(u => u.username === username)) {
                alert('이미 존재하는 아이디입니다.');
                return;
            }
            // Default grade is 'A'
            users.push({ username, password, grade: 'A' });
            localStorage.setItem('users', JSON.stringify(users));
            alert('회원가입이 완료되었습니다! (기본 A등급)');
            setAuthMode('login');
        } else {
            const user = users.find(u => u.username === username && u.password === password);
            if (user) {
                currentUser = user;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                hideAuthModal();
                updateAuthUI();
            } else {
                alert('아이디 또는 비밀번호가 틀렸습니다.');
            }
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
    const displayImg = document.getElementById(`${prefix}-display-img`);
    const displayDesc = document.getElementById(`${prefix}-display-desc`);
    const imgUpload = document.getElementById(`${prefix}-img-upload`);
    const descEdit = document.getElementById(`${prefix}-desc-edit`);
    const saveBtn = document.getElementById(`${prefix}-save-daily-btn`);
    const downloadBtn = document.getElementById(`${prefix}-download-btn`);

    // Firestore Document Reference: dailyLife/{ryeoeun}
    const docRef = db.collection('dailyLife').doc(prefix);

    // Realtime Listener
    docRef.onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            if (data.image && displayImg) displayImg.src = data.image;
            if (data.description && displayDesc) displayDesc.textContent = data.description;
            if (data.description && descEdit) {
                // Only update editor if not currently focused to avoid overwriting user input while typing
                if (document.activeElement !== descEdit) {
                    descEdit.value = data.description;
                }
            }
        }
    });

    if (saveBtn) {
        saveBtn.onclick = (e) => {
            if (e) e.preventDefault();
            const file = imgUpload.files[0];
            const description = descEdit.value.trim();

            // Current image fallback
            let currentImage = displayImg.src;

            const saveData = (imgSrc) => {
                // Firestore limit is 1MB. Data URLs for large images might fail.
                // For a proper app, use Firebase Storage. For this demo, we try to save to Firestore
                // but warn if too big.

                // Simple Check size ~ 900KB
                if (imgSrc && imgSrc.length > 900000) {
                    alert("이미지가 너무 큽니다! (1MB 제한) 더 작은 이미지를 사용해주세요.");
                    return;
                }

                docRef.set({
                    image: imgSrc,
                    description: description,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true })
                    .then(() => {
                        alert('저장되었습니다! (모든 기기에 반영됩니다) ✨');
                        if (imgUpload) imgUpload.value = '';
                    })
                    .catch((error) => {
                        console.error("Error writing document: ", error);
                        alert("저장 실패: " + error.message);
                    });
            };

            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => saveData(e.target.result);
                reader.readAsDataURL(file);
            } else {
                saveData(currentImage);
            }
        };
    }

    if (downloadBtn) {
        downloadBtn.onclick = () => {
            const imgSrc = displayImg.src;
            if (!imgSrc) {
                alert('다운로드할 이미지가 없습니다.');
                return;
            }
            const link = document.createElement('a');
            link.href = imgSrc;
            // Use timestamp for unique filename
            link.download = `${prefix}_daily_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    }
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
        initDailyLife('ryeoeun');
        initDailyLife('yunu');

        updateAuthUI();
        renderTodos();
        renderUserList();

    } catch (err) {
        console.error(err);
    }
});
