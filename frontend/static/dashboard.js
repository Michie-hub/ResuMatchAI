// Dashboard Logic - Merged with Wizard functionality
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

// Global variables
let currentAiSuggestions = null;

// Wizard State
const wizard = {
    currentStep: 1,
    uploadedResume: null,
    selectedJob: null,
    matchResults: null
};

// Helper Functions
const getStoredUser = () => JSON.parse(localStorage.getItem('user'));

const fetchWithAuth = async (url, options = {}) => {
    const user = getStoredUser();
    if (!user || !user.idToken) {
        window.location.href = 'index.html';
        throw new Error("User not authenticated. Please sign in.");
    }
    const headers = { Authorization: `Bearer ${user.idToken}`, ...options.headers };
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
        throw new Error('Session expired. Please sign in again.');
    }
    return response;
};

// Expose globally
window.API_BASE_URL = API_BASE_URL;
window.fetchWithAuth = fetchWithAuth;
window.currentAiSuggestions = currentAiSuggestions;
window.wizard = wizard;

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication first
    const user = getStoredUser();
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    // UI Elements (Dashboard + Wizard)
    const ui = {
        // Dashboard elements
        userEmailDisplay: document.getElementById('userEmail'),
        logoutBtn: document.getElementById('logoutBtn'),
        profileBtn: document.getElementById('profileBtn'),
        profileModal: document.getElementById('profileModal'),
        closeProfileModal: document.getElementById('closeProfileModal'),
        profileForm: document.getElementById('profileForm'),
        profileMessage: document.getElementById('profileMessage'),
        profilePicContainer: document.getElementById('profilePicContainer'),
        profilePicInput: document.getElementById('profilePicInput'),
        profilePicPreview: document.getElementById('profilePicPreview'),
        resumeUploadForm: document.getElementById('resumeUploadForm'),
        resumeFileInput: document.getElementById('resumeFileInput'),
        resumeList: document.getElementById('resumeList'),
        resumeMessage: document.getElementById('resumeMessage'),
        jobSaveForm: document.getElementById('jobSaveForm'),
        jobList: document.getElementById('jobList'),
        jobMessage: document.getElementById('jobMessage'),
        confirmationModal: document.getElementById('confirmationModal'),
        confirmCancelBtn: document.getElementById('confirmCancelBtn'),
        confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
        confirmationMessage: document.getElementById('confirmationMessage'),
        resumeSelect: document.getElementById('resumeSelect'),
        jobSelect: document.getElementById('jobSelect'),
        matchBtn: document.getElementById('matchBtn'),
        matchResultContainer: document.getElementById('matchResultContainer'),
        matchScoreCircle: document.getElementById('matchScoreCircle'),
        keywordsFound: document.getElementById('keywordsFound'),
        keywordsMissing: document.getElementById('keywordsMissing'),
        matchMessage: document.getElementById('matchMessage'),
        improveResumeBtn: document.getElementById('improveResumeBtn'),
        aiBuilderModal: document.getElementById('aiBuilderModal'),
        closeAiBuilderModal: document.getElementById('closeAiBuilderModal'),
        aiSuggestionsContainer: document.getElementById('aiSuggestionsContainer'),
        aiBuilderMessage: document.getElementById('aiBuilderMessage'),
        templateSelection: document.getElementById('templateSelection'),
        createAiResumeBtn: document.getElementById('createAiResumeBtn'),
        jobSearchForm: document.getElementById('jobSearchForm'),
        jobSearchResults: document.getElementById('jobSearchResults'),
        jobSearchMessage: document.getElementById('jobSearchMessage'),
        
        // Wizard elements
        step1: document.getElementById('wizardStep1'),
        step2: document.getElementById('wizardStep2'),
        step3: document.getElementById('wizardStep3'),
        stepIndicator1: document.getElementById('step1'),
        stepIndicator2: document.getElementById('step2'),
        stepIndicator3: document.getElementById('step3'),
        progress: document.getElementById('wizardProgress'),
        resumeInput: document.getElementById('wizardResumeInput'),
        dropZone: document.getElementById('dropZone'),
        togglePaste: document.getElementById('togglePaste'),
        pasteArea: document.getElementById('pasteResumeArea'),
        uploadedFileDisplay: document.getElementById('uploadedFileDisplay'),
        uploadedFileName: document.getElementById('uploadedFileName'),
        removeUploadedFile: document.getElementById('removeUploadedFile'),
        nextToJob: document.getElementById('nextToJob'),
        jobListWizard: document.getElementById('wizardJobList'),
        addNewJobBtn: document.getElementById('addNewJobBtn'),
        backToResume: document.getElementById('backToResume'),
        nextToResults: document.getElementById('nextToResults'),
        analyzeText: document.getElementById('analyzeText'),
        analyzeLoading: document.getElementById('analyzeLoading'),
        scoreCircle: document.getElementById('wizardScoreCircle'),
        keywordsFoundWizard: document.getElementById('wizardKeywordsFound'),
        keywordsMissingWizard: document.getElementById('wizardKeywordsMissing'),
        improveResumeWizardBtn: document.getElementById('improveResumeWizardBtn'),
        backToJob: document.getElementById('backToJob'),
        startOver: document.getElementById('startOver')
    };

    // Expose wizard UI globally
    window.wizardUI = ui;

    let selectedProfilePicFile = null;

    // Utility Functions
    const openModal = modal => modal?.classList.remove('hidden');
    const closeModal = modal => modal?.classList.add('hidden');

    const showMessage = (el, text, isError = false, duration = 3000) => {
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('text-red-500', isError);
        el.classList.toggle('text-green-600', !isError);
        if (duration) setTimeout(() => el.textContent = '', duration);
    };

    const showConfirmation = (message = 'This action cannot be undone.') => {
        return new Promise((resolve, reject) => {
            ui.confirmationMessage.textContent = message;
            openModal(ui.confirmationModal);
            ui.confirmDeleteBtn.onclick = () => {
                closeModal(ui.confirmationModal);
                resolve();
            };
            ui.confirmCancelBtn.onclick = () => {
                closeModal(ui.confirmationModal);
                reject(new Error('Action cancelled'));
            };
        });
    };

    // Wizard Helper Functions
    const updateStepIndicators = () => {
        [ui.stepIndicator1, ui.stepIndicator2, ui.stepIndicator3].forEach(step => {
            step?.classList.remove('active', 'completed');
        });

        for (let i = 1; i <= wizard.currentStep; i++) {
            const stepEl = document.getElementById(`step${i}`);
            if (stepEl) {
                if (i < wizard.currentStep) {
                    stepEl.classList.add('completed');
                } else if (i === wizard.currentStep) {
                    stepEl.classList.add('active');
                }
            }
        }

        if (ui.progress) {
            const progress = ((wizard.currentStep - 1) / 2) * 100;
            ui.progress.style.width = `${progress}%`;
        }
    };

    const showStep = (stepNumber) => {
        ui.step1?.classList.add('hidden');
        ui.step2?.classList.add('hidden');
        ui.step3?.classList.add('hidden');

        const stepEl = document.getElementById(`wizardStep${stepNumber}`);
        stepEl?.classList.remove('hidden');
        
        wizard.currentStep = stepNumber;
        updateStepIndicators();
    };

    // Set user email in header
    if (ui.userEmailDisplay) ui.userEmailDisplay.textContent = user.email;

    // ==================== PROFILE MANAGEMENT ====================
    const loadProfileData = async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/user/profile`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            const profileUser = data.user;
            document.getElementById('profileFullName').value = profileUser.full_name || '';
            document.getElementById('profileEmail').value = profileUser.email || '';
            document.getElementById('profileWebsiteUrl').value = profileUser.website_url || '';
            document.getElementById('profileCity').value = profileUser.city || '';
            document.getElementById('profileCountry').value = profileUser.country || '';
            document.getElementById('profileAbout').value = profileUser.about || '';
            document.getElementById('memberSince').textContent = new Date(profileUser.created_at).toLocaleDateString();
            ui.profilePicPreview.src = profileUser.profile_image_url || 'https://placehold.co/100x100/e2e8f0/475569?text=Avatar';
        } catch (err) {
            showMessage(ui.profileMessage, `Error loading profile: ${err.message}`, true);
        }
    };
    
    // ==================== RESUME MANAGEMENT ====================
    const renderResumeList = (resumes) => {
        if (ui.resumeList) ui.resumeList.innerHTML = '';
        if (ui.resumeSelect) ui.resumeSelect.innerHTML = '<option value="">-- Select a resume --</option>';
        
        if (resumes.length === 0) {
            if (ui.resumeList) ui.resumeList.innerHTML = '<li class="text-sm text-gray-500 text-center">No resumes uploaded yet.</li>';
        } else {
            resumes.forEach(resume => {
                if (ui.resumeList) {
                    const li = document.createElement('li');
                    li.className = 'flex justify-between items-start bg-gray-50 p-2 rounded';
                    li.innerHTML = `
                         
                        <span class="text-sm text-balance break-words truncate whitespace-normal overflow-hidden max-w-[50%]">${resume.original_filename} ${resume.is_ai_generated ? ' (AI✨)' : ''}</span>
                        <div class="flex-shrink-0 overflow-hidden">
                            <button class="match-resume-btn ml-2 text-blue-500 hover:text-blue-700 text-xs font-bold mr-3" data-id="${resume.id}" data-original-filename="${resume.original_filename}">MATCH</button>
                            <a href="#" data-saved-filename="${resume.saved_filename}" data-original-filename="${resume.original_filename}" class="download-resume-btn text-blue-500 hover:text-blue-700 text-xs font-bold mr-3">DOWNLOAD</a>
                            <button data-id="${resume.id}" class="delete-resume-btn text-red-500 hover:text-red-700 text-xs font-bold">DELETE</button>
                        </div>
                    `;
                    ui.resumeList.appendChild(li);
                }

                if (ui.resumeSelect) {
                    const option = document.createElement('option');
                    option.value = resume.id;
                    option.textContent = resume.original_filename;
                    ui.resumeSelect.appendChild(option);
                }
            });
        }
    };
    
    const fetchResumes = async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/resumes`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            const resumes = data.resumes || [];
            renderResumeList(resumes);
        } catch (err) {
            showMessage(ui.resumeMessage, `Error loading resumes: ${err.message}`, true);
        }
    };

    window.fetchResumes = fetchResumes;

    // Resume Upload Handler (used by both dashboard and wizard)
    const handleResumeUpload = async (file) => {
        const formData = new FormData();
        formData.append('resume_file', file);

        try {
            if (ui.nextToJob) {
                ui.nextToJob.disabled = true;
                ui.nextToJob.innerHTML = '<span class="loading"></span> Uploading...';
            }

            const res = await fetchWithAuth(`${API_BASE_URL}/api/resumes/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.message);

            wizard.uploadedResume = data.resume;
            
            // Update wizard UI
            if (ui.uploadedFileName && ui.uploadedFileDisplay) {
                ui.uploadedFileName.textContent = file.name;
                ui.uploadedFileDisplay.classList.remove('hidden');
            }
            
            if (ui.nextToJob) {
                ui.nextToJob.disabled = false;
                ui.nextToJob.innerHTML = 'Next: Select Job';
            }
         

            // Update main resume list
            fetchResumes();
            
            return data.resume;
        } catch (err) {
            alert(`Upload failed: ${err.message}`);
            if (ui.nextToJob) {
                ui.nextToJob.disabled = true;
                ui.nextToJob.innerHTML = 'Next: Select Job';
            }
            throw err;
        }
    };

    // Resume List Action Handlers
    ui.resumeList?.addEventListener('click', async e => {
        const target = e.target;
        const resumeId = target.dataset.id;

        // Delete Resume
        if (target.classList.contains('delete-resume-btn')) {
            try {
                await showConfirmation('Are you sure you want to delete this resume?');
                const res = await fetchWithAuth(`${API_BASE_URL}/api/resumes/${resumeId}`, { method: 'DELETE' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                showMessage(ui.resumeMessage, 'Resume deleted.');
                fetchResumes();
            } catch (err) {
                if (err && err.message !== 'Action cancelled') {
                    showMessage(ui.resumeMessage, `Error: ${err.message}`, true);
                }
            }
        }

        // Download Resume
        if (target.classList.contains('download-resume-btn')) {
            e.preventDefault();
            const savedFilename = target.dataset.savedFilename;
            const originalFilename = target.dataset.originalFilename;
            try {
                showMessage(ui.resumeMessage, 'Downloading...', false, 5000);
                const res = await fetchWithAuth(`${API_BASE_URL}/resumes/${savedFilename}`);
                if (!res.ok) throw new Error(`Server responded with ${res.status}`);
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = originalFilename;
                a.click();
                window.URL.revokeObjectURL(url);
                showMessage(ui.resumeMessage, '');
            } catch (err) {
                showMessage(ui.resumeMessage, `Download failed: ${err.message}`, true);
            }
        }

        // Match Resume → Wizard
        if (target.classList.contains('match-resume-btn')) {
            const resumeName = target.dataset.originalFilename;

            // Store resume in wizard state
            wizard.uploadedResume = { id: resumeId, original_filename: resumeName };

            // Update wizard UI
            if (ui.uploadedFileDisplay && ui.uploadedFileName) {
                ui.uploadedFileDisplay.classList.remove('hidden');
                ui.uploadedFileName.textContent = resumeName;
            }

            if (ui.nextToJob) {
                ui.nextToJob.disabled = false;
            }

            // Load jobs and move to Step 2
            await loadJobsForWizard();
            showStep(2);

            showMessage(ui.resumeMessage, `Resume "${resumeName}" loaded in wizard.`, false, 3000);
        }
    });

    // ==================== JOB MANAGEMENT ====================
    const renderJobList = (jobs) => {
        if (ui.jobList) ui.jobList.innerHTML = '';
        if (ui.jobSelect) ui.jobSelect.innerHTML = '<option value="">-- Select a job --</option>';
        
        if (jobs.length === 0) {
            if (ui.jobList) ui.jobList.innerHTML = '<li class="text-sm text-gray-500 text-center">No jobs saved yet.</li>';
        } else {
            jobs.forEach(job => {
                if (ui.jobList) {
                    const li = document.createElement('li');
                    li.className = 'flex justify-between items-center bg-gray-50 p-2 rounded';
                    li.innerHTML = `<span class="text-sm font-medium">${job.title}</span><button data-id="${job.id}" class="delete-job-btn text-red-500 hover:text-red-700 text-xs font-bold">DELETE</button>`;
                    ui.jobList.appendChild(li);
                }

                if (ui.jobSelect) {
                    const option = document.createElement('option');
                    option.value = job.id;
                    option.textContent = `${job.title} (${job.company || 'N/A'})`;
                    ui.jobSelect.appendChild(option);
                }
            });
        }
    };

    const fetchJobs = async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/jobs`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            renderJobList(data.jobs);
        } catch (err) {
            showMessage(ui.jobMessage, `Error fetching jobs: ${err.message}`, true);
        }
    };

    window.fetchJobs = fetchJobs;

    // Load Jobs for Wizard
    const loadJobsForWizard = async () => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/jobs`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            if (ui.jobListWizard) {
                ui.jobListWizard.innerHTML = '';
                
                if (data.jobs.length === 0) {
                    ui.jobListWizard.innerHTML = '<p class="text-center text-gray-500">No jobs saved yet. Add a new job description below.</p>';
                } else {
                    data.jobs.forEach(job => {
                        const jobOption = document.createElement('div');
                        jobOption.className = 'jobOption';
                        jobOption.dataset.jobId = job.id;
                        jobOption.innerHTML = `
                            <div class="jobTitle">${job.title}</div>
                            <div class="jobCompany">${job.company || 'Company not specified'}</div>
                        `;
                        jobOption.addEventListener('click', () => selectJob(job.id, jobOption));
                        ui.jobListWizard.appendChild(jobOption);
                    });
                }
            }
        } catch (err) {
            if (ui.jobListWizard) {
                ui.jobListWizard.innerHTML = `<p class="text-center text-red-500">Error loading jobs: ${err.message}</p>`;
            }
        }
    };

    const selectJob = (jobId, element) => {
        document.querySelectorAll('.jobOption').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        wizard.selectedJob = jobId;
        if (ui.nextToResults) ui.nextToResults.disabled = false;
    };

    const saveNewJob = async (jobData) => {
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/jobs/save`, {
                method: 'POST',
                body: JSON.stringify(jobData)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            
            await loadJobsForWizard();
            fetchJobs();
        } catch (err) {
            alert(`Failed to save job: ${err.message}`);
        }
    };

    // Job List Actions
    ui.jobList?.addEventListener('click', async e => {
        if (e.target.classList.contains('delete-job-btn')) {
            const id = e.target.dataset.id;
            try {
                await showConfirmation('Are you sure you want to delete this job?');
                const res = await fetchWithAuth(`${API_BASE_URL}/api/jobs/${id}`, { method: 'DELETE' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                showMessage(ui.jobMessage, 'Job deleted.');
                fetchJobs();
            } catch (err) {
                if (err && err.message !== 'Action cancelled') {
                    showMessage(ui.jobMessage, `Error: ${err.message}`, true);
                }
            }
        }
    });

    // ==================== JOB SEARCH ====================
    const renderJobSearchResults = (jobs) => {
        if (!ui.jobSearchResults) return;
        ui.jobSearchResults.innerHTML = '';
        jobs.forEach(job => {
            const card = document.createElement('div');
            card.className = 'job-card bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col';
            const jobDescription = (job.job_description || 'No description available.').substring(0, 100) + '...';
            card.innerHTML = `
                <h4 class="font-bold text-md mb-1">${job.job_title}</h4>
                <p class="text-sm text-gray-600 mb-1">${job.employer_name}</p>
                <p class="text-sm text-gray-500 mb-3">${job.job_city || ''}, ${job.job_country || ''}</p>
                <p class="text-xs text-gray-500 flex-grow">${jobDescription}</p>
                <button class="save-searched-job-btn mt-4 bg-blue-100 text-blue-800 font-semibold px-3 py-1.5 rounded-lg text-xs hover:bg-blue-200">Save Job</button>
            `;
            const saveBtn = card.querySelector('.save-searched-job-btn');
            saveBtn.dataset.title = job.job_title;
            saveBtn.dataset.company = job.employer_name;
            saveBtn.dataset.description = job.job_description;
            ui.jobSearchResults.appendChild(card);
        });
    };

    // ==================== AI & MATCH FUNCTIONS ====================
    const renderKeywords = (container, keywords, className) => {
        if (!container) return;
        container.innerHTML = '';
        if (keywords.length === 0) {
            container.innerHTML = `<span class="text-xs italic text-gray-500">None</span>`;
        } else {
            keywords.forEach(kw => {
                const span = document.createElement('span');
                span.className = `text-xs px-2 py-1 rounded-full ${className}`;
                span.textContent = kw;
                container.appendChild(span);
            });
        }
    };

    const displayWizardResults = (data) => {
        const score = data.match_score;
        
        if (ui.scoreCircle) {
            ui.scoreCircle.textContent = `${score}%`;
            ui.scoreCircle.style.background = score > 75 ? 
                'linear-gradient(135deg, #10b981, #059669)' : 
                score > 50 ? 
                'linear-gradient(135deg, #f59e0b, #d97706)' : 
                'linear-gradient(135deg, #ef4444, #dc2626)';
        }

        if (ui.keywordsFoundWizard) {
            ui.keywordsFoundWizard.innerHTML = '';
            if (data.found_keywords.length === 0) {
                ui.keywordsFoundWizard.innerHTML = '<span class="text-gray-500 italic text-sm">No matching keywords found</span>';
            } else {
                data.found_keywords.forEach(keyword => {
                    const badge = document.createElement('span');
                    badge.className = 'keywordBadge found';
                    badge.textContent = keyword;
                    ui.keywordsFoundWizard.appendChild(badge);
                });
            }
        }

        const missingKeywords = data.job_keywords.filter(kw => !data.found_keywords.includes(kw));
        if (ui.keywordsMissingWizard) {
            ui.keywordsMissingWizard.innerHTML = '';
            if (missingKeywords.length === 0) {
                ui.keywordsMissingWizard.innerHTML = '<span class="text-green-600 italic text-sm">Great! Your resume includes all key skills</span>';
            } else {
                missingKeywords.forEach(keyword => {
                    const badge = document.createElement('span');
                    badge.className = 'keywordBadge missing';
                    badge.textContent = keyword;
                    ui.keywordsMissingWizard.appendChild(badge);
                });
            }
        }
    };

    const handleImproveResumeClick = async () => {
        const resumeId = ui.resumeSelect?.value;
        const jobId = ui.jobSelect?.value;
        if (!resumeId || !jobId) {
            showMessage(ui.aiBuilderMessage, "Error: A resume and job must be selected for matching first.", true);
            return;
        }
        openModal(ui.aiBuilderModal);
        showMessage(ui.aiBuilderMessage, '', false);
        if (ui.aiSuggestionsContainer) {
            ui.aiSuggestionsContainer.innerHTML = `<p class="text-gray-500 text-center py-10">Generating AI suggestions... This may take a moment.</p>`;
        }
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/ai/generate-suggestions`, {
                method: 'POST',
                body: JSON.stringify({ resume_id: resumeId, job_id: jobId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            currentAiSuggestions = data.suggestions;
            window.currentAiSuggestions = data.suggestions;

            try {
                const suggestionsObj = JSON.parse(data.suggestions.replace(/```json|```/g, '').trim());
                const suggestionsList = suggestionsObj.suggestions;
                if (suggestionsList && suggestionsList.length > 0 && ui.aiSuggestionsContainer) {
                    ui.aiSuggestionsContainer.innerHTML = '<ul class="list-disc space-y-2 pl-5 text-sm"></ul>';
                    const ul = ui.aiSuggestionsContainer.querySelector('ul');
                    suggestionsList.forEach(suggestion => {
                        const li = document.createElement('li');
                        li.textContent = suggestion;
                        ul.appendChild(li);
                    });
                } else {
                    throw new Error("No suggestions found in AI response.");
                }
            } catch (parseError) {
                console.error("Could not parse AI response as JSON:", parseError);
                if (ui.aiSuggestionsContainer) {
                    ui.aiSuggestionsContainer.innerHTML = `<p class="text-sm text-gray-700 whitespace-pre-wrap">${data.suggestions}</p>`;
                }
            }
        } catch (error) {
            if (ui.aiSuggestionsContainer) {
                ui.aiSuggestionsContainer.innerHTML = `<p class="text-red-500 text-center py-10">Error: ${error.message}</p>`;
            }
        }
    };

    // ==================== WIZARD EVENT LISTENERS ====================
    
    // Step 1: Resume Upload
    ui.resumeInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await handleResumeUpload(file);
        }
    });

    // Drag and drop
    ui.dropZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        ui.dropZone.classList.add('dragover');
    });

    ui.dropZone?.addEventListener('dragleave', () => {
        ui.dropZone?.classList.remove('dragover');
    });

    ui.dropZone?.addEventListener('drop', async (e) => {
        e.preventDefault();
        ui.dropZone?.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.type === 'application/pdf' || file.name.endsWith('.docx'))) {
            await handleResumeUpload(file);
        } else {
            alert('Please upload a PDF or DOCX file');
        }
    });

    // Toggle paste area
    ui.togglePaste?.addEventListener('click', () => {
        ui.pasteArea?.classList.toggle('hidden');
    });

    // Remove uploaded file
    ui.removeUploadedFile?.addEventListener('click', () => {
        wizard.uploadedResume = null;
        ui.uploadedFileDisplay?.classList.add('hidden');
        ui.uploadedFileName.textContent = '';
        if (ui.resumeInput) ui.resumeInput.value = '';
        if (ui.nextToJob) ui.nextToJob.disabled = true;
    });

    // Navigate to Step 2
    ui.nextToJob?.addEventListener('click', async () => {
        await loadJobsForWizard();
        showStep(2);
    });

    // Add new job in wizard
    ui.addNewJobBtn?.addEventListener('click', () => {
        const title = prompt('Job Title:');
        if (!title) return;
        
        const company = prompt('Company (optional):');
        const description = prompt('Job Description:');
        if (!description) return;

        saveNewJob({ title, company, description_text: description });
    });

    // Navigate back to Step 1
    ui.backToResume?.addEventListener('click', () => showStep(1));

    // Navigate to Step 3 (Run Match)
    ui.nextToResults?.addEventListener('click', async () => {
        if (!wizard.uploadedResume || !wizard.selectedJob) {
            alert('Please ensure a resume and job are selected');
            return;
        }

        if (ui.nextToResults) ui.nextToResults.disabled = true;
        ui.analyzeText?.classList.add('hidden');
        ui.analyzeLoading?.classList.remove('hidden');

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/match`, {
                method: 'POST',
                body: JSON.stringify({
                    resume_id: wizard.uploadedResume.id,
                    job_id: wizard.selectedJob
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            wizard.matchResults = data;
            displayWizardResults(data);
            showStep(3);
        } catch (err) {
            alert(`Match analysis failed: ${err.message}`);
        } finally {
            if (ui.nextToResults) ui.nextToResults.disabled = false;
            ui.analyzeText?.classList.remove('hidden');
            ui.analyzeLoading?.classList.add('hidden');
        }
    });

    // Improve Resume with AI (Wizard)
    ui.improveResumeWizardBtn?.addEventListener('click', async () => {
        if (!wizard.uploadedResume || !wizard.selectedJob) return;

        openModal(ui.aiBuilderModal);
        if (ui.aiSuggestionsContainer) {
            ui.aiSuggestionsContainer.innerHTML = '<p class="text-gray-500 text-center py-10">Generating AI suggestions... This may take a moment.</p>';
        }
        showMessage(ui.aiBuilderMessage, '', false);

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/ai/generate-suggestions`, {
                method: 'POST',
                body: JSON.stringify({
                    resume_id: wizard.uploadedResume.id,
                    job_id: wizard.selectedJob
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            window.currentAiSuggestions = data.suggestions;

            try {
                const suggestionsObj = JSON.parse(data.suggestions.replace(/```json|```/g, '').trim());
                const suggestionsList = suggestionsObj.suggestions;
                if (suggestionsList && suggestionsList.length > 0 && ui.aiSuggestionsContainer) {
                    ui.aiSuggestionsContainer.innerHTML = '<ul class="list-disc space-y-2 pl-5 text-sm"></ul>';
                    const ul = ui.aiSuggestionsContainer.querySelector('ul');
                    suggestionsList.forEach(suggestion => {
                        const li = document.createElement('li');
                        li.textContent = suggestion;
                        ul.appendChild(li);
                    });
                } else {
                    throw new Error("No suggestions found in AI response.");
                }
            } catch (parseError) {
                console.error("Could not parse AI response as JSON:", parseError);
                if (ui.aiSuggestionsContainer) {
                    ui.aiSuggestionsContainer.innerHTML = `<p class="text-sm text-gray-700 whitespace-pre-wrap">${data.suggestions}</p>`;
                }
            }
        } catch (error) {
            if (ui.aiSuggestionsContainer) {
                ui.aiSuggestionsContainer.innerHTML = `<p class="text-red-500 text-center py-10">Error: ${error.message}</p>`;
            }
        }
    });

    // Wizard Navigation
    ui.backToJob?.addEventListener('click', () => showStep(2));
    
    ui.startOver?.addEventListener('click', () => {
        // Reset wizard
        wizard.uploadedResume = null;
        wizard.selectedJob = null;
        wizard.matchResults = null;
        
        // Reset UI
        if (ui.resumeInput) ui.resumeInput.value = '';
        ui.uploadedFileDisplay?.classList.add('hidden');
        ui.uploadedFileName.textContent = '';
        ui.resumeInput.value = '';
        ui.pasteArea?.classList.add('hidden');
        if (ui.pasteArea) ui.pasteArea.value = '';
        if (ui.nextToJob) ui.nextToJob.disabled = true;
        if (ui.nextToResults) ui.nextToResults.disabled = true;
        
        // Clear selections
        document.querySelectorAll('.jobOption').forEach(el => el.classList.remove('selected'));
        
        // Go back to step 1
        showStep(1);
    });

    // ==================== DASHBOARD EVENT LISTENERS ====================
    
    // Logout
    ui.logoutBtn?.addEventListener('click', () => {
        auth.signOut();
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    });

    // Profile
    ui.profileBtn?.addEventListener('click', () => {
        loadProfileData();
        openModal(ui.profileModal);
    });

    ui.closeProfileModal?.addEventListener('click', () => closeModal(ui.profileModal));

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

    // Resume Upload (Dashboard)
    ui.resumeUploadForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const file = ui.resumeFileInput?.files[0];
        if (!file) return;
        showMessage(ui.resumeMessage, 'Uploading...', false, null);
        try {
            await handleResumeUpload(file);
            showMessage(ui.resumeMessage, 'Upload successful!', false);
            ui.resumeUploadForm.reset();
        } catch (err) {
            showMessage(ui.resumeMessage, `Error: ${err.message}`, true);
        }
    });

    // Job Save (Dashboard)
    ui.jobSaveForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const jobData = {
            title: document.getElementById('jobTitleInput')?.value,
            company: document.getElementById('jobCompanyInput')?.value,
            description_text: document.getElementById('jobDescriptionInput')?.value
        };
        showMessage(ui.jobMessage, 'Saving...', false, null);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/jobs/save`, {
                method: 'POST',
                body: JSON.stringify(jobData)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            showMessage(ui.jobMessage, 'Job saved successfully!', false);
            fetchJobs();
            ui.jobSaveForm.reset();
        } catch (err) {
            showMessage(ui.jobMessage, `Error: ${err.message}`, true);
        }
    });

    // Job Search
    ui.jobSearchForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const query = document.getElementById('jobSearchQuery')?.value;
        const location = document.getElementById('jobSearchLocation')?.value;
        showMessage(ui.jobSearchMessage, 'Searching for jobs...', false, null);
        if (ui.jobSearchResults) ui.jobSearchResults.innerHTML = '';
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/jobs/search?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`);
            const jobs = await res.json();
            if (!res.ok) throw new Error(jobs.message || 'Search failed');
            if (jobs.length === 0) {
                showMessage(ui.jobSearchMessage, 'No jobs found for your search criteria.', false);
            } else {
                renderJobSearchResults(jobs);
                showMessage(ui.jobSearchMessage, '');
            }
        } catch (err) {
            showMessage(ui.jobSearchMessage, `Error: ${err.message}`, true);
        }
    });

    // Job Search Results - Save Button
    ui.jobSearchResults?.addEventListener('click', async e => {
        if (e.target.classList.contains('save-searched-job-btn')) {
            e.target.disabled = true;
            e.target.textContent = 'Saving...';
            const jobData = {
                title: e.target.dataset.title,
                company: e.target.dataset.company,
                description_text: e.target.dataset.description
            };
            try {
                const res = await fetchWithAuth(`${API_BASE_URL}/api/jobs/save`, {
                    method: 'POST',
                    body: JSON.stringify(jobData)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                showMessage(ui.jobSearchMessage, `"${jobData.title}" saved successfully!`, false);
                fetchJobs();
                e.target.textContent = 'Saved!';
                e.target.classList.remove('bg-blue-100', 'text-blue-800');
                e.target.classList.add('bg-green-100', 'text-green-800');
            } catch (err) {
                showMessage(ui.jobSearchMessage, `Error: ${err.message}`, true);
                e.target.disabled = false;
                e.target.textContent = 'Save Job';
            }
        }
    });

    // AI Matcher (Dashboard)
    ui.matchBtn?.addEventListener('click', async () => {
        const resumeId = ui.resumeSelect?.value;
        const jobId = ui.jobSelect?.value;
        if (!resumeId || !jobId) {
            showMessage(ui.matchMessage, 'Please select both a resume and a job.', true);
            return;
        }
        showMessage(ui.matchMessage, 'Analyzing...', false, null);
        ui.matchResultContainer?.classList.add('hidden');
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/match`, {
                method: 'POST',
                body: JSON.stringify({ resume_id: resumeId, job_id: jobId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            const score = data.match_score;
            if (ui.matchScoreCircle) {
                ui.matchScoreCircle.textContent = `${score}%`;
                ui.matchScoreCircle.style.background = score > 75 ? '#22c55e' : score > 50 ? '#f59e0b' : '#ef4444';
            }

            const missingKeywords = data.job_keywords.filter(kw => !data.found_keywords.includes(kw));
            renderKeywords(ui.keywordsFound, data.found_keywords, 'bg-green-100 text-green-800');
            renderKeywords(ui.keywordsMissing, missingKeywords, 'bg-red-100 text-red-800');

            ui.matchResultContainer?.classList.remove('hidden');
            showMessage(ui.matchMessage, '', false);
        } catch (err) {
            showMessage(ui.matchMessage, `Error: ${err.message}`, true);
        }
    });

    // AI Builder Modal
    ui.closeAiBuilderModal?.addEventListener('click', () => closeModal(ui.aiBuilderModal));

    ui.templateSelection?.addEventListener('click', e => {
        const card = e.target.closest('.template-card');
        if (card) {
            document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        }
    });

    ui.createAiResumeBtn?.addEventListener('click', async () => {
        // Check if we're in wizard mode
        const isWizardMode = wizard.uploadedResume !== null;
        
        let resumeId;
        if (isWizardMode) {
            resumeId = wizard.uploadedResume.id;
        } else {
            resumeId = ui.resumeSelect?.value;
        }

        const selectedTemplateEl = document.querySelector('.template-card.selected');
        const template = selectedTemplateEl ? selectedTemplateEl.dataset.template : 'modern';

        if (!resumeId || !window.currentAiSuggestions) {
            showMessage(ui.aiBuilderMessage, 'Please generate suggestions before creating a resume.', true);
            return;
        }
        showMessage(ui.aiBuilderMessage, 'Creating new resume with AI... This can take up to 30 seconds.', false, null);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/ai/create-resume`, {
                method: 'POST',
                body: JSON.stringify({
                    resume_id: resumeId,
                    suggestions: window.currentAiSuggestions,
                    template: template
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            showMessage(ui.aiBuilderMessage, 'Successfully created new resume!', false);
            fetchResumes();
            setTimeout(() => closeModal(ui.aiBuilderModal), 2000);
        } catch (error) {
            showMessage(ui.aiBuilderMessage, `Error: ${error.message}`, true);
        }
    });

    // ==================== INITIALIZE DASHBOARD & WIZARD ====================
    fetchResumes();
    fetchJobs();
    updateStepIndicators();
});