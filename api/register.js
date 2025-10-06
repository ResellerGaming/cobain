import bcrypt from 'bcryptjs';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO  = process.env.GITHUB_REPO;   // format: username/repo
const BASE_PATH    = 'database/user';          // folder di repo

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Hanya menerima POST' });
  }

  const { role } = req.query;                  // /api/register/<role>
  const { username, password } = req.body || {};

  if (!role || !username || !password) {
    return res.status(400).json({ error: 'Role, username dan password wajib diisi' });
  }

  const allowed = ['resellerpanel','adminpanel','pantherpanel','owner'];
  if (!allowed.includes(role)) {
    return res.status(400).json({ error: 'Role tidak valid' });
  }

  const filePath = `${BASE_PATH}/${role}.json`;

  try {
    const apiURL = `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;
    const headers = {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'vercel-html-demo'
    };

    // 1. Ambil file lama (jika ada)
    let users = [];
    let sha   = null;
    const getRes = await fetch(apiURL, { headers });
    if (getRes.status === 200) {
      const file = await getRes.json();
      sha = file.sha;
      users = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8'));
    } else if (getRes.status !== 404) {
      throw new Error(`GitHub GET error: ${getRes.status}`);
    }

    // 2. Cek duplikat
    if (users.some(u => u.username === username)) {
      return res.status(409).json({ error: 'Username sudah terdaftar' });
    }

    // 3. Hash & tambahkan user
    const hashed = await bcrypt.hash(password, 10);
    users.push({ username, password: hashed, created_at: new Date().toISOString() });

    // 4. Push kembali ke GitHub
    const newContent = Buffer.from(JSON.stringify(users, null, 2)).toString('base64');
    const putBody = {
      message: `Tambah user ${username} di ${role}`,
      content: newContent,
      sha
    };
    const putRes = await fetch(apiURL, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody)
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      throw new Error(`GitHub PUT error: ${errText}`);
    }

    return res.status(200).json({ message: 'Akun berhasil disimpan ke GitHub!' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}