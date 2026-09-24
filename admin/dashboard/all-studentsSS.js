// all-students.js â€” Laravel API version

const PAGE_SIZE = 6;
let currentPage = 1;
let filtered = [];
let allStudents = [];

// â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const API_BASE = 'https://aideanc-production.up.railway.app/api';

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function initials(name) {
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

function csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

// â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function render() {
    const start = (currentPage - 1) * PAGE_SIZE;
    const rows = filtered.slice(start, start + PAGE_SIZE);
    const tbody = document.getElementById('studentsBody');

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#8b90a7;">No students found.</td></tr>`;
        renderPagination();
        return;
    }

    tbody.innerHTML = rows.map((s, i) => `
        <tr>
            <td>${start + i + 1}</td>
            <td>
                <div class="avatar-cell">
                    <div class="avatar">${initials(s.full_name)}</div>
                    <div>
                        <strong>${s.full_name}</strong>
                        <div style="font-size:11px;color:#8b90a7;">${s.student_number || ''}</div>
                    </div>
                </div>
            </td>
            <td>${s.course || 'â€”'}</td>
            <td>${s.email}</td>
            <td>${s.section || 'â€”'}</td>
            <td>
                <span class="badge ${s.is_verified ? 'badge-success' : 'badge-danger'}">
                    ${s.is_verified ? 'Verified' : 'Unverified'}
                </span>
            </td>
            <td>
                <button class="btn-action" onclick="openEditModal(${s.id})">Edit</button>
                <button class="btn-action btn-del" onclick="deleteStudent(${s.id})">Delete</button>
            </td>
        </tr>
    `).join('');

    renderPagination();
}

function renderPagination() {
    const total = Math.ceil(filtered.length / PAGE_SIZE);
    const pg = document.getElementById('pagination');
    let html = '';
    for (let i = 1; i <= total; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    }
    pg.innerHTML = html;
}

function goPage(n) { currentPage = n; render(); }

function applyFilter() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const st = document.getElementById('filterStatus').value;
    filtered = allStudents.filter(s => {
        const matchQ = (s.full_name || '').toLowerCase().includes(q)
            || (s.email || '').toLowerCase().includes(q)
            || (s.course || '').toLowerCase().includes(q)
            || (s.student_number || '').toLowerCase().includes(q);
        const matchSt = !st
            || (st === 'Verified' && s.is_verified == 1)
            || (st === 'Unverified' && !s.is_verified);
        return matchQ && matchSt;
    });
    currentPage = 1;
    render();
}

// â”€â”€ API Calls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function fetchStudents() {
    try {
        const res = await fetch(`${API_BASE}/students`, {
            headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() }
        });
        if (!res.ok) throw new Error('Failed to fetch students');
        const data = await res.json();
        allStudents = data;
        filtered = [...allStudents];
        render();
    } catch (err) {
        console.error(err);
        document.getElementById('studentsBody').innerHTML =
            `<tr><td colspan="7" style="text-align:center;padding:32px;color:#c0392b;">Failed to load students. Check your API.</td></tr>`;
    }
}

async function saveStudent(formData, id = null) {
    const url = id ? `${API_BASE}/students/${id}` : `${API_BASE}/students`;
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-CSRF-TOKEN': csrfToken()
        },
        body: JSON.stringify(formData)
    });
    if (!res.ok) {
        const err = await res.json();
        throw err;
    }
    return res.json();
}

async function deleteStudent(id) {
    if (!confirm('Are you sure you want to delete this student?')) return;
    try {
        const res = await fetch(`${API_BASE}/students/${id}`, {
            method: 'DELETE',
            headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken() }
        });
        if (!res.ok) throw new Error('Delete failed');
        await fetchStudents();
    } catch (err) {
        alert('Failed to delete student.');
        console.error(err);
    }
}

// â”€â”€ Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add Student';
    document.getElementById('studentForm').reset();
    document.getElementById('editStudentId').value = '';
    clearFormErrors();
    document.getElementById('studentModal').classList.add('open');
}

