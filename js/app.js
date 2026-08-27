const App = (() => {
    const DAY_NAMES_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const MONTH_NAMES_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

    let currentMonday = TimetableAPI.getWeekMonday(new Date());
    let columns = [];
    let columnIdCounter = 0;
    let currentTab = 'group';
    let searchTimeout = null;

    let divisions = null;
    let selectedDivision = null;
    let programsWithLevels = null;
    let selectedProgram = null;
    let programGroups = null;

    let cachedGroups = null;
    let groupSearchMode = 'quick';

    let roomSearchStep = 'address';
    let selectedAddress = null;
    let cachedAddresses = null;
    let cachedClassrooms = null;

    const els = {};

    function init() {
        els.weekLabel = document.getElementById('week-label');
        els.timetable = document.getElementById('timetable');
        els.thead = document.getElementById('timetable-header');
        els.tbody = document.getElementById('timetable-body');
        els.emptyState = document.getElementById('empty-state');
        els.modalOverlay = document.getElementById('modal-overlay');
        els.searchInput = document.getElementById('search-input');
        els.searchResults = document.getElementById('search-results');
        els.searchSpinner = document.getElementById('search-spinner');
        els.breadcrumbs = document.getElementById('breadcrumbs');
        els.searchBox = document.getElementById('search-box');

        document.getElementById('btn-prev-week').addEventListener('click', () => { changeWeek(-1); });
        document.getElementById('btn-next-week').addEventListener('click', () => { changeWeek(1); });
        document.getElementById('btn-today').addEventListener('click', goToToday);
        document.getElementById('btn-add-column').addEventListener('click', openModal);
        document.getElementById('btn-modal-close').addEventListener('click', closeModal);
        els.modalOverlay.addEventListener('click', (e) => {
            if (e.target === els.modalOverlay) closeModal();
        });

        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        els.searchInput.addEventListener('input', onSearchInput);

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => switchGroupSearchMode(btn.dataset.mode));
        });

        updateWeekLabel();
        render();
        loadCachedGroups();
    }

    async function loadCachedGroups() {
        try {
            const response = await fetch('groups.json');
            if (response.ok) {
                cachedGroups = await response.json();
            }
        } catch (e) {
            // groups.json не найден, используется пошаговый выбор
        }
    }

    function switchGroupSearchMode(mode) {
        groupSearchMode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        initGroupSearch();
    }

    function changeWeek(delta) {
        currentMonday.setDate(currentMonday.getDate() + delta * 7);
        updateWeekLabel();
        render();
        refreshAllColumns();
    }

    function goToToday() {
        currentMonday = TimetableAPI.getWeekMonday(new Date());
        updateWeekLabel();
        render();
        refreshAllColumns();
    }

    function updateWeekLabel() {
        const from = new Date(currentMonday);
        const to = new Date(currentMonday);
        to.setDate(to.getDate() + 6);
        els.weekLabel.textContent = `${from.getDate()} ${MONTH_NAMES_GEN[from.getMonth()]} — ${to.getDate()} ${MONTH_NAMES_GEN[to.getMonth()]} ${to.getFullYear()}`;
    }

    function render() {
        renderHeader();
        renderBody();
        els.emptyState.classList.toggle('hidden', columns.length > 0);
        els.timetable.style.display = columns.length > 0 ? '' : 'none';
    }

    function renderHeader() {
        els.thead.innerHTML = '<th class="day-column-header">День</th>';
        for (const col of columns) {
            const th = document.createElement('th');
            th.innerHTML = `
                <span class="col-header-title">${escapeHtml(col.displayName)}</span>
                <span class="col-header-sub">${escapeHtml(col.typeLabel)}</span>
                <button class="btn-remove-col" data-col-id="${col.id}">Удалить</button>
            `;
            els.thead.appendChild(th);
        }
        els.thead.querySelectorAll('.btn-remove-col').forEach(btn => {
            btn.addEventListener('click', () => removeColumn(Number(btn.dataset.colId)));
        });
    }

    function renderBody() {
        els.tbody.innerHTML = '';

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(currentMonday);
            dayDate.setDate(dayDate.getDate() + i);

            const dayEventsByColumn = {};
            const allTimeSlots = new Set();

            for (const col of columns) {
                if (col.eventsData) {
                    const events = getEventsForDay(col, dayDate);
                    dayEventsByColumn[col.id] = events;
                    for (const ev of events) {
                        const timeKey = parseEventTime(ev.Start);
                        if (timeKey !== null) {
                            allTimeSlots.add(timeKey);
                        }
                    }
                } else {
                    dayEventsByColumn[col.id] = [];
                }
            }

            const sortedTimeSlots = Array.from(allTimeSlots).sort((a, b) => a - b);

            if (sortedTimeSlots.length === 0) {
                const tr = document.createElement('tr');
                const dayTd = document.createElement('td');
                dayTd.className = 'day-cell';
                dayTd.innerHTML = `${DAY_NAMES_SHORT[dayDate.getDay()]}<br><span style="font-weight:400;font-size:11px;">${dayDate.getDate()} ${MONTH_NAMES_GEN[dayDate.getMonth()]}</span>`;
                tr.appendChild(dayTd);

                for (const col of columns) {
                    const td = document.createElement('td');
                    td.className = 'event-cell';
                    if (!col.eventsData) {
                        td.innerHTML = '<span style="color:#ccc;font-size:12px;">Загрузка...</span>';
                    }
                    tr.appendChild(td);
                }

                els.tbody.appendChild(tr);
            } else {
                for (let slotIdx = 0; slotIdx < sortedTimeSlots.length; slotIdx++) {
                    const tr = document.createElement('tr');
                    if (slotIdx === 0) tr.classList.add('day-start');

                    const dayTd = document.createElement('td');
                    dayTd.className = 'day-cell';
                    if (slotIdx === 0) {
                        dayTd.rowSpan = sortedTimeSlots.length;
                        dayTd.innerHTML = `${DAY_NAMES_SHORT[dayDate.getDay()]}<br><span style="font-weight:400;font-size:11px;">${dayDate.getDate()} ${MONTH_NAMES_GEN[dayDate.getMonth()]}</span>`;
                        tr.appendChild(dayTd);
                    }

                    const slotTime = sortedTimeSlots[slotIdx];

                    for (const col of columns) {
                        const td = document.createElement('td');
                        td.className = 'event-cell';

                        const events = dayEventsByColumn[col.id] || [];
                        const slotEvents = events.filter(ev => parseEventTime(ev.Start) === slotTime);
                        const hasConflict = slotEvents.length > 1;

                        td.innerHTML = slotEvents.length > 0
                            ? slotEvents.map(ev => renderEventItem(ev, hasConflict)).join('')
                            : '';

                        tr.appendChild(td);
                    }

                    els.tbody.appendChild(tr);
                }
            }
        }
    }

    function parseEventTime(startStr) {
        if (!startStr) return null;

        // Формат "HH:MM:SS" или "HH:MM"
        const timeOnlyMatch = startStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
        if (timeOnlyMatch) {
            return parseInt(timeOnlyMatch[1]) * 60 + parseInt(timeOnlyMatch[2]);
        }

        // Полный формат даты
        const d = new Date(startStr);
        if (isNaN(d.getTime())) return null;
        return d.getHours() * 60 + d.getMinutes();
    }

    function getEventsForDay(col, date) {
        const data = col.eventsData;
        if (!data) return [];

        const targetDateStr = formatDateKey(date);

        if (data.Days && Array.isArray(data.Days)) {
            for (const day of data.Days) {
                if (day.Day) {
                    const d = new Date(day.Day);
                    if (formatDateKey(d) === targetDateStr) {
                        return day.DayStudyEvents || [];
                    }
                }
            }
        }

        if (data.EducatorEventsDays && Array.isArray(data.EducatorEventsDays)) {
            for (const day of data.EducatorEventsDays) {
                if (day.Day) {
                    const d = new Date(day.Day);
                    if (formatDateKey(d) === targetDateStr) {
                        return day.DayStudyEvents || [];
                    }
                }
            }
        }

        if (data.ClassroomEventsDays && Array.isArray(data.ClassroomEventsDays)) {
            const jsDay = date.getDay();
            const apiDay = jsDay === 0 ? 7 : jsDay;
            for (const day of data.ClassroomEventsDays) {
                if (Number(day.Day) === apiDay) {
                    return day.DayStudyEvents || [];
                }
            }
        }

        return [];
    }

    function formatDateKey(date) {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function renderEventItem(ev, isSimultaneous) {
        const cancelled = ev.IsCancelled || ev.IsCanceled;
        const subject = ev.Subject || '';
        const time = ev.TimeIntervalString || '';
        const educators = ev.EducatorsDisplayText || '';
        const groups = ev.ContingentUnitName || formatContingentUnits(ev.ContingentUnitNames) || '';
        const locations = ev.LocationsDisplayText || formatLocations(ev.EventLocations) || '';

        let details = '';
        if (groups) details += `<span>${escapeHtml(groups)}</span>`;
        if (educators) details += `<span>${escapeHtml(educators)}</span>`;
        if (locations) details += `<span>${escapeHtml(locations)}</span>`;

        const classes = ['event-item'];
        if (cancelled) classes.push('cancelled');
        if (isSimultaneous) classes.push('simultaneous');

        return `<div class="${classes.join(' ')}">
            <div class="event-subject">${escapeHtml(subject)}</div>
            ${time ? `<div class="event-time">${escapeHtml(time)}</div>` : ''}
            <div class="event-details">${details}</div>
        </div>`;
    }

    function formatContingentUnits(units) {
        if (!units || !Array.isArray(units)) return '';
        return units.map(u => u.Item1 || '').filter(Boolean).join(', ');
    }

    function formatLocations(locs) {
        if (!locs || !Array.isArray(locs)) return '';
        return locs.map(l => l.DisplayName || '').filter(Boolean).join(', ');
    }

    function openModal() {
        els.modalOverlay.classList.add('active');
        switchTab('group');
        setTimeout(() => els.searchInput.focus(), 100);
    }

    function closeModal() {
        els.modalOverlay.classList.remove('active');
    }

    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

        els.searchInput.value = '';
        els.modeSelector = document.getElementById('mode-selector');

        if (tab === 'group') {
            els.modeSelector.style.display = cachedGroups ? 'flex' : 'none';
            initGroupSearch();
        } else if (tab === 'room') {
            els.modeSelector.style.display = 'none';
            els.searchBox.style.display = '';
            roomSearchStep = 'address';
            selectedAddress = null;
            cachedClassrooms = null;
            els.searchInput.value = '';
            els.searchInput.placeholder = 'Введите часть адреса...';
            els.searchResults.innerHTML = '<p class="search-hint">Введите часть адреса для поиска</p>';
            updateRoomBreadcrumbs();
        } else if (tab === 'teacher') {
            els.modeSelector.style.display = 'none';
            els.searchBox.style.display = '';
            els.searchInput.placeholder = 'Поиск по фамилии преподавателя...';
            els.searchResults.innerHTML = '<p class="search-hint">Введите запрос для поиска</p>';
            els.breadcrumbs.innerHTML = '';
        }
    }

    async function initGroupSearch() {
        selectedDivision = null;
        selectedProgram = null;
        programsWithLevels = null;
        programGroups = null;

        updateBreadcrumbs();

        if (groupSearchMode === 'quick' && cachedGroups) {
            els.searchBox.style.display = '';
            els.searchInput.placeholder = 'Поиск по номеру группы...';
            els.searchResults.innerHTML = '<p class="search-hint">Введите номер группы (например, 26.Б11-пу)</p>';
            els.searchInput.focus();
        } else {
            els.searchBox.style.display = 'none';
            els.searchResults.innerHTML = '';

            if (!divisions) {
                els.searchResults.innerHTML = '<p class="search-loading">Загрузка подразделений...</p>';
                try {
                    divisions = await TimetableAPI.getStudyDivisions();
                } catch (err) {
                    els.searchResults.innerHTML = `<p class="search-hint">Ошибка загрузки: ${escapeHtml(err.message)}</p>`;
                    return;
                }
            }

            showDivisions();
        }
    }

    function updateBreadcrumbs() {
        let html = '';

        if (currentTab === 'group') {
            html += `<span class="breadcrumb-item${!selectedDivision ? ' current' : ''}" data-step="divisions">Подразделения</span>`;

            if (selectedDivision) {
                html += `<span class="breadcrumb-separator">›</span>`;
                html += `<span class="breadcrumb-item${!selectedProgram ? ' current' : ''}" data-step="programs">${escapeHtml(selectedDivision.Name)}</span>`;
            }

            if (selectedProgram) {
                html += `<span class="breadcrumb-separator">›</span>`;
                html += `<span class="breadcrumb-item current">${escapeHtml(selectedProgram.programName)} (${selectedProgram.year})</span>`;
            }
        }

        els.breadcrumbs.innerHTML = html;

        els.breadcrumbs.querySelectorAll('.breadcrumb-item:not(.current)').forEach(item => {
            item.addEventListener('click', () => {
                const step = item.dataset.step;
                if (step === 'divisions') {
                    selectedDivision = null;
                    selectedProgram = null;
                    programGroups = null;
                    updateBreadcrumbs();
                    showDivisions();
                } else if (step === 'programs') {
                    selectedProgram = null;
                    programGroups = null;
                    updateBreadcrumbs();
                    showPrograms();
                }
            });
        });
    }

    function updateRoomBreadcrumbs() {
        let html = '';
        if (roomSearchStep === 'address') {
            html += `<span class="breadcrumb-item current">Адреса</span>`;
        } else {
            html += `<span class="breadcrumb-item" data-step="addresses">Адреса</span>`;
            html += `<span class="breadcrumb-separator">›</span>`;
            html += `<span class="breadcrumb-item current">${escapeHtml(selectedAddress.DisplayName1)}</span>`;
        }
        els.breadcrumbs.innerHTML = html;

        els.breadcrumbs.querySelectorAll('.breadcrumb-item:not(.current)').forEach(item => {
            item.addEventListener('click', () => {
                if (item.dataset.step === 'addresses') {
                    roomSearchStep = 'address';
                    selectedAddress = null;
                    cachedClassrooms = null;
                    els.searchInput.value = '';
                    els.searchInput.placeholder = 'Введите часть адреса...';
                    els.searchResults.innerHTML = '<p class="search-hint">Введите часть адреса для поиска</p>';
                    updateRoomBreadcrumbs();
                }
            });
        });
    }

    function showDivisions() {
        els.searchResults.innerHTML = divisions.map(d => `
            <div class="search-result-item" data-alias="${escapeHtml(d.Alias)}">
                <div class="result-name">${escapeHtml(d.Name)}</div>
            </div>
        `).join('');

        els.searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => selectDivision(item.dataset.alias));
        });
    }

    async function selectDivision(alias) {
        selectedDivision = divisions.find(d => d.Alias === alias);
        selectedProgram = null;
        programGroups = null;

        updateBreadcrumbs();
        els.searchResults.innerHTML = '<p class="search-loading">Загрузка программ...</p>';

        try {
            programsWithLevels = await TimetableAPI.getDivisionProgramLevels(alias);
        } catch (err) {
            els.searchResults.innerHTML = `<p class="search-hint">Ошибка загрузки: ${escapeHtml(err.message)}</p>`;
            return;
        }

        showPrograms();
    }

    function showPrograms() {
        const items = [];

        for (const level of programsWithLevels) {
            const levelName = level.StudyLevelName || level.StudyLevelNameEnglish || '';
            if (level.StudyProgramCombinations) {
                for (const combo of level.StudyProgramCombinations) {
                    if (combo.AdmissionYears) {
                        for (const year of combo.AdmissionYears) {
                            items.push({
                                programId: year.StudyProgramId,
                                programName: combo.Name,
                                levelName: levelName,
                                year: year.YearNumber
                            });
                        }
                    }
                }
            }
        }

        if (items.length === 0) {
            els.searchResults.innerHTML = '<p class="search-hint">Программы не найдены</p>';
            return;
        }

        els.searchResults.innerHTML = items.map((item, idx) => `
            <div class="search-result-item" data-idx="${idx}">
                <div class="result-name">${escapeHtml(item.programName)}</div>
                <div class="result-sub">${escapeHtml(item.levelName)}, ${item.year} год</div>
            </div>
        `).join('');

        els.searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => selectProgram(items[Number(item.dataset.idx)]));
        });
    }

    async function selectProgram(programInfo) {
        selectedProgram = programInfo;
        programGroups = null;

        updateBreadcrumbs();
        els.searchResults.innerHTML = '<p class="search-loading">Загрузка групп...</p>';

        try {
            const data = await TimetableAPI.getProgramGroups(programInfo.programId);
            programGroups = data.Groups || [];
        } catch (err) {
            els.searchResults.innerHTML = `<p class="search-hint">Ошибка загрузки: ${escapeHtml(err.message)}</p>`;
            return;
        }

        showGroups('');
    }

    function showGroups(query) {
        if (!programGroups || programGroups.length === 0) {
            els.searchResults.innerHTML = '<p class="search-hint">Группы не найдены</p>';
            return;
        }

        const q = query.toLowerCase();
        const filtered = programGroups.filter(g => g.StudentGroupName.toLowerCase().includes(q));

        if (filtered.length === 0) {
            els.searchResults.innerHTML = '<p class="search-hint">Группы не найдены</p>';
            return;
        }

        els.searchResults.innerHTML = filtered.map(g => `
            <div class="search-result-item" data-type="group" data-id="${g.StudentGroupId}" data-name="${escapeHtml(g.StudentGroupName)}">
                <div class="result-name">${highlightMatch(escapeHtml(g.StudentGroupName), query)}</div>
                <div class="result-sub">${escapeHtml(g.StudentGroupStudyForm || '')}${g.StudentGroupProfiles ? ', ' + escapeHtml(g.StudentGroupProfiles) : ''}</div>
            </div>
        `).join('');

        bindResultClicks();
    }

    function onSearchInput() {
        clearTimeout(searchTimeout);
        const query = els.searchInput.value.trim();

        if (currentTab === 'group') {
            if (groupSearchMode === 'quick' && cachedGroups) {
                if (!query) {
                    els.searchResults.innerHTML = '<p class="search-hint">Введите номер группы (например, 26.Б11-пу)</p>';
                    return;
                }
                searchQuickGroups(query);
                return;
            }

            if (selectedProgram) {
                showGroups(query);
                return;
            }
        }

        if (currentTab === 'room') {
            if (!query) {
                els.searchResults.innerHTML = roomSearchStep === 'address'
                    ? '<p class="search-hint">Введите часть адреса для поиска</p>'
                    : '<p class="search-hint">Введите номер аудитории</p>';
                return;
            }
            searchTimeout = setTimeout(() => {
                if (roomSearchStep === 'address') {
                    searchAddresses(query);
                } else {
                    searchClassrooms(query);
                }
            }, 300);
            return;
        }

        if (!query) {
            els.searchResults.innerHTML = '<p class="search-hint">Введите запрос для поиска</p>';
            return;
        }

        searchTimeout = setTimeout(() => performSearch(query), 300);
    }

    function searchQuickGroups(query) {
        if (!cachedGroups) return;

        const q = query.toLowerCase();
        const filtered = cachedGroups.filter(g => g.name.toLowerCase().includes(q)).slice(0, 30);

        if (filtered.length === 0) {
            els.searchResults.innerHTML = '<p class="search-hint">Группы не найдены</p>';
            return;
        }

        els.searchResults.innerHTML = filtered.map(g => `
            <div class="search-result-item" data-type="group" data-id="${g.id}" data-name="${escapeHtml(g.name)}">
                <div class="result-name">${highlightMatch(escapeHtml(g.name), query)}</div>
                <div class="result-sub">${escapeHtml(g.division)} · ${escapeHtml(g.program)}, ${g.year}</div>
            </div>
        `).join('');

        bindResultClicks();
    }

    async function performSearch(query) {
        els.searchSpinner.classList.add('active');

        try {
            if (currentTab === 'teacher') {
                await searchTeachers(query);
            }
        } catch (err) {
            els.searchResults.innerHTML = `<p class="search-hint">Ошибка поиска: ${escapeHtml(err.message)}</p>`;
        } finally {
            els.searchSpinner.classList.remove('active');
        }
    }

    async function searchAddresses(query) {
        els.searchSpinner.classList.add('active');

        try {
            if (!cachedAddresses) {
                cachedAddresses = await TimetableAPI.getAddresses();
            }

            const q = query.toLowerCase();
            const filtered = cachedAddresses.filter(a => (a.DisplayName1 || '').toLowerCase().includes(q));

            if (filtered.length === 0) {
                els.searchResults.innerHTML = '<p class="search-hint">Адреса не найдены</p>';
                return;
            }

            els.searchResults.innerHTML = filtered.map(a => `
                <div class="search-result-item" data-type="address" data-oid="${a.Oid}">
                    <div class="result-name">${highlightMatch(escapeHtml(a.DisplayName1), query)}</div>
                </div>
            `).join('');

            els.searchResults.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => selectAddress(item.dataset.oid));
            });
        } catch (err) {
            els.searchResults.innerHTML = `<p class="search-hint">Ошибка загрузки адресов: ${escapeHtml(err.message)}</p>`;
        } finally {
            els.searchSpinner.classList.remove('active');
        }
    }

    function selectAddress(oid) {
        selectedAddress = cachedAddresses.find(a => a.Oid === oid);
        if (!selectedAddress) return;

        roomSearchStep = 'classroom';
        cachedClassrooms = null;
        els.searchInput.value = '';
        els.searchInput.placeholder = 'Введите номер аудитории...';
        els.searchResults.innerHTML = '<p class="search-hint">Введите номер аудитории</p>';
        updateRoomBreadcrumbs();
        els.searchInput.focus();
    }

    async function searchClassrooms(query) {
        els.searchSpinner.classList.add('active');

        try {
            if (!cachedClassrooms) {
                cachedClassrooms = await TimetableAPI.getClassrooms(selectedAddress.Oid);
            }

            const q = query.toLowerCase();
            const filtered = cachedClassrooms.filter(cr => (cr.DisplayName1 || '').toLowerCase().includes(q));

            if (filtered.length === 0) {
                els.searchResults.innerHTML = '<p class="search-hint">Аудитории не найдены</p>';
                return;
            }

            els.searchResults.innerHTML = filtered.map(cr => `
                <div class="search-result-item" data-type="room" data-oid="${cr.Oid}" data-name="${escapeHtml(cr.DisplayName1)}" data-address="${escapeHtml(selectedAddress.DisplayName1)}">
                    <div class="result-name">${highlightMatch(escapeHtml(cr.DisplayName1), query)}</div>
                    <div class="result-sub">${escapeHtml(selectedAddress.DisplayName1)}</div>
                </div>
            `).join('');

            bindResultClicks();
        } catch (err) {
            els.searchResults.innerHTML = `<p class="search-hint">Ошибка загрузки аудиторий: ${escapeHtml(err.message)}</p>`;
        } finally {
            els.searchSpinner.classList.remove('active');
        }
    }

    async function searchTeachers(query) {
        if (query.length < 2) {
            els.searchResults.innerHTML = '<p class="search-hint">Введите минимум 2 символа</p>';
            return;
        }

        const data = await TimetableAPI.searchEducators(query);
        const educators = data.Educators || [];

        if (educators.length === 0) {
            els.searchResults.innerHTML = '<p class="search-hint">Преподаватели не найдены</p>';
            return;
        }

        els.searchResults.innerHTML = educators.slice(0, 30).map(e => {
            const employment = (e.Employments && e.Employments.length > 0)
                ? e.Employments.map(emp => `${emp.Position || ''}${emp.Department ? ', ' + emp.Department : ''}`).join('; ')
                : '';
            return `
                <div class="search-result-item" data-type="teacher" data-id="${e.Id}" data-name="${escapeHtml(e.DisplayName || e.FullName)}">
                    <div class="result-name">${highlightMatch(escapeHtml(e.DisplayName || e.FullName), query)}</div>
                    ${employment ? `<div class="result-employment">${escapeHtml(employment)}</div>` : ''}
                </div>
            `;
        }).join('');

        bindResultClicks();
    }

    function bindResultClicks() {
        els.searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.dataset.type;
                if (type === 'group') {
                    addColumn({
                        type: 'group',
                        entityId: Number(item.dataset.id),
                        displayName: item.dataset.name,
                        typeLabel: 'Группа'
                    });
                } else if (type === 'room') {
                    addColumn({
                        type: 'room',
                        entityId: item.dataset.oid,
                        displayName: item.dataset.name,
                        typeLabel: item.dataset.address
                    });
                } else if (type === 'teacher') {
                    addColumn({
                        type: 'teacher',
                        entityId: Number(item.dataset.id),
                        displayName: item.dataset.name,
                        typeLabel: 'Преподаватель'
                    });
                }
                closeModal();
            });
        });
    }

    async function addColumn(config) {
        const col = {
            id: ++columnIdCounter,
            type: config.type,
            entityId: config.entityId,
            displayName: config.displayName,
            typeLabel: config.typeLabel,
            eventsData: null
        };
        columns.push(col);
        render();
        await loadColumnEvents(col);
    }

    async function removeColumn(colId) {
        columns = columns.filter(c => c.id !== colId);
        render();
    }

    async function loadColumnEvents(col) {
        const range = TimetableAPI.getWeekRange(currentMonday);

        try {
            if (col.type === 'group') {
                col.eventsData = await TimetableAPI.getGroupEvents(col.entityId, range.from, range.to);
            } else if (col.type === 'room') {
                col.eventsData = await TimetableAPI.getClassroomEvents(col.entityId, range.from, range.to);
            } else if (col.type === 'teacher') {
                col.eventsData = await TimetableAPI.getEducatorEvents(col.entityId, range.from, range.to);
            }
        } catch (err) {
            console.error('Failed to load events for column:', col, err);
            col.eventsData = { Days: [] };
        }

        render();
    }

    function refreshAllColumns() {
        for (const col of columns) {
            col.eventsData = null;
            loadColumnEvents(col);
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function highlightMatch(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }

    document.addEventListener('DOMContentLoaded', init);

    return { init };
})();
