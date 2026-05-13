const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
  return new Response(JSON.stringify(data), { ...init, headers });
}

function badRequest(message) {
  return json({ ok: false, error: message }, { status: 400 });
}

function unauthorized() {
  return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
}

function notFound() {
  return json({ ok: false, error: 'Not Found' }, { status: 404 });
}

function getBearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return null;
  return token.trim();
}

function base64UrlEncode(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToBytes(str) {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function signHmac(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return base64UrlEncode(sig);
}

async function createStudentToken(secret, email) {
  const payload = { email, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 };
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await signHmac(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

async function verifyStudentToken(secret, token) {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = await signHmac(secret, payloadB64);
  if (sig !== expected) return null;
  const bytes = base64UrlDecodeToBytes(payloadB64);
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  if (!payload?.email || typeof payload.exp !== 'number') return null;
  if (Date.now() > payload.exp) return null;
  return payload;
}

function nowIso() {
  return new Date().toISOString();
}

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function requireTeacher(request, env) {
  const token = getBearerToken(request);
  if (!token) return false;
  return token === env.TEACHER_TOKEN;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith('/api/')) {
      return notFound();
    }

    try {
      if (request.method === 'GET' && path === '/api/state') {
        const chapters = await env.DB.prepare('SELECT id, title, description, icon, order_index FROM chapters ORDER BY order_index ASC').all();
        const lessons = await env.DB.prepare('SELECT id, chapter_id, title, description, text_content, video_url, pdf_url, key_points, quiz_json, order_index FROM lessons ORDER BY chapter_id ASC, order_index ASC').all();

        const lessonsByChapter = new Map();
        for (const row of lessons.results) {
          const arr = lessonsByChapter.get(row.chapter_id) || [];
          arr.push({
            id: row.id,
            title: row.title,
            description: row.description,
            textContent: row.text_content,
            videoUrl: row.video_url,
            pdfUrl: row.pdf_url,
            keyPoints: row.key_points,
            quiz: JSON.parse(row.quiz_json || '[]'),
          });
          lessonsByChapter.set(row.chapter_id, arr);
        }

        const out = chapters.results.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          icon: c.icon,
          lessons: lessonsByChapter.get(c.id) || [],
        }));

        return json({ ok: true, chapters: out });
      }

      if (request.method === 'PUT' && path === '/api/state') {
        const isTeacher = await requireTeacher(request, env);
        if (!isTeacher) return unauthorized();

        const body = await readJson(request);
        if (!body || !Array.isArray(body.chapters)) return badRequest('Invalid body');

        const chapters = body.chapters;
        const batch = [];
        batch.push(env.DB.prepare('DELETE FROM lessons'));
        batch.push(env.DB.prepare('DELETE FROM chapters'));

        for (let cIndex = 0; cIndex < chapters.length; cIndex++) {
          const c = chapters[cIndex];
          if (!c?.id || !c?.title) return badRequest('Chapter missing id/title');
          batch.push(
            env.DB.prepare('INSERT INTO chapters (id, title, description, icon, order_index) VALUES (?, ?, ?, ?, ?)')
              .bind(String(c.id), String(c.title), String(c.description || ''), String(c.icon || 'book'), cIndex)
          );

          const lessons = Array.isArray(c.lessons) ? c.lessons : [];
          for (let lIndex = 0; lIndex < lessons.length; lIndex++) {
            const l = lessons[lIndex];
            if (!l?.id || !l?.title) return badRequest('Lesson missing id/title');
            batch.push(
              env.DB.prepare(
                'INSERT INTO lessons (id, chapter_id, title, description, text_content, video_url, pdf_url, key_points, quiz_json, order_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
              ).bind(
                String(l.id),
                String(c.id),
                String(l.title),
                String(l.description || ''),
                String(l.textContent || ''),
                String(l.videoUrl || ''),
                String(l.pdfUrl || ''),
                String(l.keyPoints || ''),
                JSON.stringify(l.quiz || []),
                lIndex
              )
            );
          }
        }

        await env.DB.batch(batch);
        return json({ ok: true });
      }

      if (request.method === 'POST' && path === '/api/student/request') {
        const body = await readJson(request);
        const email = String(body?.email || '').trim().toLowerCase();
        if (!email) return badRequest('Email required');

        const existingApproved = await env.DB.prepare('SELECT id FROM students WHERE email = ?').bind(email).first();
        if (existingApproved) return json({ ok: false, error: 'already_approved' }, { status: 409 });

        const id = crypto.randomUUID();
        try {
          await env.DB.prepare('INSERT INTO pending_students (id, email, requested_at) VALUES (?, ?, ?)').bind(id, email, nowIso()).run();
        } catch {
          return json({ ok: true, status: 'already_pending' });
        }

        return json({ ok: true, status: 'pending', id });
      }

      if (request.method === 'POST' && path === '/api/student/login') {
        const body = await readJson(request);
        const email = String(body?.email || '').trim().toLowerCase();
        const password = String(body?.password || '');
        if (!email || !password) return badRequest('Email and password required');

        const row = await env.DB.prepare('SELECT email FROM students WHERE email = ? AND password = ?').bind(email, password).first();
        if (!row) return unauthorized();

        const token = await createStudentToken(env.STUDENT_TOKEN_SECRET, email);
        return json({ ok: true, token, email });
      }

      if (request.method === 'GET' && path === '/api/student/progress') {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        const payload = await verifyStudentToken(env.STUDENT_TOKEN_SECRET, token);
        if (!payload) return unauthorized();

        const rows = await env.DB.prepare('SELECT lesson_id FROM progress WHERE student_email = ? AND completed = 1').bind(payload.email).all();
        const progress = {};
        for (const r of rows.results) progress[r.lesson_id] = true;
        return json({ ok: true, progress });
      }

      if (request.method === 'POST' && path === '/api/student/progress') {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        const payload = await verifyStudentToken(env.STUDENT_TOKEN_SECRET, token);
        if (!payload) return unauthorized();

        const body = await readJson(request);
        const lessonId = String(body?.lessonId || '');
        const completed = body?.completed ? 1 : 0;
        if (!lessonId) return badRequest('lessonId required');

        await env.DB.prepare(
          'INSERT INTO progress (student_email, lesson_id, completed, completed_at) VALUES (?, ?, ?, ?) ' +
            'ON CONFLICT(student_email, lesson_id) DO UPDATE SET completed = excluded.completed, completed_at = excluded.completed_at'
        ).bind(payload.email, lessonId, completed, completed ? nowIso() : null).run();

        return json({ ok: true });
      }

      if (path.startsWith('/api/admin/')) {
        const isTeacher = await requireTeacher(request, env);
        if (!isTeacher) return unauthorized();

        if (request.method === 'GET' && path === '/api/admin/pending') {
          const rows = await env.DB.prepare('SELECT id, email, requested_at FROM pending_students ORDER BY requested_at ASC').all();
          return json({ ok: true, pending: rows.results });
        }

        if (request.method === 'GET' && path === '/api/admin/approved') {
          const rows = await env.DB.prepare('SELECT id, email, password, approved_at FROM students ORDER BY approved_at DESC').all();
          return json({ ok: true, approved: rows.results });
        }

        if (request.method === 'POST' && path === '/api/admin/approve') {
          const body = await readJson(request);
          const pendingId = String(body?.id || '');
          if (!pendingId) return badRequest('id required');

          const pending = await env.DB.prepare('SELECT id, email FROM pending_students WHERE id = ?').bind(pendingId).first();
          if (!pending) return badRequest('pending not found');

          const password = String(body?.password || randomPassword());
          const studentId = crypto.randomUUID();

          await env.DB.batch([
            env.DB.prepare('DELETE FROM pending_students WHERE id = ?').bind(pendingId),
            env.DB.prepare('INSERT INTO students (id, email, password, approved_at) VALUES (?, ?, ?, ?)').bind(studentId, pending.email, password, nowIso()),
          ]);

          return json({ ok: true, student: { id: studentId, email: pending.email, password } });
        }

        if (request.method === 'POST' && path === '/api/admin/reject') {
          const body = await readJson(request);
          const pendingId = String(body?.id || '');
          if (!pendingId) return badRequest('id required');
          await env.DB.prepare('DELETE FROM pending_students WHERE id = ?').bind(pendingId).run();
          return json({ ok: true });
        }

        if (request.method === 'POST' && path === '/api/admin/revoke') {
          const body = await readJson(request);
          const studentId = String(body?.id || '');
          if (!studentId) return badRequest('id required');
          await env.DB.prepare('DELETE FROM students WHERE id = ?').bind(studentId).run();
          return json({ ok: true });
        }
      }

      return notFound();
    } catch (e) {
      return json({ ok: false, error: 'Server error' }, { status: 500 });
    }
  },
};
