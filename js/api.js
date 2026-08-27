const TimetableAPI = (() => {
    const BASE = 'https://timetable.spbu.ru/api/v1';

    async function fetchJSON(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API error: ${res.status} ${res.url}`);
        return res.json();
    }

    function formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function formatDateTime(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}${m}${d}${h}${min}`;
    }

    function getWeekMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function getWeekRange(monday) {
        const from = new Date(monday);
        const to = new Date(monday);
        to.setDate(to.getDate() + 6);
        to.setHours(23, 59, 0, 0);
        return { from, to };
    }

    return {
        getWeekMonday,
        getWeekRange,
        formatDate,

        async getAddresses() {
            return fetchJSON(`${BASE}/addresses`);
        },

        async getClassrooms(addressOid) {
            return fetchJSON(`${BASE}/addresses/${addressOid}/classrooms`);
        },

        async getClassroomEvents(classroomOid, from, to) {
            const f = formatDateTime(from);
            const t = formatDateTime(to);
            return fetchJSON(`${BASE}/classrooms/${classroomOid}/events/${f}/${t}`);
        },

        async searchEducators(query) {
            return fetchJSON(`${BASE}/educators/search/${encodeURIComponent(query)}`);
        },

        async getEducatorEvents(id, from, to) {
            const f = formatDate(from);
            const t = formatDate(to);
            return fetchJSON(`${BASE}/educators/${id}/events/${f}/${t}`);
        },

        async getGroupEvents(id, from, to) {
            const f = formatDate(from);
            const t = formatDate(to);
            return fetchJSON(`${BASE}/groups/${id}/events/${f}/${t}`);
        },

        async getStudyDivisions() {
            return fetchJSON(`${BASE}/study/divisions`);
        },

        async getDivisionProgramLevels(alias) {
            return fetchJSON(`${BASE}/study/divisions/${alias}/programs/levels`);
        },

        async getProgramGroups(programId) {
            return fetchJSON(`${BASE}/programs/${programId}/groups`);
        }
    };
})();
