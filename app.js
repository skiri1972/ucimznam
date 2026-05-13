const app = {
    chapters: [],
    currentChapterIndex: 0,
    currentLessonIndex: 0,
    progress: {},
    editingChapterId: null,
    editingLessonId: null,
    currentView: null,
    
    // Quiz state
    currentQuizQuestionIndex: 0,
    quizScore: 0,
    selectedOptionIndex: null,
    isQuizAnswerChecked: false,
    
    // Student authentication
    currentUser: null,
    pendingStudents: [],
    teacherAuthenticated: false,
    teacherPassword: 'nastavnik123',
    apiBase: '',
    studentToken: null,
    teacherToken: null,

    async init() {
        try {
            this.initCloud();
            this.loadData();
            if (this.isCloudEnabled()) {
                await this.loadChaptersFromCloud();
            }
            this.checkExistingTeacherLogin();
            this.checkExistingLogin(); // This will call updateAuthUI
            this.setupRouting();
            this.updateProgressUI();
            this.restoreInitialView();
            console.log('UčimZnam: Aplikacija uspešno inicijalizovana');
        } catch (error) {
            console.error('UčimZnam: Greška pri inicijalizaciji:', error);
            alert('Došlo je do greške pri učitavanju aplikacije. Pokušajte da osvežite stranicu.');
        }
    },

    initCloud() {
        const fromWindow = typeof window !== 'undefined' ? (window.UZ_API_BASE || '') : '';
        const fromStorage = localStorage.getItem('uz_api_base') || '';
        this.apiBase = String(fromWindow || fromStorage || '').trim().replace(/\/+$/g, '');
        this.studentToken = localStorage.getItem('uz_student_token');
        this.teacherToken = localStorage.getItem('uz_teacher_token');
    },

    isCloudEnabled() {
        return !!this.apiBase;
    },

    apiUrl(path) {
        return `${this.apiBase}${path}`;
    },

    async apiRequest(path, options = {}) {
        const headers = new Headers(options.headers || {});
        headers.set('Accept', 'application/json');
        if (options.json !== undefined) {
            headers.set('Content-Type', 'application/json');
        }
        if (options.auth === 'teacher') {
            const token = this.teacherToken || this.teacherPassword;
            headers.set('Authorization', `Bearer ${token}`);
        } else if (options.auth === 'student') {
            if (this.studentToken) headers.set('Authorization', `Bearer ${this.studentToken}`);
        }

        const res = await fetch(this.apiUrl(path), {
            method: options.method || 'GET',
            headers,
            body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
            const msg = data?.error || `HTTP ${res.status}`;
            throw new Error(msg);
        }
        return data;
    },

    async loadChaptersFromCloud() {
        const data = await this.apiRequest('/api/state');
        if (data?.ok && Array.isArray(data.chapters) && data.chapters.length > 0) {
            this.chapters = data.chapters;
            localStorage.setItem('uz_chapters', JSON.stringify(this.chapters));
        }
    },

    pushChaptersToCloud() {
        if (!this.isCloudEnabled()) return;
        if (!this.isTeacherAuthenticated()) return;
        void this.apiRequest('/api/state', { method: 'PUT', json: { chapters: this.chapters }, auth: 'teacher' }).catch(() => {});
    },

    async loadAdminListsFromCloud() {
        const pending = await this.apiRequest('/api/admin/pending', { auth: 'teacher' });
        const approved = await this.apiRequest('/api/admin/approved', { auth: 'teacher' });

        this.pendingStudents = Array.isArray(pending.pending)
            ? pending.pending.map((p) => ({ id: p.id, email: p.email, timestamp: p.requested_at, status: 'pending' }))
            : [];

        this.approvedStudents = Array.isArray(approved.approved)
            ? approved.approved.map((s) => ({ id: s.id, email: s.email, password: s.password, approvedAt: s.approved_at }))
            : [];

        localStorage.setItem('uz_pending_students', JSON.stringify(this.pendingStudents));
        localStorage.setItem('approved_students_permanent', JSON.stringify(this.approvedStudents));
    },

    pushLessonProgressToCloud(lessonId, completed) {
        if (!this.isCloudEnabled()) return;
        if (!this.studentToken) return;
        void this.apiRequest('/api/student/progress', { method: 'POST', json: { lessonId, completed: !!completed }, auth: 'student' }).catch(() => {});
    },

    restoreInitialView() {
        if (this.isTeacherRouteRequested()) {
            if (this.isTeacherAuthenticated()) {
                this.showView('teacher', { skipRouteUpdate: true, skipPersist: true });
            } else {
                this.showView('teacher-login', { skipRouteUpdate: true, skipPersist: true });
            }
            return;
        }

        const lastView = sessionStorage.getItem('uz_last_view') || 'home';
        if (lastView === 'lesson') {
            this.showView('home', { skipPersist: true });
            sessionStorage.removeItem('uz_last_lesson_chapter');
            sessionStorage.removeItem('uz_last_lesson_index');
            sessionStorage.removeItem('uz_home_chapter_index');
            return;
        }

        if (lastView === 'teacher') {
            if (this.isTeacherAuthenticated()) {
                this.showView('teacher', { skipPersist: true });
            } else {
                this.showView('teacher-login', { skipPersist: true });
            }
            return;
        }

        if (lastView === 'teacher-login') {
            this.showView('teacher-login', { skipPersist: true });
            return;
        }

        if (lastView === 'student-login') {
            this.showView('student-login', { skipPersist: true });
            return;
        }

        this.showView('home', { skipPersist: true });
        sessionStorage.removeItem('uz_home_chapter_index');
    },

    loadData() {
        try {
            const cacheVersion = localStorage.getItem('uz_cache_version');
            if (cacheVersion !== '4.1') {
                localStorage.clear();
                localStorage.setItem('uz_cache_version', '4.1');
            }

            // Load chapters
            const savedChapters = localStorage.getItem('uz_chapters');
            if (savedChapters) {
                this.chapters = JSON.parse(savedChapters);
            } else {
                this.chapters = initialChapters;
                this.saveData();
            }

            // Load progress
            const savedProgress = localStorage.getItem('uz_progress');
            if (savedProgress) {
                this.progress = JSON.parse(savedProgress);
            } else {
                this.progress = {};
                this.saveData();
            }

            // Load pending students
            const savedPendingStudents = localStorage.getItem('uz_pending_students');
            if (savedPendingStudents) {
                this.pendingStudents = JSON.parse(savedPendingStudents);
            } else {
                this.pendingStudents = [];
                this.saveData();
            }

            // Load approved students (permanent storage)
            const savedApprovedStudents = localStorage.getItem('approved_students_permanent');
            if (savedApprovedStudents) {
                this.approvedStudents = JSON.parse(savedApprovedStudents);
            } else {
                this.approvedStudents = [];
                this.saveApprovedStudents([]);
            }

            console.log('UčimZnam: Podaci uspešno učitani');
        } catch (error) {
            console.error('UčimZnam: Greška pri učitavanju podataka:', error);
            this.chapters = initialChapters;
            this.progress = {};
            this.pendingStudents = [];
            this.approvedStudents = [];
        }
    },

    saveData() {
        try {
            localStorage.setItem('uz_chapters', JSON.stringify(this.chapters));
            localStorage.setItem('uz_progress', JSON.stringify(this.progress));
            localStorage.setItem('uz_pending_students', JSON.stringify(this.pendingStudents));
            this.pushChaptersToCloud();
            return true;
        } catch (e) {
            console.error('Greška pri čuvanju podataka:', e);
            if (e.name === 'QuotaExceededError') {
                alert('Greška: Memorija pretraživača je puna!');
            }
            return false;
        }
    },

    showView(viewName, options = {}) {
        this.currentView = viewName;
        if (viewName === 'teacher' && !this.isTeacherAuthenticated()) {
            this.showView('teacher-login', options);
            return;
        }
        
        // Check if user is authenticated for protected views (except home)
        if (viewName === 'lesson') {
            if (!this.isAuthenticated()) {
                this.showView('student-login');
                return;
            }
        }

        if (!options.skipRouteUpdate) {
            this.updateRouteForView(viewName);
        }

        if (!options.skipPersist) {
            const viewToPersist = viewName === 'lesson' ? 'home' : viewName;
            sessionStorage.setItem('uz_last_view', viewToPersist);
            if (viewName === 'lesson') {
                sessionStorage.removeItem('uz_last_lesson_chapter');
                sessionStorage.removeItem('uz_last_lesson_index');
                sessionStorage.removeItem('uz_home_chapter_index');
            }
        }
        
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${viewName}`).classList.remove('hidden');
        
        const progressText = document.getElementById('progress-text');
        const progressIndicator = progressText?.parentElement;
        if (progressIndicator) {
            if (viewName === 'teacher' || viewName === 'teacher-login') {
                progressIndicator.classList.add('hidden');
            } else {
                this.updateProgressUI();
            }
        }
        
        if (viewName === 'home') this.renderHome();
        if (viewName === 'teacher') this.renderTeacherTable();
        if (viewName === 'teacher-login') this.resetTeacherLoginUI();
        this.updateAuthUI();
        
        window.scrollTo(0, 0);
        lucide.createIcons();
    },

    isTeacherAuthenticated() {
        return this.teacherAuthenticated === true;
    },

    checkExistingTeacherLogin() {
        this.teacherAuthenticated = localStorage.getItem('uz_teacher_auth') === '1';
    },

    openTeacher() {
        if (this.isTeacherAuthenticated()) {
            this.showView('teacher');
        } else {
            this.showView('teacher-login');
        }
    },

    logoutTeacher() {
        this.teacherAuthenticated = false;
        localStorage.removeItem('uz_teacher_auth');
        localStorage.removeItem('uz_teacher_token');
        this.teacherToken = null;
        this.updateAuthUI();
        this.showView('teacher-login');
    },

    handleTeacherLogin(event) {
        event.preventDefault();
        const pass = document.getElementById('teacher-password')?.value ?? '';

        if (pass === this.teacherPassword) {
            this.teacherAuthenticated = true;
            localStorage.setItem('uz_teacher_auth', '1');
            localStorage.setItem('uz_teacher_token', this.teacherPassword);
            this.teacherToken = this.teacherPassword;
            this.hideTeacherLoginMessage();
            this.updateAuthUI();
            this.showView('teacher');
            return;
        }

        this.showTeacherLoginMessage('Pogrešna lozinka!', 'error');
    },

    resetTeacherLoginUI() {
        const input = document.getElementById('teacher-password');
        if (input) input.value = '';
        this.hideTeacherLoginMessage();
    },

    showTeacherLoginMessage(message, type) {
        const messageDiv = document.getElementById('teacher-login-message');
        if (!messageDiv) return;

        messageDiv.textContent = message;
        messageDiv.classList.remove('hidden', 'bg-green-50', 'bg-red-50', 'bg-yellow-50', 'bg-blue-50', 'text-green-700', 'text-red-700', 'text-yellow-700', 'text-blue-700');

        if (type === 'success') {
            messageDiv.classList.add('bg-green-50', 'text-green-700');
        } else if (type === 'error') {
            messageDiv.classList.add('bg-red-50', 'text-red-700');
        } else if (type === 'warning') {
            messageDiv.classList.add('bg-yellow-50', 'text-yellow-700');
        } else if (type === 'info') {
            messageDiv.classList.add('bg-blue-50', 'text-blue-700');
        }
    },

    hideTeacherLoginMessage() {
        const messageDiv = document.getElementById('teacher-login-message');
        if (messageDiv) {
            messageDiv.classList.add('hidden');
        }
    },

    isTeacherRouteRequested() {
        const path = (window.location.pathname || '').toLowerCase();
        const hash = (window.location.hash || '').toLowerCase();
        return path.endsWith('/nastavnik') || path.endsWith('/nastavnik/') || hash === '#nastavnik' || hash === '#/nastavnik';
    },

    getBasePathname() {
        const path = window.location.pathname || '/';
        const lower = path.toLowerCase();
        if (lower.endsWith('/nastavnik')) return path.slice(0, -'/nastavnik'.length);
        if (lower.endsWith('/nastavnik/')) return path.slice(0, -'/nastavnik/'.length);
        if (lower.endsWith('/index.html')) return path.slice(0, -'/index.html'.length);
        const lastSlash = path.lastIndexOf('/');
        return lastSlash >= 0 ? path.slice(0, lastSlash + 1) : '/';
    },

    updateRouteForView(viewName) {
        if (viewName === 'teacher' || viewName === 'teacher-login') {
            this.setTeacherRoute();
        } else {
            if (this.isTeacherRouteRequested()) this.clearTeacherRoute();
        }
    },

    setTeacherRoute() {
        if (window.location.protocol === 'file:') {
            if (window.location.hash !== '#nastavnik') window.location.hash = 'nastavnik';
            return;
        }

        const base = this.getBasePathname();
        const desired = `${base.endsWith('/') ? base : base + '/'}nastavnik`;
        if (window.location.pathname !== desired) {
            history.pushState({}, '', desired);
        }
    },

    clearTeacherRoute() {
        if (window.location.protocol === 'file:') {
            const urlWithoutHash = `${window.location.pathname}${window.location.search || ''}`;
            if (window.location.hash && this.isTeacherRouteRequested()) {
                history.replaceState({}, '', urlWithoutHash);
            }
            return;
        }

        const current = window.location.pathname || '/';
        const lower = current.toLowerCase();
        const query = window.location.search || '';

        let nextPath = null;
        if (lower.endsWith('/nastavnik/')) {
            nextPath = current.slice(0, -'/nastavnik/'.length) || '/';
        } else if (lower.endsWith('/nastavnik')) {
            nextPath = current.slice(0, -'/nastavnik'.length) || '/';
        }

        if (nextPath !== null) {
            if (!nextPath.endsWith('/')) nextPath += '/';
            history.replaceState({}, '', `${nextPath}${query}`);
        }
    },

    setupRouting() {
        window.addEventListener('popstate', () => this.handleRouteChange());
        window.addEventListener('hashchange', () => this.handleRouteChange());
    },

    handleRouteChange() {
        if (!this.isTeacherRouteRequested()) return;
        if (this.isTeacherAuthenticated()) {
            this.showView('teacher', { skipRouteUpdate: true });
        } else {
            this.showView('teacher-login', { skipRouteUpdate: true });
        }
    },

    isAuthenticated() {
        return this.currentUser !== null;
    },

    logout() {
        this.currentUser = null;
        localStorage.removeItem('current_user');
        localStorage.removeItem('uz_student_token');
        this.studentToken = null;
        this.showView('student-login');
        this.showLoginMessage('Uspešno ste odjavljeni.', 'info');
        this.updateAuthUI(); // Update navigation after logout
    },

    renderHome() {
        const grid = document.getElementById('lessons-grid');
        
        // Add message for non-authenticated users
        if (!this.isAuthenticated()) {
            // Add chapters preview for non-authenticated users
            const chaptersPreview = `
                <div class="col-span-full">
                    <div class="bg-slate-50 rounded-[2.5rem] p-8">
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            ${this.chapters.map((chapter, index) => `
                                <div class="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg transition-all chapter-card">
                                    <div class="flex items-center gap-4 mb-4">
                                        <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center chapter-icon-wrap">
                                            <i data-lucide="${chapter.icon || 'book'}" class="w-6 h-6 text-blue-600 chapter-card-icon"></i>
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-slate-900 text-xl chapter-title">${chapter.title}</h4>
                                            <p class="text-base text-slate-600 font-medium">${chapter.lessons.length} lekcija</p>
                                        </div>
                                    </div>
                                    <p class="text-slate-600 text-base leading-relaxed">${chapter.description}</p>
                                    <div class="mt-4 pt-4 border-t border-slate-100">
                                        <div class="flex items-center justify-between text-base">
                                            <span class="text-slate-500">Poglavlje ${index + 1}</span>
                                            <span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-black">
                                                <i data-lucide="lock" class="w-3 h-3 inline mr-1"></i>
                                                Potrebna prijava
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            
            // Add hero section for non-authenticated users
            const heroSection = `
                <div class="col-span-full">
                    <div class="bg-blue-50 border-2 border-blue-200 rounded-[2.5rem] p-12 text-center mb-8">
                        <div class="bg-blue-600 p-4 rounded-2xl text-white shadow-lg shadow-blue-200 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                            <i data-lucide="book-open" class="w-10 h-10"></i>
                        </div>
                        <h2 class="text-3xl font-black text-slate-900 tracking-tight mb-4">Dobrodošli na UčimZnam!</h2>
                        <p class="text-xl text-slate-600 mb-8 leading-relaxed max-w-2xl mx-auto">
                            Otkrijte svet informatike kroz interaktivne lekcije i zabavne kvizove.
                        </p>
                        <button onclick="app.showView('student-login')" class="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-[2rem] transition-all shadow-xl shadow-blue-200 text-lg flex items-center gap-3 mx-auto">
                            <i data-lucide="user-plus" class="w-6 h-6"></i>
                            Prijavite se za pristup lekcijama
                        </button>
                    </div>
                </div>
            `;
            
            grid.innerHTML = chaptersPreview + heroSection;
            lucide.createIcons();
            this.updateHomeButtons();
            return;
        }
        
        // Show chapters for authenticated users
        const userProgress = this.getUserProgress();
        grid.innerHTML = this.chapters.map((chapter, index) => {
            const completedInChapter = chapter.lessons.filter(l => userProgress[l.id]).length;
            const totalInChapter = chapter.lessons.length;
            const isUnlocked = index === 0 || 
                chapter.lessons.length === 0 || 
                (index > 0 && this.chapters[index-1].lessons.every(l => userProgress[l.id]));
            
            return `
                <div class="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden group ${!isUnlocked ? 'opacity-75 grayscale' : ''} flex flex-col transform hover:-translate-y-2 chapter-card">
                    <div class="h-40 bg-slate-50 relative overflow-hidden chapter-card-media">
                        <div class="absolute inset-0 bg-blue-600 opacity-5 group-hover:opacity-10 transition-opacity"></div>
                        <div class="absolute inset-0 flex items-center justify-center">
                            <i data-lucide="${chapter.icon || 'book'}" class="w-16 h-16 ${isUnlocked ? 'text-blue-600' : 'text-slate-300'} transition-transform group-hover:scale-110 chapter-card-icon"></i>
                        </div>
                    </div>
                    <div class="p-10 flex-1 flex flex-col chapter-card-body">
                        <span class="text-[10px] font-black uppercase tracking-[0.2em] ${isUnlocked ? 'text-blue-600' : 'text-slate-400'}">Poglavlje ${index + 1}</span>
                        <h3 class="text-2xl font-black text-slate-900 mb-4 group-hover:text-blue-600 transition-colors leading-tight chapter-title">${chapter.title}</h3>
                        <p class="text-slate-500 mb-10 line-clamp-2 text-base leading-relaxed font-medium">${chapter.description}</p>
                        
                        <div class="mt-auto space-y-6">
                            <div class="flex justify-between items-center text-xs font-black uppercase tracking-widest">
                                <span class="text-slate-400">Napredak</span>
                                <span class="text-blue-600">${completedInChapter}/${totalInChapter} Lekcija</span>
                            </div>
                            <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div class="h-full bg-blue-600 rounded-full transition-all duration-1000" style="width: ${(completedInChapter/totalInChapter)*100}%"></div>
                            </div>
                            ${isUnlocked ? `
                                <button onclick="app.showChapter(${index})" class="w-full py-5 rounded-2xl font-black bg-slate-900 text-white hover:bg-blue-600 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200 group-hover:shadow-blue-200">
                                    Otvori poglavlje
                                    <i data-lucide="arrow-right" class="w-6 h-6 group-hover:translate-x-1 transition-transform"></i>
                                </button>
                            ` : `
                                <div class="w-full py-5 rounded-2xl font-black bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center gap-3 cursor-not-allowed uppercase tracking-widest text-xs">
                                    Zaključano
                                    <i data-lucide="lock" class="w-4 h-4"></i>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        lucide.createIcons();
        this.updateHomeButtons();
    },

    updateHomeButtons() {
        const homeActions = document.getElementById('home-actions');
        if (!homeActions) return;

        if (this.isAuthenticated()) {
            // User is logged in - show start learning button
            homeActions.innerHTML = `
                <button onclick="app.renderHome(); document.querySelector('#view-home .relative').style.display='block'; app.resetHomeTitle(); document.getElementById('lessons-grid').scrollIntoView({behavior: 'smooth'})" class="px-10 py-5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-[2rem] transition-all shadow-2xl shadow-blue-600/40 flex items-center gap-3 text-lg group lg:justify-start">
                    <i data-lucide="play-circle" class="group-hover:translate-x-1 transition-transform"></i>
                    <span class="lg:inline">Započni učenje</span>
                </button>
            `;
        } else {
            // User is not logged in - show auth buttons
            homeActions.innerHTML = `
                <button onclick="app.showView('student-login')" class="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-[2rem] transition-all shadow-xl shadow-blue-200 text-lg flex items-center gap-3">
                    <i data-lucide="user-plus" class="w-6 h-6"></i>
                    Prijavite se za pristup lekcijama
                </button>
            `;
        }
        lucide.createIcons();
    },

    showChapter(index) {
        this.currentChapterIndex = index;
        const chapter = this.chapters[index];
        
        // Temporarily using the same grid but with lessons
        const grid = document.getElementById('lessons-grid');
        
        // Update title and subtitle
        const heroSection = document.querySelector('#view-home .relative');
        heroSection.style.display = 'none'; // Hide hero when in chapter
        
        const titleArea = document.querySelector('#view-home h2');
        titleArea.innerText = chapter.title;
        const subtitleArea = document.querySelector('#view-home p.text-lg');
        subtitleArea.innerHTML = `<button onclick="app.renderHome(); document.querySelector('#view-home .relative').style.display='block'; app.resetHomeTitle();" class="text-blue-600 hover:underline flex items-center gap-2 mb-4"><i data-lucide="arrow-left" class="w-4 h-4"></i> Nazad na poglavlja</button><br>${chapter.description}`;

        const userProgress = this.getUserProgress();
        grid.innerHTML = chapter.lessons.map((lesson, lIndex) => {
            const isCompleted = userProgress[lesson.id];
            const isUnlocked = lIndex === 0 || userProgress[chapter.lessons[lIndex - 1].id];
            
            return `
                <div class="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden group ${!isUnlocked ? 'opacity-75 grayscale' : ''} flex flex-col transform hover:-translate-y-2 chapter-card">
                    <div class="p-10 flex-1 flex flex-col chapter-card-body">
                        <div class="flex justify-between items-start mb-4">
                            <span class="text-[10px] font-black uppercase tracking-[0.2em] ${isUnlocked ? 'text-blue-600' : 'text-slate-400'}">Lekcija ${lIndex + 1}</span>
                            ${isCompleted ? '<i data-lucide="check-circle" class="text-green-500 w-5 h-5"></i>' : ''}
                        </div>
                        <h3 class="text-2xl font-black text-slate-900 mb-4 group-hover:text-blue-600 transition-colors leading-tight chapter-title">${lesson.title}</h3>
                        <p class="text-slate-500 mb-10 line-clamp-2 text-base leading-relaxed font-medium">${lesson.description}</p>
                        <div class="mt-auto">
                            ${isUnlocked ? `
                                <button onclick="app.startLesson(${index}, ${lIndex})" class="w-full py-5 rounded-2xl font-black bg-slate-900 text-white hover:bg-blue-600 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200 group-hover:shadow-blue-200">
                                    Uči sada
                                    <i data-lucide="play" class="w-5 h-5"></i>
                                </button>
                            ` : `
                                <div class="w-full py-5 rounded-2xl font-black bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center gap-3 cursor-not-allowed uppercase tracking-widest text-xs">
                                    Zaključano
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        lucide.createIcons();
    },

    resetHomeTitle() {
        document.querySelector('#view-home h2').innerText = 'Poglavlja kursa';
        document.querySelector('#view-home p.text-lg').innerText = 'Tvoj put do digitalnog majstora';
    },

    startLesson(chapterIndex, lessonIndex) {
        this.currentChapterIndex = chapterIndex;
        this.currentLessonIndex = lessonIndex;
        this.renderLesson();
        this.showView('lesson');
    },

    getYouTubeId(url) {
        if (!url) return null;
        url = url.trim();
        const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?v=)|(\&v=)|(shorts\/))([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[9].length === 11) ? match[9] : null;
    },

    renderLesson() {
        const chapter = this.chapters[this.currentChapterIndex];
        const lesson = chapter.lessons[this.currentLessonIndex];
        const contentArea = document.getElementById('lesson-content-area');
        const sidebarList = document.getElementById('lesson-sidebar-list');
        
        let html = `<h1>${lesson.title}</h1>`;
        
        if (lesson.textContent) {
            html += `<p>${lesson.textContent.replace(/\n/g, '<br>')}</p>`;
        }

        // Multimedia Buttons
        if ((lesson.videoUrl && lesson.videoUrl.trim()) || (lesson.pdfUrl && lesson.pdfUrl.trim())) {
            html += `<div class="flex flex-wrap gap-6 my-12 p-8 bg-slate-50 rounded-[2.5rem] border-2 border-slate-100 shadow-inner">`;
            if (lesson.videoUrl && lesson.videoUrl.trim()) {
                const videoId = this.getYouTubeId(lesson.videoUrl);
                const isLocal = !videoId;
                html += `
                    <div class="flex-1 min-w-[280px]">
                        <button onclick="app.openMultimedia('video')" class="w-full group relative overflow-hidden bg-white p-6 rounded-3xl border-2 border-slate-200 hover:border-red-500 hover:shadow-xl transition-all duration-300 flex items-center gap-6 text-left">
                            <div class="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-red-600 group-hover:text-white transition-colors">
                                <i data-lucide="play" class="w-8 h-8 fill-current"></i>
                            </div>
                            <div>
                                <span class="block text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Video Lekcija</span>
                                <span class="block text-xl font-black text-slate-900 group-hover:text-red-600 transition-colors">${isLocal ? 'Lokalni video' : 'YouTube Video'}</span>
                            </div>
                        </button>
                    </div>
                `;
            }
            if (lesson.pdfUrl && lesson.pdfUrl.trim()) {
                html += `
                    <div class="flex-1 min-w-[280px]">
                        <button onclick="app.openMultimedia('pdf')" class="w-full group relative overflow-hidden bg-white p-6 rounded-3xl border-2 border-slate-200 hover:border-orange-500 hover:shadow-xl transition-all duration-300 flex items-center gap-6 text-left">
                            <div class="w-16 h-16 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                                <i data-lucide="file-text" class="w-8 h-8"></i>
                            </div>
                            <div>
                                <span class="block text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Materijali</span>
                                <span class="block text-xl font-black text-slate-900 group-hover:text-orange-600 transition-colors">PDF Dokument</span>
                            </div>
                        </button>
                    </div>
                `;
            }
            html += `</div><div id="multimedia-display-area" class="hidden my-12"></div>`;
        }

        if (lesson.keyPoints && lesson.keyPoints.length > 0) {
            html += `<h2>Ključne tačke</h2><ul>`;
            lesson.keyPoints.forEach(point => {
                if (point.trim()) html += `<li>${point}</li>`;
            });
            html += `</ul>`;
        }

        contentArea.innerHTML = html;
        
        // Sidebar shows lessons in CURRENT chapter
        const userProgress = this.getUserProgress();
        sidebarList.innerHTML = chapter.lessons.map((l, idx) => `
            <div onclick="app.startLesson(${this.currentChapterIndex}, ${idx})" class="p-6 cursor-pointer hover:bg-slate-50 transition-all ${idx === this.currentLessonIndex ? 'bg-blue-50/50 border-l-8 border-blue-600' : ''}">
                <div class="flex items-center gap-5">
                    <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black shadow-sm transition-all ${userProgress[l.id] ? 'bg-green-500 text-white' : (idx === this.currentLessonIndex ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400')}">
                        ${userProgress[l.id] ? '<i data-lucide="check" class="w-6 h-6"></i>' : idx + 1}
                    </div>
                    <div class="flex flex-col">
                        <span class="text-base font-black ${idx === this.currentLessonIndex ? 'text-blue-700' : 'text-slate-700'} tracking-tight leading-none">${l.title}</span>
                        <span class="text-sm text-slate-500">${l.description}</span>
                    </div>
                </div>
            </div>
        `).join('');

        const prevBtn = document.getElementById('prev-lesson');
        const nextBtn = document.getElementById('complete-lesson');

        if (this.currentLessonIndex === 0) {
            prevBtn.style.visibility = 'hidden';
        } else {
            prevBtn.style.visibility = 'visible';
            prevBtn.onclick = () => this.startLesson(this.currentChapterIndex, this.currentLessonIndex - 1);
        }

        nextBtn.innerHTML = this.currentLessonIndex === chapter.lessons.length - 1 ? 'Završi poglavlje <i data-lucide="award"></i>' : 'Sledeća lekcija <i data-lucide="arrow-right"></i>';
        nextBtn.onclick = () => this.completeCurrentLesson();
        lucide.createIcons();
    },

    openMultimedia(type) {
        const lesson = this.chapters[this.currentChapterIndex].lessons[this.currentLessonIndex];
        const displayArea = document.getElementById('multimedia-display-area');
        
        if (type === 'video') {
            displayArea.classList.remove('hidden');
            const videoId = this.getYouTubeId(lesson.videoUrl);
            const isLocal = !videoId;
            const source = isLocal ? lesson.videoUrl : videoId;

            displayArea.innerHTML = `
                <div class="relative group">
                    <div id="video-container-active" class="rounded-[2.5rem] overflow-hidden shadow-2xl border-8 border-white ring-1 ring-slate-200 aspect-video bg-black relative">
                        ${isLocal ? `<video class="w-full h-full" controls autoplay><source src="${source}" type="video/mp4"></video>` : `<iframe class="w-full h-full" src="https://www.youtube.com/embed/${source}?autoplay=1" frameborder="0" allowfullscreen></iframe>`}
                    </div>
                    <button onclick="app.closeVideo()" class="absolute -top-4 -right-4 bg-red-600 text-white p-3 rounded-2xl shadow-xl hover:scale-110 transition-transform z-10"><i data-lucide="x" class="w-6 h-6"></i></button>
                </div>
            `;
            lucide.createIcons();
            displayArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (type === 'pdf') {
            const source = lesson.pdfUrl;
            if (source.startsWith('data:application/pdf;base64,')) {
                const base64Content = source.split(',')[1];
                const binaryContent = atob(base64Content);
                const bytes = new Uint8Array(binaryContent.length);
                for (let i = 0; i < binaryContent.length; i++) bytes[i] = binaryContent.charCodeAt(i);
                const blob = new Blob([bytes], { type: 'application/pdf' });
                window.open(URL.createObjectURL(blob), '_blank');
            } else {
                window.open(source, '_blank');
            }
        }
    },

    closeVideo() {
        const displayArea = document.getElementById('multimedia-display-area');
        displayArea.innerHTML = '';
        displayArea.classList.add('hidden');
    },

    completeCurrentLesson() {
        const lesson = this.chapters[this.currentChapterIndex].lessons[this.currentLessonIndex];
        if (lesson.quiz && lesson.quiz.length > 0) {
            this.startQuiz();
        } else {
            const userProgress = this.getUserProgress();
            userProgress[lesson.id] = true;
            this.saveUserProgress(userProgress);
            this.pushLessonProgressToCloud(lesson.id, true);
            this.updateProgressUI();
            this.finishLessonNavigation();
        }
    },

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },

    startQuiz() {
        console.log('Starting quiz - setting isQuizAnswerChecked to false');
        const lesson = this.chapters[this.currentChapterIndex].lessons[this.currentLessonIndex];
        
        // Mešaj pitanja ako ih ima više od 1
        if (lesson.quiz && lesson.quiz.length > 1) {
            this.shuffledQuiz = this.shuffleArray(lesson.quiz);
        } else {
            this.shuffledQuiz = lesson.quiz || [];
        }
        
        this.currentQuizQuestionIndex = 0;
        this.quizScore = 0;
        this.selectedOptionIndex = null;
        this.isQuizAnswerChecked = false;
        document.getElementById('modal-quiz').classList.remove('hidden');
        document.getElementById('quiz-question-container').classList.remove('hidden');
        document.getElementById('quiz-result-container').classList.add('hidden');
        this.renderQuizQuestion();
    },

    renderQuizQuestion() {
        console.log('Rendering new question - resetting isQuizAnswerChecked to false');
        this.isQuizAnswerChecked = false;
        const lesson = this.chapters[this.currentChapterIndex].lessons[this.currentLessonIndex];
        const question = this.shuffledQuiz[this.currentQuizQuestionIndex];
        document.getElementById('quiz-progress').innerText = `Pitanje ${this.currentQuizQuestionIndex + 1}/${this.shuffledQuiz.length}`;
        document.getElementById('quiz-question-text').innerText = question.question;
        const optionsContainer = document.getElementById('quiz-options');
        
        // Mešaj i odgovore za svako pitanje
        const shuffledOptions = this.shuffleArray(question.options);
        // Sačuvaj mapiranje između mešanih indeksa i originalnog tačnog odgovora
        this.currentCorrectAnswer = question.correctAnswer;
        this.answerMapping = {};
        question.options.forEach((originalOption, originalIndex) => {
            if (originalIndex === question.correctAnswer) {
                this.answerMapping[shuffledOptions.indexOf(originalOption)] = originalIndex;
            }
        });
        
        optionsContainer.innerHTML = shuffledOptions.map((opt, idx) => `
            <button onclick="app.selectQuizOption(${idx})" class="quiz-option" id="quiz-opt-${idx}">
                <span class="quiz-number">${idx + 1}.</span>
                <span class="flex-1 text-xl text-left">${opt}</span>
            </button>
        `).join('');
        lucide.createIcons();
    },

    selectQuizOption(index) {
        console.log('selectQuizOption called with index:', index);
        if (this.isQuizAnswerChecked) {
            console.log('Answer already checked, returning');
            return;
        }
        this.isQuizAnswerChecked = true;
        const lesson = this.chapters[this.currentChapterIndex].lessons[this.currentLessonIndex];
        const question = this.shuffledQuiz[this.currentQuizQuestionIndex];
        console.log('Correct answer mapping:', this.answerMapping, 'Selected index is:', index);
        if (this.answerMapping[index] === this.currentCorrectAnswer) this.quizScore++;
        document.getElementById(`quiz-opt-${index}`).classList.add('selected');
        setTimeout(() => {
            this.currentQuizQuestionIndex++;
            if (this.currentQuizQuestionIndex < this.shuffledQuiz.length) this.renderQuizQuestion();
            else this.showQuizResult();
        }, 300);
    },

    showQuizResult() {
        const lesson = this.chapters[this.currentChapterIndex].lessons[this.currentLessonIndex];
        const percentage = (this.quizScore / this.shuffledQuiz.length) * 100;
        const passed = percentage >= 70;
        document.getElementById('quiz-question-container').classList.add('hidden');
        document.getElementById('quiz-result-container').classList.remove('hidden');
        const iconContainer = document.getElementById('quiz-result-icon');
        const title = document.getElementById('quiz-result-title');
        const text = document.getElementById('quiz-result-text');
        const continueBtn = document.getElementById('quiz-continue-btn');

        if (passed) {
            const userProgress = this.getUserProgress();
            userProgress[lesson.id] = true;
            this.saveUserProgress(userProgress);
            this.pushLessonProgressToCloud(lesson.id, true);
            this.updateProgressUI();
            iconContainer.className = "w-24 h-24 bg-green-100 text-green-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6";
            iconContainer.innerHTML = '<i data-lucide="award" class="w-12 h-12"></i>';
            title.innerText = "Sjajno znanje!";
            text.innerText = `Osvojili ste ${this.quizScore}/${this.shuffledQuiz.length} poena i otključali sledeću lekciju.`;
            continueBtn.className = "w-full py-5 bg-green-600 text-white font-black rounded-[2rem] hover:bg-green-700 transition-all shadow-2xl shadow-green-200 text-xl";
            continueBtn.innerText = "Nastavi dalje";
        } else {
            iconContainer.className = "w-24 h-24 bg-red-100 text-red-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6";
            iconContainer.innerHTML = '<i data-lucide="x-circle" class="w-12 h-12"></i>';
            title.innerText = "Pokušaj ponovo!";
            text.innerText = `Osvojili ste ${this.quizScore}/${this.shuffledQuiz.length} poena (${Math.round(percentage)}%). Potrebno je bar 70% za prolaz.`;
            continueBtn.className = "w-full py-5 bg-red-600 text-white font-black rounded-[2rem] hover:bg-red-700 transition-all shadow-2xl shadow-red-200 text-xl";
            continueBtn.innerText = "Pokušaj ponovo";
        }
        lucide.createIcons();
    },

    closeQuiz() {
        const lesson = this.chapters[this.currentChapterIndex].lessons[this.currentLessonIndex];
        const percentage = (this.quizScore / this.shuffledQuiz.length) * 100;
        const passed = percentage >= 70;
        document.getElementById('modal-quiz').classList.add('hidden');
        
        if (passed) {
            this.finishLessonNavigation();
        } else {
            this.startLesson(this.currentChapterIndex, this.currentLessonIndex);
        }
    },

    closeModal() {
        document.getElementById('modal-edit').classList.add('hidden');
    },

    exportLessons() {
        try {
            const dataToExport = {
                chapters: this.chapters,
                exportDate: new Date().toISOString(),
                version: '1.0'
            };
            
            const jsonString = JSON.stringify(dataToExport, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `ucimznam-lekcije-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert('Podaci su uspešno izvezeni!');
        } catch (error) {
            console.error('Greška pri izvozu:', error);
            alert('Došlo je do greške pri izvozu podataka. Pokušajte ponovo.');
        }
    },

    exportToWord() {
        try {
            let wordContent = `
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>UčimZnam - Lekcije</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                        h1 { color: #2c3e50; font-size: 24px; margin-bottom: 20px; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
                        h2 { color: #34495e; font-size: 20px; margin-top: 30px; margin-bottom: 15px; }
                        h3 { color: #16a085; font-size: 18px; margin-top: 25px; margin-bottom: 10px; }
                        p { margin-bottom: 15px; text-align: justify; }
                        ul { margin-bottom: 20px; }
                        li { margin-bottom: 8px; }
                        .lesson-title { font-weight: bold; color: #2980b9; }
                        .chapter-description { font-style: italic; color: #7f8c8d; margin-bottom: 20px; }
                        .key-points { background-color: #ecf0f1; padding: 15px; border-radius: 5px; margin: 20px 0; }
                        .quiz-section { background-color: #f8f9f9; padding: 15px; border-radius: 5px; margin: 20px 0; }
                        .export-info { font-size: 12px; color: #95a5a6; margin-top: 50px; border-top: 1px solid #bdc3c7; padding-top: 20px; }
                    </style>
                </head>
                <body>
                    <h1>UčimZnam - Sve lekcije</h1>
            `;

            this.chapters.forEach((chapter, chapterIndex) => {
                wordContent += `
                    <h2>Poglavlje ${chapterIndex + 1}: ${chapter.title}</h2>
                    <div class="chapter-description">${chapter.description}</div>
                `;

                chapter.lessons.forEach((lesson, lessonIndex) => {
                    wordContent += `
                        <h3>Lekcija ${lessonIndex + 1}: ${lesson.title}</h3>
                        <p><strong>Opis:</strong> ${lesson.description}</p>
                    `;

                    if (lesson.textContent) {
                        wordContent += `
                            <p><strong>Sadržaj lekcije:</strong></p>
                            <div>${lesson.textContent.replace(/\n/g, '<br>')}</div>
                        `;
                    }

                    if (lesson.keyPoints && lesson.keyPoints.length > 0) {
                        wordContent += `
                            <div class="key-points">
                                <h4>Ključne tačke:</h4>
                                <ul>
                                    ${lesson.keyPoints.map(point => `<li>${point}</li>`).join('')}
                                </ul>
                            </div>
                        `;
                    }

                    if (lesson.videoUrl) {
                        wordContent += `
                            <p><strong>Video:</strong> ${lesson.videoUrl}</p>
                        `;
                    }

                    if (lesson.pdfUrl) {
                        wordContent += `
                            <p><strong>PDF:</strong> ${lesson.pdfUrl}</p>
                        `;
                    }

                    if (lesson.quiz && lesson.quiz.length > 0) {
                        wordContent += `
                            <div class="quiz-section">
                                <h4>Kviz pitanja:</h4>
                        `;
                        lesson.quiz.forEach((quiz, quizIndex) => {
                            wordContent += `
                                <p><strong>Pitanje ${quizIndex + 1}:</strong> ${quiz.question}</p>
                                <ul>
                                    ${quiz.options.map((option, optIndex) => 
                                        `<li>${optIndex + 1}. ${option} ${optIndex === quiz.correctAnswer ? '(Tačan odgovor)' : ''}</li>`
                                    ).join('')}
                                </ul>
                            `;
                        });
                        wordContent += `</div>`;
                    }

                    wordContent += `<hr style="margin: 30px 0; border: 1px solid #e0e0e0;">`;
                });
            });

            wordContent += `
                    <div class="export-info">
                        <p><strong>Izvezeno:</strong> ${new Date().toLocaleString('sr-RS')}</p>
                        <p><strong>Verzija:</strong> UčimZnam v1.0</p>
                        <p><strong>Ukupno poglavlja:</strong> ${this.chapters.length}</p>
                        <p><strong>Ukupno lekcija:</strong> ${this.chapters.reduce((total, chapter) => total + chapter.lessons.length, 0)}</p>
                    </div>
                </body>
                </html>
            `;

            const blob = new Blob([wordContent], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `ucimznam-lekcije-${new Date().toISOString().split('T')[0]}.doc`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert('Lekcije su uspešno izvezene u Word formatu!');
        } catch (error) {
            console.error('Greška pri izvozu u Word:', error);
            alert('Došlo je do greške pri izvozu u Word format. Pokušajte ponovo.');
        }
    },

    addQuizQuestion() {
        const container = document.getElementById('quiz-questions-container');
        const questionId = 'q' + Date.now();
        
        const questionHtml = `
            <div id="${questionId}" class="bg-white p-6 rounded-xl border-2 border-purple-200 space-y-4">
                <div class="flex justify-between items-center mb-4">
                    <h5 class="text-lg font-black text-slate-800">Pitanje ${container.children.length + 1}</h5>
                    <button onclick="app.removeQuizQuestion('${questionId}')" class="text-red-500 hover:text-red-700 transition-colors">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                    </button>
                </div>
                
                <div>
                    <label class="block text-sm font-black text-slate-500 uppercase tracking-widest mb-2">Tekst pitanja</label>
                    <input type="text" id="${questionId}-question" placeholder="Unesite pitanje..." class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-purple-500 focus:bg-white outline-none transition-all font-bold">
                </div>
                
                <div class="space-y-3">
                    <label class="block text-sm font-black text-slate-500 uppercase tracking-widest mb-2">Odgovori (označite tačan odgovor)</label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div class="flex items-center gap-2">
                            <input type="radio" name="${questionId}-correct" value="0" id="${questionId}-correct-0" class="w-4 h-4 text-purple-600 focus:ring-purple-500">
                            <input type="text" id="${questionId}-option-0" placeholder="Odgovor A" class="flex-1 px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-lg focus:border-purple-500 focus:bg-white outline-none transition-all text-sm font-medium">
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="radio" name="${questionId}-correct" value="1" id="${questionId}-correct-1" class="w-4 h-4 text-purple-600 focus:ring-purple-500">
                            <input type="text" id="${questionId}-option-1" placeholder="Odgovor B" class="flex-1 px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-lg focus:border-purple-500 focus:bg-white outline-none transition-all text-sm font-medium">
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="radio" name="${questionId}-correct" value="2" id="${questionId}-correct-2" class="w-4 h-4 text-purple-600 focus:ring-purple-500">
                            <input type="text" id="${questionId}-option-2" placeholder="Odgovor C" class="flex-1 px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-lg focus:border-purple-500 focus:bg-white outline-none transition-all text-sm font-medium">
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="radio" name="${questionId}-correct" value="3" id="${questionId}-correct-3" class="w-4 h-4 text-purple-600 focus:ring-purple-500">
                            <input type="text" id="${questionId}-option-3" placeholder="Odgovor D" class="flex-1 px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-lg focus:border-purple-500 focus:bg-white outline-none transition-all text-sm font-medium">
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', questionHtml);
        lucide.createIcons();
    },

    removeQuizQuestion(questionId) {
        const element = document.getElementById(questionId);
        if (element) {
            element.remove();
            this.updateQuestionNumbers();
        }
    },

    updateQuestionNumbers() {
        const container = document.getElementById('quiz-questions-container');
        const questions = container.querySelectorAll('[id^="q"]');
        questions.forEach((question, index) => {
            const title = question.querySelector('h5');
            if (title) {
                title.textContent = `Pitanje ${index + 1}`;
            }
        });
    },

    getQuizQuestions() {
        const container = document.getElementById('quiz-questions-container');
        const questions = [];
        
        container.querySelectorAll('[id^="q"]').forEach(questionElement => {
            const questionId = questionElement.id;
            const questionText = document.getElementById(`${questionId}-question`)?.value;
            const options = [];
            let correctAnswer = 0;
            
            for (let i = 0; i < 4; i++) {
                const optionInput = document.getElementById(`${questionId}-option-${i}`);
                const correctRadio = document.getElementById(`${questionId}-correct-${i}`);
                
                if (optionInput && optionInput.value.trim()) {
                    options.push(optionInput.value.trim());
                    if (correctRadio && correctRadio.checked) {
                        correctAnswer = i;
                    }
                }
            }
            
            if (questionText && options.length >= 2) {
                questions.push({
                    question: questionText.trim(),
                    options: options,
                    correctAnswer: correctAnswer
                });
            }
        });
        
        return questions;
    },

    finishLessonNavigation() {
        const chapter = this.chapters[this.currentChapterIndex];
        if (this.currentLessonIndex < chapter.lessons.length - 1) {
            this.startLesson(this.currentChapterIndex, this.currentLessonIndex + 1);
        } else {
            alert('Čestitamo! Završili ste ovo poglavlje.');
            this.showView('home');
        }
    },

    updateProgressUI() {
        let total = 0;
        let completed = 0;
        const userProgress = this.getUserProgress();
        this.chapters.forEach(c => {
            total += c.lessons.length;
            c.lessons.forEach(l => { 
                // Only count progress for authenticated user
                if (this.isAuthenticated() && userProgress[l.id]) completed++; 
            });
        });
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        const progressText = document.getElementById('progress-text');
        const progressContainer = progressText?.parentElement;
        
        if (progressText) {
            if (this.isAuthenticated()) {
                progressText.innerText = `${percentage}% Završeno`;
                if (progressContainer) {
                    progressContainer.classList.remove('hidden');
                }
            } else {
                progressText.innerText = '0% Završeno';
                if (progressContainer) {
                    progressContainer.classList.add('hidden');
                }
            }
        }
    },

    async renderTeacherTable() {
        const table = document.getElementById('teacher-lessons-table');
        const cards = document.getElementById('teacher-lessons-cards');
        if (!table) return;

        if (this.isCloudEnabled()) {
            try {
                await this.loadAdminListsFromCloud();
            } catch {}
        }

        table.innerHTML = this.chapters.map((chapter, cIndex) => `
            <tr class="bg-slate-100 border-b-2 border-slate-200">
                <td class="p-4 font-black text-slate-900 text-lg">
                    <div class="flex items-center gap-3">
                        <i data-lucide="${chapter.icon || 'book'}" class="w-5 h-5 text-blue-600 flex-shrink-0"></i>
                        <span class="truncate">${chapter.title}</span>
                    </div>
                </td>
                <td class="p-4 text-slate-500 font-bold whitespace-nowrap">Poglavlje ${cIndex + 1}</td>
                <td class="p-4 text-right">
                    <div class="flex gap-1 justify-end">
                        <button onclick="app.editChapter(${cIndex})" class="text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-all" title="Uredi poglavlje"><i data-lucide="settings" class="w-5 h-5"></i></button>
                        <button onclick="app.deleteChapter(${cIndex})" class="text-red-600 p-2 hover:bg-red-50 rounded-lg transition-all" title="Obriši poglavlje"><i data-lucide="trash" class="w-5 h-5"></i></button>
                    </div>
                </td>
            </tr>
            ${chapter.lessons.map((lesson, lIndex) => `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition-all">
                    <td class="py-4 px-8 font-medium text-slate-700">
                        <div class="flex items-center gap-2">
                            <span class="text-slate-300 flex-shrink-0">└</span>
                            <span class="truncate">${lesson.title}</span>
                        </div>
                    </td>
                    <td class="py-4 px-6 text-slate-400 text-xs whitespace-nowrap">Lekcija ${lIndex + 1}</td>
                    <td class="py-4 px-6 text-right">
                        <div class="flex gap-1 justify-end">
                            <button onclick="app.editLesson(${cIndex}, ${lIndex})" class="text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-all" title="Uredi lekciju"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                            <button onclick="app.deleteLesson(${cIndex}, ${lIndex})" class="text-red-600 p-2 hover:bg-red-50 rounded-lg transition-all" title="Obriši lekciju"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </td>
                </tr>
            `).join('')}
            <tr>
                <td colspan="3" class="p-4 pl-12">
                    <button onclick="app.addNewLesson(${cIndex})" class="text-green-600 font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:text-green-700 transition-all">
                        <i data-lucide="plus-circle" class="w-4 h-4 flex-shrink-0"></i>
                        <span class="hidden sm:inline">Dodaj lekciju u ovo poglavlje</span>
                        <span class="sm:hidden">Dodaj lekciju</span>
                    </button>
                </td>
            </tr>
        `).join('');

        if (cards) {
            cards.innerHTML = this.chapters.map((chapter, cIndex) => `
                <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div class="p-4 bg-slate-50 border-b border-slate-100 flex items-start justify-between gap-3">
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2">
                                <i data-lucide="${chapter.icon || 'book'}" class="w-5 h-5 text-blue-600 flex-shrink-0"></i>
                                <div class="min-w-0">
                                    <div class="font-black text-slate-900 truncate">${chapter.title}</div>
                                    <div class="text-xs text-slate-500 font-bold">Poglavlje ${cIndex + 1}</div>
                                </div>
                            </div>
                        </div>
                        <div class="flex gap-2 flex-shrink-0">
                            <button onclick="app.editChapter(${cIndex})" class="text-blue-600 p-3 hover:bg-blue-50 rounded-xl transition-all" title="Uredi poglavlje">
                                <i data-lucide="settings" class="w-5 h-5"></i>
                            </button>
                            <button onclick="app.deleteChapter(${cIndex})" class="text-red-600 p-3 hover:bg-red-50 rounded-xl transition-all" title="Obriši poglavlje">
                                <i data-lucide="trash" class="w-5 h-5"></i>
                            </button>
                        </div>
                    </div>

                    <div class="divide-y divide-slate-100">
                        ${chapter.lessons.map((lesson, lIndex) => `
                            <div class="p-4 flex items-start justify-between gap-3">
                                <div class="min-w-0 flex-1">
                                    <div class="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Lekcija ${lIndex + 1}</div>
                                    <div class="font-bold text-slate-800 leading-snug break-words">${lesson.title}</div>
                                </div>
                                <div class="flex gap-2 flex-shrink-0">
                                    <button onclick="app.editLesson(${cIndex}, ${lIndex})" class="text-blue-600 p-3 hover:bg-blue-50 rounded-xl transition-all" title="Uredi lekciju">
                                        <i data-lucide="edit-3" class="w-5 h-5"></i>
                                    </button>
                                    <button onclick="app.deleteLesson(${cIndex}, ${lIndex})" class="text-red-600 p-3 hover:bg-red-50 rounded-xl transition-all" title="Obriši lekciju">
                                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                        <div class="p-4">
                            <button onclick="app.addNewLesson(${cIndex})" class="w-full py-3 rounded-xl font-black bg-green-50 text-green-700 hover:bg-green-100 transition-all flex items-center justify-center gap-2">
                                <i data-lucide="plus-circle" class="w-5 h-5"></i>
                                Dodaj lekciju
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        // Also render student requests and approved students
        this.renderStudentRequests();
        this.renderApprovedStudents();
        
        lucide.createIcons();
    },

    addNewChapter() {
        const title = prompt('Unesite naslov novog poglavlja:');
        if (!title) return;
        const description = prompt('Unesite kratak opis poglavlja:');
        
        const newChapter = {
            id: 'c' + Date.now(),
            title: title,
            description: description || '',
            icon: 'book',
            lessons: []
        };
        
        this.chapters.push(newChapter);
        this.saveData();
        this.renderTeacherTable();
    },

    editChapter(cIndex) {
        const chapter = this.chapters[cIndex];
        const newTitle = prompt('Novi naslov poglavlja:', chapter.title);
        if (newTitle === null) return;
        const newDesc = prompt('Novi opis poglavlja:', chapter.description);
        if (newDesc === null) return;
        
        this.chapters[cIndex].title = newTitle;
        this.chapters[cIndex].description = newDesc;
        this.saveData();
        this.renderTeacherTable();
    },

    deleteChapter(cIndex) {
        if (!confirm('Da li ste sigurni da želite da obrišete celo poglavlje i sve lekcije u njemu?')) return;
        this.chapters.splice(cIndex, 1);
        this.saveData();
        this.renderTeacherTable();
    },

    addNewLesson(cIndex) {
        this.currentChapterIndex = cIndex;
        this.editingLessonId = null;
        document.getElementById('modal-title').innerText = 'Nova lekcija';
        document.getElementById('edit-title').value = '';
        document.getElementById('edit-description').value = '';
        document.getElementById('edit-text-content').value = '';
        document.getElementById('edit-video-url').value = '';
        document.getElementById('edit-pdf-url').value = '';
        document.getElementById('edit-key-points').value = '';
        document.getElementById('modal-edit').classList.remove('hidden');
    },

    editLesson(cIndex, lIndex) {
        this.currentChapterIndex = cIndex;
        this.currentLessonIndex = lIndex;
        const lesson = this.chapters[cIndex].lessons[lIndex];
        this.editingLessonId = lesson.id;
        document.getElementById('modal-title').innerText = 'Uredi lekciju';
        document.getElementById('edit-title').value = lesson.title;
        document.getElementById('edit-description').value = lesson.description;
        document.getElementById('edit-text-content').value = lesson.textContent;
        document.getElementById('edit-video-url').value = lesson.videoUrl;
        document.getElementById('edit-pdf-url').value = lesson.pdfUrl;
        document.getElementById('edit-key-points').value = (lesson.keyPoints || []).join('\n');
        
        // Učitaj postojeća pitanja za kviz
        this.loadQuizQuestions(lesson.quiz || []);
        
        document.getElementById('modal-edit').classList.remove('hidden');
    },

    loadQuizQuestions(questions) {
        const container = document.getElementById('quiz-questions-container');
        container.innerHTML = '';
        
        questions.forEach((question, index) => {
            const questionId = 'q' + Date.now() + '_' + index;
            
            const questionHtml = `
                <div id="${questionId}" class="bg-white p-6 rounded-xl border-2 border-purple-200 space-y-4">
                    <div class="flex justify-between items-center mb-4">
                        <h5 class="text-lg font-black text-slate-800">Pitanje ${index + 1}</h5>
                        <button onclick="app.removeQuizQuestion('${questionId}')" class="text-red-500 hover:text-red-700 transition-colors">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-black text-slate-500 uppercase tracking-widest mb-2">Tekst pitanja</label>
                        <input type="text" id="${questionId}-question" value="${question.question}" class="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-purple-500 focus:bg-white outline-none transition-all font-bold">
                    </div>
                    
                    <div class="space-y-3">
                        <label class="block text-sm font-black text-slate-500 uppercase tracking-widest mb-2">Odgovori (označite tačan odgovor)</label>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            ${question.options.map((option, optIndex) => `
                                <div class="flex items-center gap-2">
                                    <input type="radio" name="${questionId}-correct" value="${optIndex}" id="${questionId}-correct-${optIndex}" ${question.correctAnswer === optIndex ? 'checked' : ''} class="w-4 h-4 text-purple-600 focus:ring-purple-500">
                                    <input type="text" id="${questionId}-option-${optIndex}" value="${option}" placeholder="Odgovor ${String.fromCharCode(65 + optIndex)}" class="flex-1 px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-lg focus:border-purple-500 focus:bg-white outline-none transition-all text-sm font-medium">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            
            container.insertAdjacentHTML('beforeend', questionHtml);
        });
        
        lucide.createIcons();
    },

    saveLesson() {
        const title = document.getElementById('edit-title').value;
        const description = document.getElementById('edit-description').value;
        const textContent = document.getElementById('edit-text-content').value;
        const videoUrl = document.getElementById('edit-video-url').value;
        const pdfUrl = document.getElementById('edit-pdf-url').value;
        const keyPoints = document.getElementById('edit-key-points').value.split('\n').filter(p => p.trim());
        const quiz = this.getQuizQuestions();

        const lessonData = { id: this.editingLessonId || 'l'+Date.now(), title, description, textContent, videoUrl, pdfUrl, keyPoints, quiz };
        
        if (this.editingLessonId) {
            const idx = this.chapters[this.currentChapterIndex].lessons.findIndex(l => l.id === this.editingLessonId);
            // Zadrži postojeći kviz ako se ne menja
            if (quiz.length === 0) {
                lessonData.quiz = this.chapters[this.currentChapterIndex].lessons[idx].quiz || [];
            }
            this.chapters[this.currentChapterIndex].lessons[idx] = lessonData;
        } else {
            this.chapters[this.currentChapterIndex].lessons.push(lessonData);
        }

        if (this.saveData()) {
            document.getElementById('modal-edit').classList.add('hidden');
            this.renderTeacherTable();
            alert('Sačuvano!');
        }
    },

    deleteLesson(cIndex, lIndex) {
        if (!confirm('Obriši lekciju?')) return;
        this.chapters[cIndex].lessons.splice(lIndex, 1);
        this.saveData();
        this.renderTeacherTable();
    },

    handleFileUpload(input, targetId, statusId) {
        const file = input.files[0];
        if (!file) return;
        if (confirm(`Sačuvati samo naziv "${file.name}"?`)) {
            document.getElementById(targetId).value = file.name;
        } else {
            const reader = new FileReader();
            reader.onload = (e) => { document.getElementById(targetId).value = e.target.result; alert('Učitano!'); };
            reader.readAsDataURL(file);
        }
    },

    clearFile(targetId, statusId) {
        document.getElementById(targetId).value = '';
        document.getElementById(statusId).classList.add('hidden');
    },

    // Student authentication functions
    async handleStudentLogin(event) {
        event.preventDefault();
        const email = document.getElementById('student-email').value.trim().toLowerCase();
        const password = document.getElementById('student-password').value;
        const messageDiv = document.getElementById('login-message');
        
        if (!email) {
            this.showLoginMessage('Molimo unesite email adresu', 'error');
            return;
        }

        if (this.isCloudEnabled()) {
            if (password) {
                try {
                    const data = await this.apiRequest('/api/student/login', { method: 'POST', json: { email, password } });
                    this.studentToken = data.token;
                    localStorage.setItem('uz_student_token', data.token);
                    this.loginStudent({ email: data.email });
                    try {
                        const progressData = await this.apiRequest('/api/student/progress', { auth: 'student' });
                        const allProgress = JSON.parse(localStorage.getItem('student_progress') || '{}');
                        allProgress[data.email] = progressData.progress || {};
                        localStorage.setItem('student_progress', JSON.stringify(allProgress));
                        this.updateProgressUI();
                    } catch {}
                } catch (e) {
                    this.showLoginMessage('Pogrešan email ili lozinka.', 'error');
                }
                return;
            }

            try {
                const req = await this.apiRequest('/api/student/request', { method: 'POST', json: { email } });
                if (req.status === 'already_pending') {
                    this.showLoginMessage('Vaš zahtev je već poslat. Sačekajte odobrenje nastavnika.', 'warning');
                } else {
                    this.showLoginMessage('Vaš zahtev je poslat nastavniku. Bićete obavešteni kada se odobri.', 'success');
                }
                document.getElementById('student-email').value = '';
                document.getElementById('student-password').value = '';
            } catch (e) {
                if (String(e.message || '').includes('already_approved')) {
                    this.showLoginMessage('Nalog je već odobren. Unesite lozinku.', 'info');
                } else {
                    this.showLoginMessage('Greška pri slanju zahteva. Pokušajte ponovo.', 'error');
                }
            }
            return;
        }

        // Check if student is already approved
        const approvedStudents = this.getApprovedStudents();
        const existingStudent = approvedStudents.find(s => s.email === email);
        
        if (existingStudent) {
            // Student is approved, check password
            if (password) {
                // Login with password
                if (password === existingStudent.password) {
                    this.loginStudent(existingStudent);
                } else {
                    this.showLoginMessage('Pogrešna lozinka. Pokušajte ponovo.', 'error');
                }
            } else {
                // Show password field for direct login
                this.showLoginMessage('Unesite lozinku koju ste dobili emailom.', 'info');
            }
            return;
        }

        // If password is entered but student not approved
        if (password) {
            this.showLoginMessage('Nalog sa ovim emailom ne postoji. Zatražite pristup.', 'error');
            return;
        }

        // Check if already pending
        if (this.pendingStudents.find(s => s.email === email)) {
            this.showLoginMessage('Vaš zahtev je već poslat. Sačekajte odobrenje nastavnika.', 'warning');
            return;
        }

        // Add to pending list
        const studentRequest = {
            id: Date.now().toString(),
            email: email,
            timestamp: new Date().toISOString(),
            status: 'pending'
        };
        
        this.pendingStudents.push(studentRequest);
        this.saveData();
        
        // Show success message
        this.showLoginMessage('Vaš zahtev je poslat nastavniku. Bićete obavešteni emailom kada se odobri.', 'success');
        
        // Clear form
        document.getElementById('student-email').value = '';
        document.getElementById('student-password').value = '';
        
        // In real app, this would send email to teacher
        console.log('Student request:', studentRequest);
        alert('Zahtev poslat! (U stvarnoj aplikaciji, email bi Bio poslat nastavniku)');
    },

    showLoginMessage(message, type) {
        const messageDiv = document.getElementById('login-message');
        messageDiv.textContent = message;
        messageDiv.classList.remove('hidden', 'bg-green-50', 'bg-red-50', 'bg-yellow-50', 'bg-blue-50', 'text-green-700', 'text-red-700', 'text-yellow-700', 'text-blue-700');
        
        if (type === 'success') {
            messageDiv.classList.add('bg-green-50', 'text-green-700');
        } else if (type === 'error') {
            messageDiv.classList.add('bg-red-50', 'text-red-700');
        } else if (type === 'warning') {
            messageDiv.classList.add('bg-yellow-50', 'text-yellow-700');
        } else if (type === 'info') {
            messageDiv.classList.add('bg-blue-50', 'text-blue-700');
        }
    },

    getApprovedStudents() {
        if (this.isCloudEnabled() && Array.isArray(this.approvedStudents)) {
            return this.approvedStudents;
        }
        return JSON.parse(localStorage.getItem('approved_students_permanent') || '[]');
    },

    saveApprovedStudents(students) {
        localStorage.setItem('approved_students_permanent', JSON.stringify(students));
    },

    getUserProgress() {
        if (!this.currentUser) return {};
        
        const allProgress = JSON.parse(localStorage.getItem('student_progress') || '{}');
        return allProgress[this.currentUser.email] || {};
    },

    saveUserProgress(progress) {
        if (!this.currentUser) return;
        
        const allProgress = JSON.parse(localStorage.getItem('student_progress') || '{}');
        allProgress[this.currentUser.email] = progress;
        localStorage.setItem('student_progress', JSON.stringify(allProgress));
    },

    loginStudent(student) {
        this.currentUser = student;
        localStorage.setItem('current_user', JSON.stringify(student));
        this.showLoginMessage('Uspešno ste prijavljeni! Preusmeravamo...', 'success');
        
        setTimeout(() => {
            this.showView('home');
            this.updateAuthUI(); // Update navigation after login
            this.updateProgressUI(); // Update progress display for logged in user
        }, 1500);
    },

    checkExistingLogin() {
        const savedUser = localStorage.getItem('current_user');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
        }
        this.studentToken = localStorage.getItem('uz_student_token');
        if (this.isCloudEnabled() && this.studentToken && this.currentUser?.email) {
            void this.apiRequest('/api/student/progress', { auth: 'student' }).then((progressData) => {
                const allProgress = JSON.parse(localStorage.getItem('student_progress') || '{}');
                allProgress[this.currentUser.email] = progressData.progress || {};
                localStorage.setItem('student_progress', JSON.stringify(allProgress));
                this.updateProgressUI();
            }).catch(() => {});
        }
        this.updateAuthUI();
    },

    updateAuthUI() {
        const authSection = document.getElementById('auth-section');
        if (!authSection) return;

        if (this.currentView === 'teacher-login' || this.currentView === 'teacher') {
            authSection.innerHTML = '';
        } else if (this.isAuthenticated()) {
            // User is logged in
            authSection.innerHTML = `
                <div class="flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-2 min-w-0">
                    <div class="flex items-center gap-2 text-slate-600 min-w-0">
                        <i data-lucide="user-check" class="w-4 h-4 flex-shrink-0 hidden sm:inline"></i>
                        <span class="text-xs sm:text-sm font-medium truncate w-full mt-3 sm:mt-0" title="${this.currentUser.email}">${this.currentUser.email}</span>
                    </div>
                    <button onclick="app.logout()" class="text-red-500 hover:text-red-700 font-bold text-[11px] sm:text-sm px-3 py-1.5 rounded-lg transition-all hover:bg-red-50 flex items-center justify-center gap-2 min-h-[36px] sm:min-h-[44px] w-full sm:w-auto">
                        <i data-lucide="log-out" class="w-4 h-4 flex-shrink-0"></i>
                        <span class="hidden sm:inline">Odjavi se</span>
                        <span class="sm:hidden">Odjavi</span>
                    </button>
                </div>
            `;
        } else {
            // User is not logged in
            authSection.innerHTML = `
                <button onclick="app.showView('student-login')" class="text-slate-500 hover:text-blue-600 font-bold px-4 py-2 rounded-xl transition-all hover:bg-blue-50">
                    <span class="hidden sm:inline">Učenik</span>
                    <i data-lucide="user" class="sm:hidden"></i>
                </button>
            `;
        }
        lucide.createIcons();
    },

    // Student management functions
    renderStudentRequests() {
        const container = document.getElementById('student-requests-container');
        if (!container) return;

        if (this.pendingStudents.length === 0) {
            container.innerHTML = '<p class="text-slate-500 text-center py-8">Nema novih zahteva za pristup.</p>';
            return;
        }

        container.innerHTML = this.pendingStudents.map(student => `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 transition-all gap-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <i data-lucide="user" class="w-5 h-5 text-blue-600"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-slate-900 text-sm sm:text-base truncate">${student.email}</div>
                        <div class="text-xs sm:text-sm text-slate-500">Poslato: ${new Date(student.timestamp).toLocaleString('sr-RS')}</div>
                    </div>
                </div>
                <div class="flex gap-2 w-full sm:w-auto">
                    <button onclick="app.approveStudent('${student.id}')" class="flex-1 sm:flex-none px-3 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-all flex items-center justify-center gap-2 text-sm">
                        <i data-lucide="check" class="w-4 h-4 flex-shrink-0"></i>
                        <span class="hidden sm:inline">Odobri</span>
                        <span class="sm:hidden">✓</span>
                    </button>
                    <button onclick="app.rejectStudent('${student.id}')" class="flex-1 sm:flex-none px-3 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2 text-sm">
                        <i data-lucide="x" class="w-4 h-4 flex-shrink-0"></i>
                        <span class="hidden sm:inline">Odbij</span>
                        <span class="sm:hidden">✕</span>
                    </button>
                </div>
            </div>
        `).join('');
        lucide.createIcons();
    },

    renderApprovedStudents() {
        const container = document.getElementById('approved-students-container');
        if (!container) return;

        const approvedStudents = this.getApprovedStudents();
        if (approvedStudents.length === 0) {
            container.innerHTML = '<p class="text-slate-500 text-center py-8">Nema odobrenih učenika.</p>';
            return;
        }

        container.innerHTML = approvedStudents.map(student => `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-xl border border-green-200 hover:border-green-300 transition-all gap-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <i data-lucide="user-check" class="w-5 h-5 text-green-600"></i>
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="font-bold text-slate-900 text-sm sm:text-base truncate">${student.email}</div>
                        <div class="text-xs sm:text-sm text-slate-500">Odobreno: ${new Date(student.approvedAt).toLocaleString('sr-RS')}</div>
                        <div class="text-xs text-green-600 font-medium">Lozinka: ${student.password}</div>
                    </div>
                </div>
                <div class="flex gap-2 w-full sm:w-auto">
                    <button onclick="app.revokeAccess('${student.id}')" class="flex-1 sm:flex-none px-3 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2 text-sm">
                        <i data-lucide="ban" class="w-4 h-4 flex-shrink-0"></i>
                        <span class="hidden sm:inline">Ukloni pristup</span>
                        <span class="sm:hidden">Ukloni</span>
                    </button>
                </div>
            </div>
        `).join('');
        lucide.createIcons();
    },

    async approveStudent(studentId) {
        const student = this.pendingStudents.find(s => s.id === studentId);
        if (!student) return;

        const password = this.generatePassword();

        if (this.isCloudEnabled()) {
            try {
                const res = await this.apiRequest('/api/admin/approve', { method: 'POST', json: { id: studentId, password }, auth: 'teacher' });
                await this.loadAdminListsFromCloud();
                this.renderStudentRequests();
                this.renderApprovedStudents();
                alert(`Učenik odobren!\nEmail: ${res.student.email}\nLozinka: ${res.student.password}`);
            } catch {
                alert('Greška pri odobravanju učenika.');
            }
            return;
        }

        const approvedStudents = this.getApprovedStudents();
        const approvedStudent = {
            id: student.id,
            email: student.email,
            password: password,
            approvedAt: new Date().toISOString()
        };
        approvedStudents.push(approvedStudent);
        this.saveApprovedStudents(approvedStudents);

        this.pendingStudents = this.pendingStudents.filter(s => s.id !== studentId);
        this.saveData();

        this.renderStudentRequests();
        this.renderApprovedStudents();

        console.log('Student approved:', approvedStudent);
        alert(`Učenik odobren!\nEmail: ${student.email}\nLozinka: ${password}\n\nU stvarnoj aplikaciji, email bi Bio poslat.`);
    },

    async rejectStudent(studentId) {
        if (!confirm('Da li ste sigurni da želite da odbijete ovaj zahtev?')) return;

        if (this.isCloudEnabled()) {
            try {
                await this.apiRequest('/api/admin/reject', { method: 'POST', json: { id: studentId }, auth: 'teacher' });
                await this.loadAdminListsFromCloud();
                this.renderStudentRequests();
            } catch {
                alert('Greška pri odbijanju zahteva.');
            }
            return;
        }

        this.pendingStudents = this.pendingStudents.filter(s => s.id !== studentId);
        this.saveData();
        this.renderStudentRequests();
    },

    async revokeAccess(studentId) {
        if (!confirm('Da li ste sigurni da želite da uklonite pristup ovom učeniku?')) return;

        if (this.isCloudEnabled()) {
            try {
                await this.apiRequest('/api/admin/revoke', { method: 'POST', json: { id: studentId }, auth: 'teacher' });
                await this.loadAdminListsFromCloud();
                this.renderApprovedStudents();
                alert('Pristup učeniku je uspešno uklonjen.');
            } catch {
                alert('Greška pri uklanjanju pristupa.');
            }
            return;
        }

        const approvedStudents = this.getApprovedStudents();
        const updatedStudents = approvedStudents.filter(s => s.id !== studentId);
        this.saveApprovedStudents(updatedStudents);

        if (this.currentUser && this.currentUser.id === studentId) {
            this.logout();
        }

        this.renderApprovedStudents();

        alert('Pristup učeniku je uspešno uklonjen.');
    },

    generatePassword() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let password = '';
        for (let i = 0; i < 8; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    },

    showPasswordField() {
        document.getElementById('password-field').classList.remove('hidden');
        document.getElementById('login-button-text').textContent = 'Prijavi se';
        this.showLoginMessage('Unesite email i lozinku za direktno logovanje.', 'info');
    },

    showRequestForm() {
        document.getElementById('password-field').classList.add('hidden');
        document.getElementById('login-button-text').textContent = 'Pošalji zahtev za pristup';
        document.getElementById('student-password').value = '';
        this.hideLoginMessage();
        
        // Update tab buttons
        this.updateTabButtons('register');
    },

    switchToLogin() {
        document.getElementById('password-field').classList.remove('hidden');
        document.getElementById('login-button-text').textContent = 'Prijavi se';
        document.getElementById('student-password').value = '';
        this.showLoginMessage('Unesite email i lozinku za prijavu.', 'info');
        
        // Update tab buttons
        this.updateTabButtons('login');
    },

    switchToRegister() {
        document.getElementById('password-field').classList.add('hidden');
        document.getElementById('login-button-text').textContent = 'Pošalji zahtev za pristup';
        document.getElementById('student-password').value = '';
        this.hideLoginMessage();
        
        // Update tab buttons
        this.updateTabButtons('register');
    },

    hideLoginMessage() {
        const messageDiv = document.getElementById('login-message');
        if (messageDiv) {
            messageDiv.classList.add('hidden');
        }
    },

    // Test user creation for demonstration
    createTestStudent() {
        const testStudent = {
            id: 'test-student-' + Date.now(),
            email: 'test@ucenik.rs',
            password: 'test123',
            approvedAt: new Date().toISOString()
        };
        
        // Add to approved students
        const approvedStudents = JSON.parse(localStorage.getItem('approved_students') || '[]');
        approvedStudents.push(testStudent);
        localStorage.setItem('approved_students', JSON.stringify(approvedStudents));
        
        console.log('Test student created:', testStudent);
        console.log('Login credentials:');
        console.log('Email: test@ucenik.rs');
        console.log('Password: test123');
        
        alert('Test učenik kreiran!\n\nEmail: test@ucenik.rs\nLozinka: test123\n\nSada se možete prijaviti.');
    },

    updateTabButtons(activeTab) {
        const loginTab = document.getElementById('login-tab');
        const registerTab = document.getElementById('register-tab');
        
        if (activeTab === 'login') {
            loginTab.className = 'flex-1 py-3 px-4 rounded-lg font-black text-sm transition-all bg-white text-blue-600 shadow-sm';
            registerTab.className = 'flex-1 py-3 px-4 rounded-lg font-black text-sm transition-all text-slate-500 hover:text-slate-700';
        } else {
            loginTab.className = 'flex-1 py-3 px-4 rounded-lg font-black text-sm transition-all text-slate-500 hover:text-slate-700';
            registerTab.className = 'flex-1 py-3 px-4 rounded-lg font-black text-sm transition-all bg-white text-blue-600 shadow-sm';
        }
        
        // Update title and description
        const title = document.querySelector('#view-student-login h2');
        const description = document.querySelector('#view-student-login p');
        
        if (activeTab === 'login') {
            title.textContent = 'Prijavi se';
            description.textContent = 'Unesi svoje podatke za pristup';
        } else {
            title.textContent = 'Registruj se';
            description.textContent = 'Zatražite pristup učeniku';
        }
    }
};

window.onload = () => app.init();