async function openEditModal(id) {
    const student = allStudents.find(s => s.id === id);
    if (!student) return;
    document.getElementById('modalTitle').textContent = 'Edit Student';
    document.getElementById('editStudentId').value = student.id;
    document.getElementById('fieldName').value = student.full_name || '';
    document.getElementById('fieldNumber').value = student.student_number || '';
    document.getElementById('fieldEmail').value = student.email || '';
    document.getElementById('fieldCourse').value = student.course || '';
    document.getElementById('fieldYearLevel').value = student.year_level || '';
    document.getElementById('fieldSection').value = student.section || '';
    document.getElementById('fieldVerified').value = student.is_verified ? '1' : '0';
    clearFormErrors();
    document.getElementById('studentModal').classList.add('open');
}

function closeModal() {
    document.getElementById('studentModal').classList.remove('open');
}

function clearFormErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
}

function showFormErrors(errors) {
    clearFormErrors();
    Object.entries(errors).forEach(([field, messages]) => {
        const map = {
            full_name: 'errorName', student_number: 'errorNumber',
            email: 'errorEmail', course: 'errorCourse',
            year_level: 'errorYearLevel', section: 'errorSection'
        };
        if (map[field]) {
            const el = document.getElementById(map[field]);
            if (el) el.textContent = Array.isArray(messages) ? messages[0] : messages;
        }
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('editStudentId').value;
    const formData = {
        full_name: document.getElementById('fieldName').value.trim(),
        student_number: document.getElementById('fieldNumber').value.trim(),
        email: document.getElementById('fieldEmail').value.trim(),
        course: document.getElementById('fieldCourse').value.trim(),
        year_level: document.getElementById('fieldYearLevel').value,
        section: document.getElementById('fieldSection').value.trim(),
        is_verified: document.getElementById('fieldVerified').value,
        role: 'student'
    };

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        await saveStudent(formData, id || null);
        closeModal();
        await fetchStudents();
    } catch (err) {
        if (err.errors) {
            showFormErrors(err.errors);
        } else {
            alert('Failed to save student. Please try again.');
        }
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Student';
    }
}

// â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

document.addEventListener('DOMContentLoaded', () => {
    fetchStudents();

    document.getElementById('searchInput').addEventListener('input', applyFilter);
    document.getElementById('filterStatus').addEventListener('change', applyFilter);
    document.getElementById('addStudentBtn').addEventListener('click', openAddModal);
    document.getElementById('studentForm').addEventListener('submit', handleFormSubmit);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', closeModal);

    document.getElementById('homeBtn').addEventListener('click', () => {
        location.href = '../dashboard/dashboard.html';
    });
    document.getElementById('signOutBtn').addEventListener('click', () => {
        if (confirm('Sign out?')) location.href = '../../user/login/login.html';
    });
});
async function approveStudent(id) {
    if (!confirm('Approve this student? An email notification will be sent.')) return;
    const session = AideaSession.require('admin');
    if (!session) return;
    try {
        const res = await fetch(`${API_BASE}/admin/approve-student/${id}`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${session.token}`
            }
        });
        const data = await res.json();
        if (data.success) {
            alert('Student approved and email sent!');
            await fetchStudents();
        } else {
            alert(data.message || 'Approval failed.');
        }
    } catch (err) {
        alert('Error approving student.');
        console.error(err);
    }
}


async function approveStudent(id) {
    if (!confirm('Approve this student? An email notification will be sent.')) return;
    const session = AideaSession.require('admin');
    if (!session) return;
    try {
        const res = await fetch(`${API_BASE}/admin/approve-student/${id}`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${session.token}`
            }
        });
        const data = await res.json();
        if (data.success) {
            alert('Student approved and email sent!');
            await fetchStudents();
        } else {
            alert(data.message || 'Approval failed.');
        }
    } catch (err) {
        alert('Error approving student.');
        console.error(err);
    }
}
